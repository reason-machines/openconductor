//! Files attached to chat messages (`attachments`).
//!
//! Every statement is a SQL string literal from the reference app's decoded
//! frontend bundle (Conductor 0.87.6, `assets/index-BGEQ8YjU.js`, the
//! composer attachments store).
//!
//! An attachment starts as a **draft** (`is_draft = 1`, no message) in the
//! composer of a session. Sending the message promotes the drafts: they get
//! the message id and `is_draft = 0` ([`mark_drafts_sent`]). Editing a sent
//! message puts them back ([`restore_to_draft`]). While a file is copied in,
//! `is_loading = 1` and `path` is provisional; [`finalize_path`] stores the
//! final path. Review-comment attachments carry the diff comment's id in
//! `comment_id`.
//!
//! `created_at` is left to the column default (`datetime('now')`).

use sqlx::SqlitePool;

use crate::sessions::placeholders;
use crate::{exec, Result};

/// One row of `attachments`, flags read as `true` only when 1.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Attachment {
    pub id: String,
    /// `attachments.type`.
    #[sqlx(rename = "type")]
    pub kind: Option<String>,
    pub original_name: Option<String>,
    pub path: Option<String>,
    pub is_loading: bool,
    pub session_id: Option<String>,
    pub session_message_id: Option<String>,
    pub is_draft: bool,
    pub created_at: String,
    /// The diff comment a review attachment was made from.
    pub comment_id: Option<String>,
}

const COLUMNS: &str = "id, type, original_name, path, is_loading IS 1 AS is_loading, \
    session_id, session_message_id, is_draft IS 1 AS is_draft, created_at, comment_id";

#[derive(Debug, Clone, Default)]
pub struct NewAttachment {
    pub id: String,
    pub kind: String,
    pub original_name: String,
    pub path: String,
    pub is_loading: bool,
    pub is_draft: bool,
    pub session_id: String,
    pub session_message_id: Option<String>,
    pub comment_id: Option<String>,
}

pub async fn create(pool: &SqlitePool, a: &NewAttachment) -> Result<Attachment> {
    sqlx::query(
        "INSERT INTO attachments ( id, type, original_name, path, is_loading, is_draft, \
         session_id, session_message_id, comment_id ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&a.id)
    .bind(&a.kind)
    .bind(&a.original_name)
    .bind(&a.path)
    .bind(a.is_loading)
    .bind(a.is_draft)
    .bind(&a.session_id)
    .bind(&a.session_message_id)
    .bind(&a.comment_id)
    .execute(pool)
    .await?;
    get(pool, &a.session_id, &a.id)
        .await?
        .ok_or(crate::Error::NotFound)
}

/// One attachment of a session.
pub async fn get(pool: &SqlitePool, session_id: &str, id: &str) -> Result<Option<Attachment>> {
    let sql = format!("SELECT {COLUMNS} FROM attachments WHERE id = ? AND session_id = ? LIMIT 1");
    Ok(sqlx::query_as(&sql)
        .bind(id)
        .bind(session_id)
        .fetch_optional(pool)
        .await?)
}

/// A message's attachments, oldest first.
pub async fn list_for_message(pool: &SqlitePool, message_id: &str) -> Result<Vec<Attachment>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM attachments WHERE session_message_id = ? ORDER BY created_at ASC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(message_id)
        .fetch_all(pool)
        .await?)
}

/// Every attachment of a session, drafts included: those filed under the
/// session and those on any of its messages, oldest first.
pub async fn list_for_session(pool: &SqlitePool, session_id: &str) -> Result<Vec<Attachment>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM attachments WHERE session_id = ? OR session_message_id IN ( \
         SELECT id FROM session_messages WHERE session_id = ? ) ORDER BY created_at ASC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .bind(session_id)
        .fetch_all(pool)
        .await?)
}

/// Like [`list_for_session`] without drafts.
pub async fn list_sent_for_session(pool: &SqlitePool, session_id: &str) -> Result<Vec<Attachment>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM attachments WHERE is_draft = 0 AND ( session_id = ? OR \
         session_message_id IN ( SELECT id FROM session_messages WHERE session_id = ? ) ) \
         ORDER BY created_at ASC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .bind(session_id)
        .fetch_all(pool)
        .await?)
}

/// The composer's draft attachments, oldest first.
pub async fn list_drafts(pool: &SqlitePool, session_id: &str) -> Result<Vec<Attachment>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM attachments WHERE session_id = ? AND is_draft = 1 \
         ORDER BY created_at ASC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(session_id)
        .fetch_all(pool)
        .await?)
}

/// Move draft attachments to another session's composer. Returns rows moved.
pub async fn retarget_drafts(
    pool: &SqlitePool,
    ids: &[String],
    source_session_id: &str,
    target_session_id: &str,
) -> Result<u64> {
    if source_session_id == target_session_id || ids.is_empty() {
        return Ok(0);
    }
    let sql = format!(
        "UPDATE attachments SET session_id = ? WHERE session_id = ? AND is_draft = 1 \
         AND id IN ({})",
        placeholders(ids.len())
    );
    let mut q = sqlx::query(&sql)
        .bind(target_session_id)
        .bind(source_session_id);
    for id in ids {
        q = q.bind(id);
    }
    exec(q, pool).await
}

/// Store the final path of a copied file and clear `is_loading`. False when
/// the attachment is gone.
pub async fn finalize_path(
    pool: &SqlitePool,
    session_id: &str,
    id: &str,
    path: &str,
) -> Result<bool> {
    let q = sqlx::query(
        "UPDATE attachments SET path = ?, is_loading = 0 WHERE id = ? AND session_id = ?",
    )
    .bind(path)
    .bind(id)
    .bind(session_id);
    Ok(exec(q, pool).await? > 0)
}

/// Delete an attachment (only a draft when `only_draft`); returns the
/// deleted row.
pub async fn delete(
    pool: &SqlitePool,
    session_id: &str,
    id: &str,
    only_draft: bool,
) -> Result<Option<Attachment>> {
    let guard = if only_draft { " AND is_draft = 1" } else { "" };
    let sql = format!(
        "DELETE FROM attachments WHERE id = ? AND session_id = ?{guard} RETURNING {COLUMNS}"
    );
    Ok(sqlx::query_as(&sql)
        .bind(id)
        .bind(session_id)
        .fetch_optional(pool)
        .await?)
}

/// Promote the composer's drafts onto a sent message.
///
/// With `ids = None` every draft of the session is promoted. With
/// `Some(ids)` only those drafts are promoted, and any other attachment
/// already on the message is deleted, so the message ends up with exactly
/// `ids`.
pub async fn mark_drafts_sent(
    pool: &SqlitePool,
    session_id: &str,
    message_id: &str,
    ids: Option<&[String]>,
) -> Result<()> {
    let Some(ids) = ids else {
        exec(
            sqlx::query(
                "UPDATE attachments SET session_message_id = ?, is_draft = 0 \
                 WHERE session_id = ? AND is_draft = 1",
            )
            .bind(message_id)
            .bind(session_id),
            pool,
        )
        .await?;
        return Ok(());
    };
    if !ids.is_empty() {
        let sql = format!(
            "UPDATE attachments SET session_message_id = ?, is_draft = 0 \
             WHERE session_id = ? AND is_draft = 1 AND id IN ({})",
            placeholders(ids.len())
        );
        let mut q = sqlx::query(&sql).bind(message_id).bind(session_id);
        for id in ids {
            q = q.bind(id);
        }
        exec(q, pool).await?;
    }
    let keep = if ids.is_empty() {
        String::new()
    } else {
        format!(" AND id NOT IN ({})", placeholders(ids.len()))
    };
    let sql =
        format!("DELETE FROM attachments WHERE session_id = ? AND session_message_id = ?{keep}");
    let mut q = sqlx::query(&sql).bind(session_id).bind(message_id);
    for id in ids {
        q = q.bind(id);
    }
    exec(q, pool).await?;
    Ok(())
}

/// Move a message's attachments back into the composer as drafts.
pub async fn restore_to_draft(
    pool: &SqlitePool,
    session_id: &str,
    message_id: &str,
) -> Result<u64> {
    exec(
        sqlx::query(
            "UPDATE attachments SET session_message_id = NULL, is_draft = 1 \
             WHERE session_id = ? AND session_message_id = ?",
        )
        .bind(session_id)
        .bind(message_id),
        pool,
    )
    .await
}

/// Sessions holding an attachment made from a diff comment.
pub async fn session_ids_for_comment(pool: &SqlitePool, comment_id: &str) -> Result<Vec<String>> {
    let rows: Vec<(Option<String>,)> =
        sqlx::query_as("SELECT DISTINCT session_id FROM attachments WHERE comment_id = ?")
            .bind(comment_id)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().filter_map(|(s,)| s).collect())
}

/// Diff comments attached to any of the given messages of a session.
pub async fn comment_ids_for_messages(
    pool: &SqlitePool,
    session_id: &str,
    message_ids: &[String],
) -> Result<Vec<String>> {
    if message_ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT DISTINCT comment_id FROM attachments WHERE session_id = ? \
         AND session_message_id IN ({}) AND comment_id IS NOT NULL",
        placeholders(message_ids.len())
    );
    let mut q = sqlx::query_as::<_, (String,)>(&sql).bind(session_id);
    for id in message_ids {
        q = q.bind(id);
    }
    Ok(q.fetch_all(pool).await?.into_iter().map(|(c,)| c).collect())
}
