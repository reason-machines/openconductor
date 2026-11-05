//! Spotlight sessions by repository root: at most one workspace is
//! spotlighted into a root at a time, like the reference app's single
//! "Spotlight" task per repository.
//!
//! [`SpotlightService::start`] runs [`begin`], then the [`watch`] loop;
//! [`SpotlightService::stop`] stops the loop (waiting for a sync in
//! progress) and runs [`end`]. Every step is reported as a
//! [`SpotlightEvent`] through the emitter the service was built with, so the
//! Tauri layer only forwards them to the UI.
//!
//! Starting a different workspace on a root that already has a session ends
//! that session first (the root goes back to its own state), then starts the
//! new one.
//!
//! Each workspace's session also keeps a text log, worded like the
//! reference's `spotlighter.sh` output, so agents can read it back
//! ([`SpotlightService::output`], source `spotlight` of
//! `crate::terminal_output`). The log of a stopped session stays until that
//! workspace starts again.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use super::watch::{watch, SpotlightWatcher, SyncEvent};
use super::{begin, end, session_checkpoint_id, LeftoverSession, SpotlightError, SyncOutcome};

/// What the UI hears about a Spotlight session. `repo_root` names the
/// session; it is the path the session was started with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SpotlightEvent {
    Started {
        repo_root: PathBuf,
        workspace_id: String,
        /// Set when an earlier session that was never ended could not be
        /// undone; the root keeps that session's last synced state.
        leftover_restore_error: Option<String>,
    },
    Syncing {
        repo_root: PathBuf,
        workspace_id: String,
    },
    Synced {
        repo_root: PathBuf,
        workspace_id: String,
    },
    /// The sync did not touch the root (`busy`: a merge, rebase,
    /// cherry-pick or revert is running in the workspace).
    Skipped {
        repo_root: PathBuf,
        workspace_id: String,
        busy: bool,
        message: Option<String>,
    },
    /// The workspace was saved but the root could not be updated.
    SyncFailed {
        repo_root: PathBuf,
        workspace_id: String,
        message: String,
    },
    /// The session ended. `restore_error` is set when the root could not be
    /// put back; the next start retries that.
    Stopped {
        repo_root: PathBuf,
        workspace_id: String,
        restore_error: Option<String>,
    },
}

impl SpotlightEvent {
    fn from_sync(repo_root: &Path, workspace_id: &str, event: SyncEvent) -> Self {
        let (repo_root, workspace_id) = (repo_root.to_path_buf(), workspace_id.to_string());
        match event {
            SyncEvent::Syncing => Self::Syncing {
                repo_root,
                workspace_id,
            },
            SyncEvent::Finished(SyncOutcome::Synced) => Self::Synced {
                repo_root,
                workspace_id,
            },
            SyncEvent::Finished(SyncOutcome::SkippedBusy) => Self::Skipped {
                repo_root,
                workspace_id,
                busy: true,
                message: None,
            },
            SyncEvent::Finished(SyncOutcome::SkippedSaveFailed(message)) => Self::Skipped {
                repo_root,
                workspace_id,
                busy: false,
                message: Some(message),
            },
            SyncEvent::Finished(SyncOutcome::RestoreFailed(message)) => Self::SyncFailed {
                repo_root,
                workspace_id,
                message,
            },
        }
    }
}

pub type Emit = Arc<dyn Fn(SpotlightEvent) + Send + Sync>;

/// Lines kept per workspace log; older lines are dropped.
pub const LOG_LINES: usize = 5_000;

/// A workspace's Spotlight log, see [`SpotlightService::output`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpotlightOutput {
    pub text: String,
    /// The session is still running.
    pub live: bool,
    pub started_at: SystemTime,
}

struct Log {
    lines: VecDeque<String>,
    started_at: SystemTime,
}

type Logs = Arc<Mutex<HashMap<String, Log>>>;

/// The log lines for one event. `checkpoint_id` is the session's sync
/// checkpoint. Sync lines use the reference script's wording
/// (`evidence/scripts/bin/spotlighter.sh`); start and stop lines are ours.
fn log_lines(event: &SpotlightEvent, checkpoint_id: &str) -> Vec<String> {
    match event {
        SpotlightEvent::Started {
            repo_root,
            leftover_restore_error,
            ..
        } => {
            let mut lines = vec![format!(
                "Spotlight started: syncing this workspace into {}",
                repo_root.display()
            )];
            if let Some(e) = leftover_restore_error {
                lines.push(format!(
                    "Warning: could not undo an earlier Spotlight session: {e}"
                ));
            }
            lines
        }
        SpotlightEvent::Syncing { .. } => vec![String::new(), "Starting sync...".into()],
        SpotlightEvent::Synced { repo_root, .. } => vec![
            format!("Saved checkpoint: {checkpoint_id}"),
            format!(
                "Restored checkpoint {checkpoint_id} in {}",
                repo_root.display()
            ),
        ],
        SpotlightEvent::Skipped {
            busy: true,
            message,
            ..
        } => with_message("Skipping sync: merge/rebase in progress".into(), message),
        SpotlightEvent::Skipped { message, .. } => {
            with_message("Skipping sync: checkpoint save failed".into(), message)
        }
        SpotlightEvent::SyncFailed {
            repo_root, message, ..
        } => {
            let mut lines = vec![format!("Saved checkpoint: {checkpoint_id}")];
            lines.extend(with_message(
                format!(
                    "Warning: checkpoint restore failed in {}",
                    repo_root.display()
                ),
                &Some(message.clone()),
            ));
            lines
        }
        SpotlightEvent::Stopped {
            repo_root,
            restore_error: None,
            ..
        } => vec![format!(
            "Spotlight stopped: {} is back to its own state",
            repo_root.display()
        )],
        SpotlightEvent::Stopped {
            repo_root,
            restore_error: Some(e),
            ..
        } => vec![format!(
            "Spotlight stopped: could not put {} back: {e}",
            repo_root.display()
        )],
    }
}

fn with_message(line: String, message: &Option<String>) -> Vec<String> {
    let mut lines = vec![line];
    lines.extend(
        message
            .iter()
            .flat_map(|m| m.lines())
            .filter(|l| !l.trim().is_empty())
            .map(str::to_owned),
    );
    lines
}

fn workspace_of(event: &SpotlightEvent) -> &str {
    match event {
        SpotlightEvent::Started { workspace_id, .. }
        | SpotlightEvent::Syncing { workspace_id, .. }
        | SpotlightEvent::Synced { workspace_id, .. }
        | SpotlightEvent::Skipped { workspace_id, .. }
        | SpotlightEvent::SyncFailed { workspace_id, .. }
        | SpotlightEvent::Stopped { workspace_id, .. } => workspace_id,
    }
}

/// Append `event` to its workspace's log; `Started` begins a new log.
fn record(logs: &Logs, event: &SpotlightEvent, checkpoint_id: &str) {
    let mut logs = logs.lock().unwrap_or_else(|e| e.into_inner());
    let workspace_id = workspace_of(event);
    if matches!(event, SpotlightEvent::Started { .. }) {
        logs.insert(
            workspace_id.to_string(),
            Log {
                lines: VecDeque::new(),
                started_at: SystemTime::now(),
            },
        );
    }
    let Some(log) = logs.get_mut(workspace_id) else {
        return;
    };
    for line in log_lines(event, checkpoint_id) {
        if log.lines.len() == LOG_LINES {
            log.lines.pop_front();
        }
        log.lines.push_back(line);
    }
}

struct Session {
    workspace_id: String,
    // Dropping it stops the loop; keep it last so the fields above outlive it.
    watcher: SpotlightWatcher,
}

pub struct SpotlightService {
    sessions: Mutex<HashMap<PathBuf, Session>>,
    logs: Logs,
    emit: Emit,
}

impl SpotlightService {
    pub fn new(emit: Emit) -> Self {
        let logs: Logs = Arc::default();
        let log = logs.clone();
        Self {
            sessions: Mutex::new(HashMap::new()),
            logs,
            // Start and stop are logged here, before the UI hears them.
            // Sync events name the session's checkpoint, so the watch
            // callback in `start` logs those.
            emit: Arc::new(move |event: SpotlightEvent| {
                if matches!(
                    event,
                    SpotlightEvent::Started { .. } | SpotlightEvent::Stopped { .. }
                ) {
                    record(&log, &event, "");
                }
                emit(event)
            }),
        }
    }

    /// The Spotlight log of `workspace_id`: the running session's, or the
    /// last one's until the workspace starts Spotlight again.
    pub fn output(&self, workspace_id: &str) -> Option<SpotlightOutput> {
        let (text, started_at) = {
            let logs = self.logs.lock().unwrap_or_else(|e| e.into_inner());
            let log = logs.get(workspace_id)?;
            (
                log.lines.iter().cloned().collect::<Vec<_>>().join("\n"),
                log.started_at,
            )
        };
        let live = self.lock().values().any(|s| s.workspace_id == workspace_id);
        Some(SpotlightOutput {
            text,
            live,
            started_at,
        })
    }

    /// The workspace spotlighted into `repo_root`, if any.
    pub fn active_workspace(&self, repo_root: &Path) -> Option<String> {
        self.lock().get(repo_root).map(|s| s.workspace_id.clone())
    }

    /// Start spotlighting `workspace_path` into `repo_root`. Starting the
    /// workspace that is already running there is a no-op (returns `false`).
    pub fn start(
        &self,
        workspace_id: &str,
        workspace_path: &Path,
        repo_root: &Path,
    ) -> Result<bool, String> {
        let mut sessions = self.lock();
        if let Some(current) = sessions.get(repo_root) {
            if current.workspace_id == workspace_id {
                return Ok(false);
            }
            let previous = sessions.remove(repo_root).expect("checked above");
            self.finish(repo_root, previous);
        }

        let leftover = begin(repo_root).map_err(|e| match e {
            SpotlightError::Root(blocker) => blocker.message().to_string(),
            other => other.to_string(),
        })?;
        let leftover_restore_error = match leftover {
            LeftoverSession::RestoreFailed(message) => Some(message),
            LeftoverSession::None | LeftoverSession::Restored => None,
        };
        (self.emit)(SpotlightEvent::Started {
            repo_root: repo_root.to_path_buf(),
            workspace_id: workspace_id.to_string(),
            leftover_restore_error,
        });

        let epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let id = session_checkpoint_id(epoch, std::process::id());
        let emit = self.emit.clone();
        let logs = self.logs.clone();
        let (root, ws_id, cp_id) = (
            repo_root.to_path_buf(),
            workspace_id.to_string(),
            id.clone(),
        );
        let watcher = match watch(workspace_path, repo_root, &id, move |event| {
            let event = SpotlightEvent::from_sync(&root, &ws_id, event);
            record(&logs, &event, &cp_id);
            emit(event)
        }) {
            Ok(w) => w,
            Err(e) => {
                let restore_error = end(repo_root).err().map(|e| e.to_string());
                (self.emit)(SpotlightEvent::Stopped {
                    repo_root: repo_root.to_path_buf(),
                    workspace_id: workspace_id.to_string(),
                    restore_error,
                });
                return Err(format!("Could not watch the workspace: {e}"));
            }
        };
        sessions.insert(
            repo_root.to_path_buf(),
            Session {
                workspace_id: workspace_id.to_string(),
                watcher,
            },
        );
        Ok(true)
    }

    /// Stop the session on `repo_root` and put the root back. Returns
    /// `false` when no session was running there.
    pub fn stop(&self, repo_root: &Path) -> bool {
        let session = self.lock().remove(repo_root);
        match session {
            Some(s) => {
                self.finish(repo_root, s);
                true
            }
            None => false,
        }
    }

    /// Stop every session; for app exit.
    pub fn stop_all(&self) {
        let sessions: Vec<_> = self.lock().drain().collect();
        for (root, session) in sessions {
            self.finish(&root, session);
        }
    }

    fn finish(&self, repo_root: &Path, session: Session) {
        let Session {
            workspace_id,
            watcher,
        } = session;
        // Waits for a sync in progress, so `end` never races one.
        drop(watcher);
        let restore_error = end(repo_root).err().map(|e| e.to_string());
        (self.emit)(SpotlightEvent::Stopped {
            repo_root: repo_root.to_path_buf(),
            workspace_id,
            restore_error,
        });
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<PathBuf, Session>> {
        self.sessions.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::{fixture, read};
    use super::*;
    use std::fs;
    use std::sync::mpsc;
    use std::time::Duration;

    fn service() -> (SpotlightService, mpsc::Receiver<SpotlightEvent>) {
        let (tx, rx) = mpsc::channel();
        let tx = Mutex::new(tx);
        let svc = SpotlightService::new(Arc::new(move |e| {
            let _ = tx.lock().unwrap().send(e);
        }));
        (svc, rx)
    }

    fn next(rx: &mpsc::Receiver<SpotlightEvent>) -> SpotlightEvent {
        rx.recv_timeout(Duration::from_secs(10)).expect("event")
    }

    #[test]
    fn start_syncs_and_stop_puts_the_root_back() {
        let f = fixture();
        let (svc, rx) = service();
        assert_eq!(svc.start("ws-1", &f.ws, &f.root), Ok(true));
        assert!(matches!(
            next(&rx),
            SpotlightEvent::Started {
                leftover_restore_error: None,
                ..
            }
        ));
        assert!(matches!(next(&rx), SpotlightEvent::Syncing { .. }));
        assert!(matches!(next(&rx), SpotlightEvent::Synced { .. }));
        assert_eq!(svc.active_workspace(&f.root).as_deref(), Some("ws-1"));
        assert_eq!(read(&f.root, "app.txt"), read(&f.ws, "app.txt"));

        // Starting the same workspace again changes nothing.
        assert_eq!(svc.start("ws-1", &f.ws, &f.root), Ok(false));

        assert!(svc.stop(&f.root));
        assert_eq!(
            next(&rx),
            SpotlightEvent::Stopped {
                repo_root: f.root.clone(),
                workspace_id: "ws-1".into(),
                restore_error: None,
            }
        );
        assert_eq!(read(&f.root, "app.txt").as_deref(), Some("v1\n"));
        assert_eq!(svc.active_workspace(&f.root), None);
        assert!(!svc.stop(&f.root));
    }

    #[test]
    fn log_reads_like_the_reference_script_and_outlives_the_session() {
        let f = fixture();
        let (svc, rx) = service();
        assert_eq!(svc.output("ws-1"), None);
        svc.start("ws-1", &f.ws, &f.root).unwrap();
        next(&rx);
        next(&rx);
        next(&rx); // started, syncing, synced
        let live = svc.output("ws-1").unwrap();
        assert!(live.live);
        let lines: Vec<&str> = live.text.lines().collect();
        let root = f.root.display();
        assert_eq!(
            lines[0],
            format!("Spotlight started: syncing this workspace into {root}")
        );
        assert_eq!(&lines[1..3], ["", "Starting sync..."]);
        let id = lines[3].strip_prefix("Saved checkpoint: ").unwrap();
        assert!(id.starts_with("cp-spotlight-"), "{id}");
        assert_eq!(lines[4], format!("Restored checkpoint {id} in {root}"));

        svc.stop(&f.root);
        let stopped = svc.output("ws-1").unwrap();
        assert!(!stopped.live);
        assert_eq!(
            stopped.text.lines().last().unwrap(),
            format!("Spotlight stopped: {root} is back to its own state")
        );
        assert_eq!(stopped.started_at, live.started_at);
        assert_eq!(svc.output("ws-2"), None);

        // The next start begins a new log.
        while rx.try_recv().is_ok() {}
        svc.start("ws-1", &f.ws, &f.root).unwrap();
        next(&rx);
        let restarted = svc.output("ws-1").unwrap();
        assert!(restarted.text.starts_with("Spotlight started"));
        assert!(!restarted.text.contains("Spotlight stopped"));
        svc.stop(&f.root);
    }

    #[test]
    fn sync_problems_are_logged_with_the_reference_wording() {
        let root = PathBuf::from("/r");
        let ws = || "w".to_string();
        let busy = SpotlightEvent::Skipped {
            repo_root: root.clone(),
            workspace_id: ws(),
            busy: true,
            message: None,
        };
        assert_eq!(
            log_lines(&busy, "cp"),
            ["Skipping sync: merge/rebase in progress"]
        );
        let save = SpotlightEvent::Skipped {
            repo_root: root.clone(),
            workspace_id: ws(),
            busy: false,
            message: Some("fatal: x\n\n".into()),
        };
        assert_eq!(
            log_lines(&save, "cp"),
            ["Skipping sync: checkpoint save failed", "fatal: x"]
        );
        let failed = SpotlightEvent::SyncFailed {
            repo_root: root,
            workspace_id: ws(),
            message: "locked".into(),
        };
        assert_eq!(
            log_lines(&failed, "cp"),
            [
                "Saved checkpoint: cp",
                "Warning: checkpoint restore failed in /r",
                "locked"
            ]
        );
    }

    #[test]
    fn start_refuses_a_blocked_root_with_its_message() {
        let f = fixture();
        let head = String::from_utf8(
            std::process::Command::new("git")
                .current_dir(&f.root)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap()
                .stdout,
        )
        .unwrap();
        let st = std::process::Command::new("git")
            .current_dir(&f.root)
            .args(["checkout", "-q", "--detach", head.trim()])
            .status()
            .unwrap();
        assert!(st.success());
        let (svc, rx) = service();
        let err = svc.start("ws-1", &f.ws, &f.root).unwrap_err();
        assert_eq!(err, super::super::RootBlocker::DetachedHead.message());
        assert!(rx.try_recv().is_err());
        assert_eq!(svc.active_workspace(&f.root), None);
    }

    #[test]
    fn service_can_be_shared_across_threads() {
        // Tauri managed state must be Send + Sync on every platform.
        fn shared<T: Send + Sync + 'static>() {}
        shared::<SpotlightService>();
        shared::<Arc<SpotlightService>>();
    }

    #[test]
    fn serializes_as_tagged_camel_case() {
        let e = SpotlightEvent::Skipped {
            repo_root: "/r".into(),
            workspace_id: "w".into(),
            busy: true,
            message: None,
        };
        assert_eq!(
            serde_json::to_string(&e).unwrap(),
            r#"{"type":"skipped","repoRoot":"/r","workspaceId":"w","busy":true,"message":null}"#
        );
    }

    #[test]
    fn stop_all_ends_every_session() {
        let f = fixture();
        let (svc, rx) = service();
        svc.start("ws-1", &f.ws, &f.root).unwrap();
        fs::write(f.ws.join("app.txt"), "edit\n").unwrap();
        svc.stop_all();
        let mut stopped = false;
        while let Ok(e) = rx.recv_timeout(Duration::from_secs(10)) {
            if matches!(
                e,
                SpotlightEvent::Stopped {
                    restore_error: None,
                    ..
                }
            ) {
                stopped = true;
                break;
            }
        }
        assert!(stopped);
        assert_eq!(read(&f.root, "app.txt").as_deref(), Some("v1\n"));
        assert_eq!(svc.active_workspace(&f.root), None);
    }
}
