//! The `settings` table: app-wide key/value pairs, such as the flags the
//! reference app sets once a one-time migration has run
//! (`repo_local_settings_file_migration_complete` and its siblings). Values
//! are text; the reference stores booleans as `"true"` / `"false"`.

use sqlx::sqlite::SqlitePool;

use crate::Result;

/// The value stored under `key`, if any.
pub async fn get(pool: &SqlitePool, key: &str) -> Result<Option<String>> {
    Ok(
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_optional(pool)
            .await?,
    )
}

/// Store `value` under `key`, replacing any earlier value.
pub async fn set(pool: &SqlitePool, key: &str, value: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}
