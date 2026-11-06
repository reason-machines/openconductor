use std::path::{Path, PathBuf};
use std::process::Command;

use super::pull_latest::{
    decide, parse_left_right, pull_latest_from_target, reconcile_instruction, PullOutcome, Step,
};

#[test]
fn instructions_match_the_reference_wording() {
    let o = Some("origin");
    assert_eq!(
        reconcile_instruction(o, "main", false, false),
        "Merge origin/main into this branch. Then push."
    );
    assert_eq!(
        reconcile_instruction(o, "main", false, true),
        "Commit uncommitted changes, then merge origin/main into this branch. Then push."
    );
    assert_eq!(
        reconcile_instruction(o, "main", true, false),
        "Rebase this branch onto origin/main. Then push --force-with-lease."
    );
    assert_eq!(
        reconcile_instruction(o, "main", true, true),
        "Commit uncommitted changes, then rebase this branch onto origin/main. Then push --force-with-lease."
    );
    assert_eq!(
        reconcile_instruction(None, "dev", false, false),
        "Merge dev into this branch."
    );
    assert_eq!(
        reconcile_instruction(None, "dev", true, true),
        "Commit uncommitted changes, then rebase this branch onto dev."
    );
}

#[test]
fn left_right_counts_and_the_step_they_imply() {
    assert_eq!(parse_left_right("3\t0\n"), Some((3, 0)));
    assert_eq!(parse_left_right("x 1"), None);
    assert_eq!(parse_left_right(""), None);
    assert_eq!(decide(0, 0), Step::Nothing);
    assert_eq!(decide(2, 0), Step::FastForward);
    assert_eq!(decide(2, 1), Step::AskAgent);
    assert_eq!(decide(0, 4), Step::AskAgent);
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["-c", "user.name=t", "-c", "user.email=t@t"])
        .args(args)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {out:?}");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("oc-pr-pull-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn commit(dir: &Path, file: &str) {
    std::fs::write(dir.join(file), file).unwrap();
    git(dir, &["add", file]);
    git(dir, &["commit", "-qm", file]);
}

/// A bare `origin` with `main`, a workspace on `feat` (from main), and a
/// second clone that pushes new commits to main.
fn setup(name: &str) -> (PathBuf, PathBuf, PathBuf) {
    let root = scratch(name);
    let bare = root.join("remote.git");
    git(&root, &["init", "-q", "--bare", "-b", "main", "remote.git"]);
    git(&root, &["clone", "-q", bare.to_str().unwrap(), "ws"]);
    let ws = root.join("ws");
    git(&ws, &["checkout", "-q", "-b", "main"]);
    commit(&ws, "a");
    git(&ws, &["push", "-q", "-u", "origin", "main"]);
    git(&ws, &["checkout", "-q", "-b", "feat"]);
    git(&root, &["clone", "-q", bare.to_str().unwrap(), "other"]);
    let other = root.join("other");
    (root, ws, other)
}

#[test]
fn behind_only_fast_forwards_to_the_fetched_target() {
    let (root, ws, other) = setup("ff");
    assert_eq!(
        pull_latest_from_target(&ws, Some("origin"), "main").unwrap(),
        PullOutcome::UpToDate
    );
    commit(&other, "b");
    commit(&other, "c");
    git(&other, &["push", "-q", "origin", "main"]);
    let remote_head = git(&other, &["rev-parse", "HEAD"]);
    assert_eq!(
        pull_latest_from_target(&ws, Some("origin"), "main").unwrap(),
        PullOutcome::Pulled
    );
    assert_eq!(git(&ws, &["rev-parse", "HEAD"]), remote_head);
    assert_eq!(git(&ws, &["branch", "--show-current"]), "feat");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn diverged_or_dirty_branches_go_to_the_agent() {
    let (root, ws, other) = setup("agent");
    commit(&other, "b");
    git(&other, &["push", "-q", "origin", "main"]);
    commit(&ws, "mine");
    let before = git(&ws, &["rev-parse", "HEAD"]);
    assert_eq!(
        pull_latest_from_target(&ws, Some("origin"), "main").unwrap(),
        PullOutcome::Agent {
            message: "Merge origin/main into this branch. Then push.".into()
        }
    );
    assert_eq!(
        git(&ws, &["rev-parse", "HEAD"]),
        before,
        "left to the agent"
    );

    git(&ws, &["config", "pull.rebase", "true"]);
    std::fs::write(ws.join("mine"), "edited").unwrap();
    assert_eq!(
        pull_latest_from_target(&ws, Some("origin"), "main").unwrap(),
        PullOutcome::Agent {
            message: "Commit uncommitted changes, then rebase this branch onto origin/main. Then push --force-with-lease.".into()
        }
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn missing_target_and_failed_fetch_are_reported() {
    let (root, ws, _other) = setup("missing");
    assert_eq!(
        pull_latest_from_target(&ws, Some("origin"), "nope").unwrap(),
        PullOutcome::TargetMissing
    );
    let err = pull_latest_from_target(&ws, Some("gone"), "main").unwrap_err();
    assert!(!err.is_empty());
    // Local-only: the local branch is the target and nothing is fetched.
    git(&ws, &["checkout", "-q", "main"]);
    commit(&ws, "local");
    git(&ws, &["checkout", "-q", "feat"]);
    assert_eq!(
        pull_latest_from_target(&ws, None, "main").unwrap(),
        PullOutcome::Pulled
    );
    let _ = std::fs::remove_dir_all(&root);
}
