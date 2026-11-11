//! Review comments on diff lines (`diff_comments`), one row per comment.
//!
//! Columns follow the reference schema (`evidence/sqlite/conductor.schema.sql`,
//! REA evidence `ev_eebc0cee…`). Stored values follow an REA inspection of a
//! column-only snapshot of the reference's rows
//! (`evidence/sqlite/diff-comments-values.json`): `state` was always
//! `pending`; `location` was `file` or `modified`; a whole-file comment has
//! a NULL `line_number` (the snapshot's `file_level` column was computed as
//! `line_number IS NULL`, it is not a stored column). The old side is
//! `original`, the value the reference's GitHub sync writes for a LEFT-side
//! thread (evidence/diff/comments-github.md); rows we wrote earlier as `base`
//! read as `original`. `sent` was not observed and is our own.
//!
//! Replies point at their parent with `reply_to_comment_id` and share the
//! root's `thread_id`; resolving and deleting act on a whole thread.
//! `DEPRECATED_update_memory` is left NULL.

use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::sqlite::{Sqlite, SqliteArgumentValue, SqliteTypeInfo, SqliteValueRef};
use sqlx::{Decode, Encode, SqlitePool, Type};

use crate::{exec, exec_one, Result};

/// Which side of the diff a comment is anchored to (`diff_comments.location`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Location {
    /// New side of the diff (observed).
    Modified,
    /// Old side of the diff (the reference's value; we used to write `base`).
    Original,
    /// The whole file (observed).
    File,
}

impl Location {
    pub fn as_str(self) -> &'static str {
        match self {
            Location::Modified => "modified",
            Location::Original => "original",
            Location::File => "file",
        }
    }

    /// A stored value; our earlier `base` is the old side.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "modified" => Some(Location::Modified),
            "original" | "base" => Some(Location::Original),
            "file" => Some(Location::File),
            _ => None,
        }
    }
}

impl Type<Sqlite> for Location {
    fn type_info() -> SqliteTypeInfo {
        <str as Type<Sqlite>>::type_info()
    }

    fn compatible(ty: &SqliteTypeInfo) -> bool {
        <str as Type<Sqlite>>::compatible(ty)
    }
}

impl<'q> Encode<'q, Sqlite> for Location {
    fn encode_by_ref(&self, buf: &mut Vec<SqliteArgumentValue<'q>>) -> Result<IsNull, BoxDynError> {
        <&str as Encode<'q, Sqlite>>::encode(self.as_str(), buf)
    }
}

impl<'r> Decode<'r, Sqlite> for Location {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, BoxDynError> {
        let s = <&str as Decode<'r, Sqlite>>::decode(value)?;
        Location::parse(s).ok_or_else(|| format!("unknown diff_comments.location: {s}").into())
    }
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

/// Replace a local inline anchor with absolute lines so repeated saves are idempotent.
pub async fn update_anchor(
    pool: &SqlitePool,
    workspace_id: &str,
    id: &str,
    line: i64,
    end: Option<i64>,
    now: i64,
) -> Result<u64> {
    exec(
        sqlx::query(
            "UPDATE diff_comments SET line_number = ?1, end_line_number = ?2, updated_at = ?3 \
             WHERE id = ?4 AND workspace_id = ?5 AND remote_url IS NULL \
             AND line_number IS NOT NULL AND COALESCE(location, 'modified') != 'file' \
             AND ?1 > 0 AND (?2 IS NULL OR ?2 >= ?1)",
        )
        .bind(line)
        .bind(end)
        .bind(now)
        .bind(id)
        .bind(workspace_id),
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

/// A comment read from the workspace's GitHub pull request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteDiffComment {
    /// `github-<thread>-<database id>` or `github-general-<database id>`.
    pub id: String,
    /// `None` for a comment on the PR as a whole.
    pub file_path: Option<String>,
    /// `None` for a whole-PR comment or an outdated thread.
    pub line_number: Option<i64>,
    pub end_line_number: Option<i64>,
    pub body: String,
    pub location: Location,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub remote_url: String,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub thread_id: Option<String>,
    pub reply_to_comment_id: Option<String>,
    pub is_outdated: bool,
    pub is_resolved: bool,
    pub suggestion_base_code: Option<String>,
}

/// Which half of a GitHub sync a set of ids covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteScope {
    /// Review-thread comments (`github-…`, not `github-general-…`).
    ReviewThreads,
    /// PR-level comments (`github-general-…`).
    General,
}

/// States the reference app's sync leaves alone (none of them is ours).
const SYNC_FROZEN_STATES: &str = "('hidden', 'reviewed', 'superseded')";

/// Insert new GitHub comments as `pending` and refresh the GitHub-owned
/// fields of ones already stored (text, anchor, avatar, outdated,
/// resolved, suggestion base), keeping their `state`, `created_at`,
/// author and thread links. Flags are written as 1 or NULL, as the
/// reference does. Returns how many rows were inserted or changed.
pub async fn upsert_remote(
    pool: &SqlitePool,
    workspace_id: &str,
    comments: &[RemoteDiffComment],
) -> Result<u64> {
    let sql = format!(
        "INSERT INTO diff_comments (id, workspace_id, file_path, line_number, end_line_number, \
         body, state, location, created_at, updated_at, remote_url, author, author_avatar_url, \
         thread_id, reply_to_comment_id, is_outdated, is_resolved, suggestion_base_code) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18) \
         ON CONFLICT(id) DO UPDATE SET file_path = excluded.file_path, \
           line_number = excluded.line_number, end_line_number = excluded.end_line_number, \
           body = excluded.body, updated_at = excluded.updated_at, location = excluded.location, \
           author_avatar_url = excluded.author_avatar_url, is_outdated = excluded.is_outdated, \
           is_resolved = excluded.is_resolved, suggestion_base_code = excluded.suggestion_base_code \
         WHERE diff_comments.workspace_id IS excluded.workspace_id \
           AND (diff_comments.state IS NULL OR diff_comments.state NOT IN {SYNC_FROZEN_STATES}) \
           AND (diff_comments.file_path IS NOT excluded.file_path \
             OR diff_comments.line_number IS NOT excluded.line_number \
             OR diff_comments.end_line_number IS NOT excluded.end_line_number \
             OR diff_comments.body IS NOT excluded.body \
             OR diff_comments.updated_at IS NOT excluded.updated_at \
             OR diff_comments.location IS NOT excluded.location \
             OR diff_comments.author_avatar_url IS NOT excluded.author_avatar_url \
             OR diff_comments.is_outdated IS NOT excluded.is_outdated \
             OR diff_comments.is_resolved IS NOT excluded.is_resolved \
             OR diff_comments.suggestion_base_code IS NOT excluded.suggestion_base_code)"
    );
    let flag = |b: bool| b.then_some(1_i64);
    let mut changed = 0;
    for c in comments {
        changed += exec(
            sqlx::query(&sql)
                .bind(&c.id)
                .bind(workspace_id)
                .bind(&c.file_path)
                .bind(c.line_number)
                .bind(c.end_line_number)
                .bind(&c.body)
                .bind(State::Pending)
                .bind(c.location)
                .bind(c.created_at)
                .bind(c.updated_at)
                .bind(&c.remote_url)
                .bind(&c.author)
                .bind(&c.author_avatar_url)
                .bind(&c.thread_id)
                .bind(&c.reply_to_comment_id)
                .bind(flag(c.is_outdated))
                .bind(flag(c.is_resolved))
                .bind(&c.suggestion_base_code),
            pool,
        )
        .await?;
    }
    Ok(changed)
}

/// Delete a workspace's GitHub comments in `scope` that GitHub no longer
/// returned (`current` holds the ids it did). Local comments are never
/// touched. Returns rows deleted.
pub async fn delete_missing_remote(
    pool: &SqlitePool,
    workspace_id: &str,
    scope: RemoteScope,
    current: &[String],
) -> Result<u64> {
    let (pattern, exclude_general) = match scope {
        RemoteScope::ReviewThreads => ("github-%", true),
        RemoteScope::General => ("github-general-%", false),
    };
    let keep = if current.is_empty() {
        String::new()
    } else {
        format!(" AND id NOT IN ({})", vec!["?"; current.len()].join(", "))
    };
    let general = if exclude_general {
        " AND id NOT LIKE 'github-general-%'"
    } else {
        ""
    };
    let sql = format!(
        "DELETE FROM diff_comments WHERE workspace_id = ? AND id LIKE ? \
         AND (state IS NULL OR state <> 'superseded'){general}{keep}"
    );
    let mut q = sqlx::query(&sql).bind(workspace_id).bind(pattern);
    for id in current {
        q = q.bind(id);
    }
    exec(q, pool).await
}

/// Delete every comment in a workspace (when the workspace is deleted).
pub async fn delete_for_workspace(pool: &SqlitePool, workspace_id: &str) -> Result<u64> {
    exec(
        sqlx::query("DELETE FROM diff_comments WHERE workspace_id = ?").bind(workspace_id),
        pool,
    )
    .await
}
