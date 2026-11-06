//! Queries behind the user-facing workspace rename (sidebar row menu >
//! Rename). Conductor v0.87.6 (decoded index-BGEQ8YjU.js, the local
//! workspace server's `renameWorkspace` @1050054) checks the new directory
//! name against every other local workspace of the repository, in any state
//! (`Dm` @977765 only filters on the hosting server), then either records a
//! secondary directory name (ready / setting up: the worktree stays where it
//! is and a sibling symlink carries the new name) or, for other states,
//! rewrites `directory_name` and `workspace_path` directly.

use sqlx::Row;

use crate::{exec, exec_one, Result, SqlitePool};

/// The columns a rename reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceNaming {
    pub repository_id: String,
    pub directory_name: String,
    pub secondary_directory_name: Option<String>,
    pub workspace_name: Option<String>,
    pub state: String,
    pub workspace_path: Option<String>,
}

pub async fn naming(pool: &SqlitePool, local_id: &str) -> Result<Option<WorkspaceNaming>> {
    let row = sqlx::query(
        "SELECT repository_id, directory_name, secondary_directory_name, workspace_name, state, \
         workspace_path FROM workspaces WHERE local_id = ?",
    )
    .bind(local_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| WorkspaceNaming {
        repository_id: r.get("repository_id"),
        directory_name: r
            .get::<Option<String>, _>("directory_name")
            .unwrap_or_default(),
        secondary_directory_name: r.get("secondary_directory_name"),
        workspace_name: r.get("workspace_name"),
        state: r
            .get::<Option<String>, _>("state")
            .unwrap_or_else(|| "active".into()),
        workspace_path: r.get("workspace_path"),
    }))
}

/// Directory names (primary and secondary) of the repository's other local
/// workspaces, archived ones included: a rename may not reuse any of them.
pub async fn taken_directory_names(
    pool: &SqlitePool,
    repository_id: &str,
    except_local_id: &str,
) -> Result<Vec<String>> {
    let rows = sqlx::query(
        "SELECT directory_name, secondary_directory_name FROM workspaces \
         WHERE repository_id = ? AND local_id != ? \
         AND (hosting_server_url IS NULL OR hosting_server_url = '')",
    )
    .bind(repository_id)
    .bind(except_local_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .flat_map(|r| {
            let primary: Option<String> = r.get("directory_name");
            let secondary: Option<String> = r.get("secondary_directory_name");
            primary.into_iter().chain(secondary)
        })
        .collect())
}

/// Ready / setting-up workspace: the worktree keeps its directory; the new
/// name is the secondary directory (None when renaming back to the original).
/// `user_set` only ever turns `user_set_workspace_name` on.
pub async fn record_secondary_name(
    pool: &SqlitePool,
    local_id: &str,
    secondary_directory_name: Option<&str>,
    workspace_name: Option<&str>,
    user_set: bool,
) -> Result<()> {
    let q = sqlx::query(
        "UPDATE workspaces SET secondary_directory_name = ?, workspace_name = ?, \
         user_set_workspace_name = CASE WHEN ? = 1 THEN 1 ELSE user_set_workspace_name END \
         WHERE local_id = ?",
    );
    exec_one(
        q.bind(secondary_directory_name)
            .bind(workspace_name)
            .bind(user_set)
            .bind(local_id),
        pool,
    )
    .await
}

/// Any other state: the directory itself takes the new name.
pub async fn record_directory_name(
    pool: &SqlitePool,
    local_id: &str,
    directory_name: &str,
    workspace_path: &str,
    workspace_name: Option<&str>,
    user_set: bool,
) -> Result<()> {
    let q = sqlx::query(
        "UPDATE workspaces SET directory_name = ?, secondary_directory_name = NULL, workspace_path = ?, \
         workspace_name = ?, \
         user_set_workspace_name = CASE WHEN ? = 1 THEN 1 ELSE user_set_workspace_name END \
         WHERE local_id = ?",
    );
    exec_one(
        q.bind(directory_name)
            .bind(workspace_path)
            .bind(workspace_name)
            .bind(user_set)
            .bind(local_id),
        pool,
    )
    .await
}

/// The old name's symlink may still be some process's cwd; Conductor deletes
/// it on the next start instead of now.
pub async fn queue_symlink_deletion(pool: &SqlitePool, path: &str) -> Result<()> {
    exec(
        sqlx::query("INSERT INTO symlinks_pending_deletion (path) VALUES (?)").bind(path),
        pool,
    )
    .await?;
    Ok(())
}

/// A rename back onto a queued path keeps that symlink.
pub async fn unqueue_symlink_deletion(pool: &SqlitePool, path: &str) -> Result<()> {
    exec(
        sqlx::query("DELETE FROM symlinks_pending_deletion WHERE path = ?").bind(path),
        pool,
    )
    .await?;
    Ok(())
}

pub async fn pending_symlink_deletions(pool: &SqlitePool) -> Result<Vec<String>> {
    let rows = sqlx::query("SELECT path FROM symlinks_pending_deletion")
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .filter_map(|r| r.get::<Option<String>, _>("path"))
        .collect())
}

/// A branch rename the user asked for blocks later automatic renames.
pub async fn mark_user_set_branch_name(pool: &SqlitePool, local_id: &str) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE workspaces SET user_set_branch_name = 1 WHERE local_id = ?")
            .bind(local_id),
        pool,
    )
    .await
}
