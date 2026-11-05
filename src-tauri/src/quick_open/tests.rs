use super::*;

fn entry(path: &str, is_directory: bool) -> FileEntry {
    FileEntry {
        name: path.rsplit('/').next().unwrap().to_string(),
        path: path.to_string(),
        is_directory,
    }
}

fn rels(m: &[FuzzyMatch]) -> Vec<&str> {
    m.iter().map(|m| m.relative_path.as_str()).collect()
}

#[test]
fn relative_path_strips_root_and_separator() {
    assert_eq!(
        relative_path("/w/repo", "/w/repo/src/main.rs"),
        "src/main.rs"
    );
    assert_eq!(
        relative_path("/w/repo/", "/w/repo/src/main.rs"),
        "src/main.rs"
    );
    assert_eq!(relative_path("/w/repo", "/w/repo"), "");
    // A sibling with the same prefix is not inside the root.
    assert_eq!(relative_path("/w/repo", "/w/repo2/a.rs"), "/w/repo2/a.rs");
    assert_eq!(relative_path("", "src/a.rs"), "src/a.rs");
}

#[test]
fn empty_query_returns_files_in_order_without_directories() {
    let files = vec![
        entry("/r/src", true),
        entry("/r/src/a.rs", false),
        entry("/r/b.rs", false),
    ];
    let got = fuzzy_filter(&files, "/r", "   ", true, 10);
    assert_eq!(rels(&got), ["src/a.rs", "b.rs"]);
    assert!(got
        .iter()
        .all(|m| m.match_indices.is_empty() && m.score == 0));
    let with_dirs = fuzzy_filter(&files, "/r", "", false, 10);
    assert_eq!(rels(&with_dirs), ["src", "src/a.rs", "b.rs"]);
}

#[test]
fn ranks_filename_match_above_scattered_path_match() {
    let files = vec![
        entry("/r/src/components/sidebar/Item.tsx", false),
        entry("/r/src/Sidebar.tsx", false),
        entry("/r/docs/notes.md", false),
    ];
    let got = fuzzy_filter(&files, "/r", "sidebar", true, 10);
    assert_eq!(got[0].relative_path, "src/Sidebar.tsx");
    assert!(!rels(&got).contains(&"docs/notes.md"));
}

#[test]
fn match_indices_point_at_matched_characters() {
    let files = vec![entry("/r/src/main.rs", false)];
    let got = fuzzy_filter(&files, "/r", "main", true, 10);
    let m = &got[0];
    let picked: String = m
        .match_indices
        .iter()
        .map(|&i| m.relative_path.as_bytes()[i as usize] as char)
        .collect();
    assert_eq!(picked, "main");
}

#[test]
fn smart_case_and_multiple_terms() {
    let files = vec![
        entry("/r/src/QuickOpen.tsx", false),
        entry("/r/src/quickopen.css", false),
    ];
    // Lowercase query is case-insensitive.
    assert_eq!(fuzzy_filter(&files, "/r", "quickopen", true, 10).len(), 2);
    // An uppercase letter makes it case-sensitive.
    assert_eq!(
        rels(&fuzzy_filter(&files, "/r", "QuickO", true, 10)),
        ["src/QuickOpen.tsx"]
    );
    // Space-separated atoms must all match.
    assert_eq!(
        rels(&fuzzy_filter(&files, "/r", "quick css", true, 10)),
        ["src/quickopen.css"]
    );
}

#[test]
fn non_ascii_indices_are_utf16_offsets() {
    // "é" is one UTF-16 unit, the emoji is two.
    let files = vec![entry("/r/café/😀note.md", false)];
    let got = fuzzy_filter(&files, "/r", "note", true, 10);
    let m = &got[0];
    let units: Vec<u16> = m.relative_path.encode_utf16().collect();
    let picked = String::from_utf16(
        &m.match_indices
            .iter()
            .map(|&i| units[i as usize])
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert_eq!(picked, "note");
}

#[test]
fn respects_max_results_and_tie_breaks_by_length() {
    let files: Vec<_> = ["/r/aa/x.rs", "/r/x.rs", "/r/b/x.rs"]
        .iter()
        .map(|p| entry(p, false))
        .collect();
    let got = fuzzy_filter(&files, "/r", "x.rs", true, 2);
    assert_eq!(got.len(), 2);
    assert_eq!(got[0].relative_path, "x.rs");
}

#[test]
fn fuzzy_match_files_matches_given_paths() {
    let files = vec![entry("src/a.rs", false), entry("src", true)];
    let got = fuzzy_match_files(&files, "src", false);
    assert_eq!(got.len(), 2);
    assert_eq!(got[0].relative_path, "src");
}

#[test]
fn result_serializes_with_conductor_field_names() {
    let m = FuzzyMatch {
        file: entry("/r/a.rs", false),
        score: 7,
        match_indices: vec![0],
        relative_path: "a.rs".into(),
    };
    let v = serde_json::to_value(&m).unwrap();
    assert_eq!(
        v,
        serde_json::json!({
            "file": {"name": "a.rs", "path": "/r/a.rs", "is_directory": false},
            "score": 7,
            "match_indices": [0],
            "relative_path": "a.rs"
        })
    );
}
