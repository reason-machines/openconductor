//! `favorite_models` in `cache.db`: the favorite model configurations of a
//! cloud-hosted organization, per [`Scope`], in the order the user arranged
//! them. The reference keeps local favorites in `conductor.db` with the same
//! statements scoped by `organization_id, user_id` only, and cloud ones here
//! with `hosting_server_url` in front.
//!
//! `configuration` is JSON text: the reference stores each favorite minus its
//! `id` as `JSON.stringify(...)` and merges the id back on read.

use std::collections::HashMap;

use sqlx::SqlitePool;

use super::Scope;
use crate::Result;

/// A stored favorite.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct FavoriteModel {
    pub id: String,
    pub configuration: String,
    pub created_at: Option<String>,
}

/// A favorite to store: its id and its configuration JSON.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewFavorite {
    pub id: String,
    pub configuration: String,
}

/// The scope's favorites in order. Statement: `SELECT id, configuration,
/// created_at FROM favorite_models WHERE <scope> ORDER BY position ASC`.
pub async fn list(pool: &SqlitePool, scope: &Scope) -> Result<Vec<FavoriteModel>> {
    Ok(sqlx::query_as::<_, FavoriteModel>(&format!(
        "SELECT id, configuration, created_at FROM favorite_models \
         WHERE {} ORDER BY position ASC",
        Scope::WHERE
    ))
    .bind(&scope.hosting_server_url)
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .fetch_all(pool)
    .await?)
}

/// Replace the scope's favorites with `favorites`, in that order (`position`
/// is the index). A favorite already stored keeps its `created_at`; a new one
/// gets `now`. The reference's write, one `BEGIN IMMEDIATE` transaction:
/// `DELETE FROM favorite_models WHERE <scope>` then, when the list is not
/// empty, `INSERT INTO favorite_models (hosting_server_url, organization_id,
/// user_id, id, position, configuration, created_at) VALUES (…), (…)`.
pub async fn replace(
    pool: &SqlitePool,
    scope: &Scope,
    favorites: &[NewFavorite],
    now: &str,
) -> Result<()> {
    let created: HashMap<String, Option<String>> = list(pool, scope)
        .await?
        .into_iter()
        .map(|f| (f.id, f.created_at))
        .collect();
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query(&format!(
        "DELETE FROM favorite_models WHERE {}",
        Scope::WHERE
    ))
    .bind(&scope.hosting_server_url)
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .execute(&mut *tx)
    .await?;
    if !favorites.is_empty() {
        let rows = vec!["(?, ?, ?, ?, ?, ?, ?)"; favorites.len()].join(", ");
        let sql = format!(
            "INSERT INTO favorite_models (hosting_server_url, organization_id, user_id, \
             id, position, configuration, created_at) VALUES {rows}"
        );
        let mut q = sqlx::query(&sql);
        for (position, f) in favorites.iter().enumerate() {
            let created_at = created
                .get(&f.id)
                .cloned()
                .flatten()
                .unwrap_or_else(|| now.to_owned());
            q = q
                .bind(&scope.hosting_server_url)
                .bind(&scope.organization_id)
                .bind(&scope.user_id)
                .bind(&f.id)
                .bind(position as i64)
                .bind(&f.configuration)
                .bind(created_at);
        }
        q.execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}
