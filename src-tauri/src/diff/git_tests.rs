use super::git::{branch_commits, list_changes, workspace_diff, DiffError, DiffRequest, Scope};
use super::FileStatus;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

#[path = "large_file_tests.rs"]
mod large_file_placeholder;

#[path = "historical_large_file_tests.rs"]
mod historical_large_file_placeholder;

#[path = "literal_path_tests.rs"]
mod literal_selected_paths;

#[path = "turn_large_file_tests.rs"]
mod turn_large_file_placeholder;

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

fn oid(r: &Path, revision: &str) -> String {
    super::git::git(r, &["rev-parse", revision], &[0])
        .unwrap()
        .trim()
        .to_string()
}

fn set_modified(repo: &Path, path: &str, nanoseconds: u64) {
    let time = std::time::UNIX_EPOCH + std::time::Duration::from_nanos(nanoseconds);
    fs::File::options()
        .write(true)
        .open(repo.join(path))
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
    assert_eq!(
        fs::metadata(repo.join(path)).unwrap().modified().unwrap(),
        time
    );
}

#[test]
fn worktree_modification_time_survives_full_and_summary_serialization_and_same_content_rewrite() {
    let r = repo();
    write(&r, "f.txt", "base\n");
    commit(&r, "base");
    write(&r, "f.txt", "same edited content\n");
    set_modified(&r, "f.txt", 1_700_000_000_123_600_000);
    let first = workspace_diff(&r, &req(Scope::Uncommitted)).unwrap();
    let first_json = serde_json::to_value(&first).unwrap();
    assert_eq!(
        first_json["files"][0]["last_modified_time"],
        1_700_000_000_124_i64
    );
    let summary = serde_json::to_value(list_changes(&r, &req(all())).unwrap()).unwrap();
    assert_eq!(summary[0]["last_modified_time"], 1_700_000_000_124_i64);
    write(&r, "f.txt", "same edited content\n");
    set_modified(&r, "f.txt", 1_700_000_001_456_400_000);
    let second = workspace_diff(&r, &req(Scope::Uncommitted)).unwrap();
    assert_eq!(first.files[0].hunks, second.files[0].hunks);
    assert_eq!(first.files[0].status, second.files[0].status);
    let second_json = serde_json::to_value(second).unwrap();
    assert_eq!(
        second_json["files"][0]["last_modified_time"],
        1_700_000_001_456_i64
    );
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn whitespace_and_context_options_do_not_change_worktree_modification_time() {
    let r = repo();
    write(&r, "f.txt", "one two\n");
    commit(&r, "base");
    write(&r, "f.txt", "one  two\n");
    set_modified(&r, "f.txt", 1_700_000_000_500_000_000);
    let plain = workspace_diff(&r, &req(Scope::Uncommitted)).unwrap();
    let mut request = req(Scope::Uncommitted);
    request.ignore_whitespace = true;
    request.context_lines = Some(0);
    let hidden = workspace_diff(&r, &request).unwrap();
    assert!(!plain.files[0].hunks.is_empty());
    assert!(hidden.files[0].hunks.is_empty());
    for result in [plain, hidden] {
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(
            json["files"][0]["last_modified_time"],
            1_700_000_000_500_i64
        );
    }
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn deleted_untracked_and_renamed_paths_have_worktree_metadata() {
    let r = repo();
    write(&r, "gone.txt", "deleted\n");
    write(&r, "old.txt", "renamed content\n");
    commit(&r, "base");
    fs::remove_file(r.join("gone.txt")).unwrap();
    sh(&r, &["mv", "old.txt", "new.txt"]);
    write(&r, "untracked.txt", "untracked\n");
    set_modified(&r, "new.txt", 1_700_000_000_111_000_000);
    set_modified(&r, "untracked.txt", 1_700_000_000_222_000_000);
    let result = workspace_diff(&r, &req(all())).unwrap();
    let full = serde_json::to_value(&result.files).unwrap();
    let summary = serde_json::to_value(list_changes(&r, &req(all())).unwrap()).unwrap();
    for files in [full, summary] {
        for (path, expected) in [
            ("gone.txt", 0),
            ("new.txt", 1_700_000_000_111_i64),
            ("untracked.txt", 1_700_000_000_222_i64),
        ] {
            let file = files
                .as_array()
                .unwrap()
                .iter()
                .find(|f| f["path"] == path)
                .unwrap();
            assert_eq!(file["last_modified_time"], expected, "{path}");
        }
    }
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn historical_commit_and_turn_results_do_not_stat_the_present_worktree() {
    let r = repo();
    write(&r, "f.txt", "base\n");
    commit(&r, "base");
    let start = oid(&r, "HEAD");
    write(&r, "f.txt", "historical\n");
    commit(&r, "historical");
    let end = oid(&r, "HEAD");
    sh(
        &r,
        &[
            "update-ref",
            "refs/conductor-checkpoints/session-s-turn-t-start",
            &start,
        ],
    );
    sh(
        &r,
        &[
            "update-ref",
            "refs/conductor-checkpoints/session-s-turn-t-end",
            &end,
        ],
    );
    write(&r, "f.txt", "present day\n");
    set_modified(&r, "f.txt", 1_700_000_001_000_000_000);
    for scope in [
        Scope::Commit { hash: end },
        Scope::Turn {
            session_id: "s".into(),
            turn_id: "t".into(),
        },
    ] {
        let result = workspace_diff(&r, &req(scope.clone())).unwrap();
        assert_eq!(result.files.len(), 1);
        let full = serde_json::to_value(result).unwrap();
        assert!(full["files"][0].get("last_modified_time").is_none());
        let summary = serde_json::to_value(list_changes(&r, &req(scope)).unwrap()).unwrap();
        assert!(summary[0].get("last_modified_time").is_none());
    }
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn missing_worktree_stat_leaves_full_and_summary_metadata_absent() {
    let r = repo();
    let mut file = super::FileDiff::new("missing.txt".into(), FileStatus::Modified);
    file.last_modified_time = super::git::worktree_modified_time(&r, &file);
    assert_eq!(file.last_modified_time, None);
    assert!(serde_json::to_value(&file)
        .unwrap()
        .get("last_modified_time")
        .is_none());
    assert!(serde_json::to_value(file.summary())
        .unwrap()
        .get("last_modified_time")
        .is_none());
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn worktree_stat_rounds_negative_epoch_times_like_math_round() {
    let r = repo();
    write(&r, "f.txt", "x\n");
    let file = super::FileDiff::new("f.txt".into(), FileStatus::Modified);
    for (nanoseconds, expected) in [(400_000, 0), (500_000, 0), (600_000, -1)] {
        let time = std::time::UNIX_EPOCH - std::time::Duration::from_nanos(nanoseconds);
        fs::File::options()
            .write(true)
            .open(r.join("f.txt"))
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(time))
            .unwrap();
        assert_eq!(
            super::git::worktree_modified_time(&r, &file),
            Some(expected)
        );
    }
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn commit_history_excludes_target_and_respects_remote_target() {
    let r = repo();
    write(&r, "base.txt", "base\n");
    commit(&r, "base");
    sh(&r, &["checkout", "-qb", "feature"]);
    write(&r, "one.txt", "one\n");
    commit(&r, "one | subject");
    let first = oid(&r, "HEAD");
    sh(&r, &["update-ref", "refs/remotes/origin/main", &first]);
    write(&r, "two.txt", "two\n");
    commit(&r, "two");
    let history = branch_commits(&r, "main", None).unwrap();
    assert_eq!(
        history
            .iter()
            .map(|c| c.message.as_str())
            .collect::<Vec<_>>(),
        ["two", "one | subject"]
    );
    assert_eq!(history[1].hash, first);
    assert_eq!(
        history[1].author,
        super::git::git(&r, &["show", "-s", "--format=%an", &first], &[0])
            .unwrap()
            .trim()
    );
    assert!(history[1].date > 0);
    let remote = branch_commits(&r, "main", Some("origin")).unwrap();
    assert_eq!(remote.len(), 1);
    assert_eq!(remote[0].message, "two");
    assert_eq!(
        branch_commits(&r, "main", Some("missing")).unwrap(),
        history
    );
    sh(&r, &["checkout", "-q", "main"]);
    assert!(branch_commits(&r, "main", None).unwrap().is_empty());
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn selected_commit_is_parent_to_commit_not_head_or_worktree() {
    let r = repo();
    write(&r, "f.txt", "base\n");
    commit(&r, "base");
    let parent = oid(&r, "HEAD");
    write(&r, "f.txt", "selected\n");
    commit(&r, "selected");
    let selected = oid(&r, "HEAD");
    write(&r, "f.txt", "later\n");
    write(&r, "later.txt", "later\n");
    commit(&r, "later");
    write(&r, "f.txt", "dirty\n");
    sh(&r, &["add", "f.txt"]);
    write(&r, "untracked.txt", "untracked\n");
    let scope = Scope::Commit { hash: selected };
    let result = workspace_diff(&r, &req(scope.clone())).unwrap();
    assert_eq!(result.base_commit, parent);
    assert_eq!(result.files.len(), 1);
    let lines = &result.files[0].hunks[0].lines;
    assert!(lines.iter().any(|l| l.text == "selected"));
    assert!(!lines.iter().any(|l| l.text == "dirty" || l.text == "later"));
    let mut request = req(scope.clone());
    request.path = Some("later.txt".into());
    assert!(workspace_diff(&r, &request).unwrap().files.is_empty());
    let before = fs::read(r.join("f.txt")).unwrap();
    assert!(super::discard::discard_file(
        &r,
        &super::discard::DiscardRequest {
            scope,
            path: "f.txt".into(),
            old_path: None
        }
    )
    .is_err());
    assert_eq!(fs::read(r.join("f.txt")).unwrap(), before);
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn clean_merge_commit_uses_git_show_changed_file_membership() {
    let r = repo();
    write(&r, "base.txt", "base\n");
    commit(&r, "base");
    sh(&r, &["checkout", "-qb", "feature"]);
    write(&r, "feature.txt", "feature\n");
    commit(&r, "feature");
    sh(&r, &["checkout", "-q", "main"]);
    write(&r, "main.txt", "main\n");
    commit(&r, "main");
    sh(&r, &["merge", "--no-ff", "-m", "merge", "feature"]);
    let result = workspace_diff(
        &r,
        &req(Scope::Commit {
            hash: oid(&r, "HEAD"),
        }),
    )
    .unwrap();
    assert!(result.files.is_empty());
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn resolved_merge_contents_compare_with_first_parent() {
    let r = repo();
    write(&r, "f.txt", "base\n");
    commit(&r, "base");
    sh(&r, &["checkout", "-qb", "feature"]);
    write(&r, "f.txt", "feature\n");
    commit(&r, "feature");
    sh(&r, &["checkout", "-q", "main"]);
    write(&r, "f.txt", "main\n");
    commit(&r, "main");
    let parent = oid(&r, "HEAD");
    assert_ne!(
        super::git::git_exit_code(&r, &["merge", "feature"]).unwrap(),
        0
    );
    write(&r, "f.txt", "resolved\n");
    commit(&r, "resolved merge");
    let result = workspace_diff(
        &r,
        &req(Scope::Commit {
            hash: oid(&r, "HEAD"),
        }),
    )
    .unwrap();
    assert_eq!(result.base_commit, parent);
    assert_eq!(result.files.len(), 1);
    let lines = &result.files[0].hunks[0].lines;
    assert!(lines
        .iter()
        .any(|l| l.text == "main" && l.kind == super::LineKind::Deletion));
    assert!(lines
        .iter()
        .any(|l| l.text == "resolved" && l.kind == super::LineKind::Addition));
    assert!(!lines.iter().any(|l| l.text == "feature"));
    fs::remove_dir_all(r).unwrap();
}

#[test]
fn commit_diff_preserves_whitespace_counts_and_rename_and_handles_root() {
    let r = repo();
    write(&r, "original.txt", "line one\nline two\n");
    commit(&r, "root");
    let root = oid(&r, "HEAD");
    assert_eq!(
        workspace_diff(&r, &req(Scope::Commit { hash: root }))
            .unwrap()
            .files[0]
            .status,
        FileStatus::Added
    );
    sh(&r, &["mv", "original.txt", "renamed.txt"]);
    write(&r, "space.txt", "a b\n");
    commit(&r, "rename");
    let rename = oid(&r, "HEAD");
    let result = workspace_diff(&r, &req(Scope::Commit { hash: rename })).unwrap();
    assert!(result
        .files
        .iter()
        .any(|f| f.status == FileStatus::Renamed && f.old_path.as_deref() == Some("original.txt")));
    write(&r, "space.txt", "a  b\n");
    commit(&r, "whitespace");
    let mut request = req(Scope::Commit {
        hash: oid(&r, "HEAD"),
    });
    request.ignore_whitespace = true;
    let result = workspace_diff(&r, &request).unwrap();
    assert_eq!(result.files[0].additions, 1);
    assert!(result.files[0].hunks.is_empty());
    for hash in ["--help", "HEAD", "abcdefg", "0000000"] {
        assert!(workspace_diff(&r, &req(Scope::Commit { hash: hash.into() })).is_err());
    }
    fs::remove_dir_all(r).unwrap();
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
