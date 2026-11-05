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
//! own (see evidence/quick_open/run-tests.sh).

use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::{Deserialize, Serialize};
use unicode_segmentation::UnicodeSegmentation;

#[cfg(test)]
mod tests;

/// Most results returned for one query. Conductor's cap is not visible in the
/// shipped frontend; this keeps the list fast to render.
pub const MAX_RESULTS: usize = 200;

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
    let candidates = files
        .iter()
        .filter(|f| !(exclude_directories && f.is_directory));
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

/// Body of the `fuzzy_match_files` command: rank a caller-supplied list (used
/// for remote workspaces and @-mentions, where Rust cannot walk the tree).
/// Paths are matched as given.
pub fn fuzzy_match_files(
    files: &[FileEntry],
    query: &str,
    exclude_directories: bool,
) -> Vec<FuzzyMatch> {
    fuzzy_filter(files, "", query, exclude_directories, MAX_RESULTS)
}
