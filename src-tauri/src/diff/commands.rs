// parity:diff.changes-list:command parity:diff.whitespace:command
//! `#[tauri::command]` wrapper for the diff viewer. The frontend calls
//! `invoke("diff_workspace", { repo, request })` (src/features/diff/api.ts),
//! where `repo` is the workspace worktree and `request` a [`DiffRequest`].
//!
//! Running git and parsing its output is blocking, so it runs off the async
//! runtime. Excluded from the standalone harness build (`--cfg diff_std_only`,
//! see tools/diff/run-rust-tests.sh), which has no `tauri` crate.

use std::path::PathBuf;

use super::git::{workspace_diff, DiffRequest, WorkspaceDiff};

#[tauri::command]
pub async fn diff_workspace(repo: String, request: DiffRequest) -> Result<WorkspaceDiff, String> {
    let repo = PathBuf::from(repo);
    if !repo.is_dir() {
        return Err(format!("worktree not found: {}", repo.display()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        workspace_diff(&repo, &request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("diff task failed: {e}"))?
}
