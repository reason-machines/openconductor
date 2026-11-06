use super::git::{list_changes, workspace_diff, DiffError, DiffRequest, Scope};
use super::FileStatus;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn sh(repo: &Path, args: &[&str]) {
    let st = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .unwrap();
    assert!(
        st.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&st.stderr)
    );
}

fn repo() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "oc-diff-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    sh(&dir, &["init", "-q", "-b", "main"]);
    sh(&dir, &["config", "user.name", "t"]);
    sh(&dir, &["config", "user.email", "t@example.invalid"]);
    sh(&dir, &["config", "commit.gpgsign", "false"]);
    dir
}

fn write(repo: &Path, path: &str, text: &str) {
    let p = repo.join(path);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn commit(repo: &Path, msg: &str) {
    sh(repo, &["add", "-A"]);
    sh(repo, &["commit", "-q", "-m", msg]);
}

fn req(scope: Scope) -> DiffRequest {
    DiffRequest {
        scope,
        ignore_whitespace: false,
        path: None,
        context_lines: None,
    }
}

fn all() -> Scope {
    Scope::All {
        base: "main".into(),
        remote: None,
    }
}

/// `feature` has one commit over local `main`; `origin/main` already
/// contains it (the branch was merged upstream), local `main` does not.
fn merged_upstream_repo() -> PathBuf {
    let r = repo();
    write(&r, "f.txt", "x\n");
    commit(&r, "base");
    sh(&r, &["checkout", "-q", "-b", "feature"]);
    write(&r, "feature.txt", "y\n");
    commit(&r, "feature work");
    sh(&r, &["update-ref", "refs/remotes/origin/main", "HEAD"]);
    write(&r, "f.txt", "uncommitted\n");
    r
}

fn changed(r: &Path, scope: Scope) -> Vec<String> {
    list_changes(r, &req(scope))
        .unwrap()
        .into_iter()
        .map(|c| c.path)
        .collect()
}

// parity:diff.changes-list:test
#[test]
fn all_changes_use_the_remote_target_ref_when_it_exists() {
    let r = merged_upstream_repo();
    let remote = Scope::All {
        base: "main".into(),
        remote: Some("origin".into()),
    };
    assert_eq!(changed(&r, remote), vec!["f.txt"]);
    // Against the stale local branch the merged commit still shows.
    assert_eq!(changed(&r, all()), vec!["f.txt", "feature.txt"]);
}

#[test]
fn all_changes_fall_back_to_the_local_branch_without_a_remote_ref() {
    let r = merged_upstream_repo();
    let missing = Scope::All {
        base: "main".into(),
        remote: Some("upstream".into()),
    };
    assert_eq!(changed(&r, missing), vec!["f.txt", "feature.txt"]);
}

#[test]
fn all_scope_without_remote_reads_the_old_request_shape() {
    let s: Scope = serde_json::from_str(r#"{"kind":"all","base":"main"}"#).unwrap();
    assert_eq!(s, all());
    let s: Scope =
        serde_json::from_str(r#"{"kind":"all","base":"main","remote":"origin"}"#).unwrap();
    assert_eq!(
        s,
        Scope::All {
            base: "main".into(),
            remote: Some("origin".into())
        }
    );
}

#[test]
fn all_changes_cover_commits_staged_unstaged_and_untracked() {
    let r = repo();
    write(&r, "keep.txt", "a\nb\n");
    write(&r, "old name.txt", "same\n");
    commit(&r, "base");
    sh(&r, &["checkout", "-q", "-b", "feature"]);
    write(&r, "committed.txt", "c\n");
    commit(&r, "work");
    write(&r, "keep.txt", "a\nB\n");
    sh(&r, &["mv", "old name.txt", "new name.txt"]);
    write(&r, "dir/untracked file.rs", "fn x() {}\n");

    let files = list_changes(&r, &req(all())).unwrap();
    let got: Vec<_> = files
        .iter()
        .map(|f| (f.path.as_str(), f.status, f.additions, f.deletions))
        .collect();
    assert_eq!(
        got,
        vec![
            ("committed.txt", FileStatus::Added, 1, 0),
            ("dir/untracked file.rs", FileStatus::Untracked, 1, 0),
            ("keep.txt", FileStatus::Modified, 1, 1),
            ("new name.txt", FileStatus::Renamed, 0, 0),
        ]
    );
    assert_eq!(files[3].old_path.as_deref(), Some("old name.txt"));

    // Uncommitted scope leaves out the committed file.
    let unc = list_changes(&r, &req(Scope::Uncommitted)).unwrap();
    assert!(unc.iter().all(|f| f.path != "committed.txt"));
    assert_eq!(unc.len(), 3);
}

#[test]
fn ignore_whitespace_drops_whitespace_only_hunks() {
    let r = repo();
    write(&r, "a.py", "def f():\n    return 1\n");
    commit(&r, "base");
    write(&r, "a.py", "def f():\n\treturn 1\n");
    let shown = workspace_diff(&r, &req(Scope::Uncommitted)).unwrap();
    assert_eq!(shown.files[0].hunks.len(), 1);
    let mut hidden = req(Scope::Uncommitted);
    hidden.ignore_whitespace = true;
    let hidden = workspace_diff(&r, &hidden).unwrap();
    // The file stays listed, with its counts, and no hunks: "only whitespace changes".
    assert_eq!(hidden.files.len(), 1, "{:?}", hidden.files);
    assert_eq!(hidden.files[0].path, "a.py");
    assert_eq!(
        (hidden.files[0].additions, hidden.files[0].deletions),
        (1, 1)
    );
    assert!(hidden.files[0].hunks.is_empty());
}

#[test]
fn ignore_whitespace_keeps_real_changes_and_lists_every_file() {
    let r = repo();
    write(&r, "a.py", "def f():\n    return 1\n");
    write(&r, "b.py", "x = 1\ny = 2\n");
    commit(&r, "base");
    write(&r, "a.py", "def f():\n\treturn 1\n");
    write(&r, "b.py", "x = 1\ny  =  3\n");
    write(&r, "new.txt", "fresh\n");
    let mut hidden = req(Scope::Uncommitted);
    hidden.ignore_whitespace = true;
    let d = workspace_diff(&r, &hidden).unwrap();
    let paths: Vec<_> = d.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(paths, ["a.py", "b.py", "new.txt"]);
    assert!(d.files[0].hunks.is_empty());
    // b.py has a real change mixed with whitespace: its hunk stays.
    assert_eq!(d.files[1].hunks.len(), 1);
    assert_eq!(d.files[2].hunks.len(), 1);
}

#[test]
fn single_path_and_unborn_branch() {
    let r = repo();
    write(&r, "x.txt", "x\n");
    write(&r, "y.txt", "y\n");
    let d = workspace_diff(
        &r,
        &DiffRequest {
            path: Some("y.txt".into()),
            ..req(Scope::Uncommitted)
        },
    )
    .unwrap();
    assert_eq!(d.base_commit, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    assert_eq!(d.files.len(), 1);
    assert_eq!(d.files[0].path, "y.txt");
}

#[test]
fn merge_in_progress_is_reported() {
    let r = repo();
    write(&r, "f.txt", "base\n");
    commit(&r, "base");
    sh(&r, &["checkout", "-q", "-b", "other"]);
    write(&r, "f.txt", "other\n");
    commit(&r, "other");
    sh(&r, &["checkout", "-q", "main"]);
    write(&r, "f.txt", "main\n");
    commit(&r, "main");
    let _ = Command::new("git")
        .arg("-C")
        .arg(&r)
        .args(["merge", "-q", "other"])
        .output();
    match workspace_diff(&r, &req(Scope::Uncommitted)) {
        Err(DiffError::OperationInProgress("merge")) => {}
        other => panic!("expected merge in progress, got {other:?}"),
    }
}

#[test]
fn unknown_base_is_a_git_error() {
    let r = repo();
    write(&r, "f.txt", "x\n");
    commit(&r, "base");
    let e = workspace_diff(
        &r,
        &req(Scope::All {
            base: "nope".into(),
            remote: None,
        }),
    )
    .unwrap_err();
    assert!(e.to_string().contains("merge-base"), "{e}");
}

#[test]
fn context_lines_widens_hunks_to_the_whole_file() {
    let r = repo();
    let before: String = (1..=20).map(|i| format!("line {i}\n")).collect();
    write(&r, "long.txt", &before);
    commit(&r, "base");
    write(&r, "long.txt", &before.replace("line 10\n", "line ten\n"));

    let default = workspace_diff(&r, &req(Scope::Uncommitted)).unwrap();
    let h = &default.files[0].hunks[0];
    assert_eq!((h.new_start, h.new_lines), (7, 7));

    let whole = workspace_diff(
        &r,
        &DiffRequest {
            context_lines: Some(u32::MAX >> 1),
            ..req(Scope::Uncommitted)
        },
    )
    .unwrap();
    let hunks = &whole.files[0].hunks;
    assert_eq!(hunks.len(), 1);
    assert_eq!((hunks[0].new_start, hunks[0].new_lines), (1, 20));
}

mod discard {
    use super::super::discard::{discard_file, DiscardRequest};
    use super::*;

    fn discard(
        r: &Path,
        scope: Scope,
        path: &str,
        old_path: Option<&str>,
    ) -> Result<(), DiffError> {
        discard_file(
            r,
            &DiscardRequest {
                scope,
                path: path.into(),
                old_path: old_path.map(Into::into),
            },
        )
    }

    fn read(r: &Path, path: &str) -> Option<String> {
        fs::read_to_string(r.join(path)).ok()
    }

    /// Branch `feature` off `main` with one committed edit, one committed
    /// new file, then uncommitted edits on top.
    fn branch_repo() -> PathBuf {
        let r = repo();
        write(&r, "keep.txt", "base\n");
        write(&r, "old name.txt", "same\n");
        commit(&r, "base");
        sh(&r, &["checkout", "-q", "-b", "feature"]);
        write(&r, "keep.txt", "committed\n");
        write(&r, "new.txt", "new\n");
        commit(&r, "work");
        write(&r, "keep.txt", "uncommitted\n");
        r
    }

    fn paths(r: &Path, scope: Scope) -> Vec<String> {
        list_changes(r, &req(scope))
            .unwrap()
            .into_iter()
            .map(|f| f.path)
            .collect()
    }

    #[test]
    fn all_changes_restores_the_merge_base_version() {
        let r = branch_repo();
        sh(&r, &["add", "keep.txt"]);
        discard(&r, all(), "keep.txt", None).unwrap();
        assert_eq!(read(&r, "keep.txt").as_deref(), Some("base\n"));
        assert_eq!(paths(&r, all()), vec!["new.txt"]);
    }

    #[test]
    fn uncommitted_restores_head_and_keeps_committed_work() {
        let r = branch_repo();
        discard(&r, Scope::Uncommitted, "keep.txt", None).unwrap();
        assert_eq!(read(&r, "keep.txt").as_deref(), Some("committed\n"));
        assert!(paths(&r, Scope::Uncommitted).is_empty());
    }

    #[test]
    fn files_missing_from_the_base_are_deleted_and_unstaged() {
        let r = branch_repo();
        write(&r, "dir/untracked.txt", "u\n");
        write(&r, "staged.txt", "s\n");
        sh(&r, &["add", "staged.txt"]);
        discard(&r, all(), "new.txt", None).unwrap();
        discard(&r, Scope::Uncommitted, "dir/untracked.txt", None).unwrap();
        discard(&r, Scope::Uncommitted, "staged.txt", None).unwrap();
        for p in ["new.txt", "dir/untracked.txt", "staged.txt"] {
            assert_eq!(read(&r, p), None, "{p} should be gone");
        }
        // new.txt was committed on the branch, so against HEAD it now reads as deleted.
        assert_eq!(paths(&r, all()), vec!["keep.txt"]);
        assert_eq!(paths(&r, Scope::Uncommitted), vec!["keep.txt", "new.txt"]);
    }

    #[test]
    fn a_rename_restores_the_old_path_and_drops_the_new_one() {
        let r = branch_repo();
        sh(&r, &["mv", "old name.txt", "new name.txt"]);
        discard(&r, Scope::Uncommitted, "new name.txt", Some("old name.txt")).unwrap();
        assert_eq!(read(&r, "old name.txt").as_deref(), Some("same\n"));
        assert_eq!(read(&r, "new name.txt"), None);
        assert_eq!(paths(&r, Scope::Uncommitted), vec!["keep.txt"]);
    }

    #[test]
    fn unborn_branch_deletes_the_file() {
        let r = repo();
        write(&r, "x.txt", "x\n");
        sh(&r, &["add", "x.txt"]);
        discard(&r, Scope::Uncommitted, "x.txt", None).unwrap();
        assert_eq!(read(&r, "x.txt"), None);
        assert!(paths(&r, Scope::Uncommitted).is_empty());
    }

    #[test]
    fn paths_outside_the_worktree_are_refused() {
        let r = branch_repo();
        for bad in ["../escape.txt", "/etc/hosts", "", "a/../../b"] {
            let e = discard(&r, Scope::Uncommitted, bad, None).unwrap_err();
            assert!(matches!(e, DiffError::InvalidPath(_)), "{bad}: {e}");
        }
        let e = discard(&r, Scope::Uncommitted, "keep.txt", Some("../x")).unwrap_err();
        assert!(matches!(e, DiffError::InvalidPath(_)));
        assert_eq!(read(&r, "keep.txt").as_deref(), Some("uncommitted\n"));
    }
}
