//! `#[tauri::command]` wrappers for quick open. Arguments follow the
//! reference frontend's calls (camelCase in JS; Tauri maps them to these
//! snake_case names):
//!
//! - `invoke("fuzzy_filter_files", { workspacePath, query, excludeDirectories })`,
//!   with the index cache as managed state (`fileCache` in the reference).
//! - `invoke("fuzzy_match_files", { query, files, excludeDirectories })`.
//!
//! Walking and scoring are blocking, so both run off the async runtime.

use std::sync::Arc;

use tauri::State;

use super::{FileEntry, FileIndexCache, FuzzyMatch, GrepResult};

/// Shared handle to the per-workspace index, registered with `app.manage`.
pub type FileCache = Arc<FileIndexCache>;

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("quick open task failed: {e}"))?
}

#[tauri::command]
pub async fn fuzzy_filter_files(
    file_cache: State<'_, FileCache>,
    workspace_path: String,
    query: String,
    exclude_directories: Option<bool>,
) -> Result<Vec<FuzzyMatch>, String> {
    let cache = Arc::clone(&file_cache);
    blocking(move || {
        super::fuzzy_filter_files(
            &cache,
            &workspace_path,
            &query,
            exclude_directories.unwrap_or(false),
        )
    })
    .await
}

#[tauri::command]
pub async fn fuzzy_match_files(
    query: String,
    files: Vec<FileEntry>,
    exclude_directories: Option<bool>,
) -> Result<Vec<FuzzyMatch>, String> {
    blocking(move || {
        Ok(super::fuzzy_match_files(
            &files,
            &query,
            exclude_directories.unwrap_or(false),
        ))
    })
    .await
}

/// `invoke("grep_workspace", { query, workspacePath, isRegex?, caseSensitive?, wholeWord? })`
///
/// Searches text-file contents in `workspacePath` for `query`, respecting
/// `.gitignore` rules. Mirrors the reference frontend's `Tmt` call signature
/// (index-BGEQ8YjU.js byte 2265460).
#[tauri::command]
pub async fn grep_workspace(
    workspace_path: String,
    query: String,
    is_regex: Option<bool>,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
) -> Result<GrepResult, String> {
    blocking(move || {
        super::grep_workspace(
            &workspace_path,
            &query,
            is_regex.unwrap_or(false),
            case_sensitive.unwrap_or(false),
            whole_word.unwrap_or(false),
        )
    })
    .await
}
