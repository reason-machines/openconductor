//! File listing and fuzzy file matching for quick open (⌘P) and @-mentions.
//!
//! Mirrors the reference app's Rust commands `list_file_tree`,
//! `fuzzy_match_files` and `fuzzy_filter_files` (see
//! `evidence/file-search/NOTES.md`). Walking uses the `ignore` crate, whose
//! `standard_filters` / `max_depth` options are exactly the arguments the
//! reference frontend passes; matching uses `nucleo-matcher` with path
//! scoring. No Tauri types here so the module can be tested on its own.

use std::cmp::Ordering;
use std::path::Path;

use ignore::WalkBuilder;
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::{Deserialize, Serialize};

/// Most results one fuzzy query returns. Ours: the reference passes no limit.
pub const MAX_RESULTS: usize = 200;

/// One file or directory, with its path relative to the listed root and
/// always `/`-separated so the frontend never deals with platform separators.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
}

/// A ranked match. `indices` are char positions in `file.path` that matched,
/// ascending, for highlighting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatch {
    pub file: FileEntry,
    pub score: u32,
    pub indices: Vec<u32>,
}

/// Lists everything under `root`, sorted by path. With `standard_filters` the
/// walk skips hidden files and anything ignored by `.gitignore`, `.ignore`,
/// the global gitignore or `.git/info/exclude`; `.git` itself is always
/// skipped. `max_depth` counts levels below `root` (1 = direct children).
pub fn list_file_tree(
    root: &Path,
    standard_filters: bool,
    max_depth: Option<usize>,
) -> Result<Vec<FileEntry>, String> {
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", root.display()));
    }
    let mut builder = WalkBuilder::new(root);
    builder
        .standard_filters(standard_filters)
        // Respect .gitignore even when the folder is not (yet) a git repo,
        // e.g. a fresh worktree path or a plain project folder.
        .require_git(false)
        .max_depth(max_depth)
        .filter_entry(|e| e.file_name() != ".git");
    let mut out = Vec::new();
    for entry in builder.build() {
        let Ok(entry) = entry else { continue };
        if entry.depth() == 0 {
            continue;
        }
        let Ok(rel) = entry.path().strip_prefix(root) else {
            continue;
        };
        let path = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        out.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_directory: entry.file_type().is_some_and(|t| t.is_dir()),
            path,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Ranks `files` against `query`. Best match first; equal scores prefer the
/// shorter path, then path order. An empty query keeps every file, shallow
/// paths first. Smart case: an uppercase letter in the query makes it case
/// sensitive. Spaces separate terms that must all match (any order).
pub fn fuzzy_match_files(
    query: &str,
    files: &[FileEntry],
    exclude_directories: bool,
) -> Vec<FileMatch> {
    let candidates = files
        .iter()
        .filter(|f| !(exclude_directories && f.is_directory));
    let query = query.trim();
    if query.is_empty() {
        let mut all: Vec<FileMatch> = candidates
            .map(|f| FileMatch {
                file: f.clone(),
                score: 0,
                indices: Vec::new(),
            })
            .collect();
        all.sort_by(|a, b| {
            depth(&a.file)
                .cmp(&depth(&b.file))
                .then_with(|| a.file.path.cmp(&b.file.path))
        });
        all.truncate(MAX_RESULTS);
        return all;
    }
    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let mut buf = Vec::new();
    let mut scored: Vec<(&FileEntry, u32)> = candidates
        .filter_map(|f| {
            let hay = Utf32Str::new(&f.path, &mut buf);
            pattern.score(hay, &mut matcher).map(|s| (f, s))
        })
        .collect();
    scored.sort_by(|(a, sa), (b, sb)| rank(*sa, a, *sb, b));
    scored.truncate(MAX_RESULTS);
    scored
        .into_iter()
        .map(|(f, score)| {
            let mut indices = Vec::new();
            let hay = Utf32Str::new(&f.path, &mut buf);
            pattern.indices(hay, &mut matcher, &mut indices);
            indices.sort_unstable();
            indices.dedup();
            FileMatch {
                file: f.clone(),
                score,
                indices,
            }
        })
        .collect()
}

/// `list_file_tree` with standard filters, then `fuzzy_match_files`.
pub fn fuzzy_filter_files(
    query: &str,
    root: &Path,
    exclude_directories: bool,
) -> Result<Vec<FileMatch>, String> {
    let files = list_file_tree(root, true, None)?;
    Ok(fuzzy_match_files(query, &files, exclude_directories))
}

fn depth(f: &FileEntry) -> usize {
    f.path.matches('/').count()
}

fn rank(sa: u32, a: &FileEntry, sb: u32, b: &FileEntry) -> Ordering {
    sb.cmp(&sa)
        .then_with(|| a.path.len().cmp(&b.path.len()))
        .then_with(|| a.path.cmp(&b.path))
}

#[cfg(test)]
mod tests;
