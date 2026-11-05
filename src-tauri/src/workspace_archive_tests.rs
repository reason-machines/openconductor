//! Archive / unarchive against real temporary git repositories.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;
use crate::workspace::{CreateOptions, WorkspaceManager, WorkspaceState};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Fixture {
    tmp: PathBuf,
    repo: PathBuf,
    mgr: WorkspaceManager,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.tmp);
    }
}

fn sh(dir: &Path, args: &[&str]) -> (bool, String) {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "t")
        .env("GIT_AUTHOR_EMAIL", "t@example.com")
        .env("GIT_COMMITTER_NAME", "t")
        .env("GIT_COMMITTER_EMAIL", "t@example.com")
        .env("GIT_EDITOR", "true")
        .output()
        .unwrap();
    (out.status.success(), String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn ok(dir: &Path, args: &[&str]) -> String {
    let (success, out) = sh(dir, args);
    assert!(success, "git {args:?} failed");
    out
}

fn commit(dir: &Path, file: &str, body: &str) -> String {
    std::fs::write(dir.join(file), body).unwrap();
    ok(dir, &["add", file]);
    ok(dir, &["commit", "-q", "-m", file]);
    ok(dir, &["rev-parse", "HEAD"])
}

fn fixture() -> Fixture {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let tmp = std::env::temp_dir().join(format!("ws-archive-test-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    let tmp = std::fs::canonicalize(&tmp).unwrap();
    let repo = tmp.join("app");
    std::fs::create_dir_all(&repo).unwrap();
    ok(&repo, &["init", "-q", "-b", "main"]);
    ok(&repo, &["config", "user.name", "t"]);
    ok(&repo, &["config", "user.email", "t@example.com"]);
    commit(&repo, "README.md", "hello\n");
    let mgr = WorkspaceManager::new(tmp.join("data"));
    Fixture { tmp, repo, mgr }
}

fn create(f: &Fixture, name: &str) -> Workspace {
    f.mgr.create(&f.repo, &CreateOptions { name: Some(name.into()), ..Default::default() }).unwrap().workspace
}

/// Records what `archive` asked the database to store.
#[derive(Default)]
struct Recorded {
    row: Option<(String, Option<String>)>,
    script_ran: bool,
}

fn run_archive(f: &Fixture, name: &str, mode: ArchiveMode, delete_branch: bool, rec: &mut Recorded) -> Result<ArchiveOutcome, ArchiveError> {
    let req = ArchiveRequest { local_id: format!("app/{name}"), mode, delete_branch };
    let mut row = None;
    let mut script_ran = false;
    let out = archive(
        &f.mgr,
        &f.repo,
        name,
        &req,
        &mut |branch, commit| {
            row = Some((branch.to_string(), commit.map(str::to_string)));
            Ok(())
        },
        &mut |ws| {
            // The worktree still exists while the archive script runs.
            assert!(ws.path.is_dir());
            script_ran = true;
            None
        },
    );
    rec.row = row;
    rec.script_ran = script_ran;
    out
}

#[test]
fn archive_records_head_ref_and_checkpoint_then_unarchive_restores_uncommitted_work() {
    let f = fixture();
    let ws = create(&f, "tokyo");
    let head = commit(&ws.path, "work.txt", "done\n");
    std::fs::write(ws.path.join("work.txt"), "edited, not committed\n").unwrap();
    std::fs::write(ws.path.join("scratch.txt"), "untracked\n").unwrap();

    let mut rec = Recorded::default();
    let out = run_archive(&f, "tokyo", ArchiveMode::Safe, false, &mut rec).unwrap();
    assert_eq!(out.archive_commit.as_deref(), Some(head.as_str()));
    assert_eq!(out.branch, "tokyo");
    assert!(out.warnings.is_empty(), "{:?}", out.warnings);
    assert_eq!(rec.row, Some(("tokyo".into(), Some(head.clone()))));
    assert!(rec.script_ran);
    // The archive commit is also a ref, as in Conductor.
    assert_eq!(ok(&f.repo, &["rev-parse", "refs/conductor-archive-heads/app/tokyo"]), head);
    assert!(sh(&f.repo, &["rev-parse", "--verify", "refs/conductor-checkpoints/conductor-archive-app--tokyo"]).0);
    // Worktree gone, branch kept.
    assert!(!ws.path.exists());
    assert_eq!(ok(&f.repo, &["rev-parse", "refs/heads/tokyo"]), head);
    assert_eq!(f.mgr.get(&f.repo, "tokyo").unwrap().state, WorkspaceState::Archived);

    let u = unarchive(&f.mgr, &f.repo, "tokyo", "app/tokyo").unwrap();
    assert_eq!(u.warning, None);
    assert_eq!(u.workspace.state, WorkspaceState::Active);
    assert_eq!(ok(&u.workspace.path, &["rev-parse", "HEAD"]), head);
    assert_eq!(std::fs::read_to_string(u.workspace.path.join("work.txt")).unwrap(), "edited, not committed\n");
    assert_eq!(std::fs::read_to_string(u.workspace.path.join("scratch.txt")).unwrap(), "untracked\n");
}

#[test]
fn archive_refuses_while_a_merge_is_in_progress_and_discard_mode_clears_it() {
    let f = fixture();
    let ws = create(&f, "lima");
    commit(&ws.path, "a.txt", "ours\n");
    // A conflicting commit on main, merged into the workspace: merge stops with a conflict.
    commit(&f.repo, "a.txt", "theirs\n");
    let (merged, _) = sh(&ws.path, &["merge", "main"]);
    assert!(!merged, "the merge should stop on a conflict");
    assert!(sh(&ws.path, &["rev-parse", "--verify", "MERGE_HEAD"]).0);

    let mut rec = Recorded::default();
    let refused = run_archive(&f, "lima", ArchiveMode::Safe, false, &mut rec);
    assert_eq!(refused, Err(ArchiveError::GitBusy));
    assert_eq!(refused.unwrap_err().to_string(), GIT_BUSY);
    assert_eq!(rec.row, None, "nothing recorded on refusal");
    assert!(ws.path.is_dir(), "worktree untouched on refusal");
    assert!(sh(&ws.path, &["rev-parse", "--verify", "MERGE_HEAD"]).0, "merge state untouched on refusal");

    let out = run_archive(&f, "lima", ArchiveMode::DiscardGitOperationState, false, &mut rec).unwrap();
    assert!(out.archive_commit.is_some());
    assert!(rec.row.is_some());
    assert!(!ws.path.exists());
}

#[test]
fn delete_branch_on_archive_deletes_it_and_unarchive_recreates_it_at_the_archive_commit() {
    let f = fixture();
    let ws = create(&f, "oslo");
    let head = commit(&ws.path, "w.txt", "w\n");
    let mut rec = Recorded::default();
    let out = run_archive(&f, "oslo", ArchiveMode::Safe, true, &mut rec).unwrap();
    assert_eq!(out.archive_commit.as_deref(), Some(head.as_str()));
    assert!(!sh(&f.repo, &["rev-parse", "--verify", "refs/heads/oslo"]).0, "branch deleted");

    let u = unarchive(&f.mgr, &f.repo, "oslo", "app/oslo").unwrap();
    assert_eq!(u.workspace.branch, "oslo");
    assert_eq!(ok(&f.repo, &["rev-parse", "refs/heads/oslo"]), head);
}

#[test]
fn unarchive_refuses_when_the_folder_exists_or_the_branch_is_checked_out_elsewhere() {
    let f = fixture();
    let ws = create(&f, "rome");
    let mut rec = Recorded::default();
    run_archive(&f, "rome", ArchiveMode::Safe, false, &mut rec).unwrap();

    std::fs::create_dir_all(&ws.path).unwrap();
    let err = unarchive(&f.mgr, &f.repo, "rome", "app/rome").unwrap_err();
    assert_eq!(err, format!("Can't unarchive: {} already exists", ws.path.display()));
    std::fs::remove_dir_all(&ws.path).unwrap();

    let other = f.tmp.join("elsewhere");
    ok(&f.repo, &["worktree", "add", "-q", other.to_str().unwrap(), "rome"]);
    let err = unarchive(&f.mgr, &f.repo, "rome", "app/rome").unwrap_err();
    assert_eq!(err, format!("Branch 'rome' is already checked out at {}", other.display()));
}

#[test]
fn the_default_branch_is_never_deleted() {
    let f = fixture();
    // origin's default branch is main; the root moves off it so a workspace can check it out.
    ok(&f.repo, &["update-ref", "refs/remotes/origin/main", "main"]);
    ok(&f.repo, &["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    ok(&f.repo, &["checkout", "-q", "-b", "side"]);
    let ws = f
        .mgr
        .create(&f.repo, &CreateOptions { name: Some("home".into()), branch_name: Some("main".into()), existing_branch: true, ..Default::default() })
        .unwrap()
        .workspace;
    let mut rec = Recorded::default();
    let out = run_archive(&f, &ws.name, ArchiveMode::Safe, true, &mut rec).unwrap();
    assert_eq!(out.warnings, vec!["Skipped deleting \"main\" because it is the repo default branch.".to_string()]);
    assert!(sh(&f.repo, &["rev-parse", "--verify", "refs/heads/main"]).0);
}
