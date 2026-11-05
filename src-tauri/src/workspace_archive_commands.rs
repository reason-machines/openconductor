//! `archive_workspace` and `unarchive_workspace`: the full archive behind the
//! Archive button, the palette, the sidebar row menu and archive on merge,
//! and the unarchive behind the archive-on-merge toast. A thin wrapper over
//! [`crate::workspace_archive::flow`]; behavior and evidence live there and
//! in `evidence/archive/NOTES.md`.

use oc_scripts::service::ScriptService;
use tauri::State;

use crate::db::Db;
use crate::workspace::service::WorkspaceService;
use crate::workspace_archive::flow::{
    self, ArchiveFailureDto, ArchiveResultDto, Deps, InFlightArchives, UnarchiveResultDto,
};

/// JS: `invoke("archive_workspace", { workspaceId, mode })`, `mode` `"safe"`
/// (default) or `"discardGitOperationState"`. Rejects with
/// [`ArchiveFailureDto`] (`{ code, message }`); nothing is changed when it does.
#[tauri::command]
pub async fn archive_workspace(
    db: State<'_, Db>,
    scripts: State<'_, ScriptService>,
    service: State<'_, WorkspaceService>,
    in_flight: State<'_, InFlightArchives>,
    workspace_id: String,
    mode: Option<String>,
) -> Result<ArchiveResultDto, ArchiveFailureDto> {
    let delete_branch = |root: &std::path::Path, ws: &std::path::Path| {
        crate::settings::effective::resolve(root, Some(ws))
            .map(|e| e.git.delete_branch_on_archive.value)
            .unwrap_or(false)
    };
    let deps = Deps {
        pool: &db.0,
        scripts: scripts.inner(),
        manager: service.manager(),
        delete_branch_on_archive: &delete_branch,
        in_flight: in_flight.inner(),
    };
    flow::archive_workspace(&deps, &workspace_id, mode.as_deref()).await
}

/// JS: `invoke("unarchive_workspace", { workspaceId, useNewBranch })`:
/// recreate the worktree with the work saved at archive time and mark the row
/// `ready`; the frontend then reruns the setup script. A branch that cannot
/// take it back returns `scenario` instead (the restore dialog), and
/// `useNewBranch` restores onto a new branch. Rejects with
/// [`ArchiveFailureDto`]; the row stays archived when it does.
#[tauri::command]
pub async fn unarchive_workspace(
    db: State<'_, Db>,
    scripts: State<'_, ScriptService>,
    service: State<'_, WorkspaceService>,
    in_flight: State<'_, InFlightArchives>,
    workspace_id: String,
    use_new_branch: Option<bool>,
) -> Result<UnarchiveResultDto, ArchiveFailureDto> {
    let no_delete = |_: &std::path::Path, _: &std::path::Path| false;
    let deps = Deps {
        pool: &db.0,
        scripts: scripts.inner(),
        manager: service.manager(),
        delete_branch_on_archive: &no_delete,
        in_flight: in_flight.inner(),
    };
    flow::unarchive_workspace(&deps, &workspace_id, use_new_branch.unwrap_or(false)).await
}

/// JS: `invoke("delete_workspace", { workspaceId })`: "Delete permanently" /
/// "Delete anyway" in the archive failure toast. Drops the row and the
/// workspace folder.
#[tauri::command]
pub async fn delete_workspace(
    db: State<'_, Db>,
    workspace_id: String,
) -> Result<(), ArchiveFailureDto> {
    flow::delete_workspace(&db.0, &workspace_id).await
}

/// JS: `invoke("reveal_unarchive_conflict", { workspaceId })`: the
/// "directory already exists" toast's Open in Finder.
#[tauri::command]
pub async fn reveal_unarchive_conflict(
    db: State<'_, Db>,
    workspace_id: String,
) -> Result<(), ArchiveFailureDto> {
    flow::reveal_unarchive_conflict(&db.0, &workspace_id).await
}

/// JS: `invoke("clear_unarchive_conflict", { workspaceId })`: the toast's
/// "Clear & unarchive" deletes the folder in the way; the frontend then
/// unarchives again.
#[tauri::command]
pub async fn clear_unarchive_conflict(
    db: State<'_, Db>,
    workspace_id: String,
) -> Result<(), ArchiveFailureDto> {
    flow::clear_unarchive_conflict(&db.0, &workspace_id).await
}
