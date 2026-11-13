//! Workspace setup script lifecycle.
//!
//! Evidence (`evidence/run-scripts/NOTES.md`, "Execution"): per workspace the
//! state is idle, running, completed (exit 0), failed or cancelled; starting
//! while running does nothing; when the process ends its transcript is saved
//! to `<tmp>/conductor-setup-<workspace id>.log` (the path the reference keeps
//! in `workspaces.setup_log_path`); quitting mid-setup marks it failed. The
//! caller moves the workspace from `setting_up` to `ready` in the completion
//! callback whatever the outcome.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;

use crate::launch::{self, LaunchSpec, OutputSink, Process};

/// Grace period between SIGTERM and SIGKILL when setup is cancelled.
pub const CANCEL_GRACE: Duration = Duration::from_secs(3);

const INTERRUPTED: &str = "Setup was interrupted because OpenConductor quit before it finished.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SetupState {
    Idle,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// What a finished (or interrupted) setup left behind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupOutcome {
    pub workspace_id: String,
    pub state: SetupState,
    pub exit_code: Option<i32>,
    pub log_path: PathBuf,
    pub log: String,
}

/// Called once per setup run when it ends.
pub type OnSetupDone = Box<dyn FnOnce(SetupOutcome) + Send>;

#[derive(Default)]
struct Entry {
    state: Option<SetupState>,
    process: Option<Arc<Mutex<Process>>>,
    outcome: Option<SetupOutcome>,
    interrupted: bool,
    worker: Option<thread::JoinHandle<()>>,
}

/// Setup runs for every workspace.
#[derive(Clone)]
pub struct SetupManager {
    log_dir: PathBuf,
    entries: Arc<Mutex<HashMap<String, Entry>>>,
    shutting_down: Arc<AtomicBool>,
}

impl SetupManager {
    /// `log_dir` is where `conductor-setup-<id>.log` files go (the temp dir).
    pub fn new(log_dir: impl Into<PathBuf>) -> Self {
        Self {
            log_dir: log_dir.into(),
            entries: Arc::default(),
            shutting_down: Arc::default(),
        }
    }

    pub fn log_path(&self, workspace_id: &str) -> PathBuf {
        log_path(&self.log_dir, workspace_id)
    }

    pub fn state(&self, workspace_id: &str) -> SetupState {
        self.lock()
            .get(workspace_id)
            .and_then(|e| e.state)
            .unwrap_or(SetupState::Idle)
    }

    /// The last finished run, if any.
    pub fn outcome(&self, workspace_id: &str) -> Option<SetupOutcome> {
        self.lock()
            .get(workspace_id)
            .and_then(|e| e.outcome.clone())
    }

    /// Output so far: the live transcript while running, else the saved log.
    pub fn log(&self, workspace_id: &str) -> Option<String> {
        let entries = self.lock();
        let entry = entries.get(workspace_id)?;
        match &entry.process {
            Some(p) => Some(
                p.lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .transcript
                    .text(),
            ),
            None => entry.outcome.as_ref().map(|o| o.log.clone()),
        }
    }

    /// Start setup. Returns `Ok(false)` when it is already running.
    pub fn start(
        &self,
        workspace_id: &str,
        spec: &LaunchSpec,
        sink: Option<OutputSink>,
        done: OnSetupDone,
    ) -> io::Result<bool> {
        let mut entries = self.lock();
        if self.shutting_down.load(Ordering::Acquire) {
            return Ok(false);
        }
        let entry = entries.entry(workspace_id.to_string()).or_default();
        if entry.state == Some(SetupState::Running) {
            return Ok(false);
        }
        entry.outcome = None;
        entry.interrupted = false;
        let process = match launch::spawn(spec, sink) {
            Ok(p) => Arc::new(Mutex::new(p)),
            Err(e) => {
                entry.state = Some(SetupState::Failed);
                drop(entries);
                let log = format!("Could not start the setup script: {e}");
                self.finish(workspace_id, None, log, done);
                return Ok(true);
            }
        };
        entry.state = Some(SetupState::Running);
        entry.process = Some(process.clone());
        let this = self.clone();
        let id = workspace_id.to_string();
        entry.worker = Some(thread::spawn(move || loop {
            let exited = process.lock().unwrap_or_else(|e| e.into_inner()).try_wait();
            match exited {
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Ok(Some(exit)) => {
                    let log = process
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .transcript
                        .text();
                    this.finish(&id, exit.code, log, done);
                    return;
                }
                Err(e) => {
                    this.finish(
                        &id,
                        None,
                        format!("Lost track of the setup process: {e}"),
                        done,
                    );
                    return;
                }
            }
        }));
        Ok(true)
    }

    /// Seal setup admission, interrupt active processes and wait for completion callbacks.
    pub fn interrupt_all(&self) {
        let targets: Vec<_> = {
            let mut entries = self.lock();
            self.shutting_down.store(true, Ordering::Release);
            entries
                .values_mut()
                .map(|entry| {
                    if entry.state == Some(SetupState::Running) {
                        entry.interrupted = true;
                    }
                    (entry.process.clone(), entry.worker.take())
                })
                .collect()
        };
        for (process, _) in &targets {
            if let Some(process) = process {
                let _ = process
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .stop(CANCEL_GRACE);
            }
        }
        for (_, worker) in targets {
            if let Some(worker) = worker {
                let _ = worker.join();
            }
        }
    }

    /// Cancel a running setup and wait for it to end.
    pub fn cancel(&self, workspace_id: &str) {
        let process = {
            let mut entries = self.lock();
            let Some(entry) = entries.get_mut(workspace_id) else {
                return;
            };
            if entry.state != Some(SetupState::Running) || entry.interrupted {
                return;
            }
            entry.state = Some(SetupState::Cancelled);
            entry.process.clone()
        };
        if let Some(p) = process {
            let _ = p
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .stop(CANCEL_GRACE);
        }
        while self
            .lock()
            .get(workspace_id)
            .is_some_and(|e| e.process.is_some())
        {
            thread::sleep(Duration::from_millis(10));
        }
    }

    /// Restore a finished setup run from a persisted log file and state so the Setup
    /// tab shows the previous transcript after a restart.  Called at app startup for
    /// every workspace whose `setup_log_state` column is non-null.  A live running
    /// setup is never replaced.  Missing or unreadable log files are represented as
    /// an empty string; `exit_code` is not persisted and is left as `None`.
    pub fn restore(&self, workspace_id: &str, state: SetupState, log_path: PathBuf) {
        // Only finished states are valid restore targets.
        debug_assert!(!matches!(state, SetupState::Idle | SetupState::Running));
        let log = fs::read_to_string(&log_path).unwrap_or_default();
        let outcome = SetupOutcome {
            workspace_id: workspace_id.to_string(),
            state,
            exit_code: None, // not persisted; unknown after restart
            log_path,
            log,
        };
        let mut entries = self.lock();
        let entry = entries.entry(workspace_id.to_string()).or_default();
        // A live process takes precedence over a restored snapshot.
        if entry.state == Some(SetupState::Running) {
            return;
        }
        entry.state = Some(state);
        entry.process = None;
        entry.outcome = Some(outcome);
    }

    /// Record a setup that was running when the app quit (found on next start).
    pub fn mark_interrupted(&self, workspace_id: &str) -> SetupOutcome {
        let outcome = SetupOutcome {
            workspace_id: workspace_id.to_string(),
            state: SetupState::Failed,
            exit_code: Some(1),
            log_path: self.log_path(workspace_id),
            log: INTERRUPTED.to_string(),
        };
        let mut entries = self.lock();
        let entry = entries.entry(workspace_id.to_string()).or_default();
        entry.state = Some(SetupState::Failed);
        entry.process = None;
        entry.outcome = Some(outcome.clone());
        outcome
    }

    fn finish(&self, workspace_id: &str, exit_code: Option<i32>, log: String, done: OnSetupDone) {
        let mut entries = self.lock();
        let entry = entries.entry(workspace_id.to_string()).or_default();
        let (exit_code, log) = if entry.interrupted {
            (Some(1), format!("{log}\n{INTERRUPTED}"))
        } else {
            (exit_code, log)
        };
        let log_path = self.log_path(workspace_id);
        let log = match write_log(&log_path, &log) {
            Ok(()) => log,
            Err(e) => format!(
                "{log}\n[could not save the setup log to {}: {e}]",
                log_path.display()
            ),
        };
        let outcome = {
            let state = match (entry.state, exit_code) {
                (Some(SetupState::Cancelled), _) => SetupState::Cancelled,
                (_, Some(0)) => SetupState::Completed,
                _ => SetupState::Failed,
            };
            let outcome = SetupOutcome {
                workspace_id: workspace_id.to_string(),
                state,
                exit_code,
                log_path,
                log,
            };
            entry.state = Some(state);
            entry.process = None;
            entry.outcome = Some(outcome.clone());
            outcome
        };
        drop(entries);
        done(outcome);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Entry>> {
        self.entries.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// `<log_dir>/conductor-setup-<workspace id>.log`.
pub fn log_path(log_dir: &Path, workspace_id: &str) -> PathBuf {
    log_dir.join(format!("conductor-setup-{workspace_id}.log"))
}

fn write_log(path: &Path, text: &str) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(path, text)
}

#[cfg(test)]
mod tests;
