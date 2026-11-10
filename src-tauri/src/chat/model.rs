//! Chat data model shared by the backend and the IPC boundary.
//!
//! The JSON shape (camelCase fields, `type` tags) is the contract with the
//! frontend mirror in `src/features/chat/types.ts`; `tests.rs` pins it.
//!
//! Columns follow Conductor's `session_messages` table (see
//! `evidence/sqlite/conductor.schema.sql`): `id`, `session_id`, `turn_id`,
//! `role`, `created_at`, `model`, `cancelled_at`, `sender_session_id`,
//! `sender_api_key_name`, and `full_message` (the structured content, our
//! `blocks`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
    System,
}

/// One piece of a message. Assistant messages carry text, thinking and
/// tool calls; tool results come back as their own blocks so a tool call
/// and its result can be paired by `id` / `tool_use_id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Block {
    Text {
        text: String,
    },
    Thinking {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
}

impl Block {
    pub fn text(text: impl Into<String>) -> Self {
        Block::Text { text: text.into() }
    }

    /// Text and thinking blocks are the only ones a `text_delta` may grow.
    pub fn streamable_text_mut(&mut self) -> Option<&mut String> {
        match self {
            Block::Text { text } | Block::Thinking { text } => Some(text),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SentUserPart {
    Text {
        text: String,
    },
    File {
        path: String,
        label: String,
        directory: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SentAttachment {
    WorkspaceFile {
        name: String,
        label: String,
        path: String,
    },
    Embedded {
        name: String,
        label: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentUserContentV1 {
    pub version: u8,
    pub parts: Vec<SentUserPart>,
    pub attachments: Vec<SentAttachment>,
}

fn valid_sent_path(path: &str) -> bool {
    let scheme = path.split_once(':').is_some_and(|(prefix, _)| {
        prefix
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic)
            && prefix
                .bytes()
                .all(|ch| ch.is_ascii_alphanumeric() || b"+.-".contains(&ch))
    });
    !path.is_empty()
        && !path.contains(['\0', '\\'])
        && !path.starts_with("//")
        && !scheme
        && !path.split('/').any(|part| part == "." || part == "..")
}

fn deserialize_user_content<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<SentUserContentV1>, D::Error> {
    let raw = Option::<Value>::deserialize(deserializer)?;
    Ok(raw
        .and_then(|value| serde_json::from_value::<SentUserContentV1>(value).ok())
        .filter(|content| {
            content.version == 1
                && content.parts.iter().all(|part| match part {
                    SentUserPart::Text { .. } => true,
                    SentUserPart::File { path, .. } => valid_sent_path(path),
                })
                && content
                    .attachments
                    .iter()
                    .all(|attachment| match attachment {
                        SentAttachment::Embedded { .. } => true,
                        SentAttachment::WorkspaceFile { path, .. } => valid_sent_path(path),
                    })
                && (content
                    .parts
                    .iter()
                    .any(|part| matches!(part, SentUserPart::File { .. }))
                    || content.attachments.iter().any(|attachment| {
                        matches!(attachment, SentAttachment::WorkspaceFile { .. })
                    }))
        }))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub turn_id: String,
    pub role: Role,
    /// RFC 3339 UTC timestamp, millisecond precision.
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancelled_at: Option<String>,
    /// Set when another session sent this message (e.g. a child session's
    /// report). Such a message is input to the turn, not something the user
    /// typed, and the UI must never render it as the user's own message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_session_id: Option<String>,
    /// Set when the message arrived through an API key rather than the app.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_api_key_name: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_user_content"
    )]
    pub user_content: Option<SentUserContentV1>,
    #[serde(default)]
    pub blocks: Vec<Block>,
}

/// Who a message came from, for rendering. Derived from `role` and the
/// sender columns; never stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageOrigin<'a> {
    /// Typed by the person using the app.
    User,
    Assistant,
    System,
    /// Sent by another session, such as a child session reporting back.
    Session(&'a str),
    /// Sent through a named API key.
    ApiKey(&'a str),
}

impl ChatMessage {
    /// A user-role message counts as the user's own only when no other
    /// session or API key sent it. A session sender wins over an API key.
    pub fn origin(&self) -> MessageOrigin<'_> {
        match self.role {
            Role::Assistant => MessageOrigin::Assistant,
            Role::System => MessageOrigin::System,
            Role::User => {
                if let Some(id) = self.sender_session_id.as_deref() {
                    MessageOrigin::Session(id)
                } else if let Some(name) = self.sender_api_key_name.as_deref() {
                    MessageOrigin::ApiKey(name)
                } else {
                    MessageOrigin::User
                }
            }
        }
    }

    /// Concatenated text blocks; what Conductor keeps in the plain
    /// `session_messages.content` column next to the structured message.
    pub fn plain_text(&self) -> String {
        let mut out = String::new();
        for block in &self.blocks {
            if let Block::Text { text } = block {
                if !out.is_empty() && !text.is_empty() {
                    out.push_str("\n\n");
                }
                out.push_str(text);
            }
        }
        out
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnStatus {
    Running,
    Completed,
    Cancelled,
    Failed,
}

impl TurnStatus {
    pub fn is_terminal(self) -> bool {
        !matches!(self, TurnStatus::Running)
    }
}

/// Everything the backend pushes to a subscriber.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ChatEvent {
    /// Insert the message, or replace the one with the same `id`.
    Upsert { message: ChatMessage },
    /// Append `delta` to the text or thinking block at `block_index`. When
    /// `block_index` equals the block count, a new text block is started.
    TextDelta {
        session_id: String,
        message_id: String,
        block_index: usize,
        delta: String,
    },
    TurnStatus {
        session_id: String,
        turn_id: String,
        status: TurnStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
}

impl ChatEvent {
    pub fn session_id(&self) -> &str {
        match self {
            ChatEvent::Upsert { message } => &message.session_id,
            ChatEvent::TextDelta { session_id, .. } | ChatEvent::TurnStatus { session_id, .. } => {
                session_id
            }
        }
    }
}

/// Current time as RFC 3339 UTC with milliseconds, e.g.
/// `2026-11-05T10:15:00.123Z`. Implemented on `std` so the module needs no
/// date crate.
pub fn now_rfc3339() -> String {
    let since = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_rfc3339_millis(since.as_millis() as i64)
}

pub fn format_rfc3339_millis(unix_millis: i64) -> String {
    let secs = unix_millis.div_euclid(1000);
    let millis = unix_millis.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        sod / 3600,
        (sod % 3600) / 60,
        sod % 60
    )
}

/// Howard Hinnant's days-to-civil algorithm (proleptic Gregorian).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
