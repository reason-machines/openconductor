//! The `settings` table: app-wide key/value pairs, such as the flags the
//! reference app sets once a one-time migration has run
//! (`repo_local_settings_file_migration_complete` and its siblings). Values
//! are text; the reference stores booleans as `"true"` / `"false"`.
//!
//! Statements are the reference's (frontend bundle `index-BGEQ8YjU.js`,
//! offsets 325871-333220 and 362579-365919;
//! `evidence/persistence/sql-literals-remaining-tables.txt`). Every write is
//! `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, so a write
//! resets `created_at`/`updated_at` and clears `deprecated_at`. A setting that
//! moved to the file-backed settings is marked with `deprecated_at` rather
//! than deleted, and the settings loader reads only
//! `WHERE deprecated_at IS NULL`. The reference deletes a key instead of
//! writing an empty or blank value; callers do that with [`delete`].

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

/// Store `value` under `key`, replacing the whole row (which un-deprecates
/// the key).
pub async fn set(pool: &SqlitePool, key: &str, value: &str) -> Result<()> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

/// Every setting not marked deprecated, as `(key, value)`, in table order.
pub async fn active(pool: &SqlitePool) -> Result<Vec<(String, String)>> {
    Ok(
        sqlx::query_as("SELECT key, value FROM settings WHERE deprecated_at IS NULL")
            .fetch_all(pool)
            .await?,
    )
}

/// Mark `key` deprecated (now), keeping its row and value. A missing key is
/// not an error.
pub async fn deprecate(pool: &SqlitePool, key: &str) -> Result<()> {
    sqlx::query("UPDATE settings SET deprecated_at = datetime('now') WHERE key = ?")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete `key`; a missing key is fine.
pub async fn delete(pool: &SqlitePool, key: &str) -> Result<()> {
    sqlx::query("DELETE FROM settings WHERE key = ?")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(())
}
