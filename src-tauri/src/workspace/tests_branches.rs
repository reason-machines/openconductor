//! Tests for branch listing and default-branch detection.

use super::test_util::*;
use super::*;

#[test]
fn lists_remote_branches_without_prefix_and_detects_default() {
    let tmp = TempDir::new("list");
    let (_origin, clone) = origin_and_clone(&tmp);
    let list = list_branches(&clone).unwrap();
    assert_eq!(list.remote_name.as_deref(), Some("origin"));
    assert_eq!(list.default_branch, "main");
    let mut names = list.branches.clone();
    names.sort();
    assert_eq!(names, vec!["feature", "main"], "no origin/ prefix, no HEAD");
}

#[test]
fn default_branch_follows_remote_head_not_the_root_checkout() {
    let tmp = TempDir::new("remote-head");
    let (_origin, clone) = origin_and_clone(&tmp);
    g(&clone, &["remote", "set-head", "origin", "feature"]);
    g(&clone, &["checkout", "-q", "-b", "local-only"]);
    let list = list_branches(&clone).unwrap();
    assert_eq!(list.default_branch, "feature");
    assert!(
        !list.branches.contains(&"local-only".to_string()),
        "remote branches only"
    );
}

#[test]
fn repo_without_remote_lists_local_branches() {
    let tmp = TempDir::new("local");
    init_repo(tmp.path());
    g(tmp.path(), &["branch", "topic"]);
    let list = list_branches(tmp.path()).unwrap();
    assert_eq!(list.remote_name, None);
    assert_eq!(list.default_branch, "main");
    let mut names = list.branches;
    names.sort();
    assert_eq!(names, vec!["main", "topic"]);
}

#[test]
fn default_branch_falls_back_to_root_checkout() {
    let tmp = TempDir::new("fallback");
    let dir = tmp.path();
    g(dir, &["init", "-q", "-b", "trunk"]);
    write(dir, "a", "a");
    g(dir, &["add", "."]);
    g(dir, &["commit", "-q", "-m", "a"]);
    assert_eq!(list_branches(dir).unwrap().default_branch, "trunk");
}

#[test]
fn prefers_origin_over_other_remotes() {
    let tmp = TempDir::new("remotes");
    let (origin, clone) = origin_and_clone(&tmp);
    g(&clone, &["remote", "add", "aaa", origin.to_str().unwrap()]);
    g(&clone, &["fetch", "-q", "aaa"]);
    assert_eq!(primary_remote(&clone).unwrap().as_deref(), Some("origin"));
    g(&clone, &["remote", "remove", "origin"]);
    assert_eq!(primary_remote(&clone).unwrap().as_deref(), Some("aaa"));
}

#[test]
fn non_repository_is_reported() {
    let tmp = TempDir::new("norepo");
    assert!(matches!(
        list_branches(tmp.path()),
        Err(WorkspaceError::NotARepository(_))
    ));
    let missing = tmp.path().join("missing");
    assert!(matches!(
        list_branches(&missing),
        Err(WorkspaceError::NotARepository(_))
    ));
}
