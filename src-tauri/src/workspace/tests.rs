//! Integration tests against real temporary git repositories.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use super::git::{self, BusyState};
use super::naming;
use super::scripts;
use super::*;

static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!("ws-test-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        // Canonical so comparisons with git's output are exact (macOS /private/var).
        TempDir(std::fs::canonicalize(&p).unwrap())
    }
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn sh(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "t")
        .env("GIT_AUTHOR_EMAIL", "t@example.com")
        .env("GIT_COMMITTER_NAME", "t")
        .env("GIT_COMMITTER_EMAIL", "t@example.com")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn commit_file(repo: &Path, file: &str, body: &str, msg: &str) -> String {
    std::fs::write(repo.join(file), body).unwrap();
    sh(repo, &["add", file]);
    sh(repo, &["commit", "-q", "-m", msg]);
    sh(repo, &["rev-parse", "HEAD"])
}

/// A repo `<tmp>/my-app` on `main` with one commit, and a data dir.
struct Fixture {
    tmp: TempDir,
    repo: PathBuf,
    mgr: WorkspaceManager,
}

fn fixture() -> Fixture {
    let tmp = TempDir::new();
    let repo = tmp.path().join("My App");
    std::fs::create_dir_all(&repo).unwrap();
    sh(&repo, &["init", "-q", "-b", "main"]);
    sh(&repo, &["config", "user.name", "t"]);
    sh(&repo, &["config", "user.email", "t@example.com"]);
    commit_file(&repo, "README.md", "hello\n", "init");
    let mgr = WorkspaceManager::new(tmp.path().join("data"));
    Fixture { tmp, repo, mgr }
}

fn named(name: &str) -> CreateOptions {
    CreateOptions { name: Some(name.into()), ..Default::default() }
}

#[test]
fn create_places_worktree_under_data_dir_on_new_branch() {
    let f = fixture();
    let head = sh(&f.repo, &["rev-parse", "HEAD"]);
    let c = f
        .mgr
        .create(&f.repo, &CreateOptions { branch_prefix: Some("sven".into()), ..named("Fix Login Bug!") })
        .unwrap();
    let ws = &c.workspace;
    assert_eq!(ws.name, "fix-login-bug");
    assert_eq!(ws.branch, "sven/fix-login-bug");
    assert_eq!(ws.id, "my-app/fix-login-bug");
    assert_eq!(ws.path, f.tmp.path().join("data/workspaces/my-app/fix-login-bug"));
    assert_eq!(c.base_ref, "main");
    assert_eq!(c.base_commit, head);
    assert!(!c.fetched);
    assert_eq!(sh(&ws.path, &["symbolic-ref", "--short", "HEAD"]), "sven/fix-login-bug");
    assert_eq!(sh(&ws.path, &["rev-parse", "HEAD"]), head);
    assert!(ws.path.join("README.md").is_file());
    // No upstream tracking to the base branch.
    assert!(!git::git_ok(&ws.path, ["rev-parse", "--abbrev-ref", "@{upstream}"]));
    // Root checkout untouched.
    assert_eq!(sh(&f.repo, &["symbolic-ref", "--short", "HEAD"]), "main");
}

#[test]
fn names_are_uniquified_against_dirs_and_branches() {
    let f = fixture();
    let a = f.mgr.create(&f.repo, &named("feature")).unwrap().workspace;
    let b = f.mgr.create(&f.repo, &named("feature")).unwrap().workspace;
    assert_eq!(a.name, "feature");
    assert_eq!(b.name, "feature-v1");
    // A pre-existing branch also counts as taken.
    sh(&f.repo, &["branch", "taken"]);
    let c = f.mgr.create(&f.repo, &named("taken")).unwrap().workspace;
    assert_eq!(c.name, "taken-v1");
    assert_eq!(c.branch, "taken-v1");
}

#[test]
fn generated_names_are_unique() {
    let f = fixture();
    let mut seen = HashSet::new();
    for _ in 0..5 {
        let ws = f.mgr.create(&f.repo, &CreateOptions::default()).unwrap().workspace;
        assert!(!ws.name.is_empty());
        assert!(seen.insert(ws.name.clone()), "duplicate {}", ws.name);
    }
    assert_eq!(f.mgr.list(&f.repo).unwrap().len(), 5);
}

#[test]
fn invalid_names_and_missing_base_are_rejected() {
    let f = fixture();
    assert!(matches!(f.mgr.create(&f.repo, &named("!!!")), Err(WorkspaceError::InvalidName(_))));
    let opts = CreateOptions { base_branch: Some("nope".into()), ..named("x") };
    assert!(matches!(f.mgr.create(&f.repo, &opts), Err(WorkspaceError::BaseNotFound(_))));
    let opts = CreateOptions { branch_prefix: Some("bad..prefix".into()), ..named("x") };
    assert!(matches!(f.mgr.create(&f.repo, &opts), Err(WorkspaceError::InvalidName(_))));
}

#[test]
fn create_fetches_origin_and_starts_from_remote_without_moving_root() {
    let f = fixture();
    let origin = f.tmp.path().join("origin.git");
    sh(f.tmp.path(), &["init", "-q", "--bare", "-b", "main", origin.to_str().unwrap()]);
    sh(&f.repo, &["remote", "add", "origin", origin.to_str().unwrap()]);
    sh(&f.repo, &["push", "-q", "origin", "main"]);
    sh(&f.repo, &["remote", "set-head", "origin", "main"]);
    let local_head = sh(&f.repo, &["rev-parse", "HEAD"]);

    // Someone else pushes a newer commit to origin/main.
    let other = f.tmp.path().join("other");
    sh(f.tmp.path(), &["clone", "-q", origin.to_str().unwrap(), other.to_str().unwrap()]);
    let remote_head = commit_file(&other, "NEW.md", "new\n", "remote change");
    sh(&other, &["push", "-q", "origin", "main"]);

    let c = f.mgr.create(&f.repo, &CreateOptions { fetch: true, ..named("ws") }).unwrap();
    assert!(c.fetched);
    assert_eq!(c.base_ref, "origin/main");
    assert_eq!(c.base_commit, remote_head);
    assert!(c.workspace.path.join("NEW.md").is_file());
    // The root's checked-out branch did not move.
    assert_eq!(sh(&f.repo, &["rev-parse", "main"]), local_head);
}

#[test]
fn branch_name_is_taken_checks_local_remote_and_path_conflicts() {
    let f = fixture();
    let origin = f.tmp.path().join("origin.git");
    sh(f.tmp.path(), &["init", "-q", "--bare", "-b", "main", origin.to_str().unwrap()]);
    sh(&f.repo, &["remote", "add", "origin", origin.to_str().unwrap()]);
    sh(&f.repo, &["push", "-q", "origin", "main:sven/remote-only"]);
    sh(&f.repo, &["fetch", "-q", "origin"]);
    sh(&f.repo, &["branch", "sven/tokyo"]);
    let taken = |b: &str| git::branch_name_is_taken(&f.repo, b).unwrap();
    assert!(taken("main") && taken("sven/tokyo"));
    assert!(taken("sven/remote-only"), "remote-tracking branches count");
    assert!(taken("sven/tokyo/x") && taken("sven"), "ref path conflicts count");
    assert!(!taken("sven/tokyo-v1") && !taken("osaka"));

    // create refuses an explicit branch that exists only on the remote.
    let opts = CreateOptions { branch_name: Some("sven/remote-only".into()), ..Default::default() };
    assert!(matches!(f.mgr.create(&f.repo, &opts), Err(WorkspaceError::BranchExists(_))));
}

fn existing(branch: &str) -> CreateOptions {
    CreateOptions { branch_name: Some(branch.into()), existing_branch: true, fetch: true, ..Default::default() }
}

#[test]
fn existing_branch_checks_out_local_branch_without_moving_it() {
    let f = fixture();
    sh(&f.repo, &["checkout", "-q", "-b", "sven/pr-head"]);
    let tip = commit_file(&f.repo, "pr.txt", "pr\n", "pr work");
    sh(&f.repo, &["checkout", "-q", "main"]);

    let c = f.mgr.create(&f.repo, &existing("sven/pr-head")).unwrap();
    let ws = &c.workspace;
    assert_eq!((ws.name.as_str(), ws.branch.as_str()), ("pr-head", "sven/pr-head"));
    assert_eq!((c.base_ref.as_str(), c.base_commit.as_str()), ("sven/pr-head", tip.as_str()));
    assert!(!c.fetched, "no fetch for a local branch");
    assert_eq!(sh(&ws.path, &["symbolic-ref", "--short", "HEAD"]), "sven/pr-head");
    assert_eq!(sh(&ws.path, &["rev-parse", "HEAD"]), tip);
    assert!(ws.path.join("pr.txt").is_file());

    // A branch already checked out (here by the workspace just made, or the root) is refused.
    let again = CreateOptions { name: Some("other".into()), ..existing("sven/pr-head") };
    assert!(matches!(f.mgr.create(&f.repo, &again), Err(WorkspaceError::BranchCheckedOut { branch, .. }) if branch == "sven/pr-head"));
    assert!(matches!(f.mgr.create(&f.repo, &existing("main")), Err(WorkspaceError::BranchCheckedOut { .. })));
}

#[test]
fn existing_branch_tracks_remote_only_branch_after_fetch() {
    let f = fixture();
    let origin = f.tmp.path().join("origin.git");
    sh(f.tmp.path(), &["init", "-q", "--bare", "-b", "main", origin.to_str().unwrap()]);
    sh(&f.repo, &["remote", "add", "origin", origin.to_str().unwrap()]);
    sh(&f.repo, &["push", "-q", "origin", "main"]);
    // Someone else pushes a PR branch this clone has never fetched.
    let other = f.tmp.path().join("other");
    sh(f.tmp.path(), &["clone", "-q", origin.to_str().unwrap(), other.to_str().unwrap()]);
    sh(&other, &["checkout", "-q", "-b", "alice/feature"]);
    let tip = commit_file(&other, "feature.txt", "f\n", "feature");
    sh(&other, &["push", "-q", "origin", "alice/feature"]);
    assert!(!git::ref_exists(&f.repo, "origin/alice/feature"));

    let c = f.mgr.create(&f.repo, &existing("alice/feature")).unwrap();
    let ws = &c.workspace;
    assert!(c.fetched);
    assert_eq!((c.base_ref.as_str(), c.base_commit.as_str()), ("origin/alice/feature", tip.as_str()));
    assert_eq!(ws.branch, "alice/feature");
    assert_eq!(sh(&ws.path, &["rev-parse", "HEAD"]), tip);
    assert_eq!(sh(&ws.path, &["rev-parse", "--abbrev-ref", "@{upstream}"]), "origin/alice/feature");
    assert_eq!(sh(&f.repo, &["symbolic-ref", "--short", "HEAD"]), "main");

    assert!(matches!(f.mgr.create(&f.repo, &existing("nobody/nothing")), Err(WorkspaceError::BranchNotFound(b)) if b == "nobody/nothing"));
    let no_name = CreateOptions { existing_branch: true, ..Default::default() };
    assert!(matches!(f.mgr.create(&f.repo, &no_name), Err(WorkspaceError::InvalidName(_))));
    // Without existing_branch the same name is still refused as taken.
    let fresh = CreateOptions { branch_name: Some("alice/feature".into()), ..Default::default() };
    assert!(matches!(f.mgr.create(&f.repo, &fresh), Err(WorkspaceError::BranchExists(_))));
}

#[test]
fn existing_branch_with_pr_number_fetches_fork_head_from_pull_ref() {
    let f = fixture();
    let origin = f.tmp.path().join("origin.git");
    sh(f.tmp.path(), &["init", "-q", "--bare", "-b", "main", origin.to_str().unwrap()]);
    sh(&f.repo, &["remote", "add", "origin", origin.to_str().unwrap()]);
    sh(&f.repo, &["push", "-q", "origin", "main"]);
    // A fork's PR head is not a branch on origin; GitHub exposes it as refs/pull/<n>/head.
    let fork = f.tmp.path().join("fork");
    sh(f.tmp.path(), &["clone", "-q", origin.to_str().unwrap(), fork.to_str().unwrap()]);
    sh(&fork, &["checkout", "-q", "-b", "bob/fix"]);
    let tip = commit_file(&fork, "fix.txt", "fix\n", "fork fix");
    sh(&fork, &["push", "-q", "origin", "HEAD:refs/pull/7/head"]);

    // Without prNumber the branch is not found, as before.
    assert!(matches!(f.mgr.create(&f.repo, &existing("bob/fix")), Err(WorkspaceError::BranchNotFound(_))));

    let c = f.mgr.create(&f.repo, &CreateOptions { pr_number: Some(7), ..existing("bob/fix") }).unwrap();
    let ws = &c.workspace;
    assert!(c.fetched);
    assert_eq!((c.base_ref.as_str(), c.base_commit.as_str()), ("bob/fix", tip.as_str()));
    assert_eq!((ws.name.as_str(), ws.branch.as_str()), ("fix", "bob/fix"));
    assert_eq!(sh(&ws.path, &["symbolic-ref", "--short", "HEAD"]), "bob/fix");
    assert_eq!(sh(&ws.path, &["rev-parse", "HEAD"]), tip);
    assert!(ws.path.join("fix.txt").is_file());
    let upstream = Command::new("git").arg("-C").arg(&ws.path).args(["rev-parse", "--abbrev-ref", "@{upstream}"]).output().unwrap();
    assert!(!upstream.status.success(), "no upstream for a fork PR branch");
    assert_eq!(sh(&f.repo, &["symbolic-ref", "--short", "HEAD"]), "main");

    // A PR that does not exist reports the PR number and git's error.
    let missing = f.mgr.create(&f.repo, &CreateOptions { pr_number: Some(99), ..existing("carol/none") });
    match missing {
        Err(e @ WorkspaceError::PullRequestNotFound { number: 99, .. }) => {
            assert!(e.to_string().starts_with("branch not found locally or on origin, and pull request #99"), "{e}");
        }
        other => panic!("expected PullRequestNotFound, got {other:?}"),
    }
    assert!(!git::branch_exists(&f.repo, "carol/none"));

    // A same-repo PR (branch on origin) still tracks origin/<branch>, prNumber or not.
    sh(&fork, &["push", "-q", "origin", "bob/fix:dave/same-repo"]);
    let c = f.mgr.create(&f.repo, &CreateOptions { pr_number: Some(8), ..existing("dave/same-repo") }).unwrap();
    assert_eq!(c.base_ref, "origin/dave/same-repo");
    assert_eq!(sh(&c.workspace.path, &["rev-parse", "--abbrev-ref", "@{upstream}"]), "origin/dave/same-repo");
}

#[test]
fn files_to_copy_default_env_glob_only_copies_gitignored() {
    let f = fixture();
    commit_file(&f.repo, ".gitignore", ".env\n.env.local\nnode_modules/\n", "ignore");
    std::fs::write(f.repo.join(".env"), "SECRET=1\n").unwrap();
    std::fs::write(f.repo.join(".env.local"), "LOCAL=1\n").unwrap();
    std::fs::write(f.repo.join(".envrc"), "untracked, not ignored\n").unwrap();
    std::fs::create_dir_all(f.repo.join("node_modules/x")).unwrap();
    std::fs::write(f.repo.join("node_modules/x/i.js"), "").unwrap();

    let c = f.mgr.create(&f.repo, &named("env")).unwrap();
    let mut copied = c.copied_files.clone();
    copied.sort();
    assert_eq!(copied, vec![PathBuf::from(".env"), PathBuf::from(".env.local")]);
    let p = &c.workspace.path;
    assert_eq!(std::fs::read_to_string(p.join(".env")).unwrap(), "SECRET=1\n");
    assert!(!p.join(".envrc").exists());
    assert!(!p.join("node_modules").exists());
}

#[test]
fn files_to_copy_prefers_worktreeinclude_then_settings_globs() {
    let f = fixture();
    commit_file(&f.repo, ".gitignore", ".env\nconfig/\ncerts/\n", "ignore");
    std::fs::write(f.repo.join(".env"), "E\n").unwrap();
    std::fs::create_dir_all(f.repo.join("config")).unwrap();
    std::fs::write(f.repo.join("config/local.toml"), "c\n").unwrap();
    std::fs::create_dir_all(f.repo.join("certs")).unwrap();
    std::fs::write(f.repo.join("certs/dev.pem"), "p\n").unwrap();

    let globs = Some("# pem files\ncerts/*.pem\n".to_string());
    let c = f.mgr.create(&f.repo, &CreateOptions { file_include_globs: globs.clone(), ..named("g") }).unwrap();
    assert_eq!(c.copied_files, vec![PathBuf::from("certs/dev.pem")]);

    std::fs::write(f.repo.join(".worktreeinclude"), "config/\n").unwrap();
    let c = f.mgr.create(&f.repo, &CreateOptions { file_include_globs: globs, ..named("w") }).unwrap();
    assert_eq!(c.copied_files, vec![PathBuf::from("config/local.toml")]);
    assert!(c.workspace.path.join("config/local.toml").is_file());

    // An explicit empty "Files to copy" copies nothing, unlike no setting (`.env*`).
    std::fs::remove_file(f.repo.join(".worktreeinclude")).unwrap();
    let c = f.mgr.create(&f.repo, &CreateOptions { file_include_globs: Some(String::new()), ..named("e") }).unwrap();
    assert!(c.copied_files.is_empty());
    let c = f.mgr.create(&f.repo, &CreateOptions { file_include_globs: None, ..named("d") }).unwrap();
    assert_eq!(c.copied_files, vec![PathBuf::from(".env")]);
}

#[test]
fn remove_all_deletes_worktrees_and_records_but_keeps_branches_and_the_checkout() {
    let f = fixture();
    let a = f.mgr.create(&f.repo, &named("a")).unwrap().workspace;
    let b = f.mgr.create(&f.repo, &named("b")).unwrap().workspace;
    f.mgr.archive(&f.repo, "b", &ArchiveOptions::default()).unwrap();
    std::fs::write(a.path.join("dirty.txt"), "x").unwrap();

    f.mgr.remove_all(&f.repo).unwrap();

    assert!(f.mgr.list(&f.repo).unwrap().is_empty());
    assert!(!a.path.exists());
    assert!(!f.mgr.workspaces_dir(&f.repo).exists());
    for branch in [&a.branch, &b.branch] {
        assert!(git::branch_exists(&f.repo, branch), "{branch} kept");
    }
    assert!(f.repo.join(".git").exists());
}

#[test]
fn list_reports_active_missing_and_archived_and_ignores_foreign_worktrees() {
    let f = fixture();
    let a = f.mgr.create(&f.repo, &named("a")).unwrap().workspace;
    f.mgr.create(&f.repo, &named("b")).unwrap();
    f.mgr.create(&f.repo, &named("c")).unwrap();
    // A worktree the user made elsewhere is not ours.
    let foreign = f.tmp.path().join("elsewhere");
    sh(&f.repo, &["worktree", "add", "-q", "-b", "foreign", foreign.to_str().unwrap()]);

    f.mgr.archive(&f.repo, "b", &ArchiveOptions::default()).unwrap();
    std::fs::remove_dir_all(f.tmp.path().join("data/workspaces/my-app/c")).unwrap();

    let list = f.mgr.list(&f.repo).unwrap();
    let got: Vec<(&str, WorkspaceState, &str)> =
        list.iter().map(|w| (w.name.as_str(), w.state, w.branch.as_str())).collect();
    assert_eq!(
        got,
        vec![
            ("a", WorkspaceState::Active, "a"),
            ("b", WorkspaceState::Archived, "b"),
            ("c", WorkspaceState::Missing, "c"),
        ]
    );
    assert_eq!(list[0].head, Some(sh(&a.path, &["rev-parse", "HEAD"])));
    // Listing from inside a workspace resolves to the same repository.
    assert_eq!(f.mgr.list(&a.path).unwrap(), list);
}

#[test]
fn archive_refuses_dirty_or_busy_then_keeps_branch_and_restores() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("arch")).unwrap().workspace;
    let committed = commit_file(&ws.path, "work.txt", "done\n", "work");
    std::fs::write(ws.path.join("scratch.txt"), "wip\n").unwrap();

    match f.mgr.archive(&f.repo, "arch", &ArchiveOptions::default()) {
        Err(WorkspaceError::Dirty(n)) => assert_eq!(n, "arch"),
        other => panic!("expected Dirty, got {other:?}"),
    }
    let a = f
        .mgr
        .archive(&f.repo, "arch", &ArchiveOptions { force: true, ..Default::default() })
        .unwrap();
    assert_eq!(a.workspace.state, WorkspaceState::Archived);
    assert!(!ws.path.exists());
    assert!(git::branch_exists(&f.repo, "arch"));
    assert!(f.mgr.list(&f.repo).unwrap().iter().all(|w| w.state == WorkspaceState::Archived));
    // Archived names stay taken.
    assert_eq!(f.mgr.create(&f.repo, &named("arch")).unwrap().workspace.name, "arch-v1");

    let r = f.mgr.restore(&f.repo, "arch").unwrap();
    assert_eq!(r.state, WorkspaceState::Active);
    assert_eq!(r.head.as_deref(), Some(committed.as_str()));
    assert_eq!(std::fs::read_to_string(r.path.join("work.txt")).unwrap(), "done\n");
}

#[test]
fn archive_records_commit_and_restore_recreates_a_deleted_branch() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("tokyo")).unwrap().workspace;
    let committed = commit_file(&ws.path, "work.txt", "done\n", "work");

    let opts = ArchiveOptions { delete_branch: true, ..Default::default() };
    let a = f.mgr.archive(&f.repo, "tokyo", &opts).unwrap();
    assert_eq!(a.workspace.head.as_deref(), Some(committed.as_str()));
    assert!(!git::branch_exists(&f.repo, "tokyo"), "delete_branch removes the local branch");
    let listed = f.mgr.get(&f.repo, "tokyo").unwrap();
    assert_eq!((listed.state, listed.head.as_deref()), (WorkspaceState::Archived, Some(committed.as_str())));

    let r = f.mgr.restore(&f.repo, "tokyo").unwrap();
    assert_eq!(r.state, WorkspaceState::Active);
    assert_eq!(r.branch, "tokyo");
    assert_eq!(r.head.as_deref(), Some(committed.as_str()));
    assert_eq!(sh(&f.repo, &["rev-parse", "refs/heads/tokyo"]), committed);
    assert_eq!(std::fs::read_to_string(r.path.join("work.txt")).unwrap(), "done\n");
}

#[test]
fn restore_without_branch_or_archive_commit_is_not_found() {
    let f = fixture();
    f.mgr.create(&f.repo, &named("osaka")).unwrap();
    f.mgr.archive(&f.repo, "osaka", &ArchiveOptions::default()).unwrap();
    // A record from before archive commits were stored, whose branch is gone.
    let record = f.mgr.data_dir().join("archived").join(WorkspaceManager::repo_slug(&f.repo)).join("osaka.ws");
    std::fs::write(&record, "branch=osaka\n").unwrap();
    sh(&f.repo, &["branch", "-D", "osaka"]);
    assert_eq!(f.mgr.get(&f.repo, "osaka").unwrap().head, None);
    assert!(matches!(f.mgr.restore(&f.repo, "osaka"), Err(WorkspaceError::NotFound(_))));
}

#[test]
fn archive_runs_archive_script_in_workspace_with_env() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("scripted")).unwrap().workspace;
    let marker = f.tmp.path().join("archived.txt");
    let script = format!(
        "echo \"$PWD|$CONDUCTOR_WORKSPACE_NAME|$CONDUCTOR_ROOT_PATH|$CONDUCTOR_IS_LOCAL\" > '{}'",
        marker.display()
    );
    let a = f
        .mgr
        .archive(&f.repo, "scripted", &ArchiveOptions { archive_script: Some(script), ..Default::default() })
        .unwrap();
    assert!(a.script.as_ref().unwrap().success());
    let line = std::fs::read_to_string(&marker).unwrap();
    assert_eq!(line.trim(), format!("{}|scripted|{}|1", ws.path.display(), f.repo.display()));
}

#[test]
fn delete_removes_worktree_branch_and_archive_record() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("gone")).unwrap().workspace;
    std::fs::write(ws.path.join("dirty.txt"), "x").unwrap();
    f.mgr.delete(&f.repo, "gone").unwrap();
    assert!(!ws.path.exists());
    assert!(!git::branch_exists(&f.repo, "gone"));
    assert!(f.mgr.list(&f.repo).unwrap().is_empty());

    f.mgr.create(&f.repo, &named("old")).unwrap();
    f.mgr.archive(&f.repo, "old", &ArchiveOptions::default()).unwrap();
    f.mgr.delete(&f.repo, "old").unwrap();
    assert!(!git::branch_exists(&f.repo, "old"));
    assert!(f.mgr.list(&f.repo).unwrap().is_empty());
    assert!(matches!(f.mgr.delete(&f.repo, "old"), Err(WorkspaceError::NotFound(_))));
    // Name is free again.
    assert_eq!(f.mgr.create(&f.repo, &named("old")).unwrap().workspace.name, "old");
}

#[test]
fn setup_script_runs_in_workspace_with_env_and_reports_failure() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("setup")).unwrap().workspace;
    let ctx = f.mgr.script_context(&ws, Some(55010), true);
    let out = f
        .mgr
        .run_setup(
            &ctx,
            "pwd; echo $CONDUCTOR_WORKSPACE_ID $CONDUCTOR_PORT $CONDUCTOR_DEFAULT_BRANCH; touch setup-ran",
        )
        .unwrap();
    assert!(out.success(), "{out:?}");
    let lines: Vec<&str> = out.stdout.lines().collect();
    assert_eq!(lines[0], ws.path.display().to_string());
    assert_eq!(lines[1], "my-app/setup 55010 main");
    assert!(ws.path.join("setup-ran").exists());

    let fail = f.mgr.run_setup(&ctx, "echo oops >&2; exit 3").unwrap();
    assert_eq!(fail.exit_code, Some(3));
    assert_eq!(fail.stderr.trim(), "oops");

    // Cloud-style context: no port or default branch, IS_LOCAL=0.
    let cloud = f.mgr.script_context(&ws, Some(1), false);
    let vars: Vec<String> = cloud.env_vars().into_iter().map(|(k, _)| k).collect();
    assert!(!vars.iter().any(|k| k == "CONDUCTOR_PORT" || k == "CONDUCTOR_DEFAULT_BRANCH"));
    assert!(cloud.env_vars().contains(&("CONDUCTOR_IS_LOCAL".into(), "0".into())));
}

#[test]
fn run_script_stop_kills_whole_process_group() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("run")).unwrap().workspace;
    let ctx = f.mgr.script_context(&ws, Some(55000), true);
    let pidfile = f.tmp.path().join("bg.pid");
    let script = format!("sleep 60 & echo $! > '{}'; wait", pidfile.display());
    let run = f.mgr.start_run(&ctx, &script).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !pidfile.exists() || std::fs::read_to_string(&pidfile).unwrap().trim().is_empty() {
        assert!(Instant::now() < deadline, "run script did not start");
        std::thread::sleep(Duration::from_millis(20));
    }
    let bg = std::fs::read_to_string(&pidfile).unwrap().trim().to_string();
    let started = Instant::now();
    run.stop().unwrap();
    assert!(started.elapsed() < Duration::from_secs(5));
    // The backgrounded grandchild is gone too.
    let deadline = Instant::now() + Duration::from_secs(5);
    while Command::new("kill").args(["-0", &bg]).stderr(std::process::Stdio::null()).status().unwrap().success() {
        assert!(Instant::now() < deadline, "background process {bg} survived stop");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn busy_state_matches_git_busy_check_script() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("busy")).unwrap().workspace;
    assert_eq!(git::busy_state(&ws.path).unwrap(), BusyState::Clean);

    // Conflicting change on main and on the workspace branch -> merge conflict.
    commit_file(&f.repo, "README.md", "main side\n", "main");
    commit_file(&ws.path, "README.md", "ws side\n", "ws");
    let out = git::git_raw(&ws.path, ["merge", "main"]).unwrap();
    assert!(!out.status.success());
    assert_eq!(git::busy_state(&ws.path).unwrap(), BusyState::Merge);
    assert!(matches!(
        f.mgr.archive(&f.repo, "busy", &ArchiveOptions::default()),
        Err(WorkspaceError::Busy(BusyState::Merge))
    ));
    // `force` only overrides dirty trees, never an operation in progress.
    assert!(matches!(
        f.mgr.archive(&f.repo, "busy", &ArchiveOptions { force: true, ..Default::default() }),
        Err(WorkspaceError::Busy(BusyState::Merge))
    ));
    sh(&ws.path, &["merge", "--abort"]);

    let out = git::git_raw(&ws.path, ["cherry-pick", "main"]).unwrap();
    assert!(!out.status.success());
    assert_eq!(git::busy_state(&ws.path).unwrap(), BusyState::CherryPick);
    sh(&ws.path, &["cherry-pick", "--abort"]);

    let out = git::git_raw(&ws.path, ["rebase", "main"]).unwrap();
    assert!(!out.status.success());
    assert_eq!(git::busy_state(&ws.path).unwrap(), BusyState::Rebase);
    sh(&ws.path, &["rebase", "--abort"]);

    let out = git::git_raw(&ws.path, ["merge", "--squash", "main"]).unwrap();
    assert!(!out.status.success());
    assert_eq!(git::busy_state(&ws.path).unwrap(), BusyState::SquashMerge);

    // Same answer as the bundled script, when bash is available.
    let repo_root = option_env!("CARGO_MANIFEST_DIR")
        .map(|d| Path::new(d).join(".."))
        .unwrap_or_else(|| std::env::current_dir().unwrap());
    let script = repo_root.join("evidence/scripts/bin/git-busy-check.sh");
    if script.is_file() {
        let out = Command::new("bash").arg(&script).arg(&ws.path).output().unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), BusyState::SquashMerge.as_token());
    }
}

#[test]
fn parses_worktree_porcelain() {
    let text = "worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /d/x\nHEAD def\ndetached\nlocked reason\n\nworktree /d/y\nHEAD 123\nbranch refs/heads/u/y\nprunable gitdir file points to non-existent location\n";
    let e = git::parse_worktree_porcelain(text);
    assert_eq!(e.len(), 3);
    assert_eq!(e[0].branch.as_deref(), Some("main"));
    assert_eq!(e[1].branch, None);
    assert!(e[1].locked);
    assert_eq!(e[2].branch.as_deref(), Some("u/y"));
    assert!(e[2].prunable);
}

#[test]
fn naming_helpers() {
    assert_eq!(naming::slugify("  Hello, World!! 2 "), "hello-world-2");
    assert_eq!(naming::slugify("---"), "");
    assert_eq!(naming::branch_for(Some("/sven/"), "x"), "sven/x");
    assert_eq!(naming::branch_for(Some(""), "x"), "x");
    assert_eq!(naming::uniquify("a", |c| c == "a" || c == "a-v1"), "a-v2");
    assert_eq!(naming::uniquify("a", |_| false), "a");
    // Same bump as the reference app's: an existing -vN suffix is counted up.
    assert_eq!(naming::bump("x"), "x-v1");
    assert_eq!(naming::bump("x-v3"), "x-v4");
    assert_eq!(naming::bump("a-v1-v2"), "a-v1-v3");
    assert_eq!(naming::bump("-v5"), "-v5-v1");
    assert_eq!(naming::bump("x-v"), "x-v-v1");
    assert_eq!(naming::bump("x-v1a"), "x-v1a-v1");
    assert_eq!(naming::uniquify("r-v2", |c| c == "r-v2"), "r-v3");
    let all: HashSet<String> = (0..100).map(|_| naming::generate_name(&HashSet::new())).collect();
    let n = naming::generate_name(&all);
    assert!(!all.contains(&n));
}

#[test]
fn port_blocks_do_not_overlap() {
    let used: HashSet<u16> = [55000, 55010].into_iter().collect();
    assert_eq!(scripts::allocate_port_block(55000, &used), Some(55020));
    assert_eq!(scripts::allocate_port_block(55000, &HashSet::new()), Some(55000));
    assert_eq!(scripts::allocate_port_block(65526, &HashSet::new()), Some(65526));
    assert_eq!(scripts::allocate_port_block(65530, &HashSet::new()), None);
    let used: HashSet<u16> = [65520].into_iter().collect();
    assert_eq!(scripts::allocate_port_block(65520, &used), None);
}

#[test]
fn explicit_branch_name_is_used_verbatim_and_names_the_directory() {
    let f = fixture();
    let opts = CreateOptions { branch_name: Some("sven/fix-login".into()), ..Default::default() };
    let ws = f.mgr.create(&f.repo, &opts).unwrap().workspace;
    assert_eq!(ws.branch, "sven/fix-login");
    assert_eq!(ws.name, "fix-login");
    assert_eq!(sh(&ws.path, &["symbolic-ref", "--short", "HEAD"]), "sven/fix-login");

    // Directory and branch can differ.
    let opts = CreateOptions {
        name: Some("Scratch Dir".into()),
        branch_name: Some("feature/other".into()),
        ..Default::default()
    };
    let ws = f.mgr.create(&f.repo, &opts).unwrap().workspace;
    assert_eq!((ws.name.as_str(), ws.branch.as_str()), ("scratch-dir", "feature/other"));

    // An explicit branch that exists is an error, not silently renamed.
    let again = CreateOptions { branch_name: Some("sven/fix-login".into()), ..Default::default() };
    assert!(matches!(f.mgr.create(&f.repo, &again), Err(WorkspaceError::BranchExists(b)) if b == "sven/fix-login"));
    let bad = CreateOptions { branch_name: Some("bad..name".into()), ..Default::default() };
    assert!(matches!(f.mgr.create(&f.repo, &bad), Err(WorkspaceError::InvalidName(_))));
}

#[test]
fn list_branches_returns_local_then_remote_without_symrefs() {
    let f = fixture();
    let remote = f.tmp.path().join("remote.git");
    sh(f.tmp.path(), &["init", "-q", "--bare", "-b", "main", remote.to_str().unwrap()]);
    sh(&f.repo, &["remote", "add", "origin", remote.to_str().unwrap()]);
    sh(&f.repo, &["push", "-q", "origin", "main"]);
    sh(&f.repo, &["remote", "set-head", "origin", "main"]);
    sh(&f.repo, &["branch", "topic"]);

    let b = git::list_branches(&f.repo).unwrap();
    let names: Vec<(&str, Option<&str>, bool)> =
        b.iter().map(|b| (b.name.as_str(), b.remote.as_deref(), b.is_head)).collect();
    assert!(names.contains(&("main", None, true)));
    assert!(names.contains(&("topic", None, false)));
    assert!(names.contains(&("origin/main", Some("origin"), false)));
    assert!(!names.iter().any(|(n, _, _)| *n == "origin/HEAD" || *n == "origin"));
    let first_remote = b.iter().position(|b| b.remote.is_some()).unwrap();
    assert!(b[..first_remote].iter().all(|b| b.remote.is_none()));
    assert!(b.iter().all(|b| b.commit.len() >= 40 && b.committed_at > 0));
}

#[test]
fn parses_branch_refs_with_slashed_remote_names() {
    let text = "refs/heads/main\0aaa\0*\x0010\0\nrefs/remotes/up/stream/x\0bbb\0 \x0020\0\nrefs/remotes/origin/HEAD\0ccc\0 \x0030\0refs/remotes/origin/main\n";
    let remotes = vec!["up".to_string(), "up/stream".to_string()];
    let b = git::parse_branch_refs(text, &remotes);
    assert_eq!(b.len(), 2);
    assert_eq!(b[0].name, "main");
    assert!(b[0].is_head);
    assert_eq!(b[1].remote.as_deref(), Some("up/stream"));
}

#[test]
fn root_setting_moves_workspaces_archives_and_default_clones() {
    use super::service::{CreateWorkspaceRequest, WorkspaceService};
    let f = fixture();
    let data = f.tmp.path().join("svc");
    let root = f.tmp.path().join("oc-root");
    let svc = WorkspaceService::new(&data).unwrap().with_root(&root);
    assert_eq!(svc.manager().root(), root.as_path());
    assert_eq!(svc.default_clone_dir(), root.join("repos"));
    let r = svc.add_repository(&f.repo).unwrap();
    assert!(data.join("repositories.tsv").is_file(), "registry stays in the data dir");
    assert_eq!(svc.manager().workspaces_dir(&f.repo), root.join("workspaces/my-app"));

    let req = CreateWorkspaceRequest { repository_id: r.id.clone(), directory_name: Some("oslo".into()), ..Default::default() };
    let ws = svc.create_workspace(&req).unwrap().workspace;
    assert_eq!(ws.path, root.join("workspaces/my-app/oslo"));
    assert!(ws.path.join("README.md").is_file());
    svc.manager().archive(&f.repo, "oslo", &Default::default()).unwrap();
    assert!(root.join("archived/my-app/oslo.ws").is_file());
    assert!(!data.join("workspaces").exists() && !data.join("archived").exists());

    // Without the setting everything stays under the data dir.
    let plain = WorkspaceService::new(&data).unwrap();
    assert_eq!(plain.default_clone_dir(), data.join("repos"));
    assert_eq!(plain.manager().workspaces_dir(&f.repo), data.join("workspaces/my-app"));

    // A root change forgets every repository, also after a restart.
    svc.forget_repositories().unwrap();
    assert!(svc.repositories().is_empty());
    assert!(WorkspaceService::new(&data).unwrap().repositories().is_empty());
    assert!(f.repo.join("README.md").is_file(), "files stay on disk");
}

#[test]
fn service_reads_a_registry_without_names_and_bumps_past_workspace_folders() {
    use super::service::WorkspaceService;
    let f = fixture();
    let data = f.tmp.path().join("svc");
    std::fs::create_dir_all(data.join("workspaces").join("My App")).unwrap();
    // A registry from before the name column: the name is the folder name.
    let root = super::git::toplevel(&f.repo).unwrap();
    std::fs::write(data.join("repositories.tsv"), format!("old\t{}\n", root.display())).unwrap();
    let svc = WorkspaceService::new(&data).unwrap();
    assert_eq!(svc.repositories()[0].name, "My App");
    // `My App` is taken by that project, `My App-v1` would be free but for its
    // workspaces folder (Conductor's makeRepoNameUnique checks the folder).
    std::fs::create_dir_all(data.join("workspaces").join("My App-v1")).unwrap();
    let r = svc.add_repository(&f.repo).unwrap();
    assert_eq!((r.id.as_str(), r.name.as_str()), ("my-app-v2", "My App-v2"));
}

#[test]
fn ensure_repository_twice_on_one_folder_adds_no_project() {
    use super::service::WorkspaceService;
    let f = fixture();
    let svc = WorkspaceService::new(f.tmp.path().join("svc")).unwrap();
    // An unregistered folder: the first lookup registers it, the second finds it.
    let first = svc.ensure_repository(None, &f.repo).unwrap();
    assert_eq!(svc.repositories().len(), 1);
    let second = svc.ensure_repository(None, &f.repo).unwrap();
    assert_eq!((second.id.as_str(), svc.repositories().len()), (first.id.as_str(), 1));
    // With a `-v1` copy on the folder, lookups by id or by folder add nothing.
    let copy = svc.add_repository(&f.repo).unwrap();
    let before = svc.repositories().len();
    assert_eq!(svc.ensure_repository(Some(&copy.id), &f.repo).unwrap().id, copy.id);
    assert_eq!(svc.ensure_repository(Some(&copy.id), &f.repo).unwrap().id, copy.id);
    assert_eq!(svc.ensure_repository(None, &f.repo).unwrap().id, first.id);
    assert_eq!(svc.ensure_repository(None, &f.repo).unwrap().id, first.id);
    assert_eq!(svc.repositories().len(), before);
}

#[test]
fn service_registers_repositories_and_creates_from_form_fields() {
    use super::service::{CreateWorkspaceRequest, WorkspaceService};
    let f = fixture();
    let data = f.tmp.path().join("svc");
    let svc = WorkspaceService::new(&data).unwrap();
    let r = svc.add_repository(&f.repo).unwrap();
    assert_eq!((r.id.as_str(), r.name.as_str(), r.default_branch.as_str()), ("my-app", "My App", "main"));
    // Adding the same folder again (even via a subdirectory) is not refused:
    // as in Conductor it becomes a second project on the same root, `-v1`.
    std::fs::create_dir_all(f.repo.join("sub")).unwrap();
    let again = svc.add_repository(&f.repo.join("sub")).unwrap();
    assert_eq!((again.id.as_str(), again.name.as_str(), again.root.as_path()), ("my-app-v1", "My App-v1", r.root.as_path()));
    assert_eq!(svc.add_repository(&f.repo).unwrap().name, "My App-v2");

    // Another repo with the same folder name is bumped past both.
    let other = f.tmp.path().join("elsewhere").join("My App");
    std::fs::create_dir_all(&other).unwrap();
    sh(&other, &["init", "-q", "-b", "main"]);
    commit_file(&other, "a.txt", "a\n", "init");
    let o = svc.add_repository(&other).unwrap();
    assert_eq!((o.id.as_str(), o.name.as_str()), ("my-app-v3", "My App-v3"));

    // Registry (ids, roots and names) survives a restart.
    let svc = WorkspaceService::new(&data).unwrap();
    let got: Vec<(String, String)> = svc.repositories().into_iter().map(|r| (r.id, r.name)).collect();
    let want = [("my-app", "My App"), ("my-app-v1", "My App-v1"), ("my-app-v2", "My App-v2"), ("my-app-v3", "My App-v3")];
    assert_eq!(got, want.map(|(i, n)| (i.to_string(), n.to_string())));
    assert_eq!(svc.repository_root("my-app-v1").unwrap(), r.root);

    // ensure_repository (Create workspace, branch pickers) never adds a
    // project: the id it is given, else the first on the folder.
    let by_id = svc.ensure_repository(Some("my-app-v1"), &f.repo).unwrap();
    assert_eq!(by_id.id, "my-app-v1");
    let by_root = svc.ensure_repository(Some("no-such-id"), &f.repo.join("sub")).unwrap();
    assert_eq!(by_root.id, "my-app");
    assert_eq!(svc.ensure_repository(None, &f.repo).unwrap().id, "my-app");
    assert_eq!(svc.repositories().len(), 4);
    let fresh = f.tmp.path().join("fresh");
    std::fs::create_dir_all(&fresh).unwrap();
    sh(&fresh, &["init", "-q", "-b", "main"]);
    commit_file(&fresh, "a.txt", "a\n", "init");
    assert_eq!(svc.ensure_repository(None, &fresh).unwrap().id, "fresh");
    assert_eq!(svc.ensure_repository(None, &fresh).unwrap().id, "fresh");
    assert_eq!(svc.repositories().len(), 5);

    let req = CreateWorkspaceRequest {
        repository_id: "my-app".into(),
        branch_name: Some("sven/form".into()),
        directory_name: Some("".into()),
        base_branch: Some("main".into()),
        ..Default::default()
    };
    let c = svc.create_workspace(&req).unwrap();
    assert_eq!((c.workspace.name.as_str(), c.workspace.branch.as_str()), ("form", "sven/form"));
    assert_eq!(c.base_ref, "main");
    assert!(c.workspace.path.starts_with(&data));
    assert!(svc.list_branches("my-app").unwrap().iter().any(|b| b.name == "sven/form"));

    let unknown = CreateWorkspaceRequest { repository_id: "nope".into(), ..Default::default() };
    assert!(matches!(svc.create_workspace(&unknown), Err(WorkspaceError::UnknownRepository(_))));
    assert!(matches!(svc.list_branches("nope"), Err(WorkspaceError::UnknownRepository(_))));
}

#[test]
fn rename_branch_renames_in_worktree_and_refuses_taken_initializing_or_archived() {
    let f = fixture();
    let tokyo = f.mgr.create(&f.repo, &named("tokyo")).unwrap().workspace;
    let paris = f.mgr.create(&f.repo, &named("paris")).unwrap().workspace;
    sh(&f.repo, &["remote", "add", "origin", "https://example.invalid/repo.git"]);
    sh(&f.repo, &["update-ref", "refs/remotes/origin/on-remote", "HEAD"]);

    let r = f.mgr.rename_branch(&f.repo, "tokyo", "sven/fix-login").unwrap();
    assert_eq!((r.name.as_str(), r.branch.as_str()), ("tokyo", "sven/fix-login"));
    assert_eq!(r.path, tokyo.path);
    assert_eq!(sh(&tokyo.path, &["rev-parse", "--abbrev-ref", "HEAD"]), "sven/fix-login");
    assert!(!git::branch_exists(&f.repo, "tokyo"));
    // Same name is a no-op.
    assert_eq!(f.mgr.rename_branch(&f.repo, "tokyo", "sven/fix-login").unwrap().branch, "sven/fix-login");

    for taken in ["paris", "on-remote"] {
        match f.mgr.rename_branch(&f.repo, "tokyo", taken) {
            Err(WorkspaceError::BranchExists(b)) => assert_eq!(b, taken),
            other => panic!("expected BranchExists for {taken}, got {other:?}"),
        }
    }
    assert!(matches!(f.mgr.rename_branch(&f.repo, "tokyo", "bad..name"), Err(WorkspaceError::InvalidName(_))));
    assert!(matches!(f.mgr.rename_branch(&f.repo, "nowhere", "x"), Err(WorkspaceError::NotFound(_))));

    let guard = f.mgr.mark_initializing(&paris.path);
    let err = f.mgr.rename_branch(&f.repo, "paris", "renamed").unwrap_err();
    assert!(matches!(err, WorkspaceError::Initializing(ref n) if n == "paris"), "{err:?}");
    assert!(err.to_string().contains("initializing"));
    drop(guard);
    assert_eq!(f.mgr.rename_branch(&f.repo, "paris", "renamed").unwrap().branch, "renamed");

    f.mgr.archive(&f.repo, "paris", &ArchiveOptions::default()).unwrap();
    assert!(matches!(f.mgr.rename_branch(&f.repo, "paris", "again"), Err(WorkspaceError::NotActive(_))));
}

#[test]
fn service_renames_workspace_branch_by_workspace_id() {
    use super::service::{CreateWorkspaceRequest, WorkspaceService};
    let f = fixture();
    let svc = WorkspaceService::new(f.tmp.path().join("svc")).unwrap();
    let id = svc.add_repository(&f.repo).unwrap().id;
    let req = CreateWorkspaceRequest { repository_id: id.clone(), directory_name: Some("lisbon".into()), ..Default::default() };
    let c = svc.create_workspace(&req).unwrap();
    // Creation finished, so the workspace is no longer initializing.
    let w = svc.rename_workspace_branch(&format!("{id}/{}", c.workspace.name), "sven/add-tests").unwrap();
    assert_eq!((w.name.as_str(), w.branch.as_str()), ("lisbon", "sven/add-tests"));
    assert_eq!(svc.manager().list(&f.repo).unwrap()[0].branch, "sven/add-tests");
    assert!(matches!(svc.rename_workspace_branch("nope/lisbon", "x"), Err(WorkspaceError::UnknownRepository(_))));
    assert!(matches!(svc.rename_workspace_branch("no-slash", "x"), Err(WorkspaceError::NotFound(_))));
}

#[test]
fn repo_name_from_url_takes_last_segment_without_dot_git() {
    let cases = [
        ("https://github.com/owner/name", Some("name")),
        ("https://github.com/owner/name.git", Some("name")),
        ("https://github.com/owner/name/", Some("name")),
        ("git@github.com:owner/name.git", Some("name")),
        ("git@host:name.git", Some("name")),
        ("ssh://git@host:2222/owner/name.git/", Some("name")),
        ("/Users/sven/src/my-app", Some("my-app")),
        ("  ../my-app.git  ", Some("my-app")),
        ("", None),
        ("https://", None),
        ("..", None),
    ];
    for (url, want) in cases {
        assert_eq!(naming::repo_name_from_url(url).as_deref(), want, "{url:?}");
    }
}

#[test]
fn clone_repository_streams_progress_and_picks_a_unique_name() {
    use super::service::WorkspaceService;
    let f = fixture();
    let svc = WorkspaceService::new(f.tmp.path().join("svc")).unwrap();
    let parent = f.tmp.path().join("clones");
    std::fs::create_dir_all(&parent).unwrap();
    let url = f.repo.display().to_string();
    let mut lines = Vec::new();

    let r = svc.clone_repository(&url, &parent, &mut |l| lines.push(l.to_string())).unwrap();
    assert_eq!((r.id.as_str(), r.name.as_str(), r.default_branch.as_str()), ("my-app", "My App", "main"));
    assert_eq!(r.root, parent.join("My App"));
    assert!(r.root.join("README.md").exists());
    assert_eq!(lines[..2], ["Creating directory structure...", "Cloning repository..."]);
    assert!(lines.iter().any(|l| l.starts_with("Cloning into")), "{lines:?}");
    assert_eq!(lines[lines.len() - 2..], ["Detecting default branch...", "Saving repository information..."]);

    let again = svc.clone_repository(&url, &parent, &mut |_| {}).unwrap();
    assert_eq!(again.root, parent.join("My App-v1"));
    assert_eq!(svc.repositories().len(), 2);

    // An empty clone folder still skips names other projects have, so the
    // folder and the project name stay the same (makeRepoNameUnique).
    let other = f.tmp.path().join("other-clones");
    std::fs::create_dir_all(&other).unwrap();
    let third = svc.clone_repository(&url, &other, &mut |_| {}).unwrap();
    assert_eq!((third.root, third.name.as_str()), (other.join("My App-v2"), "My App-v2"));
}

#[test]
fn clone_repository_creates_only_the_default_dir_and_reports_exit_code() {
    use super::service::WorkspaceService;
    let f = fixture();
    let svc = WorkspaceService::new(f.tmp.path().join("svc")).unwrap();
    let url = f.repo.display().to_string();

    let elsewhere = f.tmp.path().join("missing");
    match svc.clone_repository(&url, &elsewhere, &mut |_| {}) {
        Err(e @ WorkspaceError::TargetMissing(_)) => {
            assert_eq!(e.to_string(), format!("Target directory does not exist: {}", elsewhere.display()));
        }
        other => panic!("expected TargetMissing, got {other:?}"),
    }
    assert!(!elsewhere.exists());

    let default = svc.default_clone_dir();
    let mut lines = Vec::new();
    let r = svc.clone_repository(&url, &default, &mut |l| lines.push(l.to_string())).unwrap();
    assert_eq!(r.root, default.join("My App"));
    assert_eq!(lines[1], format!("Creating default directory: {}", default.display()));

    let missing = f.tmp.path().join("no-such-repo");
    let msg = svc.clone_repository(&missing.display().to_string(), &default, &mut |_| {}).unwrap_err().to_string();
    assert!(msg.starts_with("Git clone failed with code 128\n\nSTDOUT:\n"), "{msg}");
    assert!(msg.contains("STDERR:\n") && msg.contains("does not exist"), "{msg}");
    assert!(!default.join("no-such-repo").exists());
    assert_eq!(svc.repositories().len(), 1);
    assert!(matches!(svc.clone_repository("https://", &default, &mut |_| {}), Err(WorkspaceError::InvalidCloneUrl(_))));
}

/// `git config <args>` in `dir`, or `None` when the key is unset.
fn config_get(dir: &Path, args: &[&str]) -> Option<String> {
    let out = git::git_raw(dir, [&["config"], args].concat()).unwrap();
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[test]
fn push_auto_setup_remote_is_set_in_the_new_worktree_only() {
    let f = fixture();
    let opts = CreateOptions { push_auto_setup_remote: true, ..named("tokyo") };
    let c = f.mgr.create(&f.repo, &opts).unwrap();
    assert_eq!(c.upstream_warning, None);
    let ws = &c.workspace.path;
    assert_eq!(config_get(ws, &["--worktree", "--get", "push.autoSetupRemote"]).as_deref(), Some("true"));
    assert_eq!(config_get(&f.repo, &["--get", "extensions.worktreeConfig"]).as_deref(), Some("true"));
    // The main checkout and other workspaces do not inherit it.
    assert_eq!(config_get(&f.repo, &["--get", "push.autoSetupRemote"]), None);
    let other = f.mgr.create(&f.repo, &named("lisbon")).unwrap().workspace;
    assert_eq!(config_get(&other.path, &["--get", "push.autoSetupRemote"]), None);
}

#[test]
fn push_auto_setup_remote_off_writes_no_config() {
    let f = fixture();
    let c = f.mgr.create(&f.repo, &named("tokyo")).unwrap();
    assert_eq!(c.upstream_warning, None);
    assert_eq!(config_get(&c.workspace.path, &["--get", "push.autoSetupRemote"]), None);
    assert_eq!(config_get(&f.repo, &["--get", "extensions.worktreeConfig"]), None);
}

#[test]
fn push_auto_setup_remote_keeps_an_explicit_worktree_value() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("tokyo")).unwrap().workspace;
    sh(&f.repo, &["config", "extensions.worktreeConfig", "true"]);
    sh(&ws.path, &["config", "--worktree", "push.autoSetupRemote", "false"]);
    assert_eq!(git::configure_push_upstream(&f.repo, &ws.path), None);
    assert_eq!(config_get(&ws.path, &["--worktree", "--get", "push.autoSetupRemote"]).as_deref(), Some("false"));
}

#[test]
fn push_auto_setup_remote_skips_shared_core_worktree() {
    let f = fixture();
    let ws = f.mgr.create(&f.repo, &named("tokyo")).unwrap().workspace;
    sh(&f.repo, &["config", "core.worktree", f.repo.to_str().unwrap()]);
    assert_eq!(git::configure_push_upstream(&f.repo, &ws.path), Some(git::PUSH_UPSTREAM_WARNING));
    assert_eq!(config_get(&f.repo, &["--get", "extensions.worktreeConfig"]), None);
    // Already true through shared config: nothing to warn about.
    sh(&f.repo, &["config", "push.autoSetupRemote", "true"]);
    assert_eq!(git::configure_push_upstream(&f.repo, &ws.path), None);
}

#[test]
fn service_backfills_push_upstream_for_existing_active_workspaces() {
    use super::service::{CreateWorkspaceRequest, WorkspaceService};
    let f = fixture();
    let svc = WorkspaceService::new(f.tmp.path().join("svc")).unwrap();
    let id = svc.add_repository(&f.repo).unwrap().id;
    let create = |name: &str| {
        let req = CreateWorkspaceRequest { repository_id: id.clone(), directory_name: Some(name.into()), ..Default::default() };
        svc.create_workspace(&req).unwrap().workspace
    };
    let (tokyo, lisbon, _oslo) = (create("tokyo"), create("lisbon"), create("oslo"));
    sh(&f.repo, &["config", "extensions.worktreeConfig", "true"]);
    sh(&lisbon.path, &["config", "--worktree", "push.autoSetupRemote", "false"]);
    svc.manager().archive(&f.repo, "oslo", &ArchiveOptions::default()).unwrap();
    // A registered repository that is gone is skipped, not an error.
    let gone = f.tmp.path().join("gone");
    std::fs::create_dir_all(&gone).unwrap();
    sh(&gone, &["init", "-q", "-b", "main"]);
    svc.add_repository(&gone).unwrap();
    std::fs::remove_dir_all(&gone).unwrap();

    assert_eq!(svc.configure_push_upstream_for_existing(|_, _| true), vec![]);
    assert_eq!(config_get(&tokyo.path, &["--worktree", "--get", "push.autoSetupRemote"]).as_deref(), Some("true"));
    assert_eq!(config_get(&lisbon.path, &["--worktree", "--get", "push.autoSetupRemote"]).as_deref(), Some("false"));
    assert_eq!(config_get(&f.repo, &["--get", "push.autoSetupRemote"]), None);
    // Running it again changes nothing.
    assert_eq!(svc.configure_push_upstream_for_existing(|_, _| true), vec![]);

    // Shared core.worktree makes it unsafe: each unconfigured workspace reports the warning.
    let paris = create("paris");
    // A workspace whose effective setting is off is left alone.
    let rome = create("rome");
    let not_rome = |_: &std::path::Path, ws: &std::path::Path| !ws.ends_with("rome");
    assert_eq!(svc.configure_push_upstream_for_existing(not_rome), vec![]);
    assert_eq!(config_get(&rome.path, &["--worktree", "--get", "push.autoSetupRemote"]), None);
    assert_eq!(config_get(&paris.path, &["--worktree", "--get", "push.autoSetupRemote"]).as_deref(), Some("true"));
    sh(&paris.path, &["config", "--worktree", "--unset", "push.autoSetupRemote"]);
    sh(&f.repo, &["config", "core.worktree", f.repo.to_str().unwrap()]);
    assert_eq!(svc.configure_push_upstream_for_existing(not_rome), vec![(format!("{id}/paris"), git::PUSH_UPSTREAM_WARNING)]);
    assert_eq!(config_get(&paris.path, &["--worktree", "--get", "push.autoSetupRemote"]), None);
}

// --- Initialization log (create.initializing) ---

use super::init_log::{self, ScriptRun};

fn logs_in(dir: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut logs = Vec::new();
    let mut scripts = Vec::new();
    for e in std::fs::read_dir(dir).unwrap().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with("conductor-script-") {
            scripts.push(e.path());
        } else if name.starts_with("conductor-") && name.ends_with(".log") {
            logs.push(e.path());
        }
    }
    (logs, scripts)
}

#[test]
fn create_logs_worktree_add_and_counts_tracked_files() {
    let f = fixture();
    let tmp = f.tmp.path().join("script-tmp");
    let mgr = f.mgr.clone().with_script_tmp_dir(&tmp);
    commit_file(&f.repo, "b.txt", "b\n", "two");
    let c = mgr.create(&f.repo, &named("oslo")).unwrap();
    let log = c.initialization_log_path.clone().expect("log path");
    let (logs, scripts) = logs_in(&tmp);
    assert_eq!(logs, vec![log.clone()]);
    assert!(scripts.is_empty(), "the script file is removed: {scripts:?}");
    let name = log.file_name().unwrap().to_string_lossy().into_owned();
    // conductor-<ms>-<rand>.log
    let parts: Vec<&str> = name.trim_end_matches(".log").split('-').collect();
    assert_eq!(parts.len(), 3, "{name}");
    assert!(parts[1].parse::<u128>().is_ok(), "{name}");
    let text = std::fs::read_to_string(&log).unwrap();
    assert!(text.contains("Preparing worktree"), "git worktree add output is logged: {text:?}");
    assert_eq!(c.initialization_files_copied, 2);
    assert_eq!(c.auxiliary_failure_message, None);
    assert_eq!(sh(&c.workspace.path, &["symbolic-ref", "--short", "HEAD"]), "oslo");
}

#[test]
fn failing_post_checkout_hook_is_a_non_fatal_initialization_issue() {
    let f = fixture();
    let tmp = f.tmp.path().join("script-tmp");
    let mgr = f.mgr.clone().with_script_tmp_dir(&tmp);
    let hook = f.repo.join(".git/hooks/post-checkout");
    std::fs::write(&hook, "#!/bin/sh\necho hook says no >&2\nexit 7\n").unwrap();
    Command::new("chmod").arg("+x").arg(&hook).status().unwrap();
    // Shared core.worktree also makes push upstream fail: both messages join with a space.
    sh(&f.repo, &["config", "core.worktree", f.repo.to_str().unwrap()]);
    let c = mgr
        .create(&f.repo, &CreateOptions { push_auto_setup_remote: true, ..named("oslo") })
        .unwrap();
    assert!(c.workspace.path.join("README.md").is_file());
    assert_eq!(
        c.auxiliary_failure_message.as_deref(),
        Some(format!("{} {}", init_log::WORKTREE_PARTIAL_FAILURE, git::PUSH_UPSTREAM_WARNING).as_str())
    );
    let text = std::fs::read_to_string(c.initialization_log_path.unwrap()).unwrap();
    assert!(text.contains("hook says no"), "{text:?}");
}

#[test]
fn files_to_copy_failure_is_non_fatal() {
    // Root reads any file, so the copy cannot fail there.
    if Command::new("id").arg("-u").output().is_ok_and(|o| o.stdout.starts_with(b"0\n")) {
        return;
    }
    let f = fixture();
    let mgr = f.mgr.clone().with_script_tmp_dir(f.tmp.path().join("script-tmp"));
    // A gitignored .env (copied by default) that cannot be read.
    std::fs::write(f.repo.join(".gitignore"), ".env\n").unwrap();
    sh(&f.repo, &["add", ".gitignore"]);
    sh(&f.repo, &["commit", "-q", "-m", "ignore"]);
    std::fs::write(f.repo.join(".env"), "SECRET=1\n").unwrap();
    Command::new("chmod").arg("000").arg(f.repo.join(".env")).status().unwrap();
    let r = mgr.create(&f.repo, &named("oslo"));
    Command::new("chmod").arg("644").arg(f.repo.join(".env")).status().unwrap();
    let c = r.unwrap();
    let msg = c.auxiliary_failure_message.expect("copy failure is reported");
    assert!(msg.starts_with("Couldn't copy files from .worktreeinclude: "), "{msg}");
    assert!(c.copied_files.is_empty());
    assert!(c.workspace.path.join("README.md").is_file());
}

#[test]
fn worktree_add_failure_reports_the_logged_output() {
    let f = fixture();
    let mgr = f.mgr.clone().with_script_tmp_dir(f.tmp.path().join("script-tmp"));
    // git keeps worktree metadata in .git/worktrees; a file there makes `worktree add` fail.
    std::fs::write(f.repo.join(".git/worktrees"), "").unwrap();
    let err = mgr.create(&f.repo, &named("oslo")).unwrap_err();
    let msg = err.to_string();
    assert!(matches!(err, WorkspaceError::WorktreeFailed(_)), "{err:?}");
    assert!(msg.starts_with("Failed to create worktree: "), "{msg}");
    assert!(msg.contains("fatal:"), "the log's text is the reason: {msg}");
    assert!(!f.tmp.path().join("data/workspaces/my-app/oslo/README.md").exists());
}

fn script_tmp() -> TempDir {
    TempDir::new()
}

#[test]
fn internal_script_logs_output_and_runs_in_the_working_directory() {
    let t = script_tmp();
    let wd = t.path().join("it's here");
    std::fs::create_dir_all(&wd).unwrap();
    let run = init_log::run_internal_script("pwd\necho out\necho err >&2", &wd, Path::new("/bin/sh"), t.path(), &[]);
    assert_eq!(run.exit_code, 0);
    assert_eq!((run.stdout.as_str(), run.stderr.as_str(), run.error.as_deref()), ("", "", None));
    let text = std::fs::read_to_string(run.log_file_path.unwrap()).unwrap();
    assert_eq!(text, format!("{}\nout\nerr\n", wd.display()));
    // set -e: the first failing command ends the script.
    let run = init_log::run_internal_script("false\necho unreachable", &wd, Path::new("/bin/sh"), t.path(), &[]);
    assert_eq!(run.exit_code, 1);
    assert_eq!(std::fs::read_to_string(run.log_file_path.as_ref().unwrap()).unwrap(), "");
    assert_eq!(init_log::failure_output(&run), "exit code 1");
}

#[test]
fn wrapper_output_is_appended_as_additional_output() {
    let t = script_tmp();
    let shell = t.path().join("no-such-shell");
    let run = init_log::run_internal_script("echo hi", t.path(), &shell, t.path(), &[]);
    assert_ne!(run.exit_code, 0);
    let log = run.log_file_path.clone().unwrap();
    let text = std::fs::read_to_string(&log).unwrap();
    let block = init_log::additional_output(run.exit_code, &run.stdout, &run.stderr);
    if run.stderr.is_empty() && run.stdout.is_empty() {
        // The shell reported the missing program inside the redirect, so it is in the log itself.
        assert!(!text.is_empty());
        assert!(!text.contains("--- Additional Output ---"));
    } else {
        assert!(text.ends_with(&format!("{block}\n")), "{text:?}");
    }
    assert_eq!(
        init_log::additional_output(127, "", "sh: x: not found\n"),
        "\n\n--- Additional Output ---\nExit code: 127\n\nStdout:\n\n\nStderr:\nsh: x: not found\n"
    );
}

#[test]
fn failure_output_falls_back_from_stderr_to_stdout_error_log_then_exit_code() {
    let t = script_tmp();
    let log = t.path().join("conductor-1-abc.log");
    std::fs::write(&log, "fatal: from the log\n").unwrap();
    let base = ScriptRun {
        exit_code: 128,
        stdout: "out".into(),
        stderr: "err".into(),
        error: Some("Failed to execute script: boom".into()),
        log_file_path: Some(log.clone()),
    };
    assert_eq!(init_log::failure_output(&base), "err");
    let r = ScriptRun { stderr: String::new(), ..base.clone() };
    assert_eq!(init_log::failure_output(&r), "out");
    let r = ScriptRun { stdout: String::new(), ..r };
    assert_eq!(init_log::failure_output(&r), "Failed to execute script: boom");
    let r = ScriptRun { error: None, ..r };
    assert_eq!(init_log::failure_output(&r), "fatal: from the log");
    std::fs::write(&log, "").unwrap();
    assert_eq!(init_log::failure_output(&r), "exit code 128");
    let r = ScriptRun { log_file_path: None, ..r };
    assert_eq!(init_log::failure_output(&r), "exit code 128");
}

#[test]
fn worktree_failure_message_special_cases_branch_prefix_clashes() {
    let clash = "Preparing worktree (new branch 'sven/x')\nfatal: cannot lock ref 'refs/heads/sven/x': 'refs/heads/sven' exists; cannot create 'refs/heads/sven/x'\n";
    assert_eq!(
        init_log::worktree_failure_message(clash),
        "Git won't let us create branch \"sven/x\" because \"sven\" already exists. Rename or delete \"sven\", or change your git prefix in settings."
    );
    // Same shape, but not a prefix clash: the generic text.
    let other = "fatal: cannot lock ref 'refs/heads/a': 'refs/heads/b' exists; cannot create 'refs/heads/a'";
    assert_eq!(init_log::worktree_failure_message(other), format!("Failed to create worktree: {other}"));
    assert_eq!(init_log::worktree_failure_message("exit code 1"), "Failed to create worktree: exit code 1");
    assert_eq!(init_log::join_messages(None, None), None);
    assert_eq!(init_log::join_messages(Some("a".into()), None).as_deref(), Some("a"));
    assert_eq!(init_log::join_messages(None, Some("b".into())).as_deref(), Some("b"));
    assert_eq!(init_log::join_messages(Some("a".into()), Some("b".into())).as_deref(), Some("a b"));
    assert_eq!(init_log::shell_quote("it's"), "'it'\\''s'");
}
