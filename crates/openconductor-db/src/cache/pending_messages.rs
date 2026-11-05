//! `session_pending_messages` and `session_pending_messages_state`: the last
//! known snapshot of a session's pending-message queue (messages waiting to
//! be delivered to the agent), so the queue renders before the server
//! answers. A snapshot is replaced whole ([`store`]); `generation` is the
//! server's queue generation, `paused` whether the queue is paused, and
//! `cache_version` the snapshot format ([`CACHE_VERSION`]).
//!
//! `delivery_payload` and `config` are JSON text (the reference writes
//! `JSON.stringify(...)` and parses on read); `mode` is `"queue"` or
//! `"steer"`.

use sqlx::SqlitePool;

use crate::{exec, Result};

/// The reference's snapshot format version (`const xle=1`).
pub const CACHE_VERSION: i64 = 1;

/// One queued message.
#[derive(Debug, Clone, Default, PartialEq, Eq, sqlx::FromRow)]
pub struct PendingMessage {
    pub message_id: String,
    pub delivery_payload: String,
    pub config: Option<String>,
    pub mode: String,
    pub position: i64,
    pub revision: i64,
    pub sender_id: Option<String>,
    pub received_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct StateRow {
    generation: Option<i64>,
    paused: Option<i64>,
    cache_version: Option<i64>,
}

/// A session's queue as last seen.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PendingSnapshot {
    pub session_id: String,
    pub generation: i64,
    pub paused: bool,
    pub messages: Vec<PendingMessage>,
}

/// The stored snapshot, or `None` when there is none. A snapshot in another
/// format version is cleared ([`clear`]) and reads as `None`. Statements:
/// `SELECT * FROM session_pending_messages_state WHERE session_id = ?` and
/// `SELECT * FROM session_pending_messages WHERE session_id = ? ORDER BY
/// position ASC, message_id ASC`.
pub async fn load(pool: &SqlitePool, session_id: &str) -> Result<Option<PendingSnapshot>> {
    let state = sqlx::query_as::<_, StateRow>(
        "SELECT * FROM session_pending_messages_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    let Some(StateRow {
        generation,
        paused,
        cache_version,
    }) = state
    else {
        return Ok(None);
    };
    if cache_version != Some(CACHE_VERSION) {
        clear(pool, session_id).await?;
        return Ok(None);
    }
    let messages = sqlx::query_as::<_, PendingMessage>(
        "SELECT * FROM session_pending_messages \
         WHERE session_id = ? ORDER BY position ASC, message_id ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;
    Ok(Some(PendingSnapshot {
        session_id: session_id.to_owned(),
        generation: generation.unwrap_or(0),
        paused: paused == Some(1),
        messages,
    }))
}

/// Replace the session's snapshot with `snapshot`, stamped `snapshot_at`.
/// The reference's statements: `DELETE FROM session_pending_messages WHERE
/// session_id = ?`, one multi-row `INSERT OR REPLACE INTO
/// session_pending_messages (…) VALUES (…), (…)` when there are messages
/// (each row carries the snapshot's `generation`), then `INSERT OR REPLACE
/// INTO session_pending_messages_state (…) VALUES (?, ?, ?, ?, ?)`.
pub async fn store(pool: &SqlitePool, snapshot: &PendingSnapshot, snapshot_at: &str) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM session_pending_messages WHERE session_id = ?")
        .bind(&snapshot.session_id)
        .execute(&mut *tx)
        .await?;
    // SQLite allows 32766 bound values per statement; 10 per row.
    for chunk in snapshot.messages.chunks(3000) {
        let rows = vec!["(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"; chunk.len()].join(", ");
        let sql = format!(
            "INSERT OR REPLACE INTO session_pending_messages ( \
                session_id, message_id, delivery_payload, config, mode, \
                position, revision, sender_id, received_at, generation \
             ) VALUES {rows}"
        );
        let mut q = sqlx::query(&sql);
        for m in chunk {
            q = q
                .bind(&snapshot.session_id)
                .bind(&m.message_id)
                .bind(&m.delivery_payload)
                .bind(&m.config)
                .bind(&m.mode)
                .bind(m.position)
                .bind(m.revision)
                .bind(&m.sender_id)
                .bind(&m.received_at)
                .bind(snapshot.generation);
        }
        q.execute(&mut *tx).await?;
    }
    sqlx::query(
        "INSERT OR REPLACE INTO session_pending_messages_state ( \
            session_id, generation, paused, snapshot_at, cache_version \
         ) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&snapshot.session_id)
    .bind(snapshot.generation)
    .bind(i64::from(snapshot.paused))
    .bind(snapshot_at)
    .bind(CACHE_VERSION)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Delete the session's snapshot. Statements: `DELETE FROM
/// session_pending_messages WHERE session_id = ?` and `DELETE FROM
/// session_pending_messages_state WHERE session_id = ?`.
pub async fn clear(pool: &SqlitePool, session_id: &str) -> Result<()> {
    let q =
        sqlx::query("DELETE FROM session_pending_messages WHERE session_id = ?").bind(session_id);
    exec(q, pool).await?;
    let q = sqlx::query("DELETE FROM session_pending_messages_state WHERE session_id = ?")
        .bind(session_id);
    exec(q, pool).await.map(|_| ())
}
