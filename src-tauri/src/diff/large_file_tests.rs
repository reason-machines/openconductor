use super::super::git::{list_changes, workspace_diff, Scope};
use super::{commit, repo, req, write};
use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
struct Case {
    name: String,
    bytes: usize,
    changed_lines: u32,
    hidden: bool,
    binary: bool,
}

fn contents(case: &Case) -> (String, String) {
    if case.binary {
        let mut old = "\0".repeat(case.bytes);
        let mut new = old.clone();
        old.replace_range(1..2, "a");
        new.replace_range(1..2, "b");
        return (old, new);
    }
    let replacements = case.changed_lines / 2;
    let mut old = String::new();
    let mut new = String::new();
    for line in 0..600 {
        old.push_str(&format!("line-{line:04}-a\n"));
        new.push_str(&format!(
            "line-{line:04}-{}\n",
            if line >= 600 - replacements { 'b' } else { 'a' }
        ));
    }
    if case.changed_lines % 2 == 1 {
        new.push_str("extra-line\n");
    }
    let padding = format!("{}\n", "x".repeat(case.bytes - new.len() - 1));
    (format!("{padding}{old}"), format!("{padding}{new}"))
}

fn check(name: &str) {
    let cases: Vec<Case> = serde_json::from_str(include_str!(
        "../../../evidence/diff/large-file-placeholder/cases.json"
    ))
    .unwrap();
    let case = cases.into_iter().find(|case| case.name == name).unwrap();
    let r = repo();
    let path = format!("{}.txt", case.name);
    let (old, new) = contents(&case);
    assert_eq!(new.len(), case.bytes);
    write(&r, &path, &old);
    commit(&r, "tracked text baseline");
    write(&r, &path, &new);
    let request = req(Scope::Uncommitted);
    let result = workspace_diff(&r, &request).unwrap();
    let summary = list_changes(&r, &request).unwrap();
    let dto = serde_json::to_value(&result).unwrap();
    if let Some(output) = std::env::var_os("DIFF_PLACEHOLDER_DTOS") {
        fs::create_dir_all(&output).unwrap();
        fs::write(
            std::path::Path::new(&output).join(format!("{}.json", case.name)),
            serde_json::to_vec_pretty(&serde_json::json!({
                "file_bytes": fs::metadata(r.join(&path)).unwrap().len(),
                "workspace": dto,
                "summary": summary,
            }))
            .unwrap(),
        )
        .unwrap();
    }
    fs::remove_dir_all(&r).unwrap();
    assert_eq!(result.files.len(), 1, "Selected file must remain available");
    assert_eq!(summary.len(), 1, "Changes-list row must remain available");
    let file = &result.files[0];
    assert_eq!(file.path, path);
    assert_eq!(summary[0].path, path);
    assert_eq!(file.binary, case.binary);
    assert_eq!(file.additions + file.deletions, case.changed_lines);
    assert_eq!(summary[0].additions, file.additions);
    assert_eq!(summary[0].deletions, file.deletions);
    let reason = dto["files"][0]["hide_reason"].as_str();
    assert_eq!(
        reason,
        case.hidden.then_some("file_too_large"),
        "{} bytes, {} changed lines must preserve the reference size policy",
        case.bytes,
        case.changed_lines
    );
    if case.hidden {
        assert!(
            file.hunks.is_empty(),
            "Hidden content must not reach CodeView"
        );
    } else if !case.binary {
        assert!(!file.hunks.is_empty(), "Allowed text must keep its hunks");
    }
}

macro_rules! placeholder_case {
    ($name:ident) => {
        #[test]
        fn $name() {
            check(stringify!($name));
        }
    };
}

placeholder_case!(one_mib_dense);
placeholder_case!(one_mib_plus_one_dense);
placeholder_case!(two_mib_sparse);
placeholder_case!(five_mib_sparse);
placeholder_case!(five_mib_dense);
placeholder_case!(five_mib_plus_one_sparse);
placeholder_case!(six_mib_sparse);
placeholder_case!(six_mib_binary);
