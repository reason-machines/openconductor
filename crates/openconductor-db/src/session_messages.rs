//! Chat messages (`session_messages`) in `conductor.db`.
//!
//! Every statement is a SQL string literal from the reference app's decoded
//! frontend bundle (Conductor 0.87.6, `assets/index-BGEQ8YjU.js`).
//!
//! A message moves through three states, all encoded in timestamps:
//! - **queued**: `sent_at IS NULL AND cancelled_at IS NULL`; the user typed
//!   it while the agent was busy. Queued messages are ordered by
//!   `COALESCE(queue_order, 0), created_at, id`; a new one takes
//!   `MAX(queue_order) + 1` among the queue ([`next_queue_order`]).
//! - **sent**: `sent_at` set; part of the transcript, ordered by `sent_at`.
//!   A user message's `turn_id` is its own id; assistant messages carry the
//!   turn they answer.
//! - **cancelled**: `cancelled_at` set. The reference reads this state (turn
//!   lookups treat it like sent, the queue excludes it) but no statement in
//!   0.87.6 writes `cancelled_at`, so this module has no writer for it either.
//!
//! The reference pages the transcript only in its `cache.db` mirror
//! (keyset on `(sent_at, rowid)`); against `conductor.db` it reads the whole
//! settled transcript or its tail with `LIMIT -1 OFFSET ?`
//! ([`list_sent_from`]), and uses `MAX(rowid)` of sent rows as a revision.

use sqlx::SqlitePool;

use crate::{exec, exec_one, Result};

/// `last_assistant_message_id` stored on every message of a session after
/// the conversation was compacted (reference constant `sy`).
pub const COMPACTED: &str = "compacted";

/// One row of `session_messages`. `is_resumable_message` is stored as 1 or
/// NULL and read as `true` only when 1 (reference `yie`).
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SessionMessage {
    pub id: String,
    pub session_id: Option<String>,
    /// `user` or `assistant`.
    pub role: Option<String>,
    pub content: Option<String>,
    pub created_at: String,
    pub sent_at: Option<String>,
    pub full_message: Option<String>,
    pub cancelled_at: Option<String>,
    pub model: Option<String>,
    pub sdk_message_id: Option<String>,
    pub last_assistant_message_id: Option<String>,
    pub turn_id: Option<String>,
    pub is_resumable_message: bool,
    pub queue_order: Option<i64>,
    pub sender_id: Option<String>,
    pub sender_session_id: Option<String>,
    pub sender_api_key_name: Option<String>,
}

impl SessionMessage {
    pub fn is_queued(&self) -> bool {
        self.sent_at.is_none() && self.cancelled_at.is_none()
    }
}

const COLUMNS: &str = "id, session_id, role, content, created_at, sent_at, full_message, \
    cancelled_at, model, sdk_message_id, last_assistant_message_id, turn_id, \
    is_resumable_message IS 1 AS is_resumable_message, queue_order, sender_id, \
    sender_session_id, sender_api_key_name";

/// A message to insert. `sent_at = None` stores a queued message; give it
/// a `queue_order` from [`next_queue_order`].
#[derive(Debug, Clone, Default)]
pub struct NewMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub sent_at: Option<String>,
    pub created_at: String,
    pub full_message: Option<String>,
    pub model: Option<String>,
    pub sdk_message_id: Option<String>,
    pub turn_id: Option<String>,
    pub last_assistant_message_id: Option<String>,
    /// Stored as 1, or NULL when false.
    pub is_resumable_message: bool,
    pub queue_order: Option<i64>,
    pub sender_id: Option<String>,
    pub sender_session_id: Option<String>,
    pub sender_api_key_name: Option<String>,
}

const INSERT: &str = "INSERT INTO session_messages ( \
    id, session_id, role, content, sent_at, created_at, full_message, model, sdk_message_id, \
    turn_id, last_assistant_message_id, is_resumable_message, queue_order, sender_id, \
    sender_session_id, sender_api_key_name \
    ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )";

fn bind_new<'a>(sql: &'a str, m: &'a NewMessage) -> crate::Query<'a> {
    sqlx::query(sql)
        .bind(&m.id)
        .bind(&m.session_id)
        .bind(&m.role)
        .bind(&m.content)
        .bind(&m.sent_at)
        .bind(&m.created_at)
        .bind(&m.full_message)
        .bind(&m.model)
        .bind(&m.sdk_message_id)
        .bind(&m.turn_id)
        .bind(&m.last_assistant_message_id)
        .bind(m.is_resumable_message.then_some(1_i64))
        .bind(m.queue_order)
        .bind(&m.sender_id)
        .bind(&m.sender_session_id)
        .bind(&m.sender_api_key_name)
}

pub async fn insert(pool: &SqlitePool, m: &NewMessage) -> Result<()> {
    exec(bind_new(INSERT, m), pool).await?;
    Ok(())
}

/// Insert, or update an existing row's `content`, `sent_at`, `turn_id` and
/// `queue_order` when it has the same session and role. Returns rows
/// changed (0 when the id belongs to another session or role).
pub async fn upsert(pool: &SqlitePool, m: &NewMessage) -> Result<u64> {
    let sql = format!(
        "{INSERT} ON CONFLICT(id) DO UPDATE SET content = excluded.content, \
         sent_at = excluded.sent_at, turn_id = excluded.turn_id, \
         queue_order = excluded.queue_order \
         WHERE session_messages.session_id = excluded.session_id \
         AND session_messages.role = excluded.role"
    );
    exec(bind_new(&sql, m), pool).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<SessionMessage>> {
    let sql = format!("SELECT {COLUMNS} FROM session_messages WHERE id = ? LIMIT 1");
    Ok(sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?)
}

/// The settled transcript: sent messages by `sent_at`.
pub async fn list_sent(pool: &SqlitePool, session_id: &str) -> Result<Vec<SessionMessage>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM session_messages WHERE session_id = ? AND sent_at IS NOT NULL \
         ORDER BY sent_at"
    );
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .fetch_all(pool)
        .await?)
}

/// The settled transcript after its first `offset` rows (the tail the
/// reference reads when it already holds `offset` settled messages).
pub async fn list_sent_from(
    pool: &SqlitePool,
    session_id: &str,
    offset: i64,
) -> Result<Vec<SessionMessage>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM session_messages WHERE session_id = ? AND sent_at IS NOT NULL \
         ORDER BY sent_at LIMIT -1 OFFSET ?"
    );
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .bind(offset)
        .fetch_all(pool)
        .await?)
}

/// Highest rowid among sent messages, 0 when none; changes whenever a
/// message is settled.
pub async fn transcript_revision(pool: &SqlitePool, session_id: &str) -> Result<i64> {
    let (rev,): (i64,) = sqlx::query_as(
        "SELECT COALESCE(( SELECT MAX(rowid) FROM session_messages \
         WHERE session_id = ? AND sent_at IS NOT NULL ), 0) AS transcript_revision",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?;
    Ok(rev)
}

/// Queued messages, next to send first.
pub async fn list_queued(pool: &SqlitePool, session_id: &str) -> Result<Vec<SessionMessage>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM session_messages WHERE session_id = ? AND sent_at IS NULL \
         AND cancelled_at IS NULL ORDER BY COALESCE(queue_order, 0), created_at, id"
    );
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .fetch_all(pool)
        .await?)
}

/// `queue_order` for a newly queued message: one past the queue's maximum.
pub async fn next_queue_order(pool: &SqlitePool, session_id: &str) -> Result<i64> {
    let (next,): (i64,) = sqlx::query_as(
        "SELECT COALESCE(MAX(queue_order), 0) + 1 AS next FROM session_messages \
         WHERE session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?;
    Ok(next)
}

/// Queued user messages, the session's context tokens and model in one read.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct QueueState {
    pub queued_message_count: i64,
    pub context_token_count: i64,
    pub model: Option<String>,
}

pub async fn queue_state(pool: &SqlitePool, session_id: &str) -> Result<QueueState> {
    Ok(sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND role = 'user' \
         AND sent_at IS NULL AND cancelled_at IS NULL) AS queued_message_count, \
         COALESCE((SELECT context_token_count FROM sessions WHERE id = ?), 0) \
         AS context_token_count, (SELECT model FROM sessions WHERE id = ?) AS model",
    )
    .bind(session_id)
    .bind(session_id)
    .bind(session_id)
    .fetch_one(pool)
    .await?)
}

/// Promote a queued message to sent. With `expected_content`, only when its
/// content still matches. False when it was already sent or cancelled, or
/// the content changed.
pub async fn mark_sent(
    pool: &SqlitePool,
    session_id: &str,
    id: &str,
    sent_at: &str,
    last_assistant_message_id: Option<&str>,
    turn_id: &str,
    expected_content: Option<&str>,
) -> Result<bool> {
    let guard = if expected_content.is_some() {
        " AND content = ?"
    } else {
        ""
    };
    let sql = format!(
        "UPDATE session_messages SET sent_at = ?, last_assistant_message_id = ?, turn_id = ? \
         WHERE id = ? AND session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL{guard}"
    );
    let mut q = sqlx::query(&sql)
        .bind(sent_at)
        .bind(last_assistant_message_id)
        .bind(turn_id)
        .bind(id)
        .bind(session_id);
    if let Some(content) = expected_content {
        q = q.bind(content);
    }
    Ok(exec(q, pool).await? > 0)
}

/// Put a sent message back at the end of the queue, if it is still the one
/// sent at `sent_at`. False otherwise.
pub async fn requeue(pool: &SqlitePool, session_id: &str, id: &str, sent_at: &str) -> Result<bool> {
    let q = sqlx::query(
        "UPDATE session_messages SET sent_at = NULL, turn_id = NULL, \
         last_assistant_message_id = NULL, queue_order = ( \
         SELECT COALESCE(MAX(queue_order), 0) + 1 FROM session_messages \
         WHERE session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL ) \
         WHERE id = ? AND session_id = ? AND sent_at = ? AND cancelled_at IS NULL",
    )
    .bind(session_id)
    .bind(id)
    .bind(session_id)
    .bind(sent_at);
    Ok(exec(q, pool).await? > 0)
}

/// Drop the `queue_order` of the given messages if it still equals
/// `queue_order`. Returns rows changed.
pub async fn clear_queue_order(
    pool: &SqlitePool,
    session_id: &str,
    ids: &[String],
    queue_order: i64,
) -> Result<u64> {
    let ids_json = json_string_array(ids);
    exec(
        sqlx::query(
            "UPDATE session_messages SET queue_order = NULL WHERE session_id = ? \
             AND id IN (SELECT value FROM json_each(?)) AND queue_order = ?",
        )
        .bind(session_id)
        .bind(ids_json)
        .bind(queue_order),
        pool,
    )
    .await
}

/// Replace a message's content and turn.
pub async fn update_content(
    pool: &SqlitePool,
    session_id: &str,
    id: &str,
    content: &str,
    turn_id: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query(
            "UPDATE session_messages SET content = ?, turn_id = ? WHERE id = ? AND session_id = ?",
        )
        .bind(content)
        .bind(turn_id)
        .bind(id)
        .bind(session_id),
        pool,
    )
    .await
}

/// Make a sent user message with no turn the start of its own turn.
pub async fn adopt_own_turn(pool: &SqlitePool, session_id: &str, id: &str) -> Result<bool> {
    let q = sqlx::query(
        "UPDATE session_messages SET turn_id = id WHERE id = ? AND session_id = ? \
         AND role = 'user' AND sent_at IS NOT NULL AND turn_id IS NULL",
    )
    .bind(id)
    .bind(session_id);
    Ok(exec(q, pool).await? > 0)
}

/// After compaction, point every message's `last_assistant_message_id` at
/// [`COMPACTED`]. Returns rows changed.
pub async fn mark_compacted(pool: &SqlitePool, session_id: &str) -> Result<u64> {
    exec(
        sqlx::query(
            "UPDATE session_messages SET last_assistant_message_id = ? WHERE session_id = ?",
        )
        .bind(COMPACTED)
        .bind(session_id),
        pool,
    )
    .await
}

/// Delete messages sent or cancelled after `watermark` (reverting a chat to
/// a checkpoint). Returns rows deleted.
pub async fn delete_after(pool: &SqlitePool, session_id: &str, watermark: &str) -> Result<u64> {
    exec(
        sqlx::query(
            "DELETE FROM session_messages WHERE session_id = ? \
             AND COALESCE(sent_at, cancelled_at) > ?",
        )
        .bind(session_id)
        .bind(watermark),
        pool,
    )
    .await
}

/// The SDK message id of the latest sent assistant message: what a resumed
/// agent continues from.
pub async fn latest_assistant_sdk_message_id(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT sdk_message_id FROM session_messages WHERE session_id = ? \
         AND role = 'assistant' AND sdk_message_id IS NOT NULL AND sent_at IS NOT NULL \
         ORDER BY sent_at DESC, created_at DESC LIMIT 1",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(id,)| id))
}

/// The assistant message already stored for an SDK message id.
pub async fn assistant_id_by_sdk_message_id(
    pool: &SqlitePool,
    session_id: &str,
    sdk_message_id: &str,
) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM session_messages WHERE session_id = ? AND role = 'assistant' \
         AND sdk_message_id = ? LIMIT 1",
    )
    .bind(session_id)
    .bind(sdk_message_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(id,)| id))
}

/// The assistant message already stored with this content in this turn.
pub async fn assistant_id_by_turn_content(
    pool: &SqlitePool,
    session_id: &str,
    turn_id: &str,
    content: &str,
) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM session_messages WHERE session_id = ? AND role = 'assistant' \
         AND turn_id = ? AND content = ? LIMIT 1",
    )
    .bind(session_id)
    .bind(turn_id)
    .bind(content)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(id,)| id))
}

/// The current turn: the turn of the most recently sent or cancelled user
/// message.
pub async fn current_turn_id(pool: &SqlitePool, session_id: &str) -> Result<Option<String>> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT turn_id AS id FROM session_messages WHERE session_id = ? AND role = 'user' \
         AND (sent_at IS NOT NULL OR cancelled_at IS NOT NULL) \
         ORDER BY COALESCE(sent_at, cancelled_at) DESC LIMIT 1",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|(id,)| id))
}

/// Whether a user turn with this id has been sent or cancelled.
pub async fn turn_exists(pool: &SqlitePool, session_id: &str, turn_id: &str) -> Result<bool> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT turn_id AS id FROM session_messages WHERE session_id = ? AND role = 'user' \
         AND turn_id = ? AND (sent_at IS NOT NULL OR cancelled_at IS NOT NULL) LIMIT 1",
    )
    .bind(session_id)
    .bind(turn_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

fn json_string_array(items: &[String]) -> String {
    let mut out = String::from("[");
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('"');
        for c in s.chars() {
            match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                c => out.push(c),
            }
        }
        out.push('"');
    }
    out.push(']');
    out
}
