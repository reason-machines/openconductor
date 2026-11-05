//! The composer outbox: messages waiting to be delivered to an agent
//! (`session_messages_outbox`), the attachments each must upload first
//! (`session_assets_outbox`), and whether a session's queue is paused
//! (`session_messages_outbox_state`).
//!
//! Statements, states and the retry rule are the reference's (frontend
//! bundle `index-BGEQ8YjU.js`, offsets 2309300-2317100 for the data access,
//! 2369156 for the retry constants, 2372260-2385000 for the drainer, 2379047
//! for the pause state; `evidence/persistence/sql-literals-remaining-tables.txt`):
//!
//! - messages are listed `ORDER BY COALESCE(queue_order, 0) ASC, created_at
//!   ASC, message_id ASC`, per session or overall, and enqueued with `INSERT
//!   OR IGNORE` after their assets (also `INSERT OR IGNORE`);
//! - updates set only the given columns, plus `updated_at`, in a fixed order
//!   (`UPDATE … SET <col> = ?, … WHERE message_id = ?`); an empty patch
//!   writes nothing;
//! - a message whose `delivery_payload`, `config` or `asset_ids` JSON cannot
//!   be read is treated as `failed`; an unknown `state` reads as `failed`;
//!   any `mode` other than `steer` reads as `queue`;
//! - delivery is retried up to [`MAX_SEND_ATTEMPTS`] times with
//!   [`retry_delay_ms`] (2 s doubling, capped at 60 s) stored as
//!   `next_send_attempt_at`; the drainer picks due messages in memory, so
//!   there is no "claim" statement: claiming is [`mark_sending`].
//!
//! JSON columns are stored and returned as text. Times are ISO 8601 strings
//! (`toISOString()`), passed in as milliseconds since the Unix epoch.

use sqlx::SqlitePool;

use crate::{exec, iso_time, Result};

/// After this many failed attempts a message fails for good (`Qle = 20`).
pub const MAX_SEND_ATTEMPTS: i64 = 20;
/// First retry delay (`initialDelayMs: 2e3`).
pub const RETRY_INITIAL_DELAY_MS: i64 = 2_000;
/// Longest retry delay (`maxDelayMs: 6e4`).
pub const RETRY_MAX_DELAY_MS: i64 = 60_000;

/// Delay before retry number `attempt` (1-based):
/// `min(max, initial * 2^max(0, attempt - 1))`.
pub fn retry_delay_ms(attempt: i64) -> i64 {
    let doublings = (attempt - 1).clamp(0, 62) as u32;
    RETRY_INITIAL_DELAY_MS
        .saturating_mul(2_i64.saturating_pow(doublings))
        .min(RETRY_MAX_DELAY_MS)
}

/// `session_messages_outbox.state`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageState {
    /// Held until the workspace is ready.
    Waiting,
    /// Attachments still uploading.
    Uploading,
    /// Due for delivery (at `next_send_attempt_at` if set).
    Ready,
    /// Being delivered.
    Sending,
    Cancelling,
    Failed,
}

impl MessageState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::Uploading => "uploading",
            Self::Ready => "ready",
            Self::Sending => "sending",
            Self::Cancelling => "cancelling",
            Self::Failed => "failed",
        }
    }

    /// Unknown values read as `Failed`, as in the reference.
    pub fn parse(s: &str) -> Self {
        match s {
            "waiting" => Self::Waiting,
            "uploading" => Self::Uploading,
            "ready" => Self::Ready,
            "sending" => Self::Sending,
            "cancelling" => Self::Cancelling,
            _ => Self::Failed,
        }
    }
}

/// `session_messages_outbox.mode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Delivered after the agent's current turn.
    Queue,
    /// Delivered into the running turn.
    Steer,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queue => "queue",
            Self::Steer => "steer",
        }
    }

    /// Anything but `steer` reads as `Queue`, as in the reference.
    pub fn parse(s: &str) -> Self {
        if s == "steer" {
            Self::Steer
        } else {
            Self::Queue
        }
    }
}

/// `session_assets_outbox.state`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetState {
    /// Not uploaded yet (shown as "uploading").
    Pending,
    Uploaded,
    Failed,
}

impl AssetState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Uploaded => "uploaded",
            Self::Failed => "failed",
        }
    }

    /// Unknown values read as `Failed`, as in the reference.
    pub fn parse(s: &str) -> Self {
        match s {
            "pending" => Self::Pending,
            "uploaded" => Self::Uploaded,
            _ => Self::Failed,
        }
    }
}

/// One queued message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboxMessage {
    pub message_id: String,
    pub session_id: Option<String>,
    /// JSON object (`{message, agentMessage?, attachments?, attachmentIds?}`).
    pub delivery_payload: Option<String>,
    /// JSON object (e.g. `{overrideModel}`).
    pub config: Option<String>,
    pub mode: Mode,
    /// JSON array of asset ids.
    pub asset_ids: Option<String>,
    pub queue_order: Option<i64>,
    /// `Failed` when the stored state is unknown or [`Self::readable`] is false.
    pub state: MessageState,
    pub send_attempt_count: i64,
    pub next_send_attempt_at: Option<String>,
    /// Serialized error JSON.
    pub last_error: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    /// Whether `delivery_payload` and `config` are JSON objects and
    /// `asset_ids` a JSON array.
    pub readable: bool,
}

#[derive(sqlx::FromRow)]
struct MessageRow {
    message_id: String,
    session_id: Option<String>,
    delivery_payload: Option<String>,
    config: Option<String>,
    mode: Option<String>,
    asset_ids: Option<String>,
    queue_order: Option<i64>,
    state: Option<String>,
    send_attempt_count: i64,
    next_send_attempt_at: Option<String>,
    last_error: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    readable: bool,
}

impl From<MessageRow> for OutboxMessage {
    fn from(r: MessageRow) -> Self {
        let state = match (r.readable, r.state.as_deref()) {
            (true, Some(s)) => MessageState::parse(s),
            _ => MessageState::Failed,
        };
        Self {
            message_id: r.message_id,
            session_id: r.session_id,
            delivery_payload: r.delivery_payload,
            config: r.config,
            mode: Mode::parse(r.mode.as_deref().unwrap_or_default()),
            asset_ids: r.asset_ids,
            queue_order: r.queue_order,
            state,
            send_attempt_count: r.send_attempt_count,
            next_send_attempt_at: r.next_send_attempt_at,
            last_error: r.last_error,
            created_at: r.created_at,
            updated_at: r.updated_at,
            readable: r.readable,
        }
    }
}

const MESSAGE_COLUMNS: &str = "message_id, session_id, delivery_payload, config, mode, \
    asset_ids, queue_order, state, COALESCE(send_attempt_count, 0) AS send_attempt_count, \
    next_send_attempt_at, last_error, created_at, updated_at, \
    CASE WHEN json_valid(delivery_payload) AND json_valid(config) AND json_valid(asset_ids) \
    THEN json_type(delivery_payload) = 'object' AND json_type(config) = 'object' \
    AND json_type(asset_ids) = 'array' ELSE 0 END AS readable";

const MESSAGE_ORDER: &str = "ORDER BY COALESCE(queue_order, 0) ASC, created_at ASC, message_id ASC";

/// A message to enqueue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewMessage {
    pub message_id: String,
    pub session_id: String,
    pub delivery_payload: String,
    pub config: String,
    pub mode: Mode,
    pub asset_ids: String,
    pub queue_order: Option<i64>,
    pub state: MessageState,
    pub send_attempt_count: i64,
    pub next_send_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
}

/// An attachment a message must upload before delivery.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewAsset {
    pub attachment_id: String,
    pub source_ref: Option<String>,
    pub original_name: Option<String>,
    pub asset_id: Option<String>,
    pub relative_path: Option<String>,
    /// Already uploaded (`uploaded`) rather than `pending`.
    pub uploaded: bool,
}

/// Enqueue `message` and its `assets` (assets first, both `INSERT OR
/// IGNORE`). Returns `false` when a message with that id already existed,
/// which the reference then checks belongs to the same session.
pub async fn enqueue(
    pool: &SqlitePool,
    message: &NewMessage,
    assets: &[NewAsset],
    now_ms: i64,
) -> Result<bool> {
    insert_assets(pool, &message.message_id, assets, now_ms, false).await?;
    let q = sqlx::query(
        "INSERT OR IGNORE INTO session_messages_outbox ( message_id, session_id, \
         delivery_payload, config, mode, asset_ids, queue_order, state, send_attempt_count, \
         next_send_attempt_at, last_error, created_at, updated_at ) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&message.message_id)
    .bind(&message.session_id)
    .bind(&message.delivery_payload)
    .bind(&message.config)
    .bind(message.mode.as_str())
    .bind(&message.asset_ids)
    .bind(message.queue_order)
    .bind(message.state.as_str())
    .bind(message.send_attempt_count)
    .bind(&message.next_send_attempt_at)
    .bind(&message.last_error)
    .bind(&message.created_at)
    .bind(iso_time::from_millis(now_ms));
    Ok(exec(q, pool).await? != 0)
}

/// `session_id`'s queued messages in delivery order.
pub async fn list_for_session(pool: &SqlitePool, session_id: &str) -> Result<Vec<OutboxMessage>> {
    let rows = sqlx::query_as::<_, MessageRow>(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM session_messages_outbox WHERE session_id = ? {MESSAGE_ORDER}"
    ))
    .bind(session_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

/// Every queued message in delivery order.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<OutboxMessage>> {
    let rows = sqlx::query_as::<_, MessageRow>(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM session_messages_outbox {MESSAGE_ORDER}"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

/// The message with `message_id`, if queued.
pub async fn get(pool: &SqlitePool, message_id: &str) -> Result<Option<OutboxMessage>> {
    let row = sqlx::query_as::<_, MessageRow>(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM session_messages_outbox WHERE message_id = ?"
    ))
    .bind(message_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(Into::into))
}

/// Columns to change on a message; `None` leaves a column alone. For
/// nullable columns `Some(None)` writes NULL.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MessagePatch {
    pub delivery_payload: Option<String>,
    pub config: Option<String>,
    pub mode: Option<Mode>,
    pub asset_ids: Option<String>,
    pub queue_order: Option<i64>,
    pub state: Option<MessageState>,
    pub send_attempt_count: Option<i64>,
    pub next_send_attempt_at: Option<Option<String>>,
    pub last_error: Option<Option<String>>,
}

/// Apply `patch` to `message_id` and stamp `updated_at`; an empty patch
/// writes nothing. A missing row is not an error.
pub async fn update_message(
    pool: &SqlitePool,
    message_id: &str,
    patch: &MessagePatch,
    now_ms: i64,
) -> Result<()> {
    let mut set = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    let mut col = |name: &'static str, v: Value| {
        set.push(name);
        values.push(v);
    };
    if let Some(v) = &patch.delivery_payload {
        col("delivery_payload", Value::Text(Some(v.clone())));
    }
    if let Some(v) = &patch.config {
        col("config", Value::Text(Some(v.clone())));
    }
    if let Some(v) = patch.mode {
        col("mode", Value::Text(Some(v.as_str().into())));
    }
    if let Some(v) = &patch.asset_ids {
        col("asset_ids", Value::Text(Some(v.clone())));
    }
    if let Some(v) = patch.queue_order {
        col("queue_order", Value::Int(v));
    }
    if let Some(v) = patch.state {
        col("state", Value::Text(Some(v.as_str().into())));
    }
    if let Some(v) = patch.send_attempt_count {
        col("send_attempt_count", Value::Int(v));
    }
    if let Some(v) = &patch.next_send_attempt_at {
        col("next_send_attempt_at", Value::Text(v.clone()));
    }
    if let Some(v) = &patch.last_error {
        col("last_error", Value::Text(v.clone()));
    }
    update(
        pool,
        "session_messages_outbox",
        "message_id",
        message_id,
        set,
        values,
        now_ms,
    )
    .await
}

enum Value {
    Text(Option<String>),
    Int(i64),
}

async fn update(
    pool: &SqlitePool,
    table: &str,
    key: &str,
    id: &str,
    mut set: Vec<&'static str>,
    values: Vec<Value>,
    now_ms: i64,
) -> Result<()> {
    if set.is_empty() {
        return Ok(());
    }
    set.push("updated_at");
    let assignments: Vec<String> = set.iter().map(|c| format!("{c} = ?")).collect();
    let sql = format!(
        "UPDATE {table} SET {} WHERE {key} = ?",
        assignments.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for v in values {
        q = match v {
            Value::Text(t) => q.bind(t),
            Value::Int(i) => q.bind(i),
        };
    }
    let q = q.bind(iso_time::from_millis(now_ms)).bind(id);
    exec(q, pool).await.map(|_| ())
}

/// Claim `message` for delivery: `sending`, with at least one attempt
/// counted (`sendAttemptCount: Math.max(1, …)`).
pub async fn mark_sending(pool: &SqlitePool, message: &OutboxMessage, now_ms: i64) -> Result<()> {
    let patch = MessagePatch {
        state: Some(MessageState::Sending),
        send_attempt_count: Some(message.send_attempt_count.max(1)),
        ..Default::default()
    };
    update_message(pool, &message.message_id, &patch, now_ms).await
}

/// Record a failed delivery of `message` with `error` (serialized error
/// JSON): one more attempt; at [`MAX_SEND_ATTEMPTS`] it is `failed` with no
/// next attempt, otherwise `ready` again at `now + retry_delay_ms(attempt)`.
/// Returns the new state.
pub async fn record_send_failure(
    pool: &SqlitePool,
    message: &OutboxMessage,
    error: &str,
    now_ms: i64,
) -> Result<MessageState> {
    let attempt = message.send_attempt_count + 1;
    let terminal = attempt >= MAX_SEND_ATTEMPTS;
    let state = if terminal {
        MessageState::Failed
    } else {
        MessageState::Ready
    };
    let next = (!terminal).then(|| iso_time::from_millis(now_ms + retry_delay_ms(attempt)));
    let patch = MessagePatch {
        state: Some(state),
        send_attempt_count: Some(attempt),
        last_error: Some(Some(error.to_owned())),
        next_send_attempt_at: Some(next),
        ..Default::default()
    };
    update_message(pool, &message.message_id, &patch, now_ms).await?;
    Ok(state)
}

/// Retry `message_id` from scratch (the user's "retry"): `ready`, no
/// attempts, no scheduled attempt, no error.
pub async fn retry(pool: &SqlitePool, message_id: &str, now_ms: i64) -> Result<()> {
    let patch = MessagePatch {
        state: Some(MessageState::Ready),
        send_attempt_count: Some(0),
        next_send_attempt_at: Some(None),
        last_error: Some(None),
        ..Default::default()
    };
    update_message(pool, message_id, &patch, now_ms).await
}

/// Delete `message_id` and its assets.
pub async fn delete_message(pool: &SqlitePool, message_id: &str) -> Result<()> {
    exec(
        sqlx::query("DELETE FROM session_assets_outbox WHERE message_id = ?").bind(message_id),
        pool,
    )
    .await?;
    exec(
        sqlx::query("DELETE FROM session_messages_outbox WHERE message_id = ?").bind(message_id),
        pool,
    )
    .await
    .map(|_| ())
}

/// Delete several messages and their assets.
pub async fn delete_messages(pool: &SqlitePool, message_ids: &[String]) -> Result<()> {
    if message_ids.is_empty() {
        return Ok(());
    }
    let marks = vec!["?"; message_ids.len()].join(",");
    for table in ["session_assets_outbox", "session_messages_outbox"] {
        let sql = format!("DELETE FROM {table} WHERE message_id IN ({marks})");
        let mut q = sqlx::query(&sql);
        for id in message_ids {
            q = q.bind(id);
        }
        exec(q, pool).await?;
    }
    Ok(())
}

/// One attachment row, with the `comment_id` of its `attachments` row (a
/// diff comment's screenshot, say).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboxAsset {
    pub attachment_id: String,
    pub comment_id: Option<String>,
    pub message_id: Option<String>,
    pub source_ref: Option<String>,
    pub original_name: Option<String>,
    pub asset_id: Option<String>,
    pub relative_path: Option<String>,
    pub state: AssetState,
    pub upload_attempt_count: i64,
    pub next_upload_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct AssetRow {
    attachment_id: String,
    comment_id: Option<String>,
    message_id: Option<String>,
    source_ref: Option<String>,
    original_name: Option<String>,
    asset_id: Option<String>,
    relative_path: Option<String>,
    state: Option<String>,
    upload_attempt_count: i64,
    next_upload_attempt_at: Option<String>,
    last_error: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

/// `message_id`'s attachments, oldest first.
pub async fn assets_for_message(pool: &SqlitePool, message_id: &str) -> Result<Vec<OutboxAsset>> {
    let rows = sqlx::query_as::<_, AssetRow>(
        "SELECT session_assets_outbox.attachment_id, attachments.comment_id, \
         session_assets_outbox.message_id, session_assets_outbox.source_ref, \
         session_assets_outbox.original_name, session_assets_outbox.asset_id, \
         session_assets_outbox.relative_path, session_assets_outbox.state, \
         COALESCE(session_assets_outbox.upload_attempt_count, 0) AS upload_attempt_count, \
         session_assets_outbox.next_upload_attempt_at, session_assets_outbox.last_error, \
         session_assets_outbox.created_at, session_assets_outbox.updated_at \
         FROM session_assets_outbox \
         LEFT JOIN attachments ON attachments.id = session_assets_outbox.attachment_id \
         WHERE session_assets_outbox.message_id = ? \
         ORDER BY session_assets_outbox.created_at ASC, session_assets_outbox.attachment_id ASC",
    )
    .bind(message_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| OutboxAsset {
            attachment_id: r.attachment_id,
            comment_id: r.comment_id,
            message_id: r.message_id,
            source_ref: r.source_ref,
            original_name: r.original_name,
            asset_id: r.asset_id,
            relative_path: r.relative_path,
            state: AssetState::parse(r.state.as_deref().unwrap_or_default()),
            upload_attempt_count: r.upload_attempt_count,
            next_upload_attempt_at: r.next_upload_attempt_at,
            last_error: r.last_error,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

/// Whether any of `message_id`'s attachments is not uploaded yet.
pub async fn has_pending_assets(pool: &SqlitePool, message_id: &str) -> Result<bool> {
    Ok(assets_for_message(pool, message_id)
        .await?
        .iter()
        .any(|a| a.state != AssetState::Uploaded))
}

async fn insert_assets(
    pool: &SqlitePool,
    message_id: &str,
    assets: &[NewAsset],
    now_ms: i64,
    replace_existing: bool,
) -> Result<()> {
    let now = iso_time::from_millis(now_ms);
    let sql = format!(
        "INSERT{} INTO session_assets_outbox ( attachment_id, message_id, source_ref, \
         original_name, asset_id, relative_path, state, upload_attempt_count, \
         next_upload_attempt_at, last_error, created_at, updated_at ) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?){}",
        if replace_existing { "" } else { " OR IGNORE" },
        if replace_existing {
            " ON CONFLICT(attachment_id) DO UPDATE SET message_id = excluded.message_id, \
             source_ref = excluded.source_ref, original_name = excluded.original_name, \
             asset_id = excluded.asset_id, relative_path = excluded.relative_path, \
             state = excluded.state, upload_attempt_count = excluded.upload_attempt_count, \
             next_upload_attempt_at = excluded.next_upload_attempt_at, \
             last_error = excluded.last_error, created_at = excluded.created_at, \
             updated_at = excluded.updated_at"
        } else {
            ""
        }
    );
    for a in assets {
        let state = if a.uploaded {
            AssetState::Uploaded
        } else {
            AssetState::Pending
        };
        let q = sqlx::query(&sql)
            .bind(&a.attachment_id)
            .bind(message_id)
            .bind(&a.source_ref)
            .bind(&a.original_name)
            .bind(&a.asset_id)
            .bind(&a.relative_path)
            .bind(state.as_str())
            .bind(0_i64)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(&now)
            .bind(&now);
        exec(q, pool).await?;
    }
    Ok(())
}

/// Make `assets` the attachments of `message_id`: insert or overwrite each
/// (fresh attempt count, no error, both times `now`), then delete the
/// message's other attachments.
pub async fn replace_assets(
    pool: &SqlitePool,
    message_id: &str,
    assets: &[NewAsset],
    now_ms: i64,
) -> Result<()> {
    insert_assets(pool, message_id, assets, now_ms, true).await?;
    if assets.is_empty() {
        let q =
            sqlx::query("DELETE FROM session_assets_outbox WHERE message_id = ?").bind(message_id);
        return exec(q, pool).await.map(|_| ());
    }
    let marks = vec!["?"; assets.len()].join(", ");
    let sql = format!(
        "DELETE FROM session_assets_outbox WHERE message_id = ? AND attachment_id NOT IN ({marks})"
    );
    let mut q = sqlx::query(&sql).bind(message_id);
    for a in assets {
        q = q.bind(&a.attachment_id);
    }
    exec(q, pool).await.map(|_| ())
}

/// Columns to change on an attachment; `None` leaves a column alone.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AssetPatch {
    pub state: Option<AssetState>,
    pub asset_id: Option<String>,
    pub relative_path: Option<String>,
    pub upload_attempt_count: Option<i64>,
    pub next_upload_attempt_at: Option<Option<String>>,
    pub last_error: Option<Option<String>>,
}

/// Apply `patch` to `attachment_id` and stamp `updated_at`; an empty patch
/// writes nothing.
pub async fn update_asset(
    pool: &SqlitePool,
    attachment_id: &str,
    patch: &AssetPatch,
    now_ms: i64,
) -> Result<()> {
    let mut set = Vec::new();
    let mut values = Vec::new();
    let mut col = |name: &'static str, v: Value| {
        set.push(name);
        values.push(v);
    };
    if let Some(v) = patch.state {
        col("state", Value::Text(Some(v.as_str().into())));
    }
    if let Some(v) = &patch.asset_id {
        col("asset_id", Value::Text(Some(v.clone())));
    }
    if let Some(v) = &patch.relative_path {
        col("relative_path", Value::Text(Some(v.clone())));
    }
    if let Some(v) = patch.upload_attempt_count {
        col("upload_attempt_count", Value::Int(v));
    }
    if let Some(v) = &patch.next_upload_attempt_at {
        col("next_upload_attempt_at", Value::Text(v.clone()));
    }
    if let Some(v) = &patch.last_error {
        col("last_error", Value::Text(v.clone()));
    }
    update(
        pool,
        "session_assets_outbox",
        "attachment_id",
        attachment_id,
        set,
        values,
        now_ms,
    )
    .await
}

/// Put every attachment of `message_id` that is not uploaded back to
/// `pending` with a fresh attempt count, for a retried message.
pub async fn reset_assets_for_retry(
    pool: &SqlitePool,
    message_id: &str,
    now_ms: i64,
) -> Result<()> {
    let q = sqlx::query(
        "UPDATE session_assets_outbox SET state = ?, upload_attempt_count = ?, \
         next_upload_attempt_at = ?, last_error = ?, updated_at = ? \
         WHERE message_id = ? AND state != ?",
    )
    .bind(AssetState::Pending.as_str())
    .bind(0_i64)
    .bind(None::<String>)
    .bind(None::<String>)
    .bind(iso_time::from_millis(now_ms))
    .bind(message_id)
    .bind(AssetState::Uploaded.as_str());
    exec(q, pool).await.map(|_| ())
}

/// Whether `session_id`'s queue is paused (a row with `paused_at` set).
pub async fn is_paused(pool: &SqlitePool, session_id: &str) -> Result<bool> {
    let paused_at: Option<Option<String>> = sqlx::query_scalar(
        "SELECT paused_at FROM session_messages_outbox_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    Ok(paused_at.flatten().is_some())
}

/// Pause or resume `session_id`'s queue (`paused_at` = now or NULL).
pub async fn set_paused(
    pool: &SqlitePool,
    session_id: &str,
    paused: bool,
    now_ms: i64,
) -> Result<()> {
    let now = iso_time::from_millis(now_ms);
    let q = sqlx::query(
        "INSERT OR REPLACE INTO session_messages_outbox_state ( session_id, paused_at, \
         updated_at ) VALUES (?, ?, ?)",
    )
    .bind(session_id)
    .bind(paused.then(|| now.clone()))
    .bind(&now);
    exec(q, pool).await.map(|_| ())
}
