//! `client_cache_session_state`: one row per mirrored session.
//!
//! - `cache_version` marks the mirror's format; a row with any other version
//!   than [`CACHE_VERSION`] is dropped with the session's messages
//!   ([`invalidate_if_stale`]).
//! - `cache_revision` counts writes to the mirror (each mirrored message
//!   bumps it, [`touch`]); the transcript reader compares it to decide
//!   whether its in-memory copy is current ([`transcript_revision`]).
//! - `primary_max_rowid` / `primary_message_count` are the `conductor.db`
//!   watermark the mirror last caught up to ([`record_primary`]).
//! - `feed_offset` moves here from `sessions.feed_offset` for sessions whose
//!   transcript lives in the cache ([`set_feed_offset`]).
//! - `last_read_at` is set on every transcript read ([`record_read`]).
//!
//! Times are ISO strings from [`super::now_iso`].

use sqlx::SqlitePool;

use crate::{exec, Result};

/// The reference's mirror format version (`const E_=1` beside the
/// statements in `index-BGEQ8YjU.js`).
pub const CACHE_VERSION: i64 = 1;

/// The columns the transcript hydrator reads before streaming a session:
/// `SELECT cache_revision, cache_version, first_written_at, last_modified_at,
/// feed_offset FROM client_cache_session_state WHERE session_id = ?`.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Snapshot {
    pub cache_revision: Option<i64>,
    pub cache_version: Option<i64>,
    pub first_written_at: Option<String>,
    pub last_modified_at: Option<String>,
    pub feed_offset: Option<i64>,
}

/// The `conductor.db` watermark the mirror last caught up to.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, sqlx::FromRow)]
pub struct PrimaryWatermark {
    pub primary_max_rowid: i64,
    pub primary_message_count: i64,
}

/// The session's state row, if any.
pub async fn snapshot(pool: &SqlitePool, session_id: &str) -> Result<Option<Snapshot>> {
    Ok(sqlx::query_as::<_, Snapshot>(
        "SELECT cache_revision, cache_version, first_written_at, last_modified_at, feed_offset \
         FROM client_cache_session_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?)
}

/// The recorded watermark; zeros when there is no row or a column is null,
/// as the reference reads it (`?? 0`). Statement: `SELECT primary_max_rowid,
/// primary_message_count FROM client_cache_session_state WHERE session_id = ?`.
pub async fn primary_watermark(pool: &SqlitePool, session_id: &str) -> Result<PrimaryWatermark> {
    let row: Option<(Option<i64>, Option<i64>)> = sqlx::query_as(
        "SELECT primary_max_rowid, primary_message_count \
         FROM client_cache_session_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    let (rowid, count) = row.unwrap_or_default();
    Ok(PrimaryWatermark {
        primary_max_rowid: rowid.unwrap_or(0),
        primary_message_count: count.unwrap_or(0),
    })
}

/// The mirror's revision, `None` when the session has no state row (the
/// reference treats that as a cold cache). Statement: `SELECT cache_revision
/// AS transcript_revision FROM client_cache_session_state WHERE session_id = ?`.
pub async fn transcript_revision(pool: &SqlitePool, session_id: &str) -> Result<Option<i64>> {
    let row: Option<Option<i64>> = sqlx::query_scalar(
        "SELECT cache_revision AS transcript_revision \
         FROM client_cache_session_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.flatten())
}

/// The session's feed offset, `-1` when unset (`?? -1`). Statement: `SELECT
/// feed_offset FROM client_cache_session_state WHERE session_id = ?`.
pub async fn feed_offset(pool: &SqlitePool, session_id: &str) -> Result<i64> {
    let row: Option<Option<i64>> = sqlx::query_scalar(
        "SELECT feed_offset FROM client_cache_session_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.flatten().unwrap_or(-1))
}

/// Drop the session's mirror when its state row has another format version
/// than [`CACHE_VERSION`] (including no row at all); `true` when it did. The
/// reference runs this before every cache read: `SELECT cache_version FROM
/// client_cache_session_state WHERE session_id = ?`, then `DELETE FROM
/// session_messages WHERE session_id = ?` and `DELETE FROM
/// client_cache_session_state WHERE session_id = ?`.
pub async fn invalidate_if_stale(pool: &SqlitePool, session_id: &str) -> Result<bool> {
    let version: Option<Option<i64>> = sqlx::query_scalar(
        "SELECT cache_version FROM client_cache_session_state WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    if version.flatten() == Some(CACHE_VERSION) {
        return Ok(false);
    }
    let q = sqlx::query("DELETE FROM session_messages WHERE session_id = ?").bind(session_id);
    exec(q, pool).await?;
    delete(pool, session_id).await?;
    Ok(true)
}

/// Record a write to the mirror: create the row at revision 1, or bump
/// `cache_revision` and `last_modified_at`, keeping `first_written_at`. The
/// reference's statement, run after every mirrored message.
pub async fn touch(pool: &SqlitePool, session_id: &str, now: &str) -> Result<()> {
    let q = sqlx::query(
        "INSERT INTO client_cache_session_state ( \
            session_id, cache_version, cache_revision, \
            first_written_at, last_modified_at \
         ) VALUES (?, ?, 1, ?, ?) \
         ON CONFLICT(session_id) DO UPDATE SET \
            cache_version = excluded.cache_version, \
            cache_revision = COALESCE(client_cache_session_state.cache_revision, 0) + 1, \
            first_written_at = COALESCE( \
                client_cache_session_state.first_written_at, \
                excluded.first_written_at \
            ), \
            last_modified_at = excluded.last_modified_at",
    )
    .bind(session_id)
    .bind(CACHE_VERSION)
    .bind(now)
    .bind(now);
    exec(q, pool).await.map(|_| ())
}

/// Record that the mirror caught up to `conductor.db` at `watermark`. The
/// reference's statement after a catch-up or rebuild; it does not bump
/// `cache_revision` (the mirrored messages already did).
pub async fn record_primary(
    pool: &SqlitePool,
    session_id: &str,
    watermark: PrimaryWatermark,
    now: &str,
) -> Result<()> {
    let q = sqlx::query(
        "INSERT INTO client_cache_session_state ( \
            session_id, primary_max_rowid, primary_message_count, \
            cache_version, first_written_at, last_modified_at \
         ) VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT(session_id) DO UPDATE SET \
            primary_max_rowid = excluded.primary_max_rowid, \
            primary_message_count = excluded.primary_message_count, \
            cache_version = excluded.cache_version, \
            first_written_at = COALESCE( \
                client_cache_session_state.first_written_at, \
                excluded.first_written_at \
            ), \
            last_modified_at = excluded.last_modified_at",
    )
    .bind(session_id)
    .bind(watermark.primary_max_rowid)
    .bind(watermark.primary_message_count)
    .bind(CACHE_VERSION)
    .bind(now)
    .bind(now);
    exec(q, pool).await.map(|_| ())
}

/// Store the session's feed offset (`None` stores `-1`, as the reference's
/// `s ?? -1`). The reference's statement for cache-backed sessions.
pub async fn set_feed_offset(
    pool: &SqlitePool,
    session_id: &str,
    feed_offset: Option<i64>,
    now: &str,
) -> Result<()> {
    let q = sqlx::query(
        "INSERT INTO client_cache_session_state ( \
            session_id, feed_offset, cache_version, first_written_at, \
            last_modified_at \
         ) VALUES (?, ?, ?, ?, ?) \
         ON CONFLICT(session_id) DO UPDATE SET \
            feed_offset = excluded.feed_offset, \
            cache_version = excluded.cache_version, \
            first_written_at = COALESCE( \
                client_cache_session_state.first_written_at, \
                excluded.first_written_at \
            ), \
            last_modified_at = excluded.last_modified_at",
    )
    .bind(session_id)
    .bind(feed_offset.unwrap_or(-1))
    .bind(CACHE_VERSION)
    .bind(now)
    .bind(now);
    exec(q, pool).await.map(|_| ())
}

/// Stamp `last_read_at`; no row, no change. Statement: `UPDATE
/// client_cache_session_state SET last_read_at = ? WHERE session_id = ?`.
pub async fn record_read(pool: &SqlitePool, session_id: &str, now: &str) -> Result<()> {
    let q =
        sqlx::query("UPDATE client_cache_session_state SET last_read_at = ? WHERE session_id = ?")
            .bind(now)
            .bind(session_id);
    exec(q, pool).await.map(|_| ())
}

/// Delete the session's state row; a missing row is fine. Statement:
/// `DELETE FROM client_cache_session_state WHERE session_id = ?`.
pub async fn delete(pool: &SqlitePool, session_id: &str) -> Result<()> {
    let q =
        sqlx::query("DELETE FROM client_cache_session_state WHERE session_id = ?").bind(session_id);
    exec(q, pool).await.map(|_| ())
}
