//! `cache.db` `session_messages`: a mirror of settled `conductor.db`
//! `session_messages` rows (`sent_at IS NOT NULL`), each carrying the primary
//! row's `rowid` in `source_rowid`. Rows the client writes straight into the
//! cache (an assistant message before the primary has it) have a null
//! `source_rowid` and survive the mirror being cleared ([`delete_mirrored`]).
//!
//! Reading `conductor.db` belongs to the sessions module; [`catch_up`] and
//! [`rebuild`] take the primary side as arguments.

use std::future::Future;

use sqlx::SqlitePool;

use super::session_state::{self, PrimaryWatermark};
use crate::{exec, Result};

/// Rows per page when reading a settled transcript (`const IP=500`).
pub const PAGE_SIZE: i64 = 500;

/// One mirrored message: every `conductor.db` `session_messages` column plus
/// `source_rowid`. Primary rows are read for the mirror as `SELECT rowid AS
/// source_rowid, * FROM session_messages …`, which yields exactly this shape.
#[derive(Debug, Clone, Default, PartialEq, Eq, sqlx::FromRow)]
pub struct CachedMessage {
    pub id: String,
    pub sdk_message_id: Option<String>,
    pub last_assistant_message_id: Option<String>,
    pub session_id: String,
    pub role: Option<String>,
    pub content: Option<String>,
    pub created_at: Option<String>,
    pub turn_id: Option<String>,
    pub sent_at: Option<String>,
    pub full_message: Option<String>,
    pub cancelled_at: Option<String>,
    pub model: Option<String>,
    pub is_resumable_message: Option<i64>,
    pub queue_order: Option<i64>,
    pub sender_id: Option<String>,
    pub sender_session_id: Option<String>,
    pub sender_api_key_name: Option<String>,
    /// The primary row's `rowid`; `None` for a client-written row.
    #[sqlx(default)]
    pub source_rowid: Option<i64>,
}

/// A settled row as the transcript reader pages it, with the cache's own
/// `rowid` as the tie-breaking cursor.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SettledRow {
    #[sqlx(flatten)]
    pub message: CachedMessage,
    pub cache_rowid: i64,
}

/// A whole settled transcript and the revision read before paging it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettledTranscript {
    pub rows: Vec<SettledRow>,
    pub revision: Option<i64>,
}

/// Insert or replace `m` by `id`, then [`session_state::touch`] its session.
/// The reference's mirror write: `INSERT OR REPLACE INTO session_messages
/// (id, …, sender_api_key_name, source_rowid) VALUES (?, …)` followed by the
/// state upsert.
pub async fn upsert(pool: &SqlitePool, m: &CachedMessage, now: &str) -> Result<()> {
    let q = sqlx::query(
        "INSERT OR REPLACE INTO session_messages ( \
            id, sdk_message_id, last_assistant_message_id, session_id, \
            role, content, created_at, turn_id, sent_at, full_message, \
            cancelled_at, model, is_resumable_message, queue_order, \
            sender_id, sender_session_id, sender_api_key_name, \
            source_rowid \
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&m.id)
    .bind(&m.sdk_message_id)
    .bind(&m.last_assistant_message_id)
    .bind(&m.session_id)
    .bind(&m.role)
    .bind(&m.content)
    .bind(&m.created_at)
    .bind(&m.turn_id)
    .bind(&m.sent_at)
    .bind(&m.full_message)
    .bind(&m.cancelled_at)
    .bind(&m.model)
    .bind(m.is_resumable_message)
    .bind(m.queue_order)
    .bind(&m.sender_id)
    .bind(&m.sender_session_id)
    .bind(&m.sender_api_key_name)
    .bind(m.source_rowid);
    exec(q, pool).await?;
    session_state::touch(pool, &m.session_id, now).await
}

/// Delete the session's mirrored rows, keeping client-written ones.
/// Statement: `DELETE FROM session_messages WHERE session_id = ? AND
/// source_rowid IS NOT NULL`.
pub async fn delete_mirrored(pool: &SqlitePool, session_id: &str) -> Result<()> {
    let q = sqlx::query(
        "DELETE FROM session_messages WHERE session_id = ? AND source_rowid IS NOT NULL",
    )
    .bind(session_id);
    exec(q, pool).await.map(|_| ())
}

/// How many of the session's rows came from the primary. Statement: `SELECT
/// COUNT(*) AS cached_count FROM session_messages WHERE session_id = ? AND
/// source_rowid IS NOT NULL`.
pub async fn count_mirrored(pool: &SqlitePool, session_id: &str) -> Result<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) AS cached_count FROM session_messages \
         WHERE session_id = ? AND source_rowid IS NOT NULL",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?)
}

/// One page of the session's settled rows in `(sent_at, rowid)` order,
/// strictly after `after` (`(sent_at, cache_rowid)` of the previous page's
/// last row) when given. The reference's paged read, with its
/// `1 AS is_client_cache_projection` marker column.
pub async fn settled_page(
    pool: &SqlitePool,
    session_id: &str,
    after: Option<(&str, i64)>,
    limit: i64,
) -> Result<Vec<SettledRow>> {
    let cursor = if after.is_some() {
        "AND (sent_at, rowid) > (?, ?)"
    } else {
        ""
    };
    let sql = format!(
        "SELECT id, sdk_message_id, last_assistant_message_id, \
                session_id, role, content, created_at, turn_id, \
                sent_at, full_message, cancelled_at, model, \
                is_resumable_message, queue_order, sender_id, \
                sender_session_id, sender_api_key_name, \
                1 AS is_client_cache_projection, \
                rowid AS cache_rowid \
         FROM session_messages \
         WHERE session_id = ? \
           AND sent_at IS NOT NULL \
           {cursor} \
         ORDER BY sent_at, rowid \
         LIMIT ?"
    );
    let mut q = sqlx::query_as::<_, SettledRow>(&sql).bind(session_id);
    if let Some((sent_at, rowid)) = after {
        q = q.bind(sent_at).bind(rowid);
    }
    Ok(q.bind(limit).fetch_all(pool).await?)
}

/// The whole settled transcript, read in [`PAGE_SIZE`] pages, with the
/// revision ([`session_state::transcript_revision`]) read first, as the
/// reference does.
pub async fn settled(pool: &SqlitePool, session_id: &str) -> Result<SettledTranscript> {
    let revision = session_state::transcript_revision(pool, session_id).await?;
    let mut rows: Vec<SettledRow> = Vec::new();
    loop {
        let after = rows.last().map(|r| {
            // Every row matched `sent_at IS NOT NULL`.
            (r.message.sent_at.clone().unwrap_or_default(), r.cache_rowid)
        });
        let page = settled_page(
            pool,
            session_id,
            after.as_ref().map(|(s, id)| (s.as_str(), *id)),
            PAGE_SIZE,
        )
        .await?;
        let full = page.len() as i64 == PAGE_SIZE;
        rows.extend(page);
        if !full {
            return Ok(SettledTranscript { rows, revision });
        }
    }
}

/// What [`catch_up`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatchUp {
    /// The recorded watermark already matched the primary.
    Current,
    /// Rows past the recorded `primary_max_rowid` were mirrored.
    Appended,
    /// The mirror was cleared and refilled from the start.
    Rebuilt,
}

/// Bring the mirror up to `primary`, the session's settled watermark in
/// `conductor.db` (`COALESCE(MAX(rowid), 0)` and `COUNT(*)` over rows with
/// `sent_at IS NOT NULL`). `fetch_after(rowid)` returns the primary's settled
/// rows with `rowid > rowid` in rowid order, as [`CachedMessage`]s.
///
/// The reference's reconciliation: unchanged watermark, nothing to do; a
/// primary that shrank (count or max rowid below the recorded one) clears the
/// mirror and refills from 0; otherwise append past the recorded max rowid,
/// and if the mirrored count then disagrees with the primary's, clear and
/// refill. Finally [`session_state::record_primary`].
pub async fn catch_up<F, Fut>(
    pool: &SqlitePool,
    session_id: &str,
    primary: PrimaryWatermark,
    now: &str,
    mut fetch_after: F,
) -> Result<CatchUp>
where
    F: FnMut(i64) -> Fut,
    Fut: Future<Output = Result<Vec<CachedMessage>>>,
{
    let cached = session_state::primary_watermark(pool, session_id).await?;
    if cached == primary {
        return Ok(CatchUp::Current);
    }
    let shrank = primary.primary_message_count < cached.primary_message_count
        || primary.primary_max_rowid < cached.primary_max_rowid;
    if shrank {
        delete_mirrored(pool, session_id).await?;
    }
    let after = if shrank { 0 } else { cached.primary_max_rowid };
    for m in fetch_after(after).await? {
        upsert(pool, &m, now).await?;
    }
    let mut outcome = if shrank {
        CatchUp::Rebuilt
    } else {
        CatchUp::Appended
    };
    if !shrank && count_mirrored(pool, session_id).await? != primary.primary_message_count {
        delete_mirrored(pool, session_id).await?;
        for m in fetch_after(0).await? {
            upsert(pool, &m, now).await?;
        }
        outcome = CatchUp::Rebuilt;
    }
    session_state::record_primary(pool, session_id, primary, now).await?;
    Ok(outcome)
}

/// Replace the session's mirror with `rows` (all of the primary's settled
/// rows, in rowid order). The reference's rebuild: delete the state row and
/// the mirrored rows, mirror every row, then record the watermark as the
/// largest `source_rowid` and the row count.
pub async fn rebuild(
    pool: &SqlitePool,
    session_id: &str,
    rows: &[CachedMessage],
    now: &str,
) -> Result<()> {
    session_state::delete(pool, session_id).await?;
    delete_mirrored(pool, session_id).await?;
    for m in rows {
        upsert(pool, m, now).await?;
    }
    let watermark = PrimaryWatermark {
        primary_max_rowid: rows.iter().filter_map(|m| m.source_rowid).fold(0, i64::max),
        primary_message_count: rows.len() as i64,
    };
    session_state::record_primary(pool, session_id, watermark, now).await
}
