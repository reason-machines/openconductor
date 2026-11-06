// parity:diff.changes-list:command parity:diff.whitespace:command parity:diff.discard:command parity:diff.edit-in-viewer:command
//! `#[tauri::command]` wrapper for the diff viewer. The frontend calls
//! `invoke("diff_workspace", { repo, request })` (src/features/diff/api.ts),
//! where `repo` is the workspace worktree and `request` a [`DiffRequest`].
//!
//! Running git and parsing its output is blocking, so it runs off the async
//! runtime. Excluded from the standalone harness build (`--cfg diff_std_only`,
//! see tools/diff/run-rust-tests.sh), which has no `tauri` crate.

use std::path::PathBuf;

use super::discard::{discard_file, DiscardRequest};
use super::git::{workspace_diff, DiffRequest, WorkspaceDiff};
use super::write_file::{write_file, WriteFileRequest};

fn worktree(repo: String) -> Result<PathBuf, String> {
    let repo = PathBuf::from(repo);
    if repo.is_dir() {
        Ok(repo)
    } else {
        Err(format!("worktree not found: {}", repo.display()))
    }
}

#[tauri::command]
pub async fn diff_workspace(repo: String, request: DiffRequest) -> Result<WorkspaceDiff, String> {
    let repo = worktree(repo)?;
    tauri::async_runtime::spawn_blocking(move || {
        workspace_diff(&repo, &request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("diff task failed: {e}"))?
}

/// `invoke("diff_discard_file", { repo, request })`: discard one file's changes.
#[tauri::command]
pub async fn diff_discard_file(repo: String, request: DiscardRequest) -> Result<(), String> {
    let repo = worktree(repo)?;
    tauri::async_runtime::spawn_blocking(move || {
        discard_file(&repo, &request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("discard task failed: {e}"))?
}

/// `invoke("diff_write_file", { repo, request })`: save a file edited in the diff viewer.
#[tauri::command]
pub async fn diff_write_file(repo: String, request: WriteFileRequest) -> Result<(), String> {
    let repo = worktree(repo)?;
    tauri::async_runtime::spawn_blocking(move || {
        write_file(&repo, &request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("save task failed: {e}"))?
}
