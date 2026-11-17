//! Quick open: index a workspace's files and fuzzy-filter them for the
//! Spotlight-style file picker (`nav.quickOpen`, Cmd+P).
//!
//! Conductor v0.87.6 reference (evidence/quick_open/NOTES.md):
//! - Tauri commands `fuzzy_filter_files {fileCache, workspacePath, query,
//!   excludeDirectories}` and `fuzzy_match_files {query, files,
//!   excludeDirectories}`.
//! - Each result is `{file: {name, path, is_directory}, score,
//!   match_indices, relative_path}`.
//! - The binary links `ignore 0.4.25` (gitignore-aware walk) and
//!   `nucleo-matcher 0.3.1` (scoring), which this module also uses.
//!
//! The module is plain Rust with no Tauri types, so it builds and tests on its
//! own (see evidence/quick_open/run-tests.sh). The `#[tauri::command]`
//! wrappers live with the app crate's command table.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::{Deserialize, Serialize};
use unicode_segmentation::UnicodeSegmentation;

/// `#[tauri::command]` wrappers. Excluded from the standalone test build
/// (`--cfg quick_open_std_only`, see evidence/quick_open/run-tests.sh).
#[cfg(not(quick_open_std_only))]
pub mod commands;

#[cfg(test)]
mod tests;

/// Most results returned for one query. Conductor's cap is not visible in the
/// shipped frontend; this keeps the list fast to render.
pub const MAX_RESULTS: usize = 200;

/// Most files indexed per workspace, so a huge untracked tree cannot stall
/// the picker.
pub const MAX_INDEXED_FILES: usize = 100_000;

/// How long an index stays fresh. Matches the frontend `staleTime` Conductor
/// uses for its fuzzy-search query (15 s).
pub const INDEX_TTL: Duration = Duration::from_secs(15);

/// One file or directory in a workspace. `path` is absolute, as in Conductor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

/// One ranked result. `match_indices` are UTF-16 code unit offsets into
/// `relative_path`, so the frontend can highlight with plain string indexing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FuzzyMatch {
    pub file: FileEntry,
    pub score: u32,
    pub match_indices: Vec<u32>,
    pub relative_path: String,
}

/// Walks `root` the way `git ls-files --others --cached` would see it:
/// `.gitignore`, `.git/info/exclude` and global excludes apply, `.git` itself
/// is skipped, hidden files are kept. Output is sorted by relative path.
pub fn index_workspace(root: &Path, limit: usize) -> std::io::Result<Vec<FileEntry>> {
    if !root.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("workspace path is not a directory: {}", root.display()),
        ));
    }
    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .parents(true)
        .filter_entry(|e| e.file_name() != ".git")
        .sort_by_file_path(|a, b| a.cmp(b))
        .build();
    let mut out = Vec::new();
    for entry in walker {
        let Ok(entry) = entry else { continue };
        if entry.depth() == 0 {
            continue;
        }
        let is_directory = entry.file_type().is_some_and(|t| t.is_dir());
        out.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_directory,
        });
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

/// Path of `file` relative to `root`, with `/` separators. Falls back to the
/// absolute path for files outside `root`.
pub fn relative_path(root: &str, path: &str) -> String {
    if root.is_empty() {
        return path.to_string();
    }
    let root = root.trim_end_matches('/');
    match path.strip_prefix(root) {
        Some(rest) if rest.starts_with('/') => rest.trim_start_matches('/').to_string(),
        Some("") => String::new(),
        _ => path.to_string(),
    }
}

/// Ranks `files` against `query`. An empty query returns files in their given
/// order (the frontend shows them as the default list). Otherwise results are
/// sorted by score (highest first), then shorter path, then path.
pub fn fuzzy_filter(
    files: &[FileEntry],
    root: &str,
    query: &str,
    exclude_directories: bool,
    max_results: usize,
) -> Vec<FuzzyMatch> {
    let candidates = files.iter().filter(|f| !(exclude_directories && f.is_directory));
    let query = query.trim();
    if query.is_empty() {
        return candidates
            .take(max_results)
            .map(|f| FuzzyMatch {
                file: f.clone(),
                score: 0,
                match_indices: Vec::new(),
                relative_path: relative_path(root, &f.path),
            })
            .collect();
    }

    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let mut buf = Vec::new();
    let mut indices = Vec::new();
    let mut out: Vec<FuzzyMatch> = Vec::new();
    for f in candidates {
        let rel = relative_path(root, &f.path);
        indices.clear();
        let haystack = Utf32Str::new(&rel, &mut buf);
        let Some(score) = pattern.indices(haystack, &mut matcher, &mut indices) else {
            continue;
        };
        indices.sort_unstable();
        indices.dedup();
        out.push(FuzzyMatch {
            file: f.clone(),
            score,
            match_indices: utf16_offsets(&rel, &indices),
            relative_path: rel,
        });
    }
    out.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then(a.relative_path.len().cmp(&b.relative_path.len()))
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    out.truncate(max_results);
    out
}

/// nucleo reports indices in its own units: bytes for ASCII haystacks,
/// grapheme clusters otherwise. Convert them to UTF-16 offsets of each
/// grapheme's first code unit.
fn utf16_offsets(text: &str, indices: &[u32]) -> Vec<u32> {
    if text.is_ascii() {
        return indices.to_vec();
    }
    let mut starts = Vec::new();
    let mut offset = 0u32;
    for g in text.graphemes(true) {
        starts.push(offset);
        offset += g.encode_utf16().count() as u32;
    }
    indices
        .iter()
        .filter_map(|&i| starts.get(i as usize).copied())
        .collect()
}

type IndexMap = HashMap<PathBuf, (Instant, Arc<Vec<FileEntry>>)>;

/// Per-workspace file index cache, the state behind `fileCache`.
#[derive(Default)]
pub struct FileIndexCache {
    entries: Mutex<IndexMap>,
}

impl FileIndexCache {
    /// Returns the workspace index, re-walking it when older than `ttl`.
    pub fn get(&self, root: &Path, ttl: Duration) -> std::io::Result<Arc<Vec<FileEntry>>> {
        if let Some((at, files)) = self.lock().get(root) {
            if at.elapsed() < ttl {
                return Ok(Arc::clone(files));
            }
        }
        let files = Arc::new(index_workspace(root, MAX_INDEXED_FILES)?);
        self.lock()
            .insert(root.to_path_buf(), (Instant::now(), Arc::clone(&files)));
        Ok(files)
    }

    /// Drops a workspace's index, e.g. after a file is created or deleted.
    pub fn invalidate(&self, root: &Path) {
        self.lock().remove(root);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, IndexMap> {
        self.entries.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Body of the `fuzzy_filter_files` command.
pub fn fuzzy_filter_files(
    cache: &FileIndexCache,
    workspace_path: &str,
    query: &str,
    exclude_directories: bool,
) -> Result<Vec<FuzzyMatch>, String> {
    let files = cache
        .get(Path::new(workspace_path), INDEX_TTL)
        .map_err(|e| e.to_string())?;
    Ok(fuzzy_filter(&files, workspace_path, query, exclude_directories, MAX_RESULTS))
}

/// Body of the `fuzzy_match_files` command: rank a caller-supplied list (used
/// for remote workspaces and @-mentions, where Rust cannot walk the tree).
/// Paths are matched as given.
pub fn fuzzy_match_files(files: &[FileEntry], query: &str, exclude_directories: bool) -> Vec<FuzzyMatch> {
    fuzzy_filter(files, "", query, exclude_directories, MAX_RESULTS)
}

// ── grep_workspace ────────────────────────────────────────────────────────────
//
// REA evidence (index-BGEQ8YjU.js, bytes 2265460–2266400):
//   invoke("grep_workspace", { query, workspacePath, isRegex, caseSensitive, wholeWord })
//   → { matches: [{relative_path, line_number, line_text, submatches:[{start,end}]}],
//        truncated, files_searched }
// Error strings beginning "Invalid pattern: " are caught by the frontend and
// surfaced as a user-visible invalid-pattern error (MK in the minified source).

/// Most matching lines returned for one query.
pub const MAX_GREP_RESULTS: usize = 1_000;

/// One character range within a line. `start` and `end` are UTF-8 byte offsets
/// into `line_text` (half-open `[start, end)`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrepSubmatch {
    pub start: usize,
    pub end: usize,
}

/// One matching line in a workspace file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrepMatch {
    pub relative_path: String,
    pub line_number: usize,
    pub line_text: String,
    pub submatches: Vec<GrepSubmatch>,
}

/// Return value of the `grep_workspace` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrepResult {
    pub matches: Vec<GrepMatch>,
    pub truncated: bool,
    pub files_searched: usize,
}

/// Builds the regex used by `grep_workspace`. On error the message starts with
/// `"Invalid pattern: "`, matching the frontend's error-type guard.
fn build_grep_pattern(
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<regex::Regex, String> {
    let core = if is_regex {
        query.to_owned()
    } else {
        regex::escape(query)
    };
    let with_word = if whole_word {
        format!(r"\b{}\b", core)
    } else {
        core
    };
    let full = if case_sensitive {
        with_word
    } else {
        format!("(?i){}", with_word)
    };
    regex::Regex::new(&full).map_err(|e| format!("Invalid pattern: {e}"))
}

/// Searches text-file contents in `workspace_path` for `query`, respecting
/// `.gitignore` rules. Returns up to `MAX_GREP_RESULTS` matching lines;
/// `truncated` is true when the limit was reached. Binary files (those
/// containing a null byte) and non-UTF-8 files are silently skipped.
pub fn grep_workspace(
    workspace_path: &str,
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<GrepResult, String> {
    if query.is_empty() {
        return Ok(GrepResult { matches: Vec::new(), truncated: false, files_searched: 0 });
    }

    let re = build_grep_pattern(query, is_regex, case_sensitive, whole_word)?;
    let root = Path::new(workspace_path);

    let mut matches: Vec<GrepMatch> = Vec::new();
    let mut files_searched: usize = 0;
    let mut truncated = false;

    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .parents(true)
        .filter_entry(|e| e.file_name() != ".git")
        .sort_by_file_path(|a, b| a.cmp(b))
        .build();

    'outer: for entry in walker.flatten() {
        if entry.depth() == 0 || entry.file_type().is_some_and(|t| t.is_dir()) {
            continue;
        }

        let abs_path = entry.path();
        let raw = match std::fs::read(abs_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Skip binary files (contain a null byte) as ripgrep does.
        if raw.contains(&0u8) {
            continue;
        }

        let text = match std::str::from_utf8(&raw) {
            Ok(t) => t,
            Err(_) => continue,
        };

        let rel = relative_path(workspace_path, &abs_path.to_string_lossy());
        files_searched += 1;

        for (line_idx, line) in text.lines().enumerate() {
            let submatches: Vec<GrepSubmatch> = re
                .find_iter(line)
                .map(|m| GrepSubmatch { start: m.start(), end: m.end() })
                .collect();

            if submatches.is_empty() {
                continue;
            }

            if matches.len() >= MAX_GREP_RESULTS {
                truncated = true;
                break 'outer;
            }

            matches.push(GrepMatch {
                relative_path: rel.clone(),
                line_number: line_idx + 1,
                line_text: line.to_owned(),
                submatches,
            });
        }
    }

    Ok(GrepResult { matches, truncated, files_searched })
}
