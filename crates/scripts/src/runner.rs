//! Run-script processes for all workspaces.
//!
//! Evidence (`evidence/run-scripts/NOTES.md`, "Execution"): states are
//! starting, waiting_for_setup, running, stopping and stopped, keyed by
//! workspace and run-script id; starting a run script first stops every run
//! process of that workspace; a start while the workspace is still setting up
//! waits for setup; with `nonconcurrent`, starting kills the run processes of
//! the repository's other workspaces; the last transcript is kept after
//! exit; the last 20 run-script ids per workspace are remembered.

use std::collections::HashMap;
use std::io;
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, SystemTime};

use serde::Serialize;

use crate::launch::{self, Exit, LaunchSpec, OutputSink, Process};
use crate::setup::SetupState;

/// Grace period between SIGTERM and SIGKILL when a run script is stopped.
pub const STOP_GRACE: Duration = Duration::from_secs(5);
/// Run-script ids remembered per workspace.
pub const HISTORY_LEN: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    Starting,
    WaitingForSetup,
    Running,
    Stopping,
    Stopped,
}

/// One request to run a script in a workspace.
#[derive(Clone)]
pub struct RunRequest {
    pub workspace_id: String,
    pub repo_id: String,
    pub script_id: String,
    pub spec: LaunchSpec,
    /// `run_mode = "concurrent"`.
    pub concurrent: bool,
    pub sink: Option<OutputSink>,
    pub on_finished: Arc<dyn Fn(RunStatus) + Send + Sync>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatus {
    pub workspace_id: String,
    pub script_id: String,
    pub state: RunState,
    pub exit: Option<(Option<i32>, Option<i32>)>,
}

/// See [`RunManager::latest`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LatestRun {
    pub script_id: String,
    pub state: RunState,
    pub started_at: SystemTime,
    /// Raw output (escape sequences included); `None` before any output
    /// was kept, for example while waiting for setup.
    pub output: Option<String>,
}

type Key = (String, String);

#[derive(Default)]
struct Inner {
    states: HashMap<Key, RunState>,
    repos: HashMap<Key, String>,
    processes: HashMap<Key, Arc<Mutex<Process>>>,
    waiting: HashMap<String, RunRequest>,
    last_output: HashMap<Key, String>,
    last_exit: HashMap<Key, Exit>,
    started_at: HashMap<Key, SystemTime>,
    history: HashMap<String, Vec<String>>,
}

#[derive(Clone, Default)]
pub struct RunManager {
    inner: Arc<Mutex<Inner>>,
}

impl RunManager {
    /// Start `req`, stopping whatever else runs in its workspace (and, when
    /// not concurrent, in the repository's other workspaces). While setup
    /// runs the request waits; [`RunManager::setup_finished`] starts it.
    pub fn start(&self, req: RunRequest, setup_state: SetupState) -> io::Result<()> {
        self.stop(&req.workspace_id, None);
        let key = (req.workspace_id.clone(), req.script_id.clone());
        {
            let mut inner = self.lock();
            let history = inner.history.entry(req.workspace_id.clone()).or_default();
            history.retain(|id| id != &req.script_id);
            history.insert(0, req.script_id.clone());
            history.truncate(HISTORY_LEN);
            inner.repos.insert(key.clone(), req.repo_id.clone());
            inner.started_at.insert(key.clone(), SystemTime::now());
            if setup_state == SetupState::Running {
                inner.states.insert(key, RunState::WaitingForSetup);
                inner.waiting.insert(req.workspace_id.clone(), req);
                return Ok(());
            }
            inner.states.insert(key.clone(), RunState::Starting);
        }
        if !req.concurrent {
            let others: Vec<String> = {
                let inner = self.lock();
                inner
                    .processes
                    .keys()
                    .filter(|k| {
                        k.0 != req.workspace_id && inner.repos.get(*k) == Some(&req.repo_id)
                    })
                    .map(|k| k.0.clone())
                    .collect()
            };
            for ws in others {
                self.stop(&ws, None);
            }
        }
        let process = match launch::spawn(&req.spec, req.sink.clone()) {
            Ok(p) => Arc::new(Mutex::new(p)),
            Err(e) => {
                self.lock().states.insert(key, RunState::Stopped);
                return Err(e);
            }
        };
        {
            let mut inner = self.lock();
            inner.processes.insert(key.clone(), process.clone());
            inner.states.insert(key.clone(), RunState::Running);
            inner.last_exit.remove(&key);
        }
        let this = self.clone();
        let on_finished = req.on_finished;
        thread::spawn(move || loop {
            let exit = process.lock().unwrap_or_else(|e| e.into_inner()).try_wait();
            if let Ok(None) = exit {
                thread::sleep(Duration::from_millis(50));
                continue;
            }
            let output = process
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .transcript
                .text();
            let mut inner = this.lock();
            // A newer run for the same key replaced this one: leave it alone.
            if inner
                .processes
                .get(&key)
                .is_some_and(|p| Arc::ptr_eq(p, &process))
            {
                inner.processes.remove(&key);
                inner.states.insert(key.clone(), RunState::Stopped);
                inner.last_output.insert(key.clone(), output);
                if let Ok(Some(exit)) = exit {
                    inner.last_exit.insert(key.clone(), exit);
                }
                let status = RunStatus {
                    workspace_id: key.0.clone(),
                    script_id: key.1.clone(),
                    state: RunState::Stopped,
                    exit: inner.last_exit.get(&key).map(|e| (e.code, e.signal)),
                };
                drop(inner);
                on_finished(status);
            }
            return;
        });
        Ok(())
    }

    /// Stop one run script of a workspace, or all of them (`None`). Returns
    /// false when there was nothing to stop.
    pub fn stop(&self, workspace_id: &str, script_id: Option<&str>) -> bool {
        let targets: Vec<(Key, Option<Arc<Mutex<Process>>>)> = {
            let mut inner = self.lock();
            let keys: Vec<Key> = inner
                .states
                .iter()
                .filter(|(k, s)| {
                    k.0 == workspace_id
                        && script_id.is_none_or(|id| k.1 == id)
                        && **s != RunState::Stopped
                })
                .map(|(k, _)| k.clone())
                .collect();
            for k in &keys {
                inner.states.insert(k.clone(), RunState::Stopping);
                if inner
                    .waiting
                    .get(workspace_id)
                    .is_some_and(|r| r.script_id == k.1)
                {
                    inner.waiting.remove(workspace_id);
                }
            }
            keys.into_iter()
                .map(|k| (k.clone(), inner.processes.get(&k).cloned()))
                .collect()
        };
        for (key, process) in &targets {
            if let Some(p) = process {
                let _ = p.lock().unwrap_or_else(|e| e.into_inner()).stop(STOP_GRACE);
                while self
                    .lock()
                    .processes
                    .get(key)
                    .is_some_and(|q| Arc::ptr_eq(q, p))
                {
                    thread::sleep(Duration::from_millis(10));
                }
            }
            self.lock().states.insert(key.clone(), RunState::Stopped);
        }
        !targets.is_empty()
    }

    /// Stop every run of the repository's workspaces, waiting ones included.
    /// Returns the workspaces that had something to stop, sorted. Spotlight
    /// starts with this, as the reference starts it without run-script
    /// concurrency.
    pub fn stop_repository(&self, repo_id: &str) -> Vec<String> {
        let mut workspaces: Vec<String> = {
            let inner = self.lock();
            inner
                .states
                .iter()
                .filter(|(k, s)| {
                    **s != RunState::Stopped && inner.repos.get(*k).is_some_and(|r| r == repo_id)
                })
                .map(|(k, _)| k.0.clone())
                .collect()
        };
        workspaces.sort();
        workspaces.dedup();
        workspaces.retain(|ws| self.stop(ws, None));
        workspaces
    }

    /// Setup of `workspace_id` ended: start the run that was waiting for it.
    pub fn setup_finished(&self, workspace_id: &str) -> io::Result<bool> {
        let Some(req) = self.lock().waiting.remove(workspace_id) else {
            return Ok(false);
        };
        self.start(req, SetupState::Completed).map(|()| true)
    }

    /// Stop everything (app quit).
    pub fn stop_all(&self) {
        let workspaces: Vec<String> = self.lock().states.keys().map(|k| k.0.clone()).collect();
        for ws in workspaces {
            self.stop(&ws, None);
        }
    }

    pub fn state(&self, workspace_id: &str, script_id: &str) -> RunState {
        let key = (workspace_id.to_string(), script_id.to_string());
        self.lock()
            .states
            .get(&key)
            .copied()
            .unwrap_or(RunState::Stopped)
    }

    /// Live output while running, else the last run's output.
    pub fn output(&self, workspace_id: &str, script_id: &str) -> Option<String> {
        let key = (workspace_id.to_string(), script_id.to_string());
        let inner = self.lock();
        match inner.processes.get(&key) {
            Some(p) => Some(
                p.lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .transcript
                    .text(),
            ),
            None => inner.last_output.get(&key).cloned(),
        }
    }

    pub fn statuses(&self, workspace_id: &str) -> Vec<RunStatus> {
        let inner = self.lock();
        let mut out: Vec<RunStatus> = inner
            .states
            .iter()
            .filter(|(k, _)| k.0 == workspace_id)
            .map(|(k, s)| RunStatus {
                workspace_id: k.0.clone(),
                script_id: k.1.clone(),
                state: *s,
                exit: inner.last_exit.get(k).map(|e| (e.code, e.signal)),
            })
            .collect();
        out.sort_by(|a, b| a.script_id.cmp(&b.script_id));
        out
    }

    /// The workspace's most recently started run script with its state and
    /// output (live while it runs, else its last run's), for reading it
    /// back the way the reference's `getTerminalOutput` does.
    pub fn latest(&self, workspace_id: &str) -> Option<LatestRun> {
        let (script_id, started_at) = {
            let inner = self.lock();
            let script_id = inner.history.get(workspace_id)?.first()?.clone();
            let key = (workspace_id.to_string(), script_id.clone());
            (script_id, *inner.started_at.get(&key)?)
        };
        Some(LatestRun {
            state: self.state(workspace_id, &script_id),
            output: self.output(workspace_id, &script_id),
            script_id,
            started_at,
        })
    }

    /// Most recently started run-script ids, newest first.
    pub fn history(&self, workspace_id: &str) -> Vec<String> {
        self.lock()
            .history
            .get(workspace_id)
            .cloned()
            .unwrap_or_default()
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Whether to start the default run script once setup ends: the repository
/// turned on `auto_run_after_setup`, it has a run script, and setup completed
/// (or there is no setup script).
pub fn should_auto_run(
    auto_run_after_setup: bool,
    has_run_script: bool,
    has_setup_script: bool,
    setup: SetupState,
) -> bool {
    auto_run_after_setup
        && has_run_script
        && match setup {
            SetupState::Completed => true,
            SetupState::Idle => !has_setup_script,
            _ => false,
        }
}

#[cfg(test)]
mod tests;
