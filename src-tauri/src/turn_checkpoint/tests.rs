//! Real `checkpoint::save` around a turn, read back through the diff
//! viewer's turn scope.

use super::*;
use crate::diff::git::{workspace_diff, DiffRequest, Scope};
use crate::diff::FileStatus;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn scratch() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "oc-turn-cp-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn repo() -> PathBuf {
    let dir = scratch();
    git(&dir, &["init", "-q", "-b", "main"]);
    git(&dir, &["config", "user.name", "t"]);
    git(&dir, &["config", "user.email", "t@example.invalid"]);
    git(&dir, &["config", "commit.gpgsign", "false"]);
    fs::write(dir.join("a.txt"), "a\n").unwrap();
    fs::write(dir.join(".gitignore"), "target/\n").unwrap();
    git(&dir, &["add", "-A"]);
    git(&dir, &["commit", "-q", "-m", "base"]);
    dir
}

fn target<'a>(dir: &'a Path, turn: &'a str) -> TurnTarget<'a> {
    TurnTarget {
        workspace: dir,
        session_id: "ws-1",
        turn_id: turn,
    }
}

fn summary(files: &[FileChange]) -> Vec<(&str, FileStatus, u32, u32)> {
    files
        .iter()
        .map(|f| (f.path.as_str(), f.status, f.additions, f.deletions))
        .collect()
}

#[test]
fn a_turn_reports_only_its_own_changes() {
    let dir = repo();
    fs::write(dir.join("a.txt"), "a\nuser edit before the turn\n").unwrap();

    let (out, changes) = around_turn(Some(target(&dir, "t1")), || {
        fs::write(dir.join("a.txt"), "a\nuser edit before the turn\nagent\n").unwrap();
        fs::write(dir.join("new.rs"), "fn x() {}\n").unwrap();
        fs::create_dir_all(dir.join("target")).unwrap();
        fs::write(dir.join("target/ignored.bin"), "x").unwrap();
        "done"
    });
    assert_eq!(out, "done");
    let changes = changes.expect("both checkpoints saved");
    assert_eq!(
        summary(&changes),
        vec![
            ("a.txt", FileStatus::Modified, 1, 0),
            ("new.rs", FileStatus::Added, 1, 0),
        ]
    );

    // Saving changed nothing on disk, in the index or at HEAD.
    assert_eq!(git(&dir, &["status", "--porcelain"]), "M a.txt\n?? new.rs");
    assert_eq!(git(&dir, &["rev-list", "--count", "HEAD"]), "1");

    // Later edits do not leak into the finished turn.
    fs::write(dir.join("later.txt"), "later\n").unwrap();
    assert_eq!(turn_changes(&dir, "ws-1", "t1").unwrap().len(), 2);

    // The refs follow the reference naming.
    let refs = git(
        &dir,
        &[
            "for-each-ref",
            "--format=%(refname)",
            "refs/conductor-checkpoints/",
        ],
    );
    assert_eq!(
        refs,
        "refs/conductor-checkpoints/session-ws-1-turn-t1-end\nrefs/conductor-checkpoints/session-ws-1-turn-t1-start"
    );
}

#[test]
fn turn_scope_hunks_come_from_the_saved_checkpoints() {
    let dir = repo();
    let (_, changes) = around_turn(Some(target(&dir, "t2")), || {
        fs::write(dir.join("a.txt"), "b\n").unwrap();
        // The agent commits its work: still part of the turn.
        git(&dir, &["commit", "-q", "-am", "agent"]);
    });
    assert_eq!(
        summary(&changes.unwrap()),
        vec![("a.txt", FileStatus::Modified, 1, 1)]
    );
    let diff = workspace_diff(
        &dir,
        &DiffRequest {
            scope: Scope::Turn {
                session_id: "ws-1".into(),
                turn_id: "t2".into(),
            },
            ignore_whitespace: false,
            path: Some("a.txt".into()),
            context_lines: None,
        },
    )
    .unwrap();
    let start = checkpoint::get(&dir, "session-ws-1-turn-t2-start").unwrap();
    assert_eq!(diff.base_commit, start.commit);
    let text: Vec<_> = diff.files[0].hunks[0]
        .lines
        .iter()
        .map(|l| l.text.as_str())
        .collect();
    assert_eq!(text, vec!["a", "b"]);
}

#[test]
fn a_rerun_turn_id_overwrites_its_checkpoints() {
    let dir = repo();
    around_turn(Some(target(&dir, "t3")), || {
        fs::write(dir.join("one.txt"), "1\n").unwrap()
    });
    let (_, changes) = around_turn(Some(target(&dir, "t3")), || {
        fs::write(dir.join("two.txt"), "2\n").unwrap()
    });
    let paths: Vec<_> = changes.unwrap().into_iter().map(|f| f.path).collect();
    assert_eq!(paths, vec!["two.txt"]);
}

#[test]
fn checkpoint_problems_never_stop_the_turn() {
    // Not a repository.
    let plain = scratch();
    let (ran, changes) = around_turn(Some(target(&plain, "t1")), || true);
    assert!(ran);
    assert!(changes.is_none());

    // A subfolder of a repository is not its root (reference exit 103).
    let dir = repo();
    fs::create_dir_all(dir.join("sub")).unwrap();
    let sub = dir.join("sub");
    let (ran, changes) = around_turn(Some(target(&sub, "t1")), || true);
    assert!(ran);
    assert!(changes.is_none());

    // An id that cannot be part of a ref name.
    let (ran, changes) = around_turn(Some(target(&dir, "bad/id")), || true);
    assert!(ran);
    assert!(changes.is_none());
    assert!(matches!(
        save_turn_point(&dir, "ws-1", "a b", TurnPoint::Start),
        Err(CheckpointError::InvalidId(_))
    ));

    // No target: just runs.
    let (ran, changes) = around_turn(None, || 7);
    assert_eq!((ran, changes), (7, None));
}

#[test]
fn a_merge_in_progress_skips_the_checkpoint() {
    let dir = repo();
    git(&dir, &["checkout", "-q", "-b", "other"]);
    fs::write(dir.join("a.txt"), "other\n").unwrap();
    git(&dir, &["commit", "-q", "-am", "other"]);
    git(&dir, &["checkout", "-q", "main"]);
    fs::write(dir.join("a.txt"), "main\n").unwrap();
    git(&dir, &["commit", "-q", "-am", "main"]);
    let out = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["merge", "-q", "other"])
        .output()
        .unwrap();
    assert!(!out.status.success(), "merge must conflict");

    let (ran, changes) = around_turn(Some(target(&dir, "t1")), || true);
    assert!(ran);
    assert!(changes.is_none());
    assert!(checkpoint::get(&dir, "session-ws-1-turn-t1-start").is_err());
}

#[test]
fn large_turns_leave_the_list_out_but_it_can_still_be_read() {
    let dir = repo();
    let (_, changes) = around_turn(Some(target(&dir, "big")), || {
        for i in 0..=MAX_RESULT_FILES {
            fs::write(dir.join(format!("f{i}.txt")), "x\n").unwrap();
        }
    });
    assert!(changes.is_none());
    assert_eq!(
        turn_changes(&dir, "ws-1", "big").unwrap().len(),
        MAX_RESULT_FILES + 1
    );
}
