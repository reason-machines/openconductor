use super::*;
use std::fs;
use std::process::Command;

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let p = std::env::temp_dir().join(format!("oc-quick-open-{tag}-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        TempDir(p)
    }
    fn write(&self, rel: &str, body: &str) {
        let p = self.0.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, body).unwrap();
    }
    fn root(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

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
    assert_eq!(relative_path("/w/repo", "/w/repo/src/main.rs"), "src/main.rs");
    assert_eq!(relative_path("/w/repo/", "/w/repo/src/main.rs"), "src/main.rs");
    assert_eq!(relative_path("/w/repo", "/w/repo"), "");
    // A sibling with the same prefix is not inside the root.
    assert_eq!(relative_path("/w/repo", "/w/repo2/a.rs"), "/w/repo2/a.rs");
    assert_eq!(relative_path("", "src/a.rs"), "src/a.rs");
}

#[test]
fn empty_query_returns_files_in_order_without_directories() {
    let files = vec![entry("/r/src", true), entry("/r/src/a.rs", false), entry("/r/b.rs", false)];
    let got = fuzzy_filter(&files, "/r", "   ", true, 10);
    assert_eq!(rels(&got), ["src/a.rs", "b.rs"]);
    assert!(got.iter().all(|m| m.match_indices.is_empty() && m.score == 0));
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
    let files = vec![entry("/r/src/QuickOpen.tsx", false), entry("/r/src/quickopen.css", false)];
    // Lowercase query is case-insensitive.
    assert_eq!(fuzzy_filter(&files, "/r", "quickopen", true, 10).len(), 2);
    // An uppercase letter makes it case-sensitive.
    assert_eq!(rels(&fuzzy_filter(&files, "/r", "QuickO", true, 10)), ["src/QuickOpen.tsx"]);
    // Space-separated atoms must all match.
    assert_eq!(rels(&fuzzy_filter(&files, "/r", "quick css", true, 10)), ["src/quickopen.css"]);
}

#[test]
fn non_ascii_indices_are_utf16_offsets() {
    // "é" is one UTF-16 unit, the emoji is two.
    let files = vec![entry("/r/café/😀note.md", false)];
    let got = fuzzy_filter(&files, "/r", "note", true, 10);
    let m = &got[0];
    let units: Vec<u16> = m.relative_path.encode_utf16().collect();
    let picked = String::from_utf16(&m.match_indices.iter().map(|&i| units[i as usize]).collect::<Vec<_>>()).unwrap();
    assert_eq!(picked, "note");
}

#[test]
fn respects_max_results_and_tie_breaks_by_length() {
    let files: Vec<_> = ["/r/aa/x.rs", "/r/x.rs", "/r/b/x.rs"].iter().map(|p| entry(p, false)).collect();
    let got = fuzzy_filter(&files, "/r", "x.rs", true, 2);
    assert_eq!(got.len(), 2);
    assert_eq!(got[0].relative_path, "x.rs");
}

#[test]
fn index_respects_gitignore_and_skips_dot_git() {
    let t = TempDir::new("ignore");
    t.write(".gitignore", "target/\n*.log\n");
    t.write("src/main.rs", "fn main() {}");
    t.write("target/debug/out.bin", "x");
    t.write("build.log", "x");
    t.write(".env.example", "x");
    t.write(".git/HEAD", "ref: refs/heads/main");
    let files = index_workspace(&t.0, 1000).unwrap();
    let got: Vec<String> = files.iter().map(|f| relative_path(&t.root(), &f.path)).collect();
    assert!(got.contains(&"src/main.rs".to_string()), "{got:?}");
    assert!(got.contains(&"src".to_string()));
    assert!(got.contains(&".env.example".to_string()), "hidden files are kept: {got:?}");
    assert!(!got.iter().any(|p| p.starts_with("target")), "{got:?}");
    assert!(!got.iter().any(|p| p.ends_with(".log")), "{got:?}");
    assert!(!got.iter().any(|p| p == ".git" || p.starts_with(".git/")), "{got:?}");
    let dir = files.iter().find(|f| f.name == "src").unwrap();
    assert!(dir.is_directory);
}

#[test]
fn index_limit_and_missing_root() {
    let t = TempDir::new("limit");
    for i in 0..10 {
        t.write(&format!("f{i}.txt"), "x");
    }
    assert_eq!(index_workspace(&t.0, 3).unwrap().len(), 3);
    let err = index_workspace(&t.0.join("nope"), 10).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
}

#[test]
fn index_honours_git_info_exclude_in_a_real_repo() {
    let t = TempDir::new("gitrepo");
    let ok = Command::new("git").args(["init", "-q"]).current_dir(&t.0).status();
    if !ok.is_ok_and(|s| s.success()) {
        eprintln!("git unavailable; skipping");
        return;
    }
    t.write(".git/info/exclude", "secret.txt\n");
    t.write("secret.txt", "x");
    t.write("kept.txt", "x");
    let files = index_workspace(&t.0, 1000).unwrap();
    let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
    assert!(names.contains(&"kept.txt"));
    assert!(!names.contains(&"secret.txt"), "{names:?}");
}

#[test]
fn cache_reuses_index_until_invalidated_or_stale() {
    let t = TempDir::new("cache");
    t.write("a.txt", "x");
    let cache = FileIndexCache::default();
    let first = cache.get(&t.0, Duration::from_secs(60)).unwrap();
    t.write("b.txt", "x");
    let second = cache.get(&t.0, Duration::from_secs(60)).unwrap();
    assert!(Arc::ptr_eq(&first, &second), "fresh index is reused");
    assert_eq!(second.len(), 1);
    cache.invalidate(&t.0);
    assert_eq!(cache.get(&t.0, Duration::from_secs(60)).unwrap().len(), 2);
    t.write("c.txt", "x");
    assert_eq!(cache.get(&t.0, Duration::ZERO).unwrap().len(), 3, "stale index is rebuilt");
}

#[test]
fn fuzzy_filter_files_end_to_end() {
    let t = TempDir::new("e2e");
    t.write("src/quick_open/mod.rs", "x");
    t.write("src/lib.rs", "x");
    t.write("README.md", "x");
    let cache = FileIndexCache::default();
    let got = fuzzy_filter_files(&cache, &t.root(), "qomod", true).unwrap();
    assert_eq!(rels(&got), ["src/quick_open/mod.rs"]);
    assert!(got.iter().all(|m| !m.file.is_directory));
    assert!(fuzzy_filter_files(&cache, "/definitely/not/here", "x", true).is_err());
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
