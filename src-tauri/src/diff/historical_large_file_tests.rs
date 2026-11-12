use super::super::git::{list_changes, workspace_diff, Scope};
use super::{commit, oid, repo, req, write};
use std::fs;

struct Case {
    name: &'static str,
    old_bytes: usize,
    new_bytes: usize,
    changed_lines: u32,
    hidden: bool,
    binary: bool,
    remove_worktree: bool,
}

const MIB: usize = 1024 * 1024;
const CASES: [Case; 8] = [
    Case {
        name: "six_mib_old_small_new",
        old_bytes: 6 * MIB,
        new_bytes: 16_384,
        changed_lines: 2,
        hidden: true,
        binary: false,
        remove_worktree: false,
    },
    Case {
        name: "six_mib_new_missing_worktree",
        old_bytes: 6 * MIB,
        new_bytes: 6 * MIB,
        changed_lines: 2,
        hidden: true,
        binary: false,
        remove_worktree: true,
    },
    Case {
        name: "five_mib_plus_one_sparse",
        old_bytes: 5 * MIB + 1,
        new_bytes: 5 * MIB + 1,
        changed_lines: 2,
        hidden: true,
        binary: false,
        remove_worktree: false,
    },
    Case {
        name: "one_mib_plus_one_dense",
        old_bytes: MIB + 1,
        new_bytes: MIB + 1,
        changed_lines: 502,
        hidden: true,
        binary: false,
        remove_worktree: false,
    },
    Case {
        name: "one_mib_dense",
        old_bytes: MIB,
        new_bytes: MIB,
        changed_lines: 502,
        hidden: false,
        binary: false,
        remove_worktree: false,
    },
    Case {
        name: "five_mib_sparse",
        old_bytes: 5 * MIB,
        new_bytes: 5 * MIB,
        changed_lines: 2,
        hidden: false,
        binary: false,
        remove_worktree: false,
    },
    Case {
        name: "six_mib_binary",
        old_bytes: 6 * MIB,
        new_bytes: 6 * MIB,
        changed_lines: 0,
        hidden: false,
        binary: true,
        remove_worktree: false,
    },
    Case {
        name: "small_text",
        old_bytes: 16_384,
        new_bytes: 16_384,
        changed_lines: 2,
        hidden: false,
        binary: false,
        remove_worktree: false,
    },
];

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

fn check(name: &str) {
    let case = CASES.iter().find(|case| case.name == name).unwrap();
    let r = repo();
    let path = format!("{}.txt", case.name);
    let old = contents(case.old_bytes, case.changed_lines, false, case.binary);
    let new = contents(case.new_bytes, case.changed_lines, true, case.binary);
    assert_eq!(old.len(), case.old_bytes);
    assert_eq!(new.len(), case.new_bytes);
    write(&r, &path, &old);
    commit(&r, "historical baseline");
    let parent = oid(&r, "HEAD");
    write(&r, &path, &new);
    commit(&r, "selected historical revision");
    let selected = oid(&r, "HEAD");
    if case.remove_worktree {
        fs::remove_file(r.join(&path)).unwrap();
    } else {
        write(&r, &path, "unrelated current worktree\n");
    }
    let request = req(Scope::Commit {
        hash: selected.clone(),
    });
    let result = workspace_diff(&r, &request).unwrap();
    let summary = list_changes(&r, &request).unwrap();
    let raw_counts = super::super::git::git(
        &r,
        &["diff", "--numstat", &parent, &selected, "--", &path],
        &[0],
    )
    .unwrap();
    let fields: Vec<_> = raw_counts.trim_end().split('\t').collect();
    let expected_additions = fields[0].parse::<u32>().unwrap_or(0);
    let expected_deletions = fields[1].parse::<u32>().unwrap_or(0);
    let dto = serde_json::to_value(&result).unwrap();
    fs::remove_dir_all(&r).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(summary.len(), 1);
    let file = &result.files[0];
    assert_eq!(file.path, path);
    assert_eq!(file.old_path, None);
    assert_eq!(summary[0].path, path);
    assert_eq!(summary[0].status, file.status);
    assert_eq!(file.binary, case.binary);
    assert_eq!(file.additions, expected_additions);
    assert_eq!(file.deletions, expected_deletions);
    assert_eq!(summary[0].additions, expected_additions);
    assert_eq!(summary[0].deletions, expected_deletions);
    assert_eq!(
        dto["files"][0]["hide_reason"].as_str(),
        case.hidden.then_some("file_too_large")
    );
    if case.hidden {
        assert!(file.hunks.is_empty());
    } else if !case.binary {
        assert!(!file.hunks.is_empty());
    }
}

macro_rules! historical_case {
    ($name:ident) => {
        #[test]
        fn $name() {
            check(stringify!($name));
        }
    };
}

historical_case!(six_mib_old_small_new);
historical_case!(six_mib_new_missing_worktree);
historical_case!(five_mib_plus_one_sparse);
historical_case!(one_mib_plus_one_dense);
historical_case!(one_mib_dense);
historical_case!(five_mib_sparse);
historical_case!(six_mib_binary);
historical_case!(small_text);
