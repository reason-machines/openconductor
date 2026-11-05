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
    assert_eq!(b.name, "feature-2");
    // A pre-existing branch also counts as taken.
    sh(&f.repo, &["branch", "taken"]);
    let c = f.mgr.create(&f.repo, &named("taken")).unwrap().workspace;
    assert_eq!(c.name, "taken-2");
    assert_eq!(c.branch, "taken-2");
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

    let globs = Some(vec!["certs/*.pem".to_string()]);
    let c = f.mgr.create(&f.repo, &CreateOptions { file_include_globs: globs.clone(), ..named("g") }).unwrap();
    assert_eq!(c.copied_files, vec![PathBuf::from("certs/dev.pem")]);

    std::fs::write(f.repo.join(".worktreeinclude"), "config/\n").unwrap();
    let c = f.mgr.create(&f.repo, &CreateOptions { file_include_globs: globs, ..named("w") }).unwrap();
    assert_eq!(c.copied_files, vec![PathBuf::from("config/local.toml")]);
    assert!(c.workspace.path.join("config/local.toml").is_file());
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
    assert_eq!(f.mgr.create(&f.repo, &named("arch")).unwrap().workspace.name, "arch-2");

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
    assert_eq!(naming::uniquify("a", |c| c == "a" || c == "a-2"), "a-3");
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
fn service_registers_repositories_and_creates_from_form_fields() {
    use super::service::{CreateWorkspaceRequest, WorkspaceService};
    let f = fixture();
    let data = f.tmp.path().join("svc");
    let svc = WorkspaceService::new(&data).unwrap();
    let r = svc.add_repository(&f.repo).unwrap();
    assert_eq!((r.id.as_str(), r.default_branch.as_str()), ("my-app", "main"));
    // Same repo (even via a subdirectory) keeps its id.
    std::fs::create_dir_all(f.repo.join("sub")).unwrap();
    assert_eq!(svc.add_repository(&f.repo.join("sub")).unwrap().id, "my-app");

    // A second repo with the same folder name gets a distinct id.
    let other = f.tmp.path().join("elsewhere").join("My App");
    std::fs::create_dir_all(&other).unwrap();
    sh(&other, &["init", "-q", "-b", "main"]);
    commit_file(&other, "a.txt", "a\n", "init");
    assert_eq!(svc.add_repository(&other).unwrap().id, "my-app-2");

    // Registry survives a restart.
    let svc = WorkspaceService::new(&data).unwrap();
    let ids: Vec<String> = svc.repositories().into_iter().map(|r| r.id).collect();
    assert_eq!(ids, ["my-app", "my-app-2"]);

    let req = CreateWorkspaceRequest {
        repository_id: "my-app".into(),
        branch_name: Some("sven/form".into()),
        directory_name: Some("".into()),
        base_branch: Some("main".into()),
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
