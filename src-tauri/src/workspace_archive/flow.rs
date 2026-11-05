//! The archive as a whole: the git steps of [`super`] around the database
//! row, the workspace's scripts and the "Delete branch on archive" setting,
//! in the order of Conductor 0.87.6 `dYe` (index @ ~966,478). No Tauri here,
//! so it is tested end to end; `workspace_archive_commands.rs` wraps it.
//!
//! The "agents still running" check (`WorkspaceHasRunningSessionsError`)
//! happens in the frontend before this is called, as in Conductor's archive
//! mutation (index @ ~3,299,721): only the UI knows which chats are working.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use oc_scripts::service::{ScriptService, WorkspaceRef};
use openconductor_db::SqlitePool;
use serde::Serialize;

use super::{self as archive, ArchiveError, ArchiveMode, ArchiveTarget, Notice, NoticeKind};
use crate::workspace::WorkspaceManager;

#[cfg(test)]
#[path = "flow_tests.rs"]
mod tests;

/// What the archive needs from the app.
pub struct Deps<'a> {
    pub pool: &'a SqlitePool,
    pub scripts: &'a ScriptService,
    pub manager: &'a WorkspaceManager,
    /// The workspace's effective `git.delete_branch_on_archive`, given the
    /// repository root and the workspace path.
    pub delete_branch_on_archive: &'a (dyn Fn(&Path, &Path) -> bool + Send + Sync),
    pub in_flight: &'a InFlightArchives,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoticeDto {
    /// `"info" | "error"`.
    pub kind: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveResultDto {
    /// False when the row was already archived, or an archive of it is
    /// already running (Conductor dedupes per workspace).
    pub archived: bool,
    pub branch: Option<String>,
    pub archive_commit: Option<String>,
    /// Toasts to show: a failing archive script, a worktree that could not
    /// be removed, a branch that was not deleted.
    pub notices: Vec<NoticeDto>,
}

/// The rejection value; `code` is Conductor's error name.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveFailureDto {
    /// `WORKSPACE_CORRUPTED`, `WorkspaceArchiveBlockedByGitOperationError` or `ArchiveFailed`.
    pub code: &'static str,
    pub message: String,
}

impl From<ArchiveError> for ArchiveFailureDto {
    fn from(e: ArchiveError) -> Self {
        Self {
            code: e.code(),
            message: e.to_string(),
        }
    }
}

fn failed(message: impl Into<String>) -> ArchiveFailureDto {
    ArchiveError::Failed(message.into()).into()
}

fn notice_dto(n: Notice) -> NoticeDto {
    NoticeDto {
        kind: if n.kind == NoticeKind::Error {
            "error"
        } else {
            "info"
        },
        message: n.message,
    }
}

/// Workspaces with an archive running (Conductor's
/// `dedupedWorkspaceArchiving`): a second request while one runs returns at
/// once. Managed app state, one per app.
#[derive(Debug, Default)]
pub struct InFlightArchives(Mutex<HashSet<String>>);

struct InFlight<'a>(&'a InFlightArchives, String);

impl InFlightArchives {
    fn claim(&self, id: &str) -> Option<InFlight<'_>> {
        let mut set = self.0.lock().unwrap_or_else(|e| e.into_inner());
        set.insert(id.to_string())
            .then(|| InFlight(self, id.to_string()))
    }
}

impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        self.0
             .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.1);
    }
}

/// Archive workspace `workspace_id` (`workspaces.local_id`); `mode` is
/// `"safe"` (default) or `"discardGitOperationState"`. On an error nothing
/// has changed yet.
pub async fn archive_workspace(
    deps: &Deps<'_>,
    workspace_id: &str,
    mode: Option<&str>,
) -> Result<ArchiveResultDto, ArchiveFailureDto> {
    let workspace_id = workspace_id.to_string();
    let mode = ArchiveMode::parse(mode).map_err(failed)?;
    let Some(_guard) = deps.in_flight.claim(&workspace_id) else {
        return Ok(ArchiveResultDto {
            archived: false,
            branch: None,
            archive_commit: None,
            notices: vec![],
        });
    };
    let pool = deps.pool;
    let row = openconductor_db::workspaces::get(pool, &workspace_id)
        .await
        .map_err(|e| failed(e.to_string()))?
        .ok_or_else(|| failed("Workspace not found"))?;
    let w = &row.workspace;
    if w.state == openconductor_db::workspaces::WorkspaceState::Archived {
        return Ok(ArchiveResultDto {
            archived: false,
            branch: w.branch.clone(),
            archive_commit: w.archive_commit.clone(),
            notices: vec![],
        });
    }
    let target = target_of(pool, &row).await?;
    let (repo_root, workspace_path, directory_name, default_branch) = (
        target.repo_root.clone(),
        target.workspace_path.clone(),
        target.directory_name.clone(),
        target.default_branch.clone(),
    );

    // 1. Checkpoint, branch, archive commit (`mYe`).
    let prepared = {
        let t = target.clone();
        tokio::task::spawn_blocking(move || archive::prepare(&t, mode))
            .await
            .map_err(|e| failed(e.to_string()))??
    };
    let scripts = deps.scripts.clone();
    scripts.setup.cancel(&workspace_id);

    // 2. The row (`SYe`).
    openconductor_db::workspaces::archive(
        pool,
        &workspace_id,
        &prepared.persisted_branch,
        prepared.archive_commit.as_deref(),
    )
    .await
    .map_err(|e| failed(e.to_string()))?;

    let manager = deps.manager;
    let mut notices = Vec::new();
    if let Err(e) = manager.record_archive(
        &repo_root,
        &directory_name,
        &prepared.persisted_branch,
        prepared.archive_commit.as_deref(),
    ) {
        eprintln!("archive: could not write the archive record for {workspace_id}: {e}");
    }

    // 3. Processes, then the archive script (`Z$`, `wYe`). Its failure is
    //    reported and the archive goes on.
    scripts.runs.stop(&workspace_id, None);
    let script_ref = WorkspaceRef {
        workspace_id: workspace_id.clone(),
        repository_id: w.repository_id.clone(),
        repo_root: repo_root.clone(),
        workspace_path: workspace_path.clone(),
        workspace_name: directory_name.clone(),
        default_branch: default_branch.clone(),
        target_branch: w.intended_target_branch.clone(),
    };
    let script = {
        let scripts = scripts.clone();
        tokio::task::spawn_blocking(move || scripts.run_archive(&script_ref)).await
    };
    match script {
        Ok(Ok(Some((Some(0), _)))) | Ok(Ok(None)) => {}
        Ok(Ok(Some((code, _)))) => notices.push(Notice::error(match code {
            Some(c) => format!("Archive script failed (exit code {c})"),
            None => format!(
                "Archive script failed: stopped after {} s",
                oc_scripts::service::ARCHIVE_TIMEOUT.as_secs()
            ),
        })),
        Ok(Err(e)) => notices.push(Notice::error(format!("Archive script failed: {e}"))),
        Err(e) => notices.push(Notice::error(format!("Archive script failed: {e}"))),
    }

    // 4. "Delete branch on archive" is read while the worktree (and its
    //    workspace settings layer) still exists, then `.context`, worktree, branch.
    let delete_branch = (deps.delete_branch_on_archive)(&repo_root, &workspace_path);
    let root = manager.root().to_path_buf();
    let torn_down = {
        let (t, p) = (target, prepared.clone());
        tokio::task::spawn_blocking(move || archive::teardown(&t, &p, delete_branch, Some(&root)))
            .await
    };
    match torn_down {
        Ok(n) => notices.extend(n),
        Err(e) => notices.push(Notice::error(e.to_string())),
    }

    Ok(ArchiveResultDto {
        archived: true,
        branch: Some(prepared.persisted_branch),
        archive_commit: prepared.archive_commit,
        notices: notices.into_iter().map(notice_dto).collect(),
    })
}

/// The row as an [`ArchiveTarget`]. Refuses a row with no path, or whose
/// path is the repository's own checkout, which must never be torn down.
async fn target_of(
    pool: &SqlitePool,
    row: &openconductor_db::workspaces::WorkspaceWithRepo,
) -> Result<ArchiveTarget, ArchiveFailureDto> {
    let w = &row.workspace;
    let repo_root = PathBuf::from(row.root_path.clone().unwrap_or_default());
    let workspace_path = PathBuf::from(w.workspace_path.clone().unwrap_or_default());
    if workspace_path.as_os_str().is_empty() || workspace_path == repo_root {
        return Err(ArchiveError::Corrupted.into());
    }
    let default_branch = match openconductor_db::repos::get(pool, &w.repository_id).await {
        Ok(Some(r)) => r.default_branch.filter(|b| !b.is_empty()),
        _ => None,
    }
    .unwrap_or_else(|| crate::workspace::git::default_branch(&repo_root));
    let directory_name = w.directory_name.clone().unwrap_or_default();
    Ok(ArchiveTarget {
        local_id: w.local_id.clone(),
        repo_name: row
            .repo_name
            .clone()
            .unwrap_or_else(|| directory_name.clone()),
        directory_name,
        workspace_path,
        repo_root,
        branch: w.branch.clone().unwrap_or_default(),
        default_branch,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnarchiveResultDto {
    /// False when the row was not archived, or an archive or unarchive of it
    /// was already running.
    pub restored: bool,
    pub branch: Option<String>,
    /// The branch had been deleted and was recreated at the archive commit.
    pub recreated_branch: bool,
    /// Uncommitted work saved at archive time was put back.
    pub restored_changes: bool,
    pub notices: Vec<NoticeDto>,
}

/// Unarchive workspace `workspace_id` (Conductor's `RWt` / `PY`, index
/// @ ~3,304,884): recreate the worktree on its branch (or at the archive
/// commit when the branch was deleted), restore the uncommitted work and
/// `.context` saved at archive time, drop the archive record and mark the row
/// `ready`. The caller reruns the setup script (`needsSetupScript`). On an
/// error the row is unchanged.
pub async fn unarchive_workspace(
    deps: &Deps<'_>,
    workspace_id: &str,
) -> Result<UnarchiveResultDto, ArchiveFailureDto> {
    let not_restored = |branch: Option<String>| UnarchiveResultDto {
        restored: false,
        branch,
        recreated_branch: false,
        restored_changes: false,
        notices: vec![],
    };
    let Some(_guard) = deps.in_flight.claim(workspace_id) else {
        return Ok(not_restored(None));
    };
    let pool = deps.pool;
    let row = openconductor_db::workspaces::get(pool, workspace_id)
        .await
        .map_err(|e| failed(e.to_string()))?
        .ok_or_else(|| failed("Workspace not found"))?;
    let w = &row.workspace;
    if w.state != openconductor_db::workspaces::WorkspaceState::Archived {
        return Ok(not_restored(w.branch.clone()));
    }
    let target = target_of(pool, &row).await?;
    let commit = w.archive_commit.clone();
    let root = deps.manager.root().to_path_buf();
    let restored = {
        let t = target.clone();
        tokio::task::spawn_blocking(move || archive::restore(&t, commit.as_deref(), Some(&root)))
            .await
            .map_err(|e| failed(e.to_string()))?
            .map_err(failed)?
    };
    // `markSettingUpAfterUnarchive`, then ready: the setup script's state
    // lives in the UI, as for a new workspace.
    if !openconductor_db::workspaces::unarchive(pool, workspace_id)
        .await
        .map_err(|e| failed(e.to_string()))?
    {
        return Err(failed("Workspace is not archived"));
    }
    openconductor_db::workspaces::set_state(
        pool,
        workspace_id,
        openconductor_db::workspaces::WorkspaceState::Ready,
    )
    .await
    .map_err(|e| failed(e.to_string()))?;
    if let Err(e) = deps
        .manager
        .forget_archive_record(&target.repo_root, &target.directory_name)
    {
        eprintln!("unarchive: could not remove the archive record for {workspace_id}: {e}");
    }
    Ok(UnarchiveResultDto {
        restored: true,
        branch: Some(restored.branch),
        recreated_branch: restored.recreated_branch,
        restored_changes: restored.restored_changes,
        notices: restored.notices.into_iter().map(notice_dto).collect(),
    })
}
