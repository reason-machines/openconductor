//! Review comments on diff lines (`diff_comments`), one row per comment.
//!
//! Columns follow the reference schema (`evidence/sqlite/conductor.schema.sql`,
//! REA evidence `ev_eebc0cee…`). Stored values follow an REA inspection of a
//! column-only snapshot of the reference's rows
//! (`evidence/sqlite/diff-comments-values.json`): `state` was always
//! `pending`; `location` was `file` or `modified`; a whole-file comment has
//! a NULL `line_number` (the snapshot's `file_level` column was computed as
//! `line_number IS NULL`, it is not a stored column). `base` (old side) and
//! `sent` were not observed and are our own.
//!
//! Replies point at their parent with `reply_to_comment_id` and share the
//! root's `thread_id`; resolving and deleting act on a whole thread.
//! `DEPRECATED_update_memory` is left NULL.

use sqlx::SqlitePool;

use crate::{exec, exec_one, Result};

/// Which side of the diff a comment is anchored to (`diff_comments.location`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum Location {
    /// New side of the diff (observed).
    Modified,
    /// Old side of the diff (ours; not observed).
    Base,
    /// The whole file (observed).
    File,
}

/// `diff_comments.state`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum State {
    /// Saved, not yet sent to the agent (observed, the only value seen).
    Pending,
    /// Added to the chat (ours).
    Sent,
}

/// One row of `diff_comments`, with NULL flags read as `false`.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct DiffComment {
    pub id: String,
    pub workspace_id: Option<String>,
    pub file_path: Option<String>,
    /// First line of the range; `None` for a whole-file comment.
    pub line_number: Option<i64>,
    /// Last line of a multi-line range; `None` for a single line.
    pub end_line_number: Option<i64>,
    pub body: Option<String>,
    pub state: Option<State>,
    pub location: Option<Location>,
    /// Milliseconds since the Unix epoch.
    pub created_at: i64,
    pub updated_at: Option<i64>,
    /// Set for comments synced from a GitHub pull request.
    pub remote_url: Option<String>,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub thread_id: Option<String>,
    pub reply_to_comment_id: Option<String>,
    pub is_outdated: bool,
    pub is_resolved: bool,
    /// Original code a GitHub suggestion replaces.
    pub suggestion_base_code: Option<String>,
}

impl DiffComment {
    pub fn is_file_level(&self) -> bool {
        self.line_number.is_none()
    }
}

const COLUMNS: &str = "id, workspace_id, file_path, line_number, end_line_number, body, \
    state, location, created_at, updated_at, remote_url, author, author_avatar_url, \
    thread_id, reply_to_comment_id, COALESCE(is_outdated, 0) AS is_outdated, \
    COALESCE(is_resolved, 0) AS is_resolved, suggestion_base_code";

/// Fields for a new local comment. A reply sets `reply_to` and inherits the
/// parent's thread; a root comment starts a thread named after its own id.
#[derive(Debug, Clone)]
pub struct NewDiffComment {
    pub id: String,
    pub workspace_id: String,
    pub file_path: String,
    /// `None` for a whole-file comment.
    pub line_number: Option<i64>,
    pub end_line_number: Option<i64>,
    pub body: String,
    pub location: Location,
    pub created_at: i64,
    pub author: Option<String>,
    pub reply_to: Option<String>,
}

/// Save a new pending comment and return the stored row.
pub async fn insert(pool: &SqlitePool, c: &NewDiffComment) -> Result<DiffComment> {
    let (line, end) = match c.line_number {
        None => (None, None),
        Some(start) => match c.end_line_number {
            Some(end) if end != start => (Some(start.min(end)), Some(start.max(end))),
            _ => (Some(start), None),
        },
    };
    sqlx::query(
        "INSERT INTO diff_comments (id, workspace_id, file_path, line_number, end_line_number, \
         body, state, location, created_at, author, reply_to_comment_id, thread_id, \
         is_outdated, is_resolved) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, \
         COALESCE((SELECT COALESCE(thread_id, id) FROM diff_comments WHERE id = ?11), ?1), 0, 0)",
    )
    .bind(&c.id)
    .bind(&c.workspace_id)
    .bind(&c.file_path)
    .bind(line)
    .bind(end)
    .bind(c.body.trim())
    .bind(State::Pending)
    .bind(c.location)
    .bind(c.created_at)
    .bind(&c.author)
    .bind(&c.reply_to)
    .execute(pool)
    .await?;
    get(pool, &c.id).await?.ok_or(crate::Error::NotFound)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<DiffComment>> {
    let sql = format!("SELECT {COLUMNS} FROM diff_comments WHERE id = ?");
    Ok(sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?)
}

/// Every comment in a workspace, oldest first.
pub async fn list_for_workspace(pool: &SqlitePool, workspace_id: &str) -> Result<Vec<DiffComment>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM diff_comments WHERE workspace_id = ? ORDER BY created_at, id"
    );
    Ok(sqlx::query_as(&sql)
        .bind(workspace_id)
        .fetch_all(pool)
        .await?)
}

/// Replace a comment's text and stamp `updated_at`.
pub async fn update_body(pool: &SqlitePool, id: &str, body: &str, now: i64) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE diff_comments SET body = ?, updated_at = ? WHERE id = ?")
            .bind(body.trim())
            .bind(now)
            .bind(id),
        pool,
    )
    .await
}

/// Resolve or reopen every comment in a thread. Returns rows changed.
pub async fn set_thread_resolved(
    pool: &SqlitePool,
    thread_id: &str,
    resolved: bool,
    now: i64,
) -> Result<u64> {
    exec(
        sqlx::query(
            "UPDATE diff_comments SET is_resolved = ?, updated_at = ? \
             WHERE COALESCE(thread_id, id) = ?",
        )
        .bind(resolved)
        .bind(now)
        .bind(thread_id),
        pool,
    )
    .await
}

/// Mark comments as added to the chat. Returns rows changed.
pub async fn mark_sent(pool: &SqlitePool, ids: &[String], now: i64) -> Result<u64> {
    let mut changed = 0;
    for id in ids {
        changed += exec(
            sqlx::query("UPDATE diff_comments SET state = ?, updated_at = ? WHERE id = ?")
                .bind(State::Sent)
                .bind(now)
                .bind(id),
            pool,
        )
        .await?;
    }
    Ok(changed)
}

/// Flag a comment whose anchored lines no longer exist in the diff.
pub async fn set_outdated(pool: &SqlitePool, id: &str, outdated: bool) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE diff_comments SET is_outdated = ? WHERE id = ?")
            .bind(outdated)
            .bind(id),
        pool,
    )
    .await
}

/// Delete a comment; deleting a thread's root deletes the whole thread.
/// Returns rows deleted.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<u64> {
    exec(
        sqlx::query(
            "DELETE FROM diff_comments WHERE id = ?1 \
             OR (COALESCE(thread_id, id) = ?1 \
                 AND EXISTS (SELECT 1 FROM diff_comments r WHERE r.id = ?1 \
                             AND r.reply_to_comment_id IS NULL))",
        )
        .bind(id),
        pool,
    )
    .await
}

/// Delete every comment in a workspace (when the workspace is deleted).
pub async fn delete_for_workspace(pool: &SqlitePool, workspace_id: &str) -> Result<u64> {
    exec(
        sqlx::query("DELETE FROM diff_comments WHERE workspace_id = ?").bind(workspace_id),
        pool,
    )
    .await
}
