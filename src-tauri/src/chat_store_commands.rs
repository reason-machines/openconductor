//! `#[tauri::command]`s that keep a chat's transcript in `conductor.db`
//! (`openconductor_db::chat_messages`, issue #272): the frontend sends each
//! batch of changed and dropped messages (src/features/chat/persist.ts) and
//! reads the chat back when it opens.
//!
//! A batch with a user message also moves the chat's workspace's
//! `updated_at` forward to that message's `created_at` (Conductor's
//! `addUserMessage` -> `setSessionUpdatedAt`, index-BGEQ8YjU.js @1,181,136 and
//! @1,066,404): the last-activity order the sidebar and Go to next unread
//! sort by. Assistant output does not move it, as in Conductor, whose
//! migration 85 dropped the workspaces trigger "so only enqueue and unarchive
//! bump it".

use openconductor_db::chat_messages::{self as store, Batch, StoredMessage};
use openconductor_db::{workspaces, Error};
use serde::{Deserialize, Serialize};
use tauri::State as Managed;

use crate::db::Db;

/// One message as the frontend sends it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessageDto {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub turn_id: Option<String>,
    pub sent_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub sender_session_id: Option<String>,
    pub sender_api_key_name: Option<String>,
    pub full_message: String,
}

impl From<StoredMessageDto> for StoredMessage {
    fn from(m: StoredMessageDto) -> Self {
        StoredMessage {
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            turn_id: m.turn_id,
            sent_at: m.sent_at,
            cancelled_at: m.cancelled_at,
            sender_session_id: m.sender_session_id,
            sender_api_key_name: m.sender_api_key_name,
            full_message: m.full_message,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedChatDto {
    /// Each message's `full_message` JSON, oldest first.
    pub messages: Vec<String>,
    pub agent_session_id: Option<String>,
}

#[tauri::command]
pub async fn chat_messages_save(
    db: Managed<'_, Db>,
    chat_id: String,
    upserts: Vec<StoredMessageDto>,
    delete_ids: Vec<String>,
    agent_session_id: Option<String>,
    rewind_to: Option<String>,
) -> Result<(), String> {
    let batch = Batch {
        upserts: upserts.into_iter().map(StoredMessage::from).collect(),
        delete_ids,
        agent_session_id,
        rewind_to,
    };
    store::save(&db.0, &chat_id, &batch)
        .await
        .map_err(|e| e.to_string())?;
    let Some(at) = store::latest_user_message_at(&batch) else {
        return Ok(());
    };
    match workspaces::touch(&db.0, workspace_of_chat(&chat_id), at).await {
        // A chat whose workspace has no row (not persisted yet) has nothing to move.
        Ok(()) | Err(Error::NotFound) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The workspace a chat belongs to: the main chat's id is the workspace id and
/// a review chat's is `<workspace id>:review:<n>` (src/state/workspaceSessions.ts).
fn workspace_of_chat(chat_id: &str) -> &str {
    chat_id.split(":review:").next().unwrap_or(chat_id)
}

#[tauri::command]
pub async fn chat_messages_load(
    db: Managed<'_, Db>,
    chat_id: String,
) -> Result<LoadedChatDto, String> {
    let loaded = store::load(&db.0, &chat_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(LoadedChatDto {
        messages: loaded.messages,
        agent_session_id: loaded.agent_session_id,
    })
}

#[cfg(test)]
mod tests {
    use super::workspace_of_chat;

    #[test]
    fn a_review_chat_belongs_to_its_workspace() {
        assert_eq!(workspace_of_chat("app/oslo"), "app/oslo");
        assert_eq!(workspace_of_chat("app/oslo:review:2"), "app/oslo");
    }
}
