//! Repositories: the git repos added to OpenConductor, each the parent of
//! its workspaces.
//!
//! Query shapes follow the reference app's own SQL (from its decoded
//! frontend bundle): list order is `display_order, created_at`; a repo
//! with workspaces cannot be deleted on its own; a hidden, unused repo at
//! the same path is reused when that path is added again. `updated_at` is
//! bumped by the `update_repos_updated_at` trigger.

use sqlx::SqlitePool;

use crate::{exec_one, Error, Result};

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

/// Per-repository scripts, prompts and workspace-file settings.
#[derive(Debug, Clone, Default, PartialEq, Eq, sqlx::FromRow)]
pub struct RepoSettings {
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    /// `concurrent` (default) or `nonconcurrent`.
    pub run_script_mode: Option<String>,
    pub archive_script: Option<String>,
    pub custom_prompt_general: Option<String>,
    pub custom_prompt_code_review: Option<String>,
    pub custom_prompt_create_pr: Option<String>,
    pub custom_prompt_fix_errors: Option<String>,
    pub custom_prompt_resolve_merge_conflicts: Option<String>,
    pub custom_prompt_rename_branch: Option<String>,
    pub file_include_globs: Option<String>,
    pub spotlight_testing: Option<bool>,
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

pub async fn set_default_branch(pool: &SqlitePool, id: &str, branch: &str) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE repos SET default_branch = ? WHERE id = ?")
            .bind(branch)
            .bind(id),
        pool,
    )
    .await
}

/// Set the git remote name and its URL together.
pub async fn set_remote(
    pool: &SqlitePool,
    id: &str,
    remote: &str,
    remote_url: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE repos SET remote = ?, remote_url = ? WHERE id = ?")
            .bind(remote)
            .bind(remote_url)
            .bind(id),
        pool,
    )
    .await
}

pub async fn set_hidden(pool: &SqlitePool, id: &str, hidden: bool) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE repos SET hidden = ? WHERE id = ?")
            .bind(hidden)
            .bind(id),
        pool,
    )
    .await
}

pub async fn set_icon(pool: &SqlitePool, id: &str, icon: Option<&str>) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE repos SET icon = ? WHERE id = ?")
            .bind(icon)
            .bind(id),
        pool,
    )
    .await
}

/// Store the repository's `conductor.json`-style config (opaque JSON text).
pub async fn set_conductor_config(pool: &SqlitePool, id: &str, config: Option<&str>) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE repos SET conductor_config = ? WHERE id = ?")
            .bind(config)
            .bind(id),
        pool,
    )
    .await
}

pub async fn settings(pool: &SqlitePool, id: &str) -> Result<RepoSettings> {
    sqlx::query_as(
        "SELECT setup_script, run_script, run_script_mode, archive_script, custom_prompt_general, \
         custom_prompt_code_review, custom_prompt_create_pr, custom_prompt_fix_errors, \
         custom_prompt_resolve_merge_conflicts, custom_prompt_rename_branch, file_include_globs, \
         spotlight_testing FROM repos WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(Error::NotFound)
}

/// Replace every setting at once with `settings`.
pub async fn update_settings(pool: &SqlitePool, id: &str, s: &RepoSettings) -> Result<()> {
    let query = sqlx::query(
        "UPDATE repos SET setup_script = ?, run_script = ?, run_script_mode = ?, \
         archive_script = ?, custom_prompt_general = ?, custom_prompt_code_review = ?, \
         custom_prompt_create_pr = ?, custom_prompt_fix_errors = ?, \
         custom_prompt_resolve_merge_conflicts = ?, custom_prompt_rename_branch = ?, \
         file_include_globs = ?, spotlight_testing = ? WHERE id = ?",
    )
    .bind(&s.setup_script)
    .bind(&s.run_script)
    .bind(&s.run_script_mode)
    .bind(&s.archive_script)
    .bind(&s.custom_prompt_general)
    .bind(&s.custom_prompt_code_review)
    .bind(&s.custom_prompt_create_pr)
    .bind(&s.custom_prompt_fix_errors)
    .bind(&s.custom_prompt_resolve_merge_conflicts)
    .bind(&s.custom_prompt_rename_branch)
    .bind(&s.file_include_globs)
    .bind(s.spotlight_testing)
    .bind(id);
    exec_one(query, pool).await
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
