//! Repositories and workspaces in `conductor.db` (opened by `db.rs`): the
//! source of truth the sidebar and Home list, kept in step with the workspace
//! service by the workspace commands.
//!
//! Tauri-free so it is tested on its own (`evidence/persistence/run-tests.sh`);
//! the IPC layer and the hooks the workspace commands call are in
//! `persistence_commands.rs`.
//!
//! Ids are the workspace service's: a repository id is its registry slug and
//! a workspace `local_id` is `<repositoryId>/<directoryName>`, the id the
//! other workspace commands (`rename_workspace_branch`, ...) take.

use openconductor_db::workspaces::{NewWorkspace, WorkspaceState};
use openconductor_db::{repos, workspaces, Result, SqlitePool};
use serde::Serialize;

/// Delete every workspace still `initializing` (its worktree was never
/// finished). Run at startup, before anything lists workspaces.
pub async fn delete_incomplete(pool: &SqlitePool) -> Result<usize> {
    let mut deleted = 0;
    for w in workspaces::list(pool).await? {
        let w = w.workspace;
        if w.state == WorkspaceState::Initializing
            && workspaces::delete_if_initializing(pool, &w.local_id).await?
        {
            deleted += 1;
        }
    }
    Ok(deleted)
}

/// A repository as the workspace service registered it.
#[derive(Debug, Clone)]
pub struct KnownRepo {
    pub id: String,
    pub name: String,
    pub root: String,
    pub default_branch: String,
}

/// A worktree the workspace service created.
#[derive(Debug, Clone)]
pub struct KnownWorkspace {
    pub id: String,
    pub repository_id: String,
    pub directory_name: String,
    pub branch: String,
    pub path: String,
    pub archived: bool,
}

/// Record a registered repository. Adding a hidden one again unhides it.
pub async fn record_repository(pool: &SqlitePool, repo: &KnownRepo) -> Result<()> {
    match repos::get(pool, &repo.id).await? {
        Some(existing) if existing.hidden => repos::set_hidden(pool, &repo.id, false).await,
        Some(_) => Ok(()),
        None => {
            let new = repos::NewRepo {
                id: repo.id.clone(),
                name: repo.name.clone(),
                root_path: repo.root.clone(),
                default_branch: Some(repo.default_branch.clone()),
                ..Default::default()
            };
            repos::insert(pool, &new).await.map(drop)
        }
    }
}

/// One-time import of state from before the database: a registry repository
/// the database lacks is added with its worktrees. Known repositories are left
/// alone, so a workspace deleted at startup is not brought back.
pub async fn import_repository(
    pool: &SqlitePool,
    repo: &KnownRepo,
    worktrees: &[KnownWorkspace],
) -> Result<bool> {
    if repos::get(pool, &repo.id).await?.is_some() {
        return Ok(false);
    }
    record_repository(pool, repo).await?;
    for w in worktrees {
        let state = if w.archived {
            WorkspaceState::Archived
        } else {
            WorkspaceState::Ready
        };
        insert_workspace(pool, w, state, None, None).await?;
    }
    Ok(true)
}

/// Row for a workspace whose worktree is being created (`initializing`).
pub async fn begin_workspace(
    pool: &SqlitePool,
    w: &KnownWorkspace,
    parent_branch: Option<&str>,
) -> Result<()> {
    insert_workspace(pool, w, WorkspaceState::Initializing, parent_branch, None).await?;
    // Numbered on creation, as Conductor does once its server answers.
    workspaces::set_number(pool, &w.id, workspaces::next_number(pool).await?).await
}

/// The worktree exists: replace any row with this id by a `ready` one.
/// Returns the workspace's number: the one `begin_workspace` gave it, or a new
/// one when the replaced row was a leftover (an archived workspace) or absent.
pub async fn finish_workspace(
    pool: &SqlitePool,
    w: &KnownWorkspace,
    parent_branch: Option<&str>,
    placeholder_branch_name: Option<&str>,
) -> Result<i64> {
    let kept = workspaces::get(pool, &w.id)
        .await?
        .map(|r| r.workspace)
        .filter(|r| r.state == WorkspaceState::Initializing)
        .and_then(|r| r.number);
    workspaces::delete(pool, &w.id).await?;
    insert_workspace(
        pool,
        w,
        WorkspaceState::Ready,
        parent_branch,
        placeholder_branch_name,
    )
    .await?;
    let number = match kept {
        Some(n) => n,
        None => workspaces::next_number(pool).await?,
    };
    workspaces::set_number(pool, &w.id, number).await?;
    Ok(number)
}

/// Creating the worktree failed: drop its `initializing` row.
pub async fn abandon_workspace(pool: &SqlitePool, local_id: &str) -> Result<bool> {
    workspaces::delete_if_initializing(pool, local_id).await
}

/// The branch was renamed (after the first message); the placeholder is gone.
pub async fn record_rename(pool: &SqlitePool, local_id: &str, branch: &str) -> Result<()> {
    workspaces::rename_branch(pool, local_id, branch, None).await
}

/// Save the branch a workspace merges into (`intended_target_branch`).
pub async fn set_target_branch(pool: &SqlitePool, local_id: &str, branch: &str) -> Result<()> {
    workspaces::set_target_branch(pool, local_id, Some(branch)).await
}

/// Mark a workspace archived, keeping its branch.
pub async fn archive(pool: &SqlitePool, local_id: &str) -> Result<()> {
    let w = workspaces::get(pool, local_id)
        .await?
        .ok_or(openconductor_db::Error::NotFound)?
        .workspace;
    workspaces::archive(
        pool,
        local_id,
        w.branch.as_deref().unwrap_or_default(),
        None,
    )
    .await
}

async fn insert_workspace(
    pool: &SqlitePool,
    w: &KnownWorkspace,
    state: WorkspaceState,
    parent_branch: Option<&str>,
    placeholder_branch_name: Option<&str>,
) -> Result<()> {
    let new = NewWorkspace {
        local_id: w.id.clone(),
        repository_id: w.repository_id.clone(),
        directory_name: w.directory_name.clone(),
        workspace_name: None,
        branch: w.branch.clone(),
        placeholder_branch_name: placeholder_branch_name.map(str::to_string),
        state,
        initialization_parent_branch: parent_branch.map(str::to_string),
        intended_target_branch: parent_branch.map(str::to_string),
        workspace_path: (!w.path.is_empty()).then(|| w.path.clone()),
    };
    workspaces::insert(pool, &new).await.map(drop)
}

/// `db_list_repos` row, in sidebar order (`display_order`, `created_at`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRow {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub remote_url: Option<String>,
    pub default_branch: String,
    pub display_order: i64,
    pub hidden: bool,
    pub icon: Option<String>,
    pub created_at: String,
}

/// `db_list_workspaces` row. `state` is the snake_case schema value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub id: String,
    pub repository_id: String,
    pub directory_name: String,
    pub workspace_name: Option<String>,
    pub branch: String,
    pub placeholder_branch_name: Option<String>,
    pub state: &'static str,
    pub derived_status: Option<String>,
    pub manual_status: Option<String>,
    pub workspace_path: Option<String>,
    pub pinned_at: Option<String>,
    pub unread: bool,
    /// `workspaces.number`, shown as `W-<n>`; null for workspaces from before numbering.
    pub number: Option<i64>,
    /// `workspaces.intended_target_branch`: the branch the work merges into,
    /// set at creation and by the target-branch picker.
    pub intended_target_branch: Option<String>,
    pub created_at: String,
}

pub async fn list_repos(pool: &SqlitePool) -> Result<Vec<RepoRow>> {
    Ok(repos::list(pool)
        .await?
        .into_iter()
        .map(|r| RepoRow {
            name: r.name.unwrap_or_default(),
            root_path: r.root_path.unwrap_or_default(),
            remote_url: r.remote_url,
            default_branch: r.default_branch.unwrap_or_else(|| "main".into()),
            display_order: r.display_order,
            hidden: r.hidden,
            icon: r.icon,
            created_at: r.created_at,
            id: r.id,
        })
        .collect())
}

/// Every workspace, oldest first.
pub async fn list_workspaces(pool: &SqlitePool) -> Result<Vec<WorkspaceRow>> {
    Ok(workspaces::list(pool)
        .await?
        .into_iter()
        .map(|w| {
            let w = w.workspace;
            WorkspaceRow {
                directory_name: w.directory_name.unwrap_or_default(),
                workspace_name: w.workspace_name,
                branch: w.branch.unwrap_or_default(),
                placeholder_branch_name: w.placeholder_branch_name,
                state: state_name(w.state),
                derived_status: w.derived_status,
                manual_status: w.manual_status,
                workspace_path: w.workspace_path,
                pinned_at: w.pinned_at,
                unread: w.unread,
                number: w.number,
                intended_target_branch: w.intended_target_branch,
                created_at: w.created_at,
                repository_id: w.repository_id,
                id: w.local_id,
            }
        })
        .collect())
}

fn state_name(s: WorkspaceState) -> &'static str {
    match s {
        WorkspaceState::Unstarted => "unstarted",
        WorkspaceState::Initializing => "initializing",
        WorkspaceState::SettingUp => "setting_up",
        WorkspaceState::Ready => "ready",
        WorkspaceState::Archiving => "archiving",
        WorkspaceState::Archived => "archived",
        WorkspaceState::Failed => "failed",
        WorkspaceState::Deleted => "deleted",
    }
}

#[cfg(test)]
mod tests;
