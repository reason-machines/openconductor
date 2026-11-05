//! Behavior tests against throwaway git repositories.

use super::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        static N: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!(
            "ckpt-test-{tag}-{}-{nanos}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&p).unwrap();
        TempDir(fs::canonicalize(&p).unwrap())
    }
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn git_cmd(dir: &Path, args: &[&str]) -> std::process::Output {
    Command::new("git")
        .current_dir(dir)
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_EDITOR", "true")
        .output()
        .unwrap()
}

/// Run git, asserting success; returns trimmed stdout.
fn g(dir: &Path, args: &[&str]) -> String {
    let out = git_cmd(dir, args);
    assert!(
        out.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn write(dir: &Path, rel: &str, content: &str) {
    let p = dir.join(rel);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(p, content).unwrap();
}

fn read(dir: &Path, rel: &str) -> String {
    fs::read_to_string(dir.join(rel)).unwrap()
}

fn init_repo(tag: &str) -> TempDir {
    let t = TempDir::new(tag);
    g(t.path(), &["init", "-q", "-b", "main"]);
    g(t.path(), &["config", "commit.gpgsign", "false"]);
    t
}

fn repo_with_commit(tag: &str) -> TempDir {
    let t = init_repo(tag);
    write(t.path(), "a.txt", "base\n");
    write(t.path(), "keep/b.txt", "bee\n");
    g(t.path(), &["add", "-A"]);
    g(t.path(), &["commit", "-q", "-m", "init"]);
    t
}

fn named(id: &str) -> SaveOptions {
    SaveOptions { id: Some(id.into()), force: false }
}

fn status(dir: &Path) -> String {
    g(dir, &["status", "--porcelain=v1", "--untracked-files=all"])
}

#[test]
fn save_change_restore_round_trip() {
    let t = repo_with_commit("roundtrip");
    let ws = t.path();

    // Dirty state to capture: unstaged edit, staged new file, untracked file
    // and dir, deleted tracked file.
    write(ws, "a.txt", "edited\n");
    write(ws, "staged.txt", "staged\n");
    g(ws, &["add", "staged.txt"]);
    write(ws, "untracked.txt", "u\n");
    write(ws, "newdir/n.txt", "n\n");
    fs::remove_file(ws.join("keep/b.txt")).unwrap();
    let head_before = g(ws, &["rev-parse", "HEAD"]);
    let status_before = status(ws);
    let cached_before = g(ws, &["diff", "--cached", "--name-status"]);

    let id = save(ws, &named("turn-1")).unwrap();
    assert_eq!(id, "turn-1");
    // Non-disruptive: nothing about HEAD, index or files changed.
    assert_eq!(g(ws, &["rev-parse", "HEAD"]), head_before);
    assert_eq!(status(ws), status_before);
    assert_eq!(read(ws, "a.txt"), "edited\n");

    // Now wreck the workspace: commit, edit, add/remove files.
    write(ws, "a.txt", "later\n");
    write(ws, "keep/b.txt", "resurrected\n");
    fs::remove_file(ws.join("untracked.txt")).unwrap();
    write(ws, "junk.txt", "junk\n");
    write(ws, "junkdir/deep/j.txt", "j\n");
    g(ws, &["add", "-A"]);
    g(ws, &["commit", "-q", "-m", "later"]);
    write(ws, "after-commit.txt", "x\n");
    fs::create_dir_all(ws.join("empty-dir/nested")).unwrap();
    assert_ne!(g(ws, &["rev-parse", "HEAD"]), head_before);

    restore(ws, "turn-1").unwrap();

    assert_eq!(g(ws, &["rev-parse", "HEAD"]), head_before, "HEAD restored");
    assert_eq!(read(ws, "a.txt"), "edited\n");
    assert_eq!(read(ws, "staged.txt"), "staged\n");
    assert_eq!(read(ws, "untracked.txt"), "u\n");
    assert_eq!(read(ws, "newdir/n.txt"), "n\n");
    assert!(!ws.join("keep/b.txt").exists(), "deleted file stays deleted");
    assert!(!ws.join("junk.txt").exists());
    assert!(!ws.join("junkdir").exists(), "untracked dirs removed");
    assert!(!ws.join("after-commit.txt").exists());
    // Only `git clean -fd` removes these: git never indexes empty dirs.
    assert!(!ws.join("empty-dir").exists(), "empty untracked dirs removed");
    assert_eq!(status(ws), status_before, "status identical");
    assert_eq!(
        g(ws, &["diff", "--cached", "--name-status"]),
        cached_before,
        "staged state restored"
    );
    // The branch moved back too (mixed reset of the checked-out branch).
    assert_eq!(g(ws, &["rev-parse", "main"]), head_before);
}

#[test]
fn checkpoint_commit_layout_matches_reference() {
    let t = repo_with_commit("layout");
    let ws = t.path();
    write(ws, "u.txt", "u\n");
    let head = g(ws, &["rev-parse", "HEAD"]);
    let index_tree = g(ws, &["write-tree"]);
    save(ws, &named("l1")).unwrap();

    // Literal ref name from the reference script, not just our constant.
    let reference = "refs/conductor-checkpoints/l1".to_string();
    assert_eq!(format!("{REF_NAMESPACE}/l1"), reference);
    let commit = g(ws, &["rev-parse", &reference]);
    let raw = g(ws, &["cat-file", "commit", &commit]);
    assert!(!raw.contains("\nparent "), "checkpoint commit has no parent");
    assert!(raw.contains("\nauthor Checkpointer <checkpointer@noreply> "));
    assert!(raw.contains("\ncommitter Checkpointer <checkpointer@noreply> "));

    let body = raw.split("\n\n").nth(1).unwrap();
    let lines: Vec<&str> = body.lines().collect();
    assert_eq!(lines[0], "checkpoint:l1");
    assert_eq!(lines[1], format!("head {head}"));
    assert_eq!(lines[2], format!("index-tree {index_tree}"));
    assert!(lines[3].starts_with("worktree-tree "));
    assert!(lines[4].starts_with("created "));
    assert_eq!(lines[5], format!("worktree {}", ws.display()));

    // Commit tree == worktree tree, which includes the untracked file.
    let tree = g(ws, &["rev-parse", &format!("{commit}^{{tree}}")]);
    assert_eq!(lines[3], format!("worktree-tree {tree}"));
    let names = g(ws, &["ls-tree", "-r", "--name-only", &tree]);
    assert!(names.lines().any(|l| l == "u.txt"));

    let cp = get(ws, "l1").unwrap();
    assert_eq!(cp.head.as_deref(), Some(head.as_str()));
    assert_eq!(cp.index_tree, index_tree);
    assert_eq!(cp.worktree_tree, tree);
    assert_eq!(cp.commit, commit);
    let c = &cp.created;
    assert_eq!(c.len(), 20, "created like 2025-01-02T03:04:05Z: {c}");
    assert!(c.ends_with('Z') && &c[10..11] == "T");

    // No temp index left behind.
    let tmp = ws.join(".git").join("conductor-checkpoint-tmp");
    assert_eq!(fs::read_dir(tmp).unwrap().count(), 0);
}

#[test]
fn default_id_and_duplicate_handling() {
    let t = repo_with_commit("ids");
    let ws = t.path();
    let id = save(ws, &SaveOptions::default()).unwrap();
    assert!(id.starts_with("cp-") && id.len() == "cp-20250101T000000Z".len(), "{id}");
    assert!(id[3..11].bytes().all(|b| b.is_ascii_digit()) && id.ends_with('Z'));

    save(ws, &named("dup")).unwrap();
    let first = get(ws, "dup").unwrap();
    write(ws, "a.txt", "changed\n");
    match save(ws, &named("dup")) {
        Err(CheckpointError::AlreadyExists(i)) => assert_eq!(i, "dup"),
        other => panic!("expected AlreadyExists, got {other:?}"),
    }
    save(ws, &SaveOptions { id: Some("dup".into()), force: true }).unwrap();
    assert_ne!(get(ws, "dup").unwrap().worktree_tree, first.worktree_tree);

    assert!(matches!(save(ws, &named("bad id")), Err(CheckpointError::InvalidId(_))));
    assert!(matches!(save(ws, &named("a/b")), Err(CheckpointError::InvalidId(_))));
    assert!(matches!(save(ws, &named("x..y")), Err(CheckpointError::InvalidId(_))));
}

#[test]
fn ignored_files_semantics() {
    let t = init_repo("ignored");
    let ws = t.path();
    write(ws, ".gitignore", "*.log\nbuild/\n");
    write(ws, "a.txt", "a\n");
    write(ws, "tracked.log", "tracked but ignored pattern\n");
    g(ws, &["add", ".gitignore", "a.txt"]);
    g(ws, &["add", "-f", "tracked.log"]);
    g(ws, &["commit", "-q", "-m", "init"]);
    write(ws, "tracked.log", "edited tracked log\n");
    write(ws, "debug.log", "ignored\n");
    write(ws, "build/out.bin", "ignored dir\n");

    save(ws, &named("ig")).unwrap();
    let cp = get(ws, "ig").unwrap();
    let names = g(ws, &["ls-tree", "-r", "--name-only", &cp.worktree_tree]);
    assert!(names.lines().any(|l| l == "tracked.log"), "tracked ignored-pattern file kept");
    assert!(!names.contains("debug.log") && !names.contains("build/"), "ignored files skipped");

    write(ws, "tracked.log", "changed again\n");
    write(ws, "fresh.txt", "untracked\n");
    fs::remove_file(ws.join("debug.log")).unwrap();
    write(ws, "other.log", "new ignored\n");
    restore(ws, "ig").unwrap();

    assert_eq!(read(ws, "tracked.log"), "edited tracked log\n");
    assert!(!ws.join("fresh.txt").exists(), "untracked non-ignored removed");
    assert_eq!(read(ws, "other.log"), "new ignored\n", "ignored files are left alone");
    assert_eq!(read(ws, "build/out.bin"), "ignored dir\n");
    assert!(!ws.join("debug.log").exists(), "ignored files are not part of the snapshot");
}

#[test]
fn restore_is_noop_when_state_matches() {
    let t = repo_with_commit("noop");
    let ws = t.path();
    write(ws, "a.txt", "dirty\n");
    write(ws, "u.txt", "u\n");
    save(ws, &named("n")).unwrap();
    restore(ws, "n").unwrap();

    let old = SystemTime::now() - Duration::from_secs(3600);
    for f in ["a.txt", "u.txt", "keep/b.txt"] {
        fs::File::options().write(true).open(ws.join(f)).unwrap().set_modified(old).unwrap();
    }
    // Refresh so the index carries the new stat info, as restore leaves it.
    let _ = git_cmd(ws, &["update-index", "-q", "--refresh"]);
    let reflog_before = g(ws, &["reflog"]).lines().count();

    restore(ws, "n").unwrap();

    for f in ["a.txt", "u.txt", "keep/b.txt"] {
        let m = fs::metadata(ws.join(f)).unwrap().modified().unwrap();
        assert_eq!(m, old, "{f} was rewritten by a no-op restore");
    }
    assert_eq!(g(ws, &["reflog"]).lines().count(), reflog_before, "no reflog entry");
}

#[test]
fn only_differing_files_are_rewritten() {
    let t = repo_with_commit("minimal");
    let ws = t.path();
    save(ws, &named("m")).unwrap();
    let old = SystemTime::now() - Duration::from_secs(3600);
    fs::File::options().write(true).open(ws.join("keep/b.txt")).unwrap().set_modified(old).unwrap();
    let _ = git_cmd(ws, &["update-index", "-q", "--refresh"]);
    write(ws, "a.txt", "changed\n");

    restore(ws, "m").unwrap();
    assert_eq!(read(ws, "a.txt"), "base\n");
    let m = fs::metadata(ws.join("keep/b.txt")).unwrap().modified().unwrap();
    assert_eq!(m, old, "unchanged file untouched");
}

#[test]
fn busy_states_skip_save() {
    let t = repo_with_commit("busy");
    let ws = t.path();
    assert_eq!(busy_state(ws).unwrap(), BusyState::Clean);

    // Real conflicting merge -> busy:merge (exit 101).
    g(ws, &["checkout", "-q", "-b", "other"]);
    write(ws, "a.txt", "other\n");
    g(ws, &["commit", "-qam", "other"]);
    g(ws, &["checkout", "-q", "main"]);
    write(ws, "a.txt", "mine\n");
    g(ws, &["commit", "-qam", "mine"]);
    assert!(!git_cmd(ws, &["merge", "-q", "other"]).status.success());
    assert_eq!(busy_state(ws).unwrap(), BusyState::Merge);
    let err = save(ws, &named("m")).unwrap_err();
    assert!(matches!(err, CheckpointError::Busy(BusyState::Merge)));
    assert_eq!(err.reference_exit_code(), 101);
    assert!(err.is_skip());
    g(ws, &["merge", "--abort"]);

    // Real conflicting cherry-pick.
    assert!(!git_cmd(ws, &["cherry-pick", "other"]).status.success());
    assert_eq!(busy_state(ws).unwrap(), BusyState::CherryPick);
    g(ws, &["cherry-pick", "--abort"]);
    assert_eq!(busy_state(ws).unwrap(), BusyState::Clean);

    // Marker-based states, checked by path like the reference script.
    let git_dir = ws.join(".git");
    fs::create_dir(git_dir.join("rebase-merge")).unwrap();
    assert_eq!(busy_state(ws).unwrap(), BusyState::Rebase);
    fs::remove_dir(git_dir.join("rebase-merge")).unwrap();
    fs::create_dir(git_dir.join("rebase-apply")).unwrap();
    assert_eq!(busy_state(ws).unwrap(), BusyState::Rebase);
    fs::remove_dir(git_dir.join("rebase-apply")).unwrap();
    let head = g(ws, &["rev-parse", "HEAD"]);
    fs::write(git_dir.join("REVERT_HEAD"), &head).unwrap();
    assert_eq!(busy_state(ws).unwrap(), BusyState::Revert);
    fs::remove_file(git_dir.join("REVERT_HEAD")).unwrap();
    // A clean squash merge (SQUASH_MSG, no conflicts) is not busy.
    fs::write(git_dir.join("SQUASH_MSG"), "squash").unwrap();
    assert_eq!(busy_state(ws).unwrap(), BusyState::Clean);
    fs::remove_file(git_dir.join("SQUASH_MSG")).unwrap();
}

#[test]
fn conflicted_squash_merge_is_busy() {
    let t = repo_with_commit("squash");
    let ws = t.path();
    g(ws, &["checkout", "-q", "-b", "other"]);
    write(ws, "a.txt", "other\n");
    g(ws, &["commit", "-qam", "other"]);
    g(ws, &["checkout", "-q", "main"]);
    write(ws, "a.txt", "mine\n");
    g(ws, &["commit", "-qam", "mine"]);
    assert!(!git_cmd(ws, &["merge", "--squash", "other"]).status.success());
    assert_eq!(busy_state(ws).unwrap(), BusyState::SquashMerge);
    assert!(matches!(save(ws, &named("s")), Err(CheckpointError::Busy(BusyState::SquashMerge))));
}

#[test]
fn unresolved_conflicts_without_operation_is_102() {
    let t = repo_with_commit("conflict");
    let ws = t.path();
    write(ws, "a.txt", "stashed\n");
    g(ws, &["stash", "-q"]);
    write(ws, "a.txt", "committed\n");
    g(ws, &["commit", "-qam", "c"]);
    assert!(!git_cmd(ws, &["stash", "pop", "-q"]).status.success());
    assert_eq!(busy_state(ws).unwrap(), BusyState::Clean);
    let err = save(ws, &named("c")).unwrap_err();
    assert!(matches!(err, CheckpointError::UnresolvedConflicts), "{err:?}");
    assert_eq!(err.reference_exit_code(), 102);
}

#[test]
fn restore_clears_in_progress_merge() {
    let t = repo_with_commit("midmerge");
    let ws = t.path();
    g(ws, &["checkout", "-q", "-b", "other"]);
    write(ws, "a.txt", "other\n");
    g(ws, &["commit", "-qam", "other"]);
    g(ws, &["checkout", "-q", "main"]);
    write(ws, "a.txt", "mine\n");
    g(ws, &["commit", "-qam", "mine"]);
    write(ws, "wip.txt", "wip\n");
    save(ws, &named("pre-merge")).unwrap();
    let head = g(ws, &["rev-parse", "HEAD"]);

    assert!(!git_cmd(ws, &["merge", "-q", "other"]).status.success());
    assert!(!g(ws, &["ls-files", "-u"]).is_empty());

    restore(ws, "pre-merge").unwrap();
    assert_eq!(busy_state(ws).unwrap(), BusyState::Clean);
    assert!(g(ws, &["ls-files", "-u"]).is_empty());
    assert_eq!(g(ws, &["rev-parse", "HEAD"]), head);
    assert_eq!(read(ws, "a.txt"), "mine\n");
    assert_eq!(read(ws, "wip.txt"), "wip\n");
}

#[test]
fn refuses_outside_workspace_root() {
    let t = repo_with_commit("root");
    let sub = t.path().join("keep");
    let err = save(&sub, &named("x")).unwrap_err();
    assert!(matches!(err, CheckpointError::RootMismatch { .. }), "{err:?}");
    assert_eq!(err.reference_exit_code(), 103);
    assert!(matches!(restore(&sub, "x"), Err(CheckpointError::RootMismatch { .. })));
    assert!(matches!(get(&sub, "x"), Err(CheckpointError::RootMismatch { .. })));

    let plain = TempDir::new("plain");
    assert!(matches!(save(plain.path(), &named("x")), Err(CheckpointError::NotARepository(_))));
}

#[test]
fn unborn_head_saves_but_cannot_restore() {
    let t = init_repo("unborn");
    let ws = t.path();
    write(ws, "first.txt", "1\n");
    save(ws, &named("u")).unwrap();
    let cp = get(ws, "u").unwrap();
    assert_eq!(cp.head, None);
    let raw = g(ws, &["cat-file", "commit", &cp.commit]);
    assert!(raw.contains(&format!("\nhead {ZERO_OID}\n")));
    assert!(matches!(restore(ws, "u"), Err(CheckpointError::UnbornHead(_))));
    assert_eq!(read(ws, "first.txt"), "1\n", "failed restore touched nothing");
}

#[test]
fn missing_checkpoint_and_metadata() {
    let t = repo_with_commit("missing");
    let ws = t.path();
    assert!(matches!(restore(ws, "nope"), Err(CheckpointError::NotFound(_))));
    // A ref in the namespace that is not a checkpoint commit.
    let head = g(ws, &["rev-parse", "HEAD"]);
    g(ws, &["update-ref", &format!("{REF_NAMESPACE}/bogus"), &head]);
    assert!(matches!(restore(ws, "bogus"), Err(CheckpointError::MissingMetadata(_))));
}

#[test]
fn stale_temp_index_dirs_are_pruned() {
    let t = repo_with_commit("prune");
    let ws = t.path();
    let parent = ws.join(".git").join("conductor-checkpoint-tmp");
    fs::create_dir_all(&parent).unwrap();
    let old = SystemTime::now() - Duration::from_secs(2 * 3600);
    let mk = |name: &str, owner: Option<String>| {
        let d = parent.join(name);
        fs::create_dir(&d).unwrap();
        if let Some(o) = owner {
            fs::write(d.join("owner-pid"), o).unwrap();
        }
        fs::File::open(&d).unwrap().set_modified(old).unwrap();
        d
    };
    let dead = mk("chkpt-index.dead", Some("999999999".into()));
    let ownerless = mk("chkpt-index.none", None);
    let live = mk("chkpt-index.live", Some(std::process::id().to_string()));
    let fresh = parent.join("chkpt-index.fresh");
    fs::create_dir(&fresh).unwrap();

    save(ws, &named("p")).unwrap();
    assert!(!dead.exists() && !ownerless.exists(), "old dirs with gone owners pruned");
    assert!(live.exists(), "old dir with a live owner kept");
    assert!(fresh.exists(), "recent dir kept");
}

#[test]
fn utc_formatting() {
    let at = |s: u64| UNIX_EPOCH + Duration::from_secs(s);
    assert_eq!(iso_utc(at(0)), "1970-01-01T00:00:00Z");
    assert_eq!(iso_utc(at(951_782_400)), "2000-02-29T00:00:00Z");
    assert_eq!(iso_utc(at(4_102_444_799)), "2099-12-31T23:59:59Z");
    assert_eq!(compact_utc(at(1_735_787_045)), "20250102T030405Z");
}
