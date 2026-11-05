//! The Spotlight watch loop: sync the workspace into the root once at start,
//! then again after every relevant file change.
//!
//! The reference app runs `watchexec` on the workspace with its default
//! startup run, `.gitignore` handling and two extra ignores (`*.tmp.*` and
//! `.context/**`). It runs one sync at a time and queues one more for
//! changes that arrive during a sync. This loop does the same with
//! `notify`: changes are debounced, a sync runs on its own thread, and
//! changes seen while it runs trigger exactly one follow-up sync.
//!
//! Only the workspace's top-level `.gitignore` is applied (nested ignore
//! files and `info/exclude` are not), so a change to a file ignored only
//! there still triggers a sync; that sync copies nothing new.

use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread::JoinHandle;
use std::time::Duration;

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::{RecursiveMode, Watcher as _};

use super::{sync_once, SyncOutcome};

/// Quiet period that groups a burst of changes into one sync.
const DEBOUNCE: Duration = Duration::from_millis(100);

/// What the loop reports, in order: `Syncing` then `Finished` per sync.
#[derive(Debug, PartialEq, Eq)]
pub enum SyncEvent {
    Syncing,
    Finished(SyncOutcome),
}

enum Msg {
    Changed(Vec<PathBuf>),
    Stop,
}

/// A running watch loop. Dropping it stops the loop and waits for a sync
/// in progress to finish.
pub struct SpotlightWatcher {
    tx: mpsc::Sender<Msg>,
    thread: Option<JoinHandle<()>>,
    _fs: notify::RecommendedWatcher,
}

impl Drop for SpotlightWatcher {
    fn drop(&mut self) {
        let _ = self.tx.send(Msg::Stop);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// Changes under the workspace that should trigger a sync.
struct Filter {
    workspace: PathBuf,
    gitignore: Gitignore,
}

impl Filter {
    fn new(workspace: &Path) -> Self {
        let mut b = GitignoreBuilder::new(workspace);
        // A missing or unreadable .gitignore just means no extra ignores.
        let _ = b.add(workspace.join(".gitignore"));
        Filter {
            workspace: workspace.to_path_buf(),
            gitignore: b.build().unwrap_or_else(|_| Gitignore::empty()),
        }
    }

    fn is_relevant(&self, path: &Path) -> bool {
        let Ok(rel) = path.strip_prefix(&self.workspace) else {
            return false;
        };
        let mut parts = rel.components().filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy()),
            _ => None,
        });
        let Some(first) = parts.next() else {
            return false;
        };
        if first == ".git" || first == ".context" {
            return false;
        }
        if std::iter::once(first)
            .chain(parts)
            .any(|p| p.contains(".tmp."))
        {
            return false;
        }
        !self
            .gitignore
            .matched_path_or_any_parents(path, false)
            .is_ignore()
    }
}

/// Start watching `workspace`, syncing into `root` through checkpoint `id`.
/// `on_event` runs on the loop's thread.
pub fn watch(
    workspace: &Path,
    root: &Path,
    id: &str,
    mut on_event: impl FnMut(SyncEvent) + Send + 'static,
) -> notify::Result<SpotlightWatcher> {
    let workspace = std::fs::canonicalize(workspace)?;
    let root = root.to_path_buf();
    let id = id.to_string();
    let (tx, rx) = mpsc::channel();

    let fs_tx = tx.clone();
    let mut fs = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        // Reads (git opening files during a sync) are not changes; without
        // this every sync would trigger the next one.
        match res {
            Ok(e) if !matches!(e.kind, notify::EventKind::Access(_)) => {
                let _ = fs_tx.send(Msg::Changed(e.paths));
            }
            _ => {}
        }
    })?;
    fs.watch(&workspace, RecursiveMode::Recursive)?;

    let filter = Filter::new(&workspace);
    let thread = std::thread::spawn(move || {
        // Like watchexec without --postpone: sync once at start.
        let mut pending = true;
        loop {
            if pending {
                loop {
                    match rx.recv_timeout(DEBOUNCE) {
                        Ok(Msg::Changed(_)) => continue,
                        Ok(Msg::Stop) | Err(RecvTimeoutError::Disconnected) => return,
                        Err(RecvTimeoutError::Timeout) => break,
                    }
                }
                on_event(SyncEvent::Syncing);
                on_event(SyncEvent::Finished(sync_once(&workspace, &root, &id)));
            }
            pending = match rx.recv() {
                Ok(Msg::Changed(paths)) => paths.iter().any(|p| filter.is_relevant(p)),
                Ok(Msg::Stop) | Err(_) => return,
            };
        }
    });

    Ok(SpotlightWatcher {
        tx,
        thread: Some(thread),
        _fs: fs,
    })
}

#[cfg(test)]
mod tests {
    use super::super::tests::{fixture, read};
    use super::super::{begin, end};
    use super::*;
    use std::fs;
    use std::time::Instant;

    #[test]
    fn filter_skips_git_context_tmp_and_gitignored_paths() {
        let f = fixture();
        let ws = &f.ws;
        fs::write(ws.join(".gitignore"), "*.log\ntarget/\n").unwrap();
        let filter = Filter::new(ws);
        assert!(filter.is_relevant(&ws.join("src/main.rs")));
        assert!(filter.is_relevant(&ws.join(".gitignore")));
        assert!(!filter.is_relevant(&ws.join(".git")));
        assert!(!filter.is_relevant(&ws.join(".context/notes.md")));
        assert!(!filter.is_relevant(&ws.join("app.txt.tmp.123")));
        assert!(!filter.is_relevant(&ws.join("server.log")));
        assert!(!filter.is_relevant(&ws.join("target/debug/app")));
        assert!(!filter.is_relevant(&f.root.join("app.txt")));
    }

    fn next(rx: &mpsc::Receiver<SyncEvent>) -> Option<SyncEvent> {
        rx.recv_timeout(Duration::from_secs(10)).ok()
    }

    #[test]
    fn syncs_at_start_and_after_each_change_until_dropped() {
        let f = fixture();
        begin(&f.root).unwrap();
        let (tx, rx) = mpsc::channel();
        let w = watch(&f.ws, &f.root, "cp-spotlight-1-1", move |e| {
            let _ = tx.send(e);
        })
        .unwrap();
        assert_eq!(next(&rx), Some(SyncEvent::Syncing));
        assert_eq!(next(&rx), Some(SyncEvent::Finished(SyncOutcome::Synced)));

        fs::write(f.ws.join("app.txt"), "live edit\n").unwrap();
        assert_eq!(next(&rx), Some(SyncEvent::Syncing));
        assert_eq!(next(&rx), Some(SyncEvent::Finished(SyncOutcome::Synced)));
        assert_eq!(read(&f.root, "app.txt").as_deref(), Some("live edit\n"));

        // A change to an ignored file does not sync.
        fs::write(f.ws.join("build.log"), "noise\n").unwrap();
        let quiet = Instant::now();
        assert!(rx.recv_timeout(Duration::from_millis(600)).is_err());
        assert!(quiet.elapsed() >= Duration::from_millis(600));

        drop(w);
        fs::write(f.ws.join("app.txt"), "after stop\n").unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(read(&f.root, "app.txt").as_deref(), Some("live edit\n"));
        end(&f.root).unwrap();
        assert_eq!(read(&f.root, "app.txt").as_deref(), Some("v1\n"));
    }
}
