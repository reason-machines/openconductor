//! Saved terminal sessions (`terminal_sessions`): everything about a closed
//! terminal except its screen text, which is kept encrypted in local storage
//! (`src-tauri/src/terminal/history_store.rs`).
//!
//! The statements are the reference's, read from its frontend bundle and
//! binary (`evidence/terminal/NOTES.md`): `INSERT OR REPLACE INTO
//! terminal_sessions (…)` and `SELECT workspace_id, started_at, ended_at,
//! cwd, cols, rows, rehydrate_sequences, alternate_screen, bracketed_paste,
//! has_received_user_input FROM terminal_sessions WHERE session_id = ?`.
//! Times are ISO 8601 strings (`new Date().toISOString()` in the reference);
//! flags are 0/1. The reference always writes every column except `ended_at`
//! and `cwd`; a row missing one of them anyway reads back as empty or 0.

use sqlx::SqlitePool;

use crate::{exec, Result};

/// One `terminal_sessions` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct TerminalSession {
    pub session_id: String,
    pub workspace_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub cwd: Option<String>,
    pub cols: i64,
    pub rows: i64,
    pub rehydrate_sequences: String,
    pub alternate_screen: bool,
    pub bracketed_paste: bool,
    pub has_received_user_input: bool,
}

/// Insert or replace the row for `s.session_id`.
pub async fn upsert(pool: &SqlitePool, s: &TerminalSession) -> Result<()> {
    let q = sqlx::query(
        "INSERT OR REPLACE INTO terminal_sessions (session_id, workspace_id, started_at, \
         ended_at, cwd, cols, rows, rehydrate_sequences, alternate_screen, bracketed_paste, \
         has_received_user_input) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&s.session_id)
    .bind(&s.workspace_id)
    .bind(&s.started_at)
    .bind(&s.ended_at)
    .bind(&s.cwd)
    .bind(s.cols)
    .bind(s.rows)
    .bind(&s.rehydrate_sequences)
    .bind(s.alternate_screen)
    .bind(s.bracketed_paste)
    .bind(s.has_received_user_input);
    exec(q, pool).await.map(|_| ())
}

/// The row for `session_id`, if any.
pub async fn get(pool: &SqlitePool, session_id: &str) -> Result<Option<TerminalSession>> {
    Ok(sqlx::query_as::<_, TerminalSession>(
        "SELECT session_id, COALESCE(workspace_id, '') AS workspace_id, \
         COALESCE(started_at, '') AS started_at, ended_at, cwd, \
         COALESCE(cols, 0) AS cols, COALESCE(rows, 0) AS rows, \
         COALESCE(rehydrate_sequences, '') AS rehydrate_sequences, \
         COALESCE(alternate_screen, 0) AS alternate_screen, \
         COALESCE(bracketed_paste, 0) AS bracketed_paste, \
         COALESCE(has_received_user_input, 0) AS has_received_user_input \
         FROM terminal_sessions WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?)
}
