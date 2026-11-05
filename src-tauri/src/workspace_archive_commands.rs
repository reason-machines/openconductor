//! IPC for archive and unarchive (`workspace_archive.rs`). The workspace is
//! looked up in `conductor.db` (`workspaces.local_id`, which is
//! `<repositoryId>/<directoryName>`), its worktree through the repository
//! registry of [`WorkspaceService`].

use serde::Serialize;
use tauri::{AppHandle, Manager};

use oc_scripts::service::{ScriptService, WorkspaceRef};
use openconductor_db::workspaces::{self, WorkspaceState as DbState};

use crate::db::Db;
use crate::persistence::{self as store, WorkspaceRow};
use crate::workspace::git;
use crate::workspace::service::WorkspaceService;
use crate::workspace_archive::{self as core, ArchiveError, ArchiveMode, ArchiveRequest};

/// Error of `archive_workspace`. `code` is `"gitBusy"` when a git operation
/// blocks the archive (the UI then offers to archive anyway), `"failed"`
/// otherwise; `message` is the text to show.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveErrorDto {
    pub code: &'static str,
    pub message: String,
}

impl From<ArchiveError> for ArchiveErrorDto {
    fn from(e: ArchiveError) -> Self {
        let code = match e {
            ArchiveError::GitBusy => "gitBusy",
            ArchiveError::Failed(_) => "failed",
        };
        ArchiveErrorDto { code, message: e.to_string() }
    }
}

fn failed(message: impl std::fmt::Display) -> ArchiveErrorDto {
    ArchiveErrorDto { code: "failed", message: message.to_string() }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedDto {
    /// `workspaces.archive_commit`: HEAD when archived.
    pub archive_commit: Option<String>,
    /// Cleanup that failed or was skipped (worktree removal, branch deletion).
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnarchivedDto {
    /// The workspace's row, back in the sidebar's states.
    pub workspace: WorkspaceRow,
    /// "Uncommitted changes couldn't be recovered: ..."
    pub warning: Option<String>,
}

/// The row, its repository root and its directory name.
async fn locate(app: &AppHandle, workspace_id: &str) -> Result<(workspaces::Workspace, std::path::PathBuf, String), String> {
    let db = app.state::<Db>();
    let row = workspaces::get(&db.0, workspace_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("workspace not found: {workspace_id}"))?
        .workspace;
    let root = app.state::<WorkspaceService>().repository_root(&row.repository_id).map_err(|e| e.to_string())?;
    let name = row
        .directory_name
        .clone()
        .filter(|d| !d.is_empty())
        .or_else(|| workspace_id.rsplit_once('/').map(|(_, n)| n.to_string()))
        .ok_or_else(|| format!("workspace has no directory: {workspace_id}"))?;
    Ok((row, root, name))
}

/// JS: `invoke("archive_workspace", { workspaceId, mode })`, `mode` being
/// `"safe"` (default) or `"discardGitOperationState"`. Checkpoints the
/// worktree, records `state = 'archived'`, the branch and
/// `archive_commit`, runs the archive script and removes the worktree.
/// Archiving an archived workspace does nothing.
#[tauri::command]
pub async fn archive_workspace(
    app: AppHandle,
    workspace_id: String,
    mode: Option<ArchiveMode>,
) -> Result<ArchivedDto, ArchiveErrorDto> {
    let (row, root, name) = locate(&app, &workspace_id).await.map_err(failed)?;
    if row.state == DbState::Archived {
        return Ok(ArchivedDto { archive_commit: row.archive_commit, warnings: Vec::new() });
    }
    let mode = mode.unwrap_or(ArchiveMode::Safe);
    let manager = app.state::<WorkspaceService>().manager().clone();
    let pool = app.state::<Db>().0.clone();
    let scripts = app.state::<ScriptService>().inner().clone();
    let repository_id = row.repository_id.clone();
    let target_branch = row.intended_target_branch.clone();
    let worker = tauri::async_runtime::spawn_blocking(move || {
        let ws_path = manager.get(&root, &name).map(|w| w.path).ok();
        // `git.delete_branch_on_archive` through the repository layers, as
        // Conductor's getSettingForWorkspace; unreadable settings keep the branch.
        let delete_branch = crate::settings::effective::resolve(&root, ws_path.as_deref())
            .map(|e| e.git.delete_branch_on_archive.value)
            .unwrap_or(false);
        let req = ArchiveRequest { local_id: workspace_id.clone(), mode, delete_branch };
        let id = workspace_id.clone();
        core::archive(
            &manager,
            &root,
            &name,
            &req,
            &mut |branch, commit| {
                tauri::async_runtime::block_on(workspaces::archive(&pool, &id, branch, commit)).map_err(|e| e.to_string())
            },
            &mut |ws| {
                let r = WorkspaceRef {
                    workspace_id: id.clone(),
                    repository_id: repository_id.clone(),
                    repo_root: ws.repo_root.clone(),
                    workspace_path: ws.path.clone(),
                    workspace_name: ws.name.clone(),
                    default_branch: git::default_branch(&ws.repo_root),
                    target_branch: target_branch.clone(),
                };
                // As in Conductor, a failing archive script is only logged.
                match scripts.run_archive(&r) {
                    Ok(Some((code, _))) if code != Some(0) => eprintln!("archive script for {id} exited with {code:?}"),
                    Err(e) => eprintln!("archive script for {id}: {e}"),
                    _ => {}
                }
                None
            },
        )
    });
    let out = worker.await.map_err(failed)??;
    Ok(ArchivedDto { archive_commit: out.archive_commit, warnings: out.warnings })
}

/// JS: `invoke("unarchive_workspace", { workspaceId })`. Re-adds the
/// worktree on the workspace's branch (recreated at the archive commit when
/// it was deleted), restores the archive checkpoint and returns the row,
/// now `ready`. The caller starts the setup script, as after creating one.
#[tauri::command]
pub async fn unarchive_workspace(app: AppHandle, workspace_id: String) -> Result<UnarchivedDto, String> {
    let (row, root, name) = locate(&app, &workspace_id).await?;
    let pool = app.state::<Db>().0.clone();
    let mut warning = None;
    if row.state == DbState::Archived {
        let manager = app.state::<WorkspaceService>().manager().clone();
        let id = workspace_id.clone();
        let out = tauri::async_runtime::spawn_blocking(move || core::unarchive(&manager, &root, &name, &id))
            .await
            .map_err(|e| e.to_string())??;
        warning = out.warning;
        workspaces::unarchive(&pool, &workspace_id).await.map_err(|e| e.to_string())?;
        // Our create flow records `ready` while setup runs; unarchive does the same.
        workspaces::finish_setup(&pool, &workspace_id).await.map_err(|e| e.to_string())?;
    }
    let workspace = store::list_workspaces(&pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|w| w.id == workspace_id)
        .ok_or_else(|| format!("workspace not found: {workspace_id}"))?;
    Ok(UnarchivedDto { workspace, warning })
}
