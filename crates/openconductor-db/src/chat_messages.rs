//! A chat's transcript in `conductor.db`: one `sessions` row per chat and one
//! `session_messages` row per message, as Conductor keeps it (issue #272,
//! `evidence/sqlite`). The chat id is `sessions.id`; the agent's own session
//! id goes to `sessions.claude_session_id`.
//!
//! A message row stores the frontend's message JSON in `full_message` (our
//! own shape, not Conductor's SDK message), its plain text in `content`, and
//! the columns Conductor filters on: `role`, `turn_id`, `created_at`,
//! `sent_at` (settled messages only), `cancelled_at`, and the report sender
//! (`sender_session_id`, `sender_api_key_name`).
//!
//! Writes come in batches from the frontend as messages change: [`save`]
//! upserts the changed rows and deletes the dropped ones (Reset chat) in one
//! transaction. [`load`] reads them back in insertion order.

use sqlx::SqlitePool;

use crate::Result;

/// One `session_messages` row as the chat writes it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StoredMessage {
    pub id: String,
    pub role: String,
    /// Plain text of the message (`content`).
    pub content: String,
    pub created_at: String,
    pub turn_id: Option<String>,
    /// Set once the message is settled; a queued message has none.
    pub sent_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub sender_session_id: Option<String>,
    pub sender_api_key_name: Option<String>,
    /// The message as the frontend serialises it.
    pub full_message: String,
}

/// A batch of changes to one chat.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Batch {
    pub upserts: Vec<StoredMessage>,
    pub delete_ids: Vec<String>,
    /// The agent's session id, when known (`sessions.claude_session_id`).
    /// Saving it also clears `resume_session_at`: the session is current.
    pub agent_session_id: Option<String>,
    /// Reset chat: the agent session remembers turns after this message,
    /// which were deleted. Forgets the session (`claude_session_id`) and
    /// records the message in `resume_session_at`, as Conductor does, so the
    /// chat's next turn starts a new session. Applied before
    /// `agent_session_id`.
    pub rewind_to: Option<String>,
}

/// When the batch's newest user message was created, if it has one: the time
/// that moves `sessions.last_user_message_at` and the workspace's
/// `updated_at` forward.
pub fn latest_user_message_at(batch: &Batch) -> Option<&str> {
    batch
        .upserts
        .iter()
        .filter(|m| m.role == "user")
        .map(|m| m.created_at.as_str())
        .max()
}

/// Apply `batch` to chat `session_id`, creating its `sessions` row if needed.
/// Upserting keeps a row's `rowid`, so [`load`] keeps the first-write order.
pub async fn save(pool: &SqlitePool, session_id: &str, batch: &Batch) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT OR IGNORE INTO sessions (id) VALUES (?)")
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
    if let Some(at) = &batch.rewind_to {
        sqlx::query(
            "UPDATE sessions SET claude_session_id = NULL, resume_session_at = ? WHERE id = ?",
        )
        .bind(at)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
    }
    if let Some(agent) = &batch.agent_session_id {
        sqlx::query(
            "UPDATE sessions SET claude_session_id = ?, resume_session_at = NULL WHERE id = ?",
        )
        .bind(agent)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
    }
    if let Some(last) = latest_user_message_at(batch) {
        sqlx::query(
            "UPDATE sessions SET last_user_message_at = ? \
             WHERE id = ? AND (last_user_message_at IS NULL OR last_user_message_at < ?)",
        )
        .bind(last)
        .bind(session_id)
        .bind(last)
        .execute(&mut *tx)
        .await?;
    }
    for m in &batch.upserts {
        sqlx::query(
            "INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at, \
             full_message, cancelled_at, turn_id, sender_session_id, sender_api_key_name) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, role = excluded.role, \
             content = excluded.content, created_at = excluded.created_at, sent_at = excluded.sent_at, \
             full_message = excluded.full_message, cancelled_at = excluded.cancelled_at, \
             turn_id = excluded.turn_id, sender_session_id = excluded.sender_session_id, \
             sender_api_key_name = excluded.sender_api_key_name",
        )
        .bind(&m.id)
        .bind(session_id)
        .bind(&m.role)
        .bind(&m.content)
        .bind(&m.created_at)
        .bind(&m.sent_at)
        .bind(&m.full_message)
        .bind(&m.cancelled_at)
        .bind(&m.turn_id)
        .bind(&m.sender_session_id)
        .bind(&m.sender_api_key_name)
        .execute(&mut *tx)
        .await?;
    }
    for id in &batch.delete_ids {
        sqlx::query("DELETE FROM session_messages WHERE id = ? AND session_id = ?")
            .bind(id)
            .bind(session_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// A chat as stored: its messages' `full_message` JSON in first-write order,
/// and the agent's session id.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Loaded {
    pub messages: Vec<String>,
    pub agent_session_id: Option<String>,
}

/// Read chat `session_id` back; an unknown chat is empty.
pub async fn load(pool: &SqlitePool, session_id: &str) -> Result<Loaded> {
    let messages: Vec<(String,)> = sqlx::query_as(
        "SELECT full_message FROM session_messages \
         WHERE session_id = ? AND full_message IS NOT NULL ORDER BY rowid",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;
    let agent: Option<(Option<String>,)> =
        sqlx::query_as("SELECT claude_session_id FROM sessions WHERE id = ?")
            .bind(session_id)
            .fetch_optional(pool)
            .await?;
    Ok(Loaded {
        messages: messages.into_iter().map(|(m,)| m).collect(),
        agent_session_id: agent.and_then(|(a,)| a),
    })
}
