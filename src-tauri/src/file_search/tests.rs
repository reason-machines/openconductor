use super::*;
use std::fs;
use std::path::PathBuf;

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("oc-file-search-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        TempDir(dir)
    }
    fn file(&self, rel: &str) -> &Self {
        let p = self.0.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, rel).unwrap();
        self
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn entry(path: &str) -> FileEntry {
    FileEntry {
        path: path.into(),
        name: path.rsplit('/').next().unwrap().into(),
        is_directory: false,
    }
}

fn paths(m: &[FileMatch]) -> Vec<&str> {
    m.iter().map(|m| m.file.path.as_str()).collect()
}

#[test]
fn lists_relative_slash_paths_sorted_with_directories() {
    let t = TempDir::new("list");
    t.file("src/main.rs").file("README.md");
    let tree = list_file_tree(&t.0, true, None).unwrap();
    let got: Vec<(&str, bool)> = tree
        .iter()
        .map(|e| (e.path.as_str(), e.is_directory))
        .collect();
    assert_eq!(
        got,
        vec![("README.md", false), ("src", true), ("src/main.rs", false)]
    );
    assert_eq!(tree[2].name, "main.rs");
}

#[test]
fn standard_filters_respect_gitignore_and_hidden_but_never_list_dot_git() {
    let t = TempDir::new("filters");
    t.file(".gitignore")
        .file("target/out.bin")
        .file(".env")
        .file("keep.txt")
        .file(".git/HEAD");
    fs::write(t.0.join(".gitignore"), "target/\n").unwrap();

    let filtered = list_file_tree(&t.0, true, None).unwrap();
    assert_eq!(
        filtered.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
        vec!["keep.txt"]
    );

    let raw = list_file_tree(&t.0, false, None).unwrap();
    let raw: Vec<&str> = raw.iter().map(|e| e.path.as_str()).collect();
    assert!(raw.contains(&"target/out.bin") && raw.contains(&".env"));
    assert!(!raw.iter().any(|p| p.starts_with(".git/") || *p == ".git"));
}

#[test]
fn max_depth_limits_levels() {
    let t = TempDir::new("depth");
    t.file("a/b/c.txt");
    let got = list_file_tree(&t.0, true, Some(1)).unwrap();
    assert_eq!(
        got.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
        vec!["a"]
    );
}

#[test]
fn missing_root_is_an_error() {
    assert!(list_file_tree(Path::new("/definitely/not/here"), true, None).is_err());
}

#[test]
fn filename_match_beats_scattered_path_match() {
    let files = [
        entry("src/components/app/store.ts"),
        entry("src/state/store.ts"),
        entry("docs/setup.md"),
    ];
    let got = fuzzy_match_files("store", &files, false);
    assert_eq!(
        paths(&got)[0],
        "src/state/store.ts",
        "shorter path wins a tie"
    );
    assert_eq!(got.len(), 2);
}

#[test]
fn ranks_contiguous_over_scattered() {
    let files = [entry("src/sidebar/item_view.tsx"), entry("src/Sidebar.tsx")];
    let got = fuzzy_match_files("sidebar", &files, false);
    assert_eq!(
        paths(&got),
        vec!["src/Sidebar.tsx", "src/sidebar/item_view.tsx"]
    );
}

#[test]
fn smart_case_and_multiple_terms() {
    let files = [
        entry("src/App.tsx"),
        entry("src/app.css"),
        entry("lib/apple.rs"),
    ];
    assert_eq!(
        paths(&fuzzy_match_files("App", &files, false)),
        vec!["src/App.tsx"]
    );
    assert_eq!(
        paths(&fuzzy_match_files("css app", &files, false)),
        vec!["src/app.css"]
    );
}

#[test]
fn indices_point_at_matched_chars() {
    let files = [entry("src/main.rs")];
    let got = fuzzy_match_files("main", &files, false);
    assert_eq!(got[0].indices, vec![4, 5, 6, 7]);
}

#[test]
fn exclude_directories_and_empty_query() {
    let mut dir = entry("src");
    dir.is_directory = true;
    let files = [entry("a/b/deep.rs"), dir.clone(), entry("top.rs")];
    let all = fuzzy_match_files("  ", &files, false);
    assert_eq!(paths(&all), vec!["src", "top.rs", "a/b/deep.rs"]);
    assert!(all.iter().all(|m| m.score == 0 && m.indices.is_empty()));
    let files_only = fuzzy_match_files("", &files, true);
    assert_eq!(paths(&files_only), vec!["top.rs", "a/b/deep.rs"]);
}

#[test]
fn results_are_capped() {
    let files: Vec<FileEntry> = (0..MAX_RESULTS + 50)
        .map(|i| entry(&format!("f{i}.rs")))
        .collect();
    assert_eq!(fuzzy_match_files("f", &files, false).len(), MAX_RESULTS);
    assert_eq!(fuzzy_match_files("", &files, false).len(), MAX_RESULTS);
}

#[test]
fn filter_walks_then_matches() {
    let t = TempDir::new("filter");
    t.file("src/quick_open.rs")
        .file("node_modules/x/quick.js")
        .file(".gitignore");
    fs::write(t.0.join(".gitignore"), "node_modules\n").unwrap();
    let got = fuzzy_filter_files("quick", &t.0, true).unwrap();
    assert_eq!(paths(&got), vec!["src/quick_open.rs"]);
}
