//! Archive behavior against throwaway repositories with real worktrees.

use super::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) struct TempDir(pub(super) PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        static N: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let p = std::env::temp_dir().join(format!(
            "archive-test-{tag}-{}-{nanos}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&p).unwrap();
        TempDir(fs::canonicalize(&p).unwrap())
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(super) fn git_out(dir: &Path, args: &[&str]) -> std::process::Output {
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

pub(super) fn g(dir: &Path, args: &[&str]) -> String {
    let out = git_out(dir, args);
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub(super) fn write(dir: &Path, rel: &str, content: &str) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, content).unwrap();
}

/// A repository on `main` with one commit and a worktree `ws` on branch
/// `sven/ws`, laid out as `<tmp>/repo` and `<tmp>/workspaces/ws`.
pub(super) struct Fixture {
    pub(super) tmp: TempDir,
    pub(super) target: ArchiveTarget,
}

impl Fixture {
    pub(super) fn new(tag: &str) -> Self {
        let tmp = TempDir::new(tag);
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();
        g(&repo, &["init", "-q", "-b", "main"]);
        g(&repo, &["config", "user.name", "Test"]);
        g(&repo, &["config", "user.email", "test@example.com"]);
        write(&repo, "a.txt", "one\n");
        g(&repo, &["add", "."]);
        g(&repo, &["commit", "-q", "-m", "init"]);
        let ws = tmp.0.join("workspaces").join("ws");
        fs::create_dir_all(ws.parent().unwrap()).unwrap();
        g(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "sven/ws",
                ws.to_str().unwrap(),
                "main",
            ],
        );
        let target = ArchiveTarget {
            local_id: "repo/ws".into(),
            directory_name: "ws".into(),
            workspace_path: ws,
            repo_root: repo,
            repo_name: "repo".into(),
            branch: "sven/ws".into(),
            default_branch: "main".into(),
        };
        Fixture { tmp, target }
    }
    pub(super) fn repo(&self) -> &Path {
        &self.target.repo_root
    }
    pub(super) fn ws(&self) -> &Path {
        &self.target.workspace_path
    }
    pub(super) fn branch_exists(&self, b: &str) -> bool {
        git_out(
            self.repo(),
            &[
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{b}"),
            ],
        )
        .status
        .success()
    }
    /// Commit on `sven/ws` and on `main` touching the same line, then merge
    /// main into the worktree so it stops with a conflict.
    pub(super) fn conflicting_merge(&self) {
        write(self.ws(), "a.txt", "ws\n");
        g(self.ws(), &["commit", "-q", "-am", "ws side"]);
        write(self.repo(), "a.txt", "main\n");
        g(self.repo(), &["commit", "-q", "-am", "main side"]);
        let out = git_out(self.ws(), &["merge", "main"]);
        assert!(!out.status.success(), "merge should conflict");
        assert!(self.ws().join(".git").exists());
    }
}

#[test]
fn ids_map_slashes_for_checkpoint_and_archive_head() {
    assert_eq!(checkpoint_id("repo/ws"), "conductor-archive-repo-ws");
    assert_eq!(checkpoint_id("5f3c-uuid"), "conductor-archive-5f3c-uuid");
    assert_eq!(
        archive_head_ref("repo/ws"),
        "refs/conductor-archive-heads/repo-ws"
    );
    assert_eq!(ArchiveMode::parse(None), Ok(ArchiveMode::Safe));
    assert_eq!(
        ArchiveMode::parse(Some("discardGitOperationState")),
        Ok(ArchiveMode::DiscardGitOperationState)
    );
    assert!(ArchiveMode::parse(Some("nope")).is_err());
}

#[test]
fn full_archive_saves_dirty_state_records_commit_removes_worktree_and_keeps_branch() {
    let f = Fixture::new("full");
    let head = g(f.ws(), &["rev-parse", "HEAD"]);
    write(f.ws(), "a.txt", "edited\n");
    write(f.ws(), "new.txt", "untracked\n");
    write(f.ws(), ".context/notes.md", "plan\n");

    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    assert_eq!(p.persisted_branch, "sven/ws");
    assert_eq!(p.branch_to_delete.as_deref(), Some("sven/ws"));
    assert_eq!(p.archive_commit.as_deref(), Some(head.as_str()));
    // Archive commit kept reachable under refs/conductor-archive-heads.
    assert_eq!(
        g(
            f.repo(),
            &["rev-parse", "refs/conductor-archive-heads/repo-ws"]
        ),
        head
    );
    // Uncommitted and untracked work is in the checkpoint, not lost.
    let cp = "refs/conductor-checkpoints/conductor-archive-repo-ws";
    assert_eq!(g(f.repo(), &["show", &format!("{cp}:a.txt")]), "edited");
    assert_eq!(
        g(f.repo(), &["show", &format!("{cp}:new.txt")]),
        "untracked"
    );
    // prepare touches nothing in the worktree.
    assert_eq!(
        fs::read_to_string(f.ws().join("a.txt")).unwrap(),
        "edited\n"
    );

    let root = f.tmp.0.join("root");
    let notices = teardown(&f.target, &p, false, Some(&root));
    assert!(notices.is_empty(), "{notices:?}");
    assert!(!f.ws().exists());
    assert!(!g(f.repo(), &["worktree", "list"]).contains("workspaces/ws"));
    assert!(f.branch_exists("sven/ws"));
    let ctx = root.join("archived-contexts/repo/ws/notes.md");
    assert_eq!(fs::read_to_string(ctx).unwrap(), "plan\n");
}

#[test]
fn delete_branch_on_archive_deletes_the_branch_but_never_the_default_branch() {
    let f = Fixture::new("delete");
    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    assert!(teardown(&f.target, &p, true, None).is_empty());
    assert!(!f.ws().exists());
    assert!(!f.branch_exists("sven/ws"));
    // The archive head still reaches the commit, so unarchive can recreate it.
    assert!(git_out(
        f.repo(),
        &[
            "rev-parse",
            "--verify",
            "refs/conductor-archive-heads/repo-ws"
        ]
    )
    .status
    .success());

    let n = delete_local_branch(f.repo(), "main", "main").unwrap();
    assert_eq!(
        n,
        Notice::info("Skipped deleting \"main\" because it is the repo default branch.")
    );
    assert!(f.branch_exists("main"));
    let n = delete_local_branch(f.repo(), "no-such", "main").unwrap();
    assert_eq!(n.kind, NoticeKind::Error);
    assert!(
        n.message
            .starts_with("Failed to delete branch \"no-such\": "),
        "{}",
        n.message
    );
}

#[test]
fn missing_directory_is_workspace_corrupted() {
    let f = Fixture::new("missing");
    let mut t = f.target.clone();
    t.workspace_path = f.tmp.0.join("gone");
    let e = prepare(&t, ArchiveMode::Safe).unwrap_err();
    assert_eq!(e, ArchiveError::Corrupted);
    assert_eq!(e.to_string(), "Workspace directory not found");
    assert_eq!(e.code(), "WORKSPACE_CORRUPTED");
    t.workspace_path = PathBuf::new();
    assert_eq!(
        prepare(&t, ArchiveMode::Safe).unwrap_err(),
        ArchiveError::Corrupted
    );
    // A directory that is not a git worktree.
    let plain = f.tmp.0.join("plain");
    fs::create_dir_all(&plain).unwrap();
    t.workspace_path = plain;
    assert_eq!(
        prepare(&t, ArchiveMode::Safe).unwrap_err(),
        ArchiveError::Corrupted
    );
}

#[test]
fn merge_in_progress_blocks_safe_mode_and_discard_mode_clears_it() {
    let f = Fixture::new("merge");
    f.conflicting_merge();
    let merge_head = PathBuf::from(g(f.ws(), &["rev-parse", "--git-path", "MERGE_HEAD"]));
    let merge_head = if merge_head.is_absolute() {
        merge_head
    } else {
        f.ws().join(merge_head)
    };
    assert!(merge_head.exists());

    let e = prepare(&f.target, ArchiveMode::Safe).unwrap_err();
    assert_eq!(e, ArchiveError::GitOperationInProgress);
    assert_eq!(e.to_string(), GIT_OPERATION_MESSAGE);
    // Safe mode leaves the merge alone.
    assert!(merge_head.exists());

    let p = prepare(&f.target, ArchiveMode::DiscardGitOperationState).unwrap();
    assert!(!merge_head.exists());
    assert!(g(f.ws(), &["diff", "--name-only", "--diff-filter=U"]).is_empty());
    // The conflicted file, markers and all, is in the checkpoint.
    let saved = g(
        f.repo(),
        &[
            "show",
            "refs/conductor-checkpoints/conductor-archive-repo-ws:a.txt",
        ],
    );
    assert!(saved.contains("<<<<<<<"), "{saved}");
    assert_eq!(p.persisted_branch, "sven/ws");
}

#[test]
fn abandoned_conflict_residue_is_staged_then_saved() {
    let f = Fixture::new("residue");
    f.conflicting_merge();
    // Drop the merge state but keep the unmerged index entries.
    let merge_head = PathBuf::from(g(f.ws(), &["rev-parse", "--git-path", "MERGE_HEAD"]));
    let merge_head = if merge_head.is_absolute() {
        merge_head
    } else {
        f.ws().join(merge_head)
    };
    fs::remove_file(merge_head).unwrap();
    assert!(!g(f.ws(), &["diff", "--name-only", "--diff-filter=U"]).is_empty());

    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    assert!(g(f.ws(), &["diff", "--name-only", "--diff-filter=U"]).is_empty());
    assert!(p.archive_commit.is_some());
}

#[test]
fn detached_head_keeps_the_stored_branch_and_deletes_nothing() {
    let f = Fixture::new("detached");
    g(f.ws(), &["checkout", "-q", "--detach"]);
    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    assert_eq!(p.persisted_branch, "sven/ws");
    assert_eq!(p.branch_to_delete, None);
    assert!(teardown(&f.target, &p, true, None).is_empty());
    assert!(f.branch_exists("sven/ws"));
}

#[test]
fn remove_worktree_falls_back_to_deleting_the_directory_and_pruning() {
    let f = Fixture::new("fallback");
    // Break the registration: git no longer recognises the directory as a worktree.
    fs::remove_file(f.ws().join(".git")).unwrap();
    assert!(remove_worktree(f.repo(), f.ws()).is_ok());
    assert!(!f.ws().exists());
    assert!(!g(f.repo(), &["worktree", "list"]).contains("workspaces/ws"));
}

#[test]
fn context_folder_replaces_an_older_archived_copy() {
    let f = Fixture::new("context");
    let root = f.tmp.0.join("root");
    write(&root, "archived-contexts/repo/ws/old.md", "old\n");
    write(f.ws(), ".context/new.md", "new\n");
    let dest = archive_context_folder(f.ws(), &root, "repo", "ws")
        .unwrap()
        .unwrap();
    assert!(dest.join("new.md").exists());
    assert!(!dest.join("old.md").exists());
    assert!(!f.ws().join(".context").exists());
    assert_eq!(
        archive_context_folder(f.ws(), &root, "repo", "ws").unwrap(),
        None
    );
}

#[test]
fn unarchive_brings_back_the_worktree_its_uncommitted_work_and_context() {
    let f = Fixture::new("restore");
    write(f.ws(), "a.txt", "edited\n");
    write(f.ws(), "staged.txt", "staged\n");
    g(f.ws(), &["add", "staged.txt"]);
    write(f.ws(), "new.txt", "untracked\n");
    write(f.ws(), ".context/notes.md", "plan\n");
    let root = f.tmp.0.join("root");
    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    assert!(teardown(&f.target, &p, false, Some(&root)).is_empty());
    assert!(!f.ws().exists());

    let r = restore(&f.target, p.archive_commit.as_deref(), Some(&root)).unwrap();
    assert_eq!(
        r,
        Restored {
            branch: "sven/ws".into(),
            recreated_branch: false,
            restored_changes: true,
            notices: vec![]
        }
    );
    assert_eq!(g(f.ws(), &["branch", "--show-current"]), "sven/ws");
    assert_eq!(
        fs::read_to_string(f.ws().join("a.txt")).unwrap(),
        "edited\n"
    );
    assert_eq!(
        fs::read_to_string(f.ws().join("new.txt")).unwrap(),
        "untracked\n"
    );
    // The index comes back too: staged stays staged, the edit stays unstaged.
    assert_eq!(
        g(f.ws(), &["diff", "--cached", "--name-only"]),
        "staged.txt"
    );
    assert_eq!(g(f.ws(), &["diff", "--name-only"]), "a.txt");
    assert_eq!(
        fs::read_to_string(f.ws().join(".context/notes.md")).unwrap(),
        "plan\n"
    );
    assert!(!root.join("archived-contexts/repo/ws").exists());
}

#[test]
fn unarchive_recreates_a_deleted_branch_at_the_archive_commit() {
    let f = Fixture::new("restore-deleted");
    write(f.ws(), "b.txt", "committed\n");
    g(f.ws(), &["add", "."]);
    g(f.ws(), &["commit", "-q", "-m", "work"]);
    let head = g(f.ws(), &["rev-parse", "HEAD"]);
    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    teardown(&f.target, &p, true, None);
    assert!(!f.branch_exists("sven/ws"));

    let r = restore(&f.target, p.archive_commit.as_deref(), None).unwrap();
    assert!(r.recreated_branch && r.restored_changes);
    assert_eq!(g(f.ws(), &["rev-parse", "HEAD"]), head);
    assert_eq!(
        fs::read_to_string(f.ws().join("b.txt")).unwrap(),
        "committed\n"
    );
}

#[test]
fn unarchive_refuses_what_conductor_refuses() {
    let f = Fixture::new("restore-refuse");
    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    teardown(&f.target, &p, false, None);
    let commit = p.archive_commit.as_deref();

    let mut no_branch = f.target.clone();
    no_branch.branch = String::new();
    assert_eq!(
        restore(&no_branch, commit, None).unwrap_err(),
        "Cannot rehydrate workspace without branch information"
    );

    fs::create_dir_all(f.ws()).unwrap();
    assert_eq!(
        restore(&f.target, commit, None).unwrap_err(),
        format!("Can't unarchive: {} already exists", f.ws().display())
    );
    fs::remove_dir_all(f.ws()).unwrap();

    let other = f.tmp.0.join("other");
    g(
        f.repo(),
        &["worktree", "add", "-q", other.to_str().unwrap(), "sven/ws"],
    );
    assert_eq!(
        restore(&f.target, commit, None).unwrap_err(),
        format!(
            "Branch 'sven/ws' is already checked out at {}",
            other.display()
        )
    );
    g(
        f.repo(),
        &["worktree", "remove", "--force", other.to_str().unwrap()],
    );

    g(f.repo(), &["branch", "-D", "sven/ws"]);
    assert_eq!(
        restore(&f.target, None, None).unwrap_err(),
        "Branch 'sven/ws' no longer exists"
    );
    assert!(!f.ws().exists());
}

#[test]
fn unarchive_leaves_the_checkpoint_when_the_branch_moved_since() {
    let f = Fixture::new("restore-moved");
    write(f.ws(), "wip.txt", "unsaved\n");
    let p = prepare(&f.target, ArchiveMode::Safe).unwrap();
    teardown(&f.target, &p, false, None);
    // Someone commits on the branch from elsewhere after the archive.
    let elsewhere = f.tmp.0.join("elsewhere");
    g(
        f.repo(),
        &[
            "worktree",
            "add",
            "-q",
            elsewhere.to_str().unwrap(),
            "sven/ws",
        ],
    );
    write(&elsewhere, "later.txt", "later\n");
    g(&elsewhere, &["add", "."]);
    g(&elsewhere, &["commit", "-q", "-m", "later"]);
    let moved = g(&elsewhere, &["rev-parse", "HEAD"]);
    g(
        f.repo(),
        &["worktree", "remove", "--force", elsewhere.to_str().unwrap()],
    );

    let r = restore(&f.target, p.archive_commit.as_deref(), None).unwrap();
    assert!(!r.restored_changes);
    assert_eq!(r.notices.len(), 1);
    assert!(r.notices[0]
        .message
        .starts_with("Uncommitted changes couldn't be recovered: branch 'sven/ws' has moved"));
    // The branch keeps its new commit; nothing was reset.
    assert_eq!(g(f.ws(), &["rev-parse", "HEAD"]), moved);
    assert!(!f.ws().join("wip.txt").exists());
}
