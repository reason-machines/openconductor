use super::super::git::{git, turn_checkpoint_id, TurnPoint};
use super::super::{FileStatus, LineKind};
use super::{commit, list_changes, repo, req, sh, workspace_diff, write, Scope};
use std::fs;
use std::path::{Path, PathBuf};

const MIB: usize = 1024 * 1024;

struct Fixture(PathBuf);

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

struct Case {
    old_bytes: usize,
    new_bytes: usize,
    changed_lines: u32,
    hidden: bool,
    binary: bool,
    remove_worktree: bool,
}

fn contents(bytes: usize, changed_lines: u32, newer: bool, binary: bool) -> String {
    if binary {
        let mut text = "\0".repeat(bytes);
        text.replace_range(1..2, if newer { "b" } else { "a" });
        return text;
    }
    let mut tail = String::new();
    for line in 0..600 {
        let changed = newer && line >= 600 - changed_lines / 2;
        tail.push_str(&format!(
            "line-{line:04}-{}\n",
            if changed { 'b' } else { 'a' }
        ));
    }
    format!("{}\n{tail}", "x".repeat(bytes - tail.len() - 1))
}

fn snapshot(repo: &Path, point: TurnPoint) -> String {
    sh(repo, &["add", "-A"]);
    let tree = git(repo, &["write-tree"], &[0]).unwrap();
    let oid = git(
        repo,
        &["commit-tree", tree.trim(), "-m", "checkpoint"],
        &[0],
    )
    .unwrap();
    let oid = oid.trim().to_string();
    let reference = format!(
        "refs/conductor-checkpoints/{}",
        turn_checkpoint_id("large-file", "finished", point)
    );
    sh(repo, &["update-ref", &reference, &oid]);
    assert_eq!(
        git(repo, &["rev-list", "--parents", "-n", "1", &oid], &[0])
            .unwrap()
            .split_whitespace()
            .count(),
        1
    );
    oid
}

fn check(case: Case) {
    let fixture = Fixture(repo());
    let r = &fixture.0;
    let path = "turn-snapshot.txt";
    let old = contents(case.old_bytes, case.changed_lines, false, case.binary);
    let new = contents(case.new_bytes, case.changed_lines, true, case.binary);
    assert_eq!(old.len(), case.old_bytes);
    assert_eq!(new.len(), case.new_bytes);
    write(r, path, &old);
    commit(r, "before turn");
    let start = snapshot(r, TurnPoint::Start);
    write(r, path, &new);
    let end = snapshot(r, TurnPoint::End);
    if case.remove_worktree {
        fs::remove_file(r.join(path)).unwrap();
    } else {
        write(r, path, "unrelated small current worktree\n");
    }
    let mut request = req(Scope::Turn {
        session_id: "large-file".into(),
        turn_id: "finished".into(),
    });
    request.path = Some(path.into());
    let result = workspace_diff(r, &request).unwrap();
    let summaries = list_changes(r, &request).unwrap();
    let raw_counts = git(r, &["diff", "--numstat", &start, &end, "--", path], &[0]).unwrap();
    let counts: Vec<_> = raw_counts.trim_end().split('\t').collect();
    let additions = counts[0].parse::<u32>().unwrap_or(0);
    let deletions = counts[1].parse::<u32>().unwrap_or(0);
    if !case.binary && case.old_bytes == case.new_bytes {
        assert_eq!(additions + deletions, case.changed_lines);
    }
    assert_eq!(result.base_commit, start);
    assert_eq!(result.files.len(), 1);
    assert_eq!(summaries.len(), 1);
    let file = &result.files[0];
    assert_eq!(file.path, path);
    assert_eq!(file.old_path, None);
    assert_eq!(file.status, FileStatus::Modified);
    assert_eq!(file.binary, case.binary);
    assert_eq!(file.additions, additions);
    assert_eq!(file.deletions, deletions);
    assert_eq!(summaries[0], file.summary());
    assert_eq!(file.last_modified_time, None);
    let dto = serde_json::to_value(&result).unwrap();
    assert_eq!(
        dto["files"][0]["hide_reason"].as_str(),
        case.hidden.then_some("file_too_large")
    );
    if case.hidden {
        assert!(file.hunks.is_empty());
    } else if !case.binary {
        assert!(!file.hunks.is_empty());
        let text: Vec<_> = file.hunks.iter().flat_map(|hunk| &hunk.lines).collect();
        assert!(text.iter().any(|line| line.kind == LineKind::Addition));
        assert!(!text
            .iter()
            .any(|line| line.text.contains("unrelated small current worktree")));
    }
}

macro_rules! turn_case {
    ($name:ident, $old:expr, $new:expr, $lines:expr, $hidden:expr, $binary:expr, $missing:expr) => {
        #[test]
        fn $name() {
            check(Case {
                old_bytes: $old,
                new_bytes: $new,
                changed_lines: $lines,
                hidden: $hidden,
                binary: $binary,
                remove_worktree: $missing,
            });
        }
    };
}

turn_case!(
    six_mib_old_small_new,
    6 * MIB,
    16_384,
    2,
    true,
    false,
    false
);
turn_case!(
    six_mib_new_missing_worktree,
    16_384,
    6 * MIB,
    2,
    true,
    false,
    true
);
turn_case!(
    five_mib_plus_one_sparse,
    5 * MIB + 1,
    5 * MIB + 1,
    2,
    true,
    false,
    false
);
turn_case!(
    one_mib_plus_one_dense,
    MIB + 1,
    MIB + 1,
    502,
    true,
    false,
    false
);
turn_case!(one_mib_dense, MIB, MIB, 502, false, false, false);
turn_case!(five_mib_sparse, 5 * MIB, 5 * MIB, 2, false, false, false);
turn_case!(six_mib_binary, 6 * MIB, 6 * MIB, 0, false, true, false);
turn_case!(small_text, 16_384, 16_384, 2, false, false, false);
