//! Workspaces: one git worktree of a repository, with its lifecycle state.
//!
//! States and transitions follow the reference app's SQL (decoded frontend
//! bundle and embedded migration text): a workspace is `initializing` while
//! its worktree is created, `setting_up` while the setup script runs, then
//! `ready`; either step can end in `failed`. Archiving stores the branch
//! and the commit it was archived at. There is no `updated_at` trigger on
//! this table: only [`unarchive`] and [`touch`] move `updated_at`.

use sqlx::SqlitePool;

use crate::{exec, exec_one, Result};

/// Lifecycle state stored in `workspaces.state`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum WorkspaceState {
    /// Cloud workspace not started yet.
    Unstarted,
    /// Row exists; the git worktree is being created.
    Initializing,
    /// Worktree exists; the setup script is running.
    SettingUp,
    Ready,
    Archiving,
    Archived,
    Failed,
    /// Deleted on the server (cloud workspaces).
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Workspace {
    pub local_id: String,
    pub repository_id: String,
    pub directory_name: Option<String>,
    pub workspace_name: Option<String>,
    pub branch: Option<String>,
    pub placeholder_branch_name: Option<String>,
    pub state: WorkspaceState,
    pub derived_status: Option<String>,
    pub manual_status: Option<String>,
    pub active_session_id: Option<String>,
    pub initialization_parent_branch: Option<String>,
    pub intended_target_branch: Option<String>,
    pub workspace_path: Option<String>,
    pub archive_commit: Option<String>,
    pub initialization_log_path: Option<String>,
    pub initialization_files_copied: Option<i64>,
    pub setup_log_path: Option<String>,
    pub pinned_at: Option<String>,
    pub notes: Option<String>,
    pub unread: bool,
    pub pr_title: Option<String>,
    pub pr_description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A workspace joined with the repository fields callers need with it.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct WorkspaceWithRepo {
    #[sqlx(flatten)]
    pub workspace: Workspace,
    pub root_path: Option<String>,
    pub repo_name: Option<String>,
    pub storage_version: i64,
}

const SELECT_WITH_REPO: &str = "SELECT w.local_id, w.repository_id, w.directory_name, \
    w.workspace_name, w.branch, w.placeholder_branch_name, w.state, w.derived_status, \
    w.manual_status, w.active_session_id, w.initialization_parent_branch, \
    w.intended_target_branch, w.workspace_path, w.archive_commit, w.initialization_log_path, \
    w.initialization_files_copied, w.setup_log_path, w.pinned_at, w.notes, \
    COALESCE(w.unread, 0) AS unread, w.pr_title, w.pr_description, w.created_at, w.updated_at, \
    r.root_path, r.name AS repo_name, COALESCE(r.storage_version, 1) AS storage_version \
    FROM workspaces w JOIN repos r ON w.repository_id = r.id";

#[derive(Debug, Clone)]
pub struct NewWorkspace {
    pub local_id: String,
    pub repository_id: String,
    pub directory_name: String,
    pub workspace_name: Option<String>,
    pub branch: String,
    pub placeholder_branch_name: Option<String>,
    pub state: WorkspaceState,
    pub initialization_parent_branch: Option<String>,
    pub intended_target_branch: Option<String>,
    pub workspace_path: Option<String>,
}

pub async fn insert(pool: &SqlitePool, w: &NewWorkspace) -> Result<WorkspaceWithRepo> {
    sqlx::query(
        "INSERT INTO workspaces (local_id, repository_id, directory_name, workspace_name, branch, \
         placeholder_branch_name, state, initialization_parent_branch, intended_target_branch, \
         workspace_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&w.local_id)
    .bind(&w.repository_id)
    .bind(&w.directory_name)
    .bind(&w.workspace_name)
    .bind(&w.branch)
    .bind(&w.placeholder_branch_name)
    .bind(w.state)
    .bind(&w.initialization_parent_branch)
    .bind(&w.intended_target_branch)
    .bind(&w.workspace_path)
    .execute(pool)
    .await?;
    get(pool, &w.local_id).await?.ok_or(crate::Error::NotFound)
}

pub async fn get(pool: &SqlitePool, local_id: &str) -> Result<Option<WorkspaceWithRepo>> {
    let sql = format!("{SELECT_WITH_REPO} WHERE w.local_id = ?");
    Ok(sqlx::query_as(&sql)
        .bind(local_id)
        .fetch_optional(pool)
        .await?)
}

/// Every workspace, oldest first.
pub async fn list(pool: &SqlitePool) -> Result<Vec<WorkspaceWithRepo>> {
    let sql = format!("{SELECT_WITH_REPO} ORDER BY w.created_at ASC, w.local_id ASC");
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

/// The workspace a session belongs to.
pub async fn for_session(pool: &SqlitePool, session_id: &str) -> Result<Option<WorkspaceWithRepo>> {
    let sql =
        format!("{SELECT_WITH_REPO} JOIN sessions s ON s.workspace_id = w.local_id WHERE s.id = ?");
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .fetch_optional(pool)
        .await?)
}

/// Worktree created: record its init log and copied-file count, start setup.
pub async fn begin_setup(
    pool: &SqlitePool,
    local_id: &str,
    init_log: Option<&str>,
    files_copied: i64,
) -> Result<()> {
    let q = sqlx::query(
        "UPDATE workspaces SET state = 'setting_up', initialization_log_path = ?, \
         initialization_files_copied = ? WHERE local_id = ?",
    );
    exec_one(q.bind(init_log).bind(files_copied).bind(local_id), pool).await
}

/// `setting_up` -> `ready`. False when the workspace was not setting up.
pub async fn finish_setup(pool: &SqlitePool, local_id: &str) -> Result<bool> {
    let q = sqlx::query(
        "UPDATE workspaces SET state = 'ready' WHERE local_id = ? AND state = 'setting_up'",
    );
    Ok(exec(q.bind(local_id), pool).await? > 0)
}

/// `initializing` or `setting_up` -> `failed`. False in any other state.
pub async fn fail(pool: &SqlitePool, local_id: &str) -> Result<bool> {
    let q = sqlx::query(
        "UPDATE workspaces SET state = 'failed' WHERE local_id = ? \
         AND state IN ('initializing', 'setting_up')",
    );
    Ok(exec(q.bind(local_id), pool).await? > 0)
}

/// Archive: store the branch and the commit the worktree was at.
pub async fn archive(
    pool: &SqlitePool,
    local_id: &str,
    branch: &str,
    archive_commit: Option<&str>,
) -> Result<()> {
    let q = sqlx::query("UPDATE workspaces SET state = 'archived', branch = ?, archive_commit = ? WHERE local_id = ?");
    exec_one(q.bind(branch).bind(archive_commit).bind(local_id), pool).await
}

/// `archived` -> `setting_up`, bumping `updated_at`. False when not archived.
pub async fn unarchive(pool: &SqlitePool, local_id: &str) -> Result<bool> {
    let q = sqlx::query(
        "UPDATE workspaces SET state = 'setting_up', updated_at = datetime('now') \
         WHERE local_id = ? AND state = 'archived'",
    );
    Ok(exec(q.bind(local_id), pool).await? > 0)
}

pub async fn set_state(pool: &SqlitePool, local_id: &str, state: WorkspaceState) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET state = ? WHERE local_id = ?")
            .bind(state)
            .bind(local_id),
        pool,
    )
    .await
}

/// Move `updated_at` forward to `at` (never backwards).
pub async fn touch(pool: &SqlitePool, local_id: &str, at: &str) -> Result<()> {
    let q = sqlx::query(
        "UPDATE workspaces SET updated_at = CASE WHEN julianday(updated_at) < julianday(?) \
         THEN ? ELSE updated_at END WHERE local_id = ?",
    );
    exec_one(q.bind(at).bind(at).bind(local_id), pool).await
}

/// Rename the branch; the PR title and description drafted for the old
/// branch are cleared.
pub async fn rename_branch(
    pool: &SqlitePool,
    local_id: &str,
    branch: &str,
    placeholder: Option<&str>,
) -> Result<()> {
    let q = sqlx::query(
        "UPDATE workspaces SET branch = ?, placeholder_branch_name = ?, pr_title = NULL, \
         pr_description = NULL WHERE local_id = ?",
    );
    exec_one(q.bind(branch).bind(placeholder).bind(local_id), pool).await
}

pub async fn set_active_session(
    pool: &SqlitePool,
    local_id: &str,
    session_id: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET active_session_id = ? WHERE local_id = ?")
            .bind(session_id)
            .bind(local_id),
        pool,
    )
    .await
}

pub async fn set_target_branch(
    pool: &SqlitePool,
    local_id: &str,
    branch: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET intended_target_branch = ? WHERE local_id = ?")
            .bind(branch)
            .bind(local_id),
        pool,
    )
    .await
}

pub async fn set_notes(pool: &SqlitePool, local_id: &str, notes: Option<&str>) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET notes = ? WHERE local_id = ?")
            .bind(notes)
            .bind(local_id),
        pool,
    )
    .await
}

/// Pin (with the time pinned) or unpin.
pub async fn set_pinned_at(
    pool: &SqlitePool,
    local_id: &str,
    pinned_at: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET pinned_at = ? WHERE local_id = ?")
            .bind(pinned_at)
            .bind(local_id),
        pool,
    )
    .await
}

pub async fn set_unread(pool: &SqlitePool, local_id: &str, unread: bool) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET unread = ? WHERE local_id = ?")
            .bind(unread)
            .bind(local_id),
        pool,
    )
    .await
}

/// Override the derived status by hand; `None` clears the override.
pub async fn set_manual_status(
    pool: &SqlitePool,
    local_id: &str,
    status: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET manual_status = ? WHERE local_id = ?")
            .bind(status)
            .bind(local_id),
        pool,
    )
    .await
}

/// Store a freshly derived status and drop any manual override.
pub async fn set_derived_status(pool: &SqlitePool, local_id: &str, status: &str) -> Result<()> {
    let q = sqlx::query(
        "UPDATE workspaces SET manual_status = NULL, derived_status = ? WHERE local_id = ?",
    );
    exec_one(q.bind(status).bind(local_id), pool).await
}

/// Delete a workspace whose worktree was never created. False otherwise.
pub async fn delete_if_initializing(pool: &SqlitePool, local_id: &str) -> Result<bool> {
    let q = sqlx::query("DELETE FROM workspaces WHERE local_id = ? AND state = 'initializing'");
    Ok(exec(q.bind(local_id), pool).await? > 0)
}
