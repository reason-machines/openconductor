//! Chat: message model, streaming events and the per-session transcript.
//!
//! Event model (the IPC contract with `src/features/chat/`):
//!
//! * [`ChatMessage`] `{ id, sessionId, turnId, role, createdAt, model?,
//!   cancelledAt?, blocks }`, where a [`Block`] is `text`, `thinking`,
//!   `tool_use` or `tool_result`.
//! * [`ChatEvent`] is `upsert` (insert or replace a message by id),
//!   `text_delta` (append to a text or thinking block while it streams) or
//!   `turn_status` (`running`, `completed`, `cancelled`, `failed`).
//! * [`Transcript`] applies events in order; backend and frontend run the
//!   same reducer, so a subscriber that starts from a snapshot and applies
//!   every later event holds the backend's transcript.
//!
//! The module depends on `std`, `serde` and `serde_json` only, so it builds
//! and tests on its own (`tools/chat/run-rust-tests.sh`) before the Tauri
//! crate wires it into commands.

mod model;
mod transcript;

#[cfg(test)]
mod tests;

pub use model::{
    format_rfc3339_millis, now_rfc3339, Block, ChatEvent, ChatMessage, MessageOrigin, Role,
    TurnStatus,
};
pub use transcript::{ApplyError, Transcript};
