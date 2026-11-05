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
    }
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
    // The file stays listed with no hunks: "only whitespace changes".
    assert!(hidden.files.iter().all(|f| f.hunks.is_empty()));
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
