//! Favorite model configurations (`favorite_models`), an ordered list per
//! organization and user.
//!
//! The reference's statements (frontend bundle `index-BGEQ8YjU.js`, offsets
//! 3089500-3091800; `evidence/persistence/sql-literals-remaining-tables.txt`):
//!
//! - read: `SELECT id, configuration, created_at FROM favorite_models WHERE
//!   organization_id = ? AND user_id = ? ORDER BY position ASC`
//! - write: the whole list at once, in one `BEGIN IMMEDIATE` … `COMMIT`:
//!   `DELETE FROM favorite_models WHERE <scope>` then `INSERT INTO
//!   favorite_models (organization_id, user_id, id, position, configuration,
//!   created_at) VALUES …`, `position` = index in the list, `created_at` kept
//!   for ids already stored and now (`toISOString()`) for new ones; `ROLLBACK`
//!   on failure.
//!
//! `configuration` is the favorite as JSON without its `id`; this module
//! stores and returns it as text. As in the reference (index `Epe`), the same
//! statements serve both databases: a [`Scope`] without `hosting_server_url`
//! is `conductor.db`'s organization + user list, one with it is `cache.db`'s
//! cloud-hosted copy (`hosting_server_url` leads the scope columns).

use sqlx::SqlitePool;

use crate::{iso_time, Result, Scope};

/// One stored favorite, in list order.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct FavoriteModel {
    pub id: String,
    /// The favorite's settings as JSON, without `id`.
    pub configuration: String,
    pub created_at: String,
}

/// The scope's favorites by position.
pub async fn list(pool: &SqlitePool, scope: &Scope) -> Result<Vec<FavoriteModel>> {
    let sql = format!(
        "SELECT id, configuration, created_at FROM favorite_models \
         WHERE {} ORDER BY position ASC",
        scope.condition(None)
    );
    let mut q = sqlx::query_as::<_, FavoriteModel>(&sql);
    for v in scope.values() {
        q = q.bind(v);
    }
    Ok(q.fetch_all(pool).await?)
}

/// Replace the list with `favorites` (`(id, configuration JSON)` in order).
/// `now_ms` stamps favorites not already stored.
pub async fn replace(
    pool: &SqlitePool,
    scope: &Scope,
    favorites: &[(String, String)],
    now_ms: i64,
) -> Result<()> {
    let mut conn = pool.acquire().await?;
    sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await?;
    let result: Result<()> = async {
        let condition = scope.condition(None);
        let sql = format!(
            "SELECT id, created_at FROM favorite_models \
             WHERE {condition} ORDER BY position ASC"
        );
        let mut q = sqlx::query_as::<_, (String, String)>(&sql);
        for v in scope.values() {
            q = q.bind(v);
        }
        let existing = q.fetch_all(&mut *conn).await?;
        let sql = format!("DELETE FROM favorite_models WHERE {condition}");
        let mut q = sqlx::query(&sql);
        for v in scope.values() {
            q = q.bind(v);
        }
        q.execute(&mut *conn).await?;
        if favorites.is_empty() {
            return Ok(());
        }
        let now = iso_time::from_millis(now_ms);
        let columns = scope.columns();
        let row = format!("({})", vec!["?"; columns.len() + 4].join(", "));
        let rows = vec![row; favorites.len()].join(", ");
        let sql = format!(
            "INSERT INTO favorite_models ({}, id, position, configuration, created_at) \
             VALUES {rows}",
            columns.join(", ")
        );
        let mut q = sqlx::query(&sql);
        for (position, (id, configuration)) in favorites.iter().enumerate() {
            let created_at = existing
                .iter()
                .find(|(old, _)| old == id)
                .map_or(now.clone(), |(_, at)| at.clone());
            for v in scope.values() {
                q = q.bind(v);
            }
            q = q
                .bind(id)
                .bind(position as i64)
                .bind(configuration)
                .bind(created_at);
        }
        q.execute(&mut *conn).await?;
        Ok(())
    }
    .await;
    match result {
        Ok(()) => {
            sqlx::query("COMMIT").execute(&mut *conn).await?;
            Ok(())
        }
        Err(e) => {
            sqlx::query("ROLLBACK").execute(&mut *conn).await?;
            Err(e)
        }
    }
}
