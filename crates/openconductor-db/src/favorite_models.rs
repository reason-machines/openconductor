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
//! stores and returns it as text. In `conductor.db` the scope is
//! organization + user (the reference adds `hosting_server_url` only for its
//! `cache.db` copy).

use sqlx::SqlitePool;

use crate::{iso_time, Result};

/// One stored favorite, in list order.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct FavoriteModel {
    pub id: String,
    /// The favorite's settings as JSON, without `id`.
    pub configuration: String,
    pub created_at: String,
}

/// The favorites of `organization_id`/`user_id` by position.
pub async fn list(
    pool: &SqlitePool,
    organization_id: &str,
    user_id: &str,
) -> Result<Vec<FavoriteModel>> {
    Ok(sqlx::query_as::<_, FavoriteModel>(
        "SELECT id, configuration, created_at FROM favorite_models \
         WHERE organization_id = ? AND user_id = ? ORDER BY position ASC",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

/// Replace the list with `favorites` (`(id, configuration JSON)` in order).
/// `now_ms` stamps favorites not already stored.
pub async fn replace(
    pool: &SqlitePool,
    organization_id: &str,
    user_id: &str,
    favorites: &[(String, String)],
    now_ms: i64,
) -> Result<()> {
    let mut conn = pool.acquire().await?;
    sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await?;
    let result: Result<()> = async {
        let existing: Vec<(String, String)> = sqlx::query_as(
            "SELECT id, created_at FROM favorite_models \
             WHERE organization_id = ? AND user_id = ? ORDER BY position ASC",
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        sqlx::query("DELETE FROM favorite_models WHERE organization_id = ? AND user_id = ?")
            .bind(organization_id)
            .bind(user_id)
            .execute(&mut *conn)
            .await?;
        if favorites.is_empty() {
            return Ok(());
        }
        let now = iso_time::from_millis(now_ms);
        let rows = vec!["(?, ?, ?, ?, ?, ?)"; favorites.len()].join(", ");
        let sql = format!(
            "INSERT INTO favorite_models (organization_id, user_id, id, position, configuration, \
             created_at) VALUES {rows}"
        );
        let mut q = sqlx::query(&sql);
        for (position, (id, configuration)) in favorites.iter().enumerate() {
            let created_at = existing
                .iter()
                .find(|(old, _)| old == id)
                .map_or(now.clone(), |(_, at)| at.clone());
            q = q
                .bind(organization_id)
                .bind(user_id)
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
