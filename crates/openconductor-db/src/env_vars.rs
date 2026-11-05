//! Scoped environment variables (`env_vars`): one row per
//! (`key`, `scope`, `context`), unique by `idx_env_vars_key_scope_context`.
//!
//! The reference's statements (frontend bundle `index-BGEQ8YjU.js`, offsets
//! 423013-425402; `evidence/persistence/sql-literals-remaining-tables.txt`):
//!
//! - list: `SELECT key, scope, context, value FROM env_vars WHERE scope = ? AND context = ?`
//! - set: `INSERT INTO env_vars (key, scope, context, value) VALUES (?, ?, ?, ?)
//!   ON CONFLICT(key, scope, context) DO UPDATE SET value = ?`
//! - set when the value lives in the OS secret store: the same insert with
//!   `value` NULL (`… VALUES (?, ?, ?, NULL) … DO UPDATE SET value = NULL`);
//!   the row then only records that the key exists
//! - delete: `DELETE FROM env_vars WHERE key = ? AND scope = ? AND context = ?`
//!
//! Scopes and contexts seen in the bundle: scope `shared` with context
//! `local` or `cloud`. When values are not in the secret store the reference
//! drops rows whose `value` is NULL after listing; [`list`] returns them so
//! the caller decides.

use sqlx::SqlitePool;

use crate::{exec, Result};

/// One `env_vars` row. `value` is `None` when the value is kept in the OS
/// secret store instead of the database.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct EnvVar {
    pub key: String,
    pub scope: String,
    pub context: String,
    pub value: Option<String>,
}

/// Every variable stored for `scope` and `context`, in table order (the
/// reference's statement has no ORDER BY).
pub async fn list(pool: &SqlitePool, scope: &str, context: &str) -> Result<Vec<EnvVar>> {
    Ok(sqlx::query_as::<_, EnvVar>(
        "SELECT key, scope, context, value FROM env_vars WHERE scope = ? AND context = ?",
    )
    .bind(scope)
    .bind(context)
    .fetch_all(pool)
    .await?)
}

/// Store `value` for `key` in `scope`/`context`, replacing an earlier value.
pub async fn set(
    pool: &SqlitePool,
    key: &str,
    scope: &str,
    context: &str,
    value: &str,
) -> Result<()> {
    let q = sqlx::query(
        "INSERT INTO env_vars (key, scope, context, value) VALUES (?, ?, ?, ?) \
         ON CONFLICT(key, scope, context) DO UPDATE SET value = ?",
    )
    .bind(key)
    .bind(scope)
    .bind(context)
    .bind(value)
    .bind(value);
    exec(q, pool).await.map(|_| ())
}

/// Record `key` in `scope`/`context` with a NULL value, for a value the
/// caller has written to the OS secret store.
pub async fn set_in_secret_store(
    pool: &SqlitePool,
    key: &str,
    scope: &str,
    context: &str,
) -> Result<()> {
    let q = sqlx::query(
        "INSERT INTO env_vars (key, scope, context, value) VALUES (?, ?, ?, NULL) \
         ON CONFLICT(key, scope, context) DO UPDATE SET value = NULL",
    )
    .bind(key)
    .bind(scope)
    .bind(context);
    exec(q, pool).await.map(|_| ())
}

/// Delete `key` from `scope`/`context`; a missing row is fine.
pub async fn delete(pool: &SqlitePool, key: &str, scope: &str, context: &str) -> Result<()> {
    let q = sqlx::query("DELETE FROM env_vars WHERE key = ? AND scope = ? AND context = ?")
        .bind(key)
        .bind(scope)
        .bind(context);
    exec(q, pool).await.map(|_| ())
}
