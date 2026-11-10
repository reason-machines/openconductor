//! Persisted links keep workspace identities separate from local directory paths.
use sqlx::SqlitePool;

use crate::{exec_one, workspaces, Error, Result};

#[derive(Clone, Copy)]
pub enum LinkKind {
    Workspace,
    Directory,
}

pub async fn set(
    pool: &SqlitePool,
    source: &str,
    kind: LinkKind,
    value: &str,
    linked: bool,
) -> Result<()> {
    let column = match kind {
        LinkKind::Workspace => {
            if source == value {
                return Err(Error::InvalidWorkspaceLink(
                    "Cannot link a workspace to itself".into(),
                ));
            }
            if linked && workspaces::get(pool, value).await?.is_none() {
                return Err(Error::NotFound);
            }
            "linked_workspace_ids"
        }
        LinkKind::Directory => "linked_directory_paths",
    };
    let sql = if linked {
        format!("UPDATE workspaces SET {column} = CASE WHEN EXISTS (SELECT 1 FROM json_each(COALESCE({column}, '[]')) WHERE value = ?1) THEN {column} ELSE json_insert(COALESCE({column}, '[]'), '$[#]', ?1) END WHERE local_id = ?2")
    } else {
        format!("UPDATE workspaces SET {column} = NULLIF((SELECT json_group_array(value) FROM json_each(COALESCE({column}, '[]')) WHERE value != ?1), '[]') WHERE local_id = ?2")
    };
    exec_one(sqlx::query(&sql).bind(value).bind(source), pool).await
}

pub async fn resolve(pool: &SqlitePool, source: &str) -> Result<Vec<String>> {
    if workspaces::get(pool, source).await?.is_none() {
        return Err(Error::NotFound);
    }
    let mut paths: Vec<String> = sqlx::query_scalar(
        "SELECT target.workspace_path FROM workspaces source, json_each(COALESCE(source.linked_workspace_ids, '[]')) link JOIN workspaces target ON target.local_id = link.value WHERE source.local_id = ? AND target.workspace_path IS NOT NULL ORDER BY link.key",
    ).bind(source).fetch_all(pool).await?;
    let directories: Vec<String> = sqlx::query_scalar(
        "SELECT link.value FROM workspaces source, json_each(COALESCE(source.linked_directory_paths, '[]')) link WHERE source.local_id = ? ORDER BY link.key",
    ).bind(source).fetch_all(pool).await?;
    paths.extend(directories);
    Ok(paths)
}
