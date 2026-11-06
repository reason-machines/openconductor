//! Spotlight sessions against a throwaway repository with one worktree.

use super::*;
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};

pub(super) struct Fixture {
    base: PathBuf,
    pub(super) root: PathBuf,
    pub(super) ws: PathBuf,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

fn g(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_EDITOR", "true")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn write(dir: &Path, rel: &str, body: &str) {
    fs::write(dir.join(rel), body).unwrap();
}

pub(super) fn read(dir: &Path, rel: &str) -> Option<String> {
    fs::read_to_string(dir.join(rel)).ok()
}

/// Root on `main` with one commit, plus a worktree on `feature`.
pub(super) fn fixture() -> Fixture {
    static N: AtomicU64 = AtomicU64::new(0);
    let base = std::env::temp_dir().join(format!(
        "spotlight-test-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("root");
    fs::create_dir_all(&root).unwrap();
    let base = fs::canonicalize(&base).unwrap();
    let root = base.join("root");
    g(&root, &["init", "-q", "-b", "main"]);
    write(&root, ".gitignore", "*.log\n");
    write(&root, "app.txt", "v1\n");
    g(&root, &["add", "."]);
    g(&root, &["commit", "-q", "-m", "init"]);
    let ws = base.join("ws");
    g(
        &root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "feature",
            ws.to_str().unwrap(),
        ],
    );
    Fixture { base, root, ws }
}

#[test]
fn session_syncs_workspace_into_root_and_end_restores_root() {
    let f = fixture();
    let main_head = g(&f.root, &["rev-parse", "HEAD"]);
    // The root has its own uncommitted work and an ignored file.
    write(&f.root, "app.txt", "root edit\n");
    write(&f.root, "notes.txt", "root only\n");
    write(&f.root, "server.log", "keep\n");

    assert_eq!(begin(&f.root).unwrap(), LeftoverSession::None);

    write(&f.ws, "app.txt", "v2\n");
    g(&f.ws, &["commit", "-qam", "v2"]);
    write(&f.ws, "app.txt", "v3 unsaved\n");
    write(&f.ws, "new.txt", "untracked in ws\n");
    let ws_head = g(&f.ws, &["rev-parse", "HEAD"]);

    let id = session_checkpoint_id(1_700_000_000, 42);
    assert_eq!(id, "cp-spotlight-1700000000-42");
    assert_eq!(sync_once(&f.ws, &f.root, &id), SyncOutcome::Synced);
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("v3 unsaved\n"));
    assert_eq!(
        read(&f.root, "new.txt").as_deref(),
        Some("untracked in ws\n")
    );
    assert_eq!(read(&f.root, "notes.txt"), None);
    assert_eq!(read(&f.root, "server.log").as_deref(), Some("keep\n"));
    assert_eq!(g(&f.root, &["rev-parse", "HEAD"]), ws_head);

    // A second change reuses the same id.
    write(&f.ws, "new.txt", "edited\n");
    assert_eq!(sync_once(&f.ws, &f.root, &id), SyncOutcome::Synced);
    assert_eq!(read(&f.root, "new.txt").as_deref(), Some("edited\n"));

    end(&f.root).unwrap();
    assert_eq!(g(&f.root, &["rev-parse", "HEAD"]), main_head);
    assert_eq!(g(&f.root, &["branch", "--show-current"]), "main");
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("root edit\n"));
    assert_eq!(read(&f.root, "notes.txt").as_deref(), Some("root only\n"));
    assert_eq!(read(&f.root, "new.txt"), None);
    assert!(!has_checkpoint(&f.root, PRE_SPOTLIGHT_ID).unwrap());
    // The workspace itself is never touched.
    assert_eq!(read(&f.ws, "app.txt").as_deref(), Some("v3 unsaved\n"));
}

#[test]
fn begin_refuses_a_root_that_cannot_take_syncs() {
    let f = fixture();
    let head = g(&f.root, &["rev-parse", "HEAD"]);
    g(&f.root, &["checkout", "-q", "--detach"]);
    let err = begin(&f.root).unwrap_err();
    assert!(matches!(
        err,
        SpotlightError::Root(RootBlocker::DetachedHead)
    ));
    assert!(err.to_string().contains("detached HEAD"));
    assert!(!has_checkpoint(&f.root, PRE_SPOTLIGHT_ID).unwrap());

    g(&f.root, &["checkout", "-q", "main"]);
    fs::write(
        git_path(&f.root, "MERGE_HEAD").unwrap(),
        format!("{head}\n"),
    )
    .unwrap();
    assert_eq!(root_blocker(&f.root).unwrap(), Some(RootBlocker::Merge));

    // A rebase is reported before a merge.
    fs::create_dir_all(git_path(&f.root, "rebase-merge").unwrap()).unwrap();
    assert_eq!(root_blocker(&f.root).unwrap(), Some(RootBlocker::Rebase));
}

#[test]
fn busy_workspace_is_skipped_and_root_is_untouched() {
    let f = fixture();
    begin(&f.root).unwrap();
    let head = g(&f.ws, &["rev-parse", "HEAD"]);
    write(&f.ws, "app.txt", "mid merge\n");
    let merge_head = git_path(&f.ws, "MERGE_HEAD").unwrap();
    fs::write(&merge_head, format!("{head}\n")).unwrap();

    let id = session_checkpoint_id(1, 1);
    assert_eq!(sync_once(&f.ws, &f.root, &id), SyncOutcome::SkippedBusy);
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("v1\n"));

    fs::remove_file(merge_head).unwrap();
    assert_eq!(sync_once(&f.ws, &f.root, &id), SyncOutcome::Synced);
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("mid merge\n"));
}

#[test]
fn begin_undoes_a_session_that_was_never_ended() {
    let f = fixture();
    write(&f.root, "app.txt", "root edit\n");
    begin(&f.root).unwrap();
    write(&f.ws, "app.txt", "from ws\n");
    let id = session_checkpoint_id(2, 2);
    assert_eq!(sync_once(&f.ws, &f.root, &id), SyncOutcome::Synced);

    // The app quit without ending the session; the next start recovers.
    assert_eq!(begin(&f.root).unwrap(), LeftoverSession::Restored);
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("root edit\n"));
    end(&f.root).unwrap();
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("root edit\n"));
}

#[test]
fn end_without_a_session_changes_nothing() {
    let f = fixture();
    write(&f.root, "app.txt", "dirty\n");
    end(&f.root).unwrap();
    assert_eq!(read(&f.root, "app.txt").as_deref(), Some("dirty\n"));
}

const LOCAL_SETTINGS: &str = ".conductor/settings.local.toml";

#[test]
fn the_roots_local_settings_file_survives_syncs_and_end() {
    let f = fixture();
    setting::write_local(&f.root, true).unwrap();
    let on = read(&f.root, LOCAL_SETTINGS).unwrap();
    assert!(on.contains("spotlight_testing = true"), "{on}");

    begin(&f.root).unwrap();
    // The workspace has a local settings file of its own; it is not the root's.
    fs::create_dir_all(f.ws.join(".conductor")).unwrap();
    write(&f.ws, LOCAL_SETTINGS, "spotlight_testing = false\n");
    write(&f.ws, "new.txt", "from ws\n");
    let id = session_checkpoint_id(1, 1);
    assert_eq!(sync_once(&f.ws, &f.root, &id), SyncOutcome::Synced);
    assert_eq!(read(&f.root, "new.txt").as_deref(), Some("from ws\n"));
    assert_eq!(read(&f.root, LOCAL_SETTINGS), Some(on.clone()));

    end(&f.root).unwrap();
    assert_eq!(read(&f.root, "new.txt"), None);
    assert_eq!(read(&f.root, LOCAL_SETTINGS), Some(on));
    assert_eq!(
        g(&f.root, &["status", "--porcelain", "--untracked-files=all"]),
        "?? .conductor/settings.local.toml"
    );
}

#[test]
fn turning_the_setting_off_during_a_session_stays_off_after_end() {
    // The toggle writes the file, then stops Spotlight (setting::apply).
    let f = fixture();
    setting::write_local(&f.root, true).unwrap();
    begin(&f.root).unwrap();
    assert_eq!(
        sync_once(&f.ws, &f.root, &session_checkpoint_id(1, 2)),
        SyncOutcome::Synced
    );
    setting::write_local(&f.root, false).unwrap();
    end(&f.root).unwrap();
    let text = read(&f.root, LOCAL_SETTINGS).unwrap();
    assert!(text.contains("spotlight_testing = false"), "{text}");
}

#[test]
fn a_root_without_local_settings_does_not_get_the_workspaces() {
    let f = fixture();
    begin(&f.root).unwrap();
    fs::create_dir_all(f.ws.join(".conductor")).unwrap();
    write(&f.ws, LOCAL_SETTINGS, "spotlight_testing = true\n");
    assert_eq!(
        sync_once(&f.ws, &f.root, &session_checkpoint_id(1, 3)),
        SyncOutcome::Synced
    );
    assert_eq!(read(&f.root, LOCAL_SETTINGS), None);
    end(&f.root).unwrap();
    assert_eq!(read(&f.root, LOCAL_SETTINGS), None);
}
