//! Store what a PR lookup says about a workspace in `conductor.db`: the
//! derived status (`workspaces.derived_status`) and the PR's title and body
//! (`pr_title`, `pr_description`).
//!
//! The reference does this after each applied PR info (index chunk `iLt`,
//! REA-extracted, read as data). It writes the status only when it changed,
//! because that write also clears the manual status (`OQe`). It writes the
//! title and body when both are known and either differs from what is stored
//! (`JDt`). The status rule is [`status_update`].

use serde::Serialize;
use tauri::State;

use super::info::{status_update, WorkspaceStatus};
use crate::db::Db;
use openconductor_db::workspaces;

/// What the sync wrote.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSync {
    /// The derived status was stored, and the manual status cleared.
    pub status_changed: bool,
    /// `pr_title` / `pr_description` were stored.
    pub metadata_changed: bool,
}

/// JS: `invoke("pr_sync_workspace", { workspaceId, derivedStatus, title, body })`.
/// `title` and `body` are the found PR's, or null when there is no PR (the
/// stored ones are then left alone, as in the reference).
#[tauri::command]
pub async fn pr_sync_workspace(
    db: State<'_, Db>,
    workspace_id: String,
    derived_status: WorkspaceStatus,
    title: Option<String>,
    body: Option<String>,
) -> Result<WorkspaceSync, String> {
    let pool = &db.0;
    let row = workspaces::get(pool, &workspace_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("unknown workspace: {workspace_id}"))?
        .workspace;
    let status = status_update(row.derived_status.as_deref(), derived_status);
    if let Some(s) = status {
        workspaces::set_derived_status(pool, &workspace_id, s.as_str())
            .await
            .map_err(|e| e.to_string())?;
    }
    let metadata = match (&title, &body) {
        (Some(t), Some(b)) => {
            row.pr_title.as_deref() != Some(t.as_str())
                || row.pr_description.as_deref() != Some(b.as_str())
        }
        _ => false,
    };
    if metadata {
        workspaces::set_pr_metadata(pool, &workspace_id, title.as_deref(), body.as_deref())
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(WorkspaceSync {
        status_changed: status.is_some(),
        metadata_changed: metadata,
    })
}
