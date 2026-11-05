//! Repositories: the git repos added to OpenConductor, each the parent of
//! its workspaces.
//!
//! Query shapes follow the reference app's own SQL (from its decoded
//! frontend bundle): list order is `display_order, created_at`; a repo
//! with workspaces cannot be deleted on its own; a hidden, unused repo at
//! the same path is reused when that path is added again. `updated_at` is
//! bumped by the `update_repos_updated_at` trigger.

use sqlx::SqlitePool;

use crate::{Error, Result};

/// One row of `repos`, with the reference's NULL fallbacks applied.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Repo {
    pub id: String,
    pub name: Option<String>,
    pub root_path: Option<String>,
    pub remote_url: Option<String>,
    pub remote: Option<String>,
    pub default_branch: Option<String>,
    pub storage_version: i64,
    pub display_order: i64,
    pub hidden: bool,
    pub icon: Option<String>,
    pub conductor_config: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const REPO_COLUMNS: &str = "id, name, root_path, remote_url, remote, default_branch, \
    COALESCE(storage_version, 1) AS storage_version, \
    COALESCE(display_order, 0) AS display_order, \
    COALESCE(hidden, 0) AS hidden, icon, conductor_config, created_at, updated_at";

/// Fields for adding a repository. `None` leaves the column default.
#[derive(Debug, Clone, Default)]
pub struct NewRepo {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub remote_url: Option<String>,
    pub remote: Option<String>,
    pub default_branch: Option<String>,
    pub hidden: bool,
}

/// Add a repository at the end of the list (`display_order` one past the
/// current maximum).
pub async fn insert(pool: &SqlitePool, repo: &NewRepo) -> Result<Repo> {
    sqlx::query(
        "INSERT INTO repos (id, name, root_path, remote_url, remote, default_branch, hidden, \
         display_order) VALUES (?, ?, ?, ?, ?, COALESCE(?, 'main'), ?, \
         (SELECT COALESCE(MAX(display_order), -1) + 1 FROM repos))",
    )
    .bind(&repo.id)
    .bind(&repo.name)
    .bind(&repo.root_path)
    .bind(&repo.remote_url)
    .bind(&repo.remote)
    .bind(&repo.default_branch)
    .bind(repo.hidden)
    .execute(pool)
    .await?;
    get(pool, &repo.id).await?.ok_or(Error::NotFound)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Repo>> {
    let sql = format!("SELECT {REPO_COLUMNS} FROM repos WHERE id = ?");
    Ok(sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?)
}

/// Every repository, hidden ones included, in sidebar order.
pub async fn list(pool: &SqlitePool) -> Result<Vec<Repo>> {
    let sql = format!(
        "SELECT {REPO_COLUMNS} FROM repos \
         ORDER BY COALESCE(display_order, 0) ASC, created_at ASC"
    );
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

/// A hidden repository at `root_path` that has no workspaces, to reuse
/// when the same path is added again.
pub async fn find_reusable_hidden(pool: &SqlitePool, root_path: &str) -> Result<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT id FROM repos WHERE root_path = ? AND hidden = 1 AND NOT EXISTS \
         (SELECT 1 FROM workspaces WHERE workspaces.repository_id = repos.id)",
    )
    .bind(root_path)
    .fetch_optional(pool)
    .await?)
}

/// Give `ids` display orders 0, 1, 2, ... in the order given.
pub async fn reorder(pool: &SqlitePool, ids: &[&str]) -> Result<()> {
    let mut tx = pool.begin().await?;
    for (order, id) in ids.iter().enumerate() {
        let done = sqlx::query("UPDATE repos SET display_order = ? WHERE id = ?")
            .bind(order as i64)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if done.rows_affected() == 0 {
            return Err(Error::NotFound);
        }
    }
    tx.commit().await?;
    Ok(())
}

/// Delete a repository that has no workspaces. Returns false (and deletes
/// nothing) when it still has some or does not exist.
pub async fn delete_if_unused(pool: &SqlitePool, id: &str) -> Result<bool> {
    let done = sqlx::query(
        "DELETE FROM repos WHERE id = ? AND NOT EXISTS \
         (SELECT 1 FROM workspaces WHERE workspaces.repository_id = repos.id)",
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

/// Delete a repository together with all of its workspace rows.
pub async fn delete_with_workspaces(pool: &SqlitePool, id: &str) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM workspaces WHERE repository_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let done = sqlx::query("DELETE FROM repos WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if done.rows_affected() == 0 {
        return Err(Error::NotFound);
    }
    tx.commit().await?;
    Ok(())
}
