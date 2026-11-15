//! IPC for Settings › repository › Misc (Conductor 0.87.6's `Sba` registry in
//! renderApp-D_fmY7hW.js): the "Files to copy" preview (`Nei`, which lists the
//! gitignored files the patterns select) and "Remove repository" (`csi`).

use std::path::PathBuf;

use tauri::State;

use crate::db::Db;
use crate::terminal_history::TerminalHistory;
use crate::workspace::files_to_copy::{self, Preview};
use crate::workspace::service::WorkspaceService;

/// JS: `invoke("repo_files_to_copy_preview", { repoPath, globs })`: the files a
/// new workspace would get with `globs` (the row's current text; `null` means
/// no setting, so the `.env*` default). A `.worktreeinclude` wins over both.
#[tauri::command]
pub async fn repo_files_to_copy_preview(repo_path: String, globs: Option<String>) -> Result<Preview, String> {
    tauri::async_runtime::spawn_blocking(move || files_to_copy::preview(&PathBuf::from(repo_path), globs.as_deref()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_remove_repo", { repoId })`: remove the repository and its
/// workspaces from OpenConductor. Worktrees are deleted; the repository's own
/// checkout, its branches and its remotes are not touched.
///
/// Terminal history has two halves: a `terminal_sessions` row in conductor.db
/// and an encrypted entry file under `local-storage.entries/terminal-history/`.
/// `delete_with_workspaces` removes the rows; we must call
/// `TerminalHistory::delete_workspace` first so the files are removed too,
/// while the rows are still present for `session_ids_for_workspace` to find.
#[tauri::command]
pub async fn db_remove_repo(
    db: State<'_, Db>,
    service: State<'_, WorkspaceService>,
    history: State<'_, TerminalHistory>,
    repo_id: String,
) -> Result<(), String> {
    // Remove encrypted terminal-history entry files for every workspace in the
    // repo.  This must run before `delete_with_workspaces` deletes the
    // `terminal_sessions` rows that `delete_workspace` reads to find them.
    let workspace_ids: Vec<String> =
        sqlx::query_scalar("SELECT local_id FROM workspaces WHERE repository_id = ?")
            .bind(&repo_id)
            .fetch_all(&db.0)
            .await
            .map_err(|e| e.to_string())?;
    for workspace_id in &workspace_ids {
        history.delete_workspace(&db.0, workspace_id).await?;
    }

    if let Ok(root) = service.repository_root(&repo_id) {
        service.manager().remove_all(&root).map_err(|e| e.to_string())?;
    }
    service.forget_repository(&repo_id).map_err(|e| e.to_string())?;
    match openconductor_db::repos::delete_with_workspaces(&db.0, &repo_id).await {
        Ok(()) | Err(openconductor_db::Error::NotFound) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
