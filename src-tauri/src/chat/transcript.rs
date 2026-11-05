//! Ordered message list for one session, built by applying [`ChatEvent`]s.
//!
//! The frontend runs the same reducer (`src/features/chat/reducer.ts`), so a
//! subscriber that starts from a snapshot and applies every later event ends
//! up with exactly the backend's transcript.

use super::model::{Block, ChatEvent, ChatMessage, TurnStatus};
use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyError {
    WrongSession {
        expected: String,
        got: String,
    },
    UnknownMessage(String),
    BlockIndexOutOfRange {
        message_id: String,
        index: usize,
        len: usize,
    },
    NotATextBlock {
        message_id: String,
        index: usize,
    },
}

impl fmt::Display for ApplyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApplyError::WrongSession { expected, got } => {
                write!(f, "event for session {got} applied to session {expected}")
            }
            ApplyError::UnknownMessage(id) => write!(f, "text delta for unknown message {id}"),
            ApplyError::BlockIndexOutOfRange {
                message_id,
                index,
                len,
            } => write!(
                f,
                "text delta block {index} out of range for message {message_id} ({len} blocks)"
            ),
            ApplyError::NotATextBlock { message_id, index } => {
                write!(
                    f,
                    "block {index} of message {message_id} is not text or thinking"
                )
            }
        }
    }
}

impl std::error::Error for ApplyError {}

#[derive(Debug, Clone, Default)]
pub struct Transcript {
    session_id: String,
    messages: Vec<ChatMessage>,
    index: HashMap<String, usize>,
    active_turn: Option<String>,
    last_status: HashMap<String, TurnStatus>,
}

impl Transcript {
    pub fn new(session_id: impl Into<String>) -> Self {
        Transcript {
            session_id: session_id.into(),
            ..Default::default()
        }
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn messages(&self) -> &[ChatMessage] {
        &self.messages
    }

    pub fn get(&self, id: &str) -> Option<&ChatMessage> {
        self.index.get(id).map(|&i| &self.messages[i])
    }

    /// The turn that is currently running, if any.
    pub fn active_turn(&self) -> Option<&str> {
        self.active_turn.as_deref()
    }

    pub fn turn_status(&self, turn_id: &str) -> Option<TurnStatus> {
        self.last_status.get(turn_id).copied()
    }

    /// Apply one event. On error the transcript is unchanged.
    pub fn apply(&mut self, event: &ChatEvent) -> Result<(), ApplyError> {
        if event.session_id() != self.session_id {
            return Err(ApplyError::WrongSession {
                expected: self.session_id.clone(),
                got: event.session_id().to_string(),
            });
        }
        match event {
            ChatEvent::Upsert { message } => {
                match self.index.get(&message.id) {
                    Some(&i) => self.messages[i] = message.clone(),
                    None => {
                        self.index.insert(message.id.clone(), self.messages.len());
                        self.messages.push(message.clone());
                    }
                }
                Ok(())
            }
            ChatEvent::TextDelta {
                message_id,
                block_index,
                delta,
                ..
            } => {
                let &i = self
                    .index
                    .get(message_id)
                    .ok_or_else(|| ApplyError::UnknownMessage(message_id.clone()))?;
                let blocks = &mut self.messages[i].blocks;
                let len = blocks.len();
                if *block_index == len {
                    blocks.push(Block::text(delta.clone()));
                    return Ok(());
                }
                let block = blocks.get_mut(*block_index).ok_or_else(|| {
                    ApplyError::BlockIndexOutOfRange {
                        message_id: message_id.clone(),
                        index: *block_index,
                        len,
                    }
                })?;
                let text =
                    block
                        .streamable_text_mut()
                        .ok_or_else(|| ApplyError::NotATextBlock {
                            message_id: message_id.clone(),
                            index: *block_index,
                        })?;
                text.push_str(delta);
                Ok(())
            }
            ChatEvent::TurnStatus {
                turn_id, status, ..
            } => {
                self.last_status.insert(turn_id.clone(), *status);
                if *status == TurnStatus::Running {
                    self.active_turn = Some(turn_id.clone());
                } else if self.active_turn.as_deref() == Some(turn_id.as_str()) {
                    self.active_turn = None;
                }
                Ok(())
            }
        }
    }
}
