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

use std::collections::HashMap;
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

struct Session {
    workspace_id: String,
    // Dropping it stops the loop; keep it last so the fields above outlive it.
    watcher: SpotlightWatcher,
}

pub struct SpotlightService {
    sessions: Mutex<HashMap<PathBuf, Session>>,
    emit: Emit,
}

impl SpotlightService {
    pub fn new(emit: Emit) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            emit,
        }
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
        let (root, ws_id) = (repo_root.to_path_buf(), workspace_id.to_string());
        let watcher = match watch(workspace_path, repo_root, &id, move |event| {
            emit(SpotlightEvent::from_sync(&root, &ws_id, event))
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
