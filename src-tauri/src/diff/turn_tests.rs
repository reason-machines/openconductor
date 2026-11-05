//! The per-turn scope: what changed between a turn's start and end
//! checkpoints. Checkpoint refs are made here with plain git the way the
//! reference checkpointer does (a parentless commit of the full working tree,
//! untracked files included), because this harness builds `diff/` on its
//! own; `crate::turn_checkpoint`'s tests cover the real `checkpoint::save`.

use super::discard::{discard_file, DiscardRequest};
use super::git::{
    list_changes, turn_checkpoint_id, valid_turn_part, workspace_diff, DiffError, DiffRequest,
    Scope, TurnPoint,
};
use super::{FileStatus, LineKind};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn git(repo: &Path, args: &[&str], env: &[(&str, &Path)]) -> String {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn repo() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "oc-diff-turn-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    for args in [
        &["init", "-q", "-b", "main"][..],
        &["config", "user.name", "t"],
        &["config", "user.email", "t@example.invalid"],
        &["config", "commit.gpgsign", "false"],
    ] {
        git(&dir, args, &[]);
    }
    dir
}

fn write(repo: &Path, path: &str, text: &str) {
    let p = repo.join(path);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

/// Snapshot the full working tree into `refs/conductor-checkpoints/<id>`.
fn snapshot(repo: &Path, id: &str) {
    let index = repo.join(format!(".git/oc-test-index-{id}"));
    let _ = fs::remove_file(&index);
    let env = [("GIT_INDEX_FILE", index.as_path())];
    git(repo, &["add", "-A", "--", "."], &env);
    let tree = git(repo, &["write-tree"], &env);
    fs::remove_file(&index).unwrap();
    let commit = git(
        repo,
        &["commit-tree", &tree, "-m", &format!("checkpoint:{id}")],
        &[],
    );
    let reference = format!("refs/conductor-checkpoints/{id}");
    git(repo, &["update-ref", &reference, &commit], &[]);
}

fn turn(repo: &Path, point: TurnPoint) {
    snapshot(repo, &turn_checkpoint_id("chat1", "turn1", point));
}

fn scope() -> Scope {
    Scope::Turn {
        session_id: "chat1".into(),
        turn_id: "turn1".into(),
    }
}

fn req(scope: Scope) -> DiffRequest {
    DiffRequest {
        scope,
        ignore_whitespace: false,
        path: None,
        context_lines: None,
    }
}

/// A repo with work in progress before the turn, the turn's own edits
/// (one committed, the rest left in the worktree), and edits after it.
fn worked_repo() -> PathBuf {
    let r = repo();
    write(&r, "edit.txt", "one\ntwo\nthree\n");
    write(&r, "gone.txt", "bye\n");
    write(&r, "before.txt", "x\n");
    git(&r, &["add", "-A"], &[]);
    git(&r, &["commit", "-q", "-m", "base"], &[]);
    // Uncommitted before the turn: must not count as the turn's change.
    write(&r, "before.txt", "x changed before the turn\n");
    turn(&r, TurnPoint::Start);

    write(&r, "edit.txt", "one\nTWO\nthree\n");
    fs::remove_file(r.join("gone.txt")).unwrap();
    write(&r, "dir/new file.rs", "fn f() {}\n");
    write(&r, "committed.txt", "c\n");
    git(&r, &["add", "committed.txt"], &[]);
    git(&r, &["commit", "-q", "-m", "agent commit"], &[]);
    turn(&r, TurnPoint::End);

    // After the turn: must not show up either.
    write(&r, "after.txt", "later\n");
    write(&r, "edit.txt", "one\nTWO\nthree\nfour\n");
    r
}

#[test]
fn turn_scope_lists_only_what_changed_during_the_turn() {
    let r = worked_repo();
    let files = list_changes(&r, &req(scope())).unwrap();
    let got: Vec<_> = files
        .iter()
        .map(|f| (f.path.as_str(), f.status, f.additions, f.deletions))
        .collect();
    assert_eq!(
        got,
        vec![
            ("committed.txt", FileStatus::Added, 1, 0),
            ("dir/new file.rs", FileStatus::Added, 1, 0),
            ("edit.txt", FileStatus::Modified, 1, 1),
            ("gone.txt", FileStatus::Deleted, 0, 1),
        ]
    );
}

#[test]
fn turn_scope_hunks_are_end_versus_start_and_base_is_the_start_checkpoint() {
    let r = worked_repo();
    let mut one = req(scope());
    one.path = Some("edit.txt".into());
    let diff = workspace_diff(&r, &one).unwrap();
    let start = git(
        &r,
        &[
            "rev-parse",
            &format!(
                "refs/conductor-checkpoints/{}",
                turn_checkpoint_id("chat1", "turn1", TurnPoint::Start)
            ),
        ],
        &[],
    );
    assert_eq!(diff.base_commit, start);
    assert_eq!(diff.files.len(), 1);
    let lines: Vec<_> = diff.files[0].hunks[0]
        .lines
        .iter()
        .map(|l| (l.kind, l.text.as_str()))
        .collect();
    assert_eq!(
        lines,
        vec![
            (LineKind::Context, "one"),
            (LineKind::Deletion, "two"),
            (LineKind::Addition, "TWO"),
            (LineKind::Context, "three"),
        ]
    );
}

#[test]
fn turn_scope_honours_whitespace_and_context_options() {
    let r = repo();
    write(&r, "a.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n");
    write(&r, "w.txt", "a b\n");
    turn(&r, TurnPoint::Start);
    write(&r, "a.txt", "1\n2\n3\n4\nFIVE\n6\n7\n8\n9\n");
    write(&r, "w.txt", "a  b\n");
    turn(&r, TurnPoint::End);

    let mut ws = req(scope());
    ws.ignore_whitespace = true;
    let files = workspace_diff(&r, &ws).unwrap().files;
    // Between two trees git drops a whitespace-only file entirely under -w.
    let paths: Vec<_> = files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(paths, vec!["a.txt"]);
    assert_eq!(list_changes(&r, &req(scope())).unwrap().len(), 2);

    let mut whole = req(scope());
    whole.path = Some("a.txt".into());
    whole.context_lines = Some(100);
    let a = &workspace_diff(&r, &whole).unwrap().files[0];
    assert_eq!(a.hunks.len(), 1);
    assert_eq!(
        a.hunks[0].lines.len(),
        10,
        "all 9 lines plus the replacement"
    );
}

#[test]
fn a_turn_without_both_checkpoints_is_not_ready() {
    let r = repo();
    write(&r, "a.txt", "a\n");
    let e = list_changes(&r, &req(scope())).unwrap_err();
    assert!(
        matches!(
            e,
            DiffError::TurnNotReady {
                start: false,
                end: false,
                ..
            }
        ),
        "{e}"
    );
    turn(&r, TurnPoint::Start);
    let e = list_changes(&r, &req(scope())).unwrap_err();
    assert!(
        matches!(
            e,
            DiffError::TurnNotReady {
                start: true,
                end: false,
                ..
            }
        ),
        "{e}"
    );
    assert!(e.to_string().contains("turn1"));
}

#[test]
fn ids_that_cannot_be_a_ref_component_are_refused() {
    let r = repo();
    for bad in [
        "", "a/b", "..", "a..b", "-x", ".x", "a b", "a:b", "a~1", "a^",
    ] {
        assert!(!valid_turn_part(bad), "{bad:?}");
        let s = Scope::Turn {
            session_id: "chat1".into(),
            turn_id: bad.into(),
        };
        let e = list_changes(&r, &req(s)).unwrap_err();
        assert!(matches!(e, DiffError::InvalidTurn(_)), "{bad:?}: {e}");
    }
    for good in ["t1", "0b6f2c7e-1d2a-4c55-9a59-6d1c1b2f3e4a", "a.b_c-d"] {
        assert!(valid_turn_part(good), "{good:?}");
    }
}

#[test]
fn checkpoint_ids_follow_the_reference_scheme() {
    assert_eq!(
        turn_checkpoint_id("s1", "t9", TurnPoint::Start),
        "session-s1-turn-t9-start"
    );
    assert_eq!(
        turn_checkpoint_id("s1", "t9", TurnPoint::End),
        "session-s1-turn-t9-end"
    );
}

#[test]
fn turn_scope_deserializes_from_the_frontend_shape() {
    let s: Scope =
        serde_json::from_str(r#"{"kind":"turn","session_id":"s","turn_id":"t"}"#).unwrap();
    assert_eq!(
        s,
        Scope::Turn {
            session_id: "s".into(),
            turn_id: "t".into()
        }
    );
}

#[test]
fn discard_is_refused_in_the_turn_scope() {
    let r = worked_repo();
    let e = discard_file(
        &r,
        &DiscardRequest {
            scope: scope(),
            path: "edit.txt".into(),
            old_path: None,
        },
    )
    .unwrap_err();
    assert!(matches!(e, DiffError::Unsupported(_)), "{e}");
    assert_eq!(
        fs::read_to_string(r.join("edit.txt")).unwrap(),
        "one\nTWO\nthree\nfour\n"
    );
}
