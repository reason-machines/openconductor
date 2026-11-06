//! Housekeeping tables: symlinks to remove on next launch
//! (`symlinks_pending_deletion`) and per-migration rollback SQL
//! (`migration_rollbacks`).
//!
//! `symlinks_pending_deletion` statements are the reference's (frontend
//! bundle `index-BGEQ8YjU.js`, offsets 1052393-1052494 and 3303723-3303993;
//! `evidence/persistence/sql-literals-remaining-tables.txt`): renaming a
//! workspace queues the old user-visible symlink path
//! (`INSERT INTO symlinks_pending_deletion (path) VALUES (?)`) and unqueues
//! the new one (`DELETE … WHERE path = ?`); at launch the reference reads
//! `SELECT path FROM symlinks_pending_deletion`, skips NULL paths, removes
//! each symlink and deletes its row.
//!
//! `migration_rollbacks` is never read by the reference: its migrations
//! (text in `MacOS/conductor`) write `INSERT OR REPLACE INTO
//! migration_rollbacks (version, down_sql) VALUES (N, '…')`, where each
//! `down_sql` ends with `DELETE FROM migration_rollbacks WHERE version = N;`.
//! Our migrations are consolidated and record no rollbacks; [`record_rollback`]
//! exists for a later migration that wants to.

use sqlx::SqlitePool;

use crate::{exec, Result};

/// Queue `path` (a symlink) for removal on next launch. The table has no
/// unique index, so queuing a path twice gives two rows.
pub async fn queue_symlink_deletion(pool: &SqlitePool, path: &str) -> Result<()> {
    let q = sqlx::query("INSERT INTO symlinks_pending_deletion (path) VALUES (?)").bind(path);
    exec(q, pool).await.map(|_| ())
}

/// Every queued path, NULL rows skipped (the statement has no ORDER BY).
pub async fn symlinks_pending_deletion(pool: &SqlitePool) -> Result<Vec<String>> {
    let paths: Vec<Option<String>> =
        sqlx::query_scalar("SELECT path FROM symlinks_pending_deletion")
            .fetch_all(pool)
            .await?;
    Ok(paths.into_iter().flatten().collect())
}

/// Unqueue `path` (every row with it), after removing it or because it is in
/// use again.
pub async fn unqueue_symlink_deletion(pool: &SqlitePool, path: &str) -> Result<()> {
    let q = sqlx::query("DELETE FROM symlinks_pending_deletion WHERE path = ?").bind(path);
    exec(q, pool).await.map(|_| ())
}

/// Record how to undo migration `version`. `down_sql` should end by deleting
/// its own row (`DELETE FROM migration_rollbacks WHERE version = <version>;`),
/// as the reference's do.
pub async fn record_rollback(pool: &SqlitePool, version: i64, down_sql: &str) -> Result<()> {
    let q =
        sqlx::query("INSERT OR REPLACE INTO migration_rollbacks (version, down_sql) VALUES (?, ?)")
            .bind(version)
            .bind(down_sql);
    exec(q, pool).await.map(|_| ())
}

/// Tables the reference empties, in its order, when the root path changes.
const FORGOTTEN_ON_ROOT_CHANGE: [&str; 6] = [
    "attachments",
    "diff_comments",
    "session_messages",
    "sessions",
    "workspaces",
    "repos",
];

/// Forget every repository, workspace and chat, as the reference's root path
/// change does (renderApp chunk, `changeRootPath` mutation: `DELETE FROM
/// attachments`, `diff_comments`, `session_messages`, `sessions`,
/// `workspaces`, `repos`, in that order). Settings and files on disk are
/// kept. One transaction here; the reference runs six separate statements.
pub async fn forget_repositories(pool: &SqlitePool) -> Result<()> {
    let mut tx = pool.begin().await?;
    for table in FORGOTTEN_ON_ROOT_CHANGE {
        sqlx::query(&format!("DELETE FROM {table}"))
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
