use super::super::git::{turn_checkpoint_id, Scope, TurnPoint};
use super::super::{FileStatus, LineKind};
use super::{all, commit, list_changes, oid, repo, req, sh, workspace_diff, write};
use std::path::{Path, PathBuf};

struct Fixture(PathBuf);

impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

fn changed(path: &str, sibling: &str) -> Fixture {
    let fixture = Fixture(repo());
    for name in [path, sibling] {
        write(&fixture.0, name, "prefix\nbefore\nsuffix\n");
    }
    commit(&fixture.0, "base");
    write(&fixture.0, path, "prefix\nselected changed\nsuffix\n");
    write(&fixture.0, sibling, "prefix\nsibling changed\nsuffix\n");
    fixture
}

fn selected_only(repo: &Path, scope: Scope, path: &str, status: FileStatus) {
    for ignore_whitespace in [false, true] {
        for context_lines in [None, Some(i32::MAX as u32)] {
            let mut request = req(scope.clone());
            request.path = Some(path.into());
            request.ignore_whitespace = ignore_whitespace;
            request.context_lines = context_lines;
            let result = workspace_diff(repo, &request).unwrap();
            let paths: Vec<_> = result.files.iter().map(|file| file.path.as_str()).collect();
            assert_eq!(paths, vec![path], "selected path must not match siblings");
            let file = &result.files[0];
            assert_eq!(file.status, status);
            assert!(!file.binary);
            assert_eq!(file.old_path, None);
            assert_eq!(file.hide_reason, None);
            let added: Vec<_> = file
                .hunks
                .iter()
                .flat_map(|hunk| &hunk.lines)
                .filter(|line| line.kind == LineKind::Addition)
                .map(|line| line.text.as_str())
                .collect();
            assert!(added.contains(&"selected changed"));
            assert!(!added.contains(&"sibling changed"));
            assert_eq!(list_changes(repo, &request).unwrap(), vec![file.summary()]);
        }
    }
}

#[test]
fn uncommitted_question_mark_is_literal() {
    let fixture = changed("q?.txt", "q0.txt");
    selected_only(
        &fixture.0,
        Scope::Uncommitted,
        "q?.txt",
        FileStatus::Modified,
    );
}

#[test]
fn all_changes_question_mark_is_literal() {
    let fixture = changed("q?.txt", "q0.txt");
    selected_only(&fixture.0, all(), "q?.txt", FileStatus::Modified);
}

#[test]
fn selected_commit_question_mark_is_literal() {
    let fixture = changed("q?.txt", "q0.txt");
    commit(&fixture.0, "selected revision");
    let scope = Scope::Commit {
        hash: oid(&fixture.0, "HEAD"),
    };
    write(&fixture.0, "q?.txt", "unrelated later worktree\n");
    selected_only(&fixture.0, scope, "q?.txt", FileStatus::Modified);
}

#[test]
fn turn_question_mark_is_literal() {
    let fixture = changed("q?.txt", "q0.txt");
    let start = oid(&fixture.0, "HEAD");
    commit(&fixture.0, "turn end");
    let end = oid(&fixture.0, "HEAD");
    for (point, revision) in [(TurnPoint::Start, start), (TurnPoint::End, end)] {
        let reference = format!(
            "refs/conductor-checkpoints/{}",
            turn_checkpoint_id("literal", "paths", point)
        );
        sh(&fixture.0, &["update-ref", &reference, &revision]);
    }
    write(&fixture.0, "q?.txt", "unrelated later worktree\n");
    selected_only(
        &fixture.0,
        Scope::Turn {
            session_id: "literal".into(),
            turn_id: "paths".into(),
        },
        "q?.txt",
        FileStatus::Modified,
    );
}

#[test]
fn untracked_question_mark_is_literal_but_no_index_operand_is_a_filename() {
    let fixture = Fixture(repo());
    write(&fixture.0, "seed.txt", "base\n");
    commit(&fixture.0, "base");
    write(&fixture.0, "q?.txt", "selected changed\n");
    write(&fixture.0, "q0.txt", "sibling changed\n");
    selected_only(
        &fixture.0,
        Scope::Uncommitted,
        "q?.txt",
        FileStatus::Untracked,
    );
}

#[test]
fn bracket_character_is_literal() {
    let fixture = changed("q[0].txt", "q0.txt");
    selected_only(
        &fixture.0,
        Scope::Uncommitted,
        "q[0].txt",
        FileStatus::Modified,
    );
}

#[test]
fn ordinary_filename_control_still_loads_the_selected_file() {
    let fixture = changed("plain.txt", "other.txt");
    selected_only(
        &fixture.0,
        Scope::Uncommitted,
        "plain.txt",
        FileStatus::Modified,
    );
}

#[test]
fn unfiltered_control_keeps_both_changed_files() {
    let fixture = changed("q?.txt", "q0.txt");
    let result = workspace_diff(&fixture.0, &req(Scope::Uncommitted)).unwrap();
    let paths: Vec<_> = result.files.iter().map(|file| file.path.as_str()).collect();
    assert_eq!(paths, vec!["q0.txt", "q?.txt"]);
}
