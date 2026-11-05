//! `archive_workspace`: the full archive behind the Archive button, the
//! palette, the sidebar row menu and archive on merge. A thin wrapper over
//! [`crate::workspace_archive::flow`]; behavior and evidence live there and
//! in `evidence/archive/NOTES.md`.

use oc_scripts::service::ScriptService;
use tauri::State;

use crate::db::Db;
use crate::workspace::service::WorkspaceService;
use crate::workspace_archive::flow::{
    self, ArchiveFailureDto, ArchiveResultDto, Deps, InFlightArchives,
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
