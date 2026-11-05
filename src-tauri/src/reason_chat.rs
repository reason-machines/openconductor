//! Tauri commands for chats whose agent is Reason ([`crate::reason_acp`]).
//!
//! One [`ReasonProvider`] (one `reason acp` process) serves every Reason
//! chat; it is started on first use, in the user's home folder. Events
//! stream to the window as [`wire::EVENT`] with the payloads in
//! [`wire::event_json`]. The UI flow:
//!
//! 1. `reason_open_chat(chatId, cwd, sessionId?)` when a Reason chat is
//!    shown; pass the Session id saved from its `sessionStarted` event so
//!    a chat reopened after a restart resumes its Session.
//! 2. `reason_prompt(chatId, text, turn?)` for the first message and every
//!    follow-up; it resolves with the turn's end once the turn is over. With
//!    `turn: { sessionId, turnId }` the chat folder is checkpointed as
//!    `session-<sessionId>-turn-<turnId>-start|end` before and after the turn
//!    ([`crate::turn_checkpoint`]) and the result carries `turnChanges`, the
//!    files the turn changed (absent when a checkpoint was skipped or the
//!    turn touched more than 200 files).
//! 3. `reason_cancel(chatId)` for Stop.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::reason_acp::cli::{find_reason_cli, LaunchConfig};
use crate::reason_acp::provider::{ProviderEvent, ReasonProvider, Sink};
use crate::reason_acp::wire;
use crate::turn_checkpoint::{around_turn, TurnTarget};

#[derive(Default)]
pub struct ReasonChats {
    provider: Mutex<Option<Arc<ReasonProvider>>>,
    /// Each open chat's folder, checkpointed around its turns.
    cwds: Mutex<HashMap<String, PathBuf>>,
}

fn home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set".to_string())
}

fn cli_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    find_reason_cli(std::env::var_os("PATH").as_deref(), home.as_deref())
}

impl ReasonChats {
    fn provider(&self, app: &AppHandle) -> Result<Arc<ReasonProvider>, String> {
        let mut slot = self.provider.lock().unwrap();
        if let Some(p) = slot.as_ref() {
            return Ok(p.clone());
        }
        let cli = cli_path()
            .ok_or("The Reason CLI was not found. Install it, then sign in with `reason login`.")?;
        let launch = LaunchConfig::new(cli).map_err(|e| e.to_string())?;
        let app = app.clone();
        let sink: Sink = Arc::new(move |chat: &str, ev: ProviderEvent| {
            let _ = app.emit(wire::EVENT, wire::event_json(chat, &ev));
        });
        let provider = Arc::new(ReasonProvider::new(launch, home()?, sink));
        *slot = Some(provider.clone());
        Ok(provider)
    }
}

/// Absolute path of the `reason` CLI the provider would run, or null.
#[tauri::command]
pub fn reason_cli_path() -> Option<String> {
    cli_path().map(|p| p.display().to_string())
}

#[tauri::command]
pub fn reason_open_chat(
    app: AppHandle,
    state: State<'_, ReasonChats>,
    chat_id: String,
    cwd: String,
    session_id: Option<String>,
) -> Result<(), String> {
    let provider = state.provider(&app)?;
    let cwd = PathBuf::from(cwd);
    provider.open_chat(&chat_id, &cwd, session_id);
    state.cwds.lock().unwrap().insert(chat_id, cwd);
    Ok(())
}

/// Names one turn's checkpoints: the frontend's `turnCheckpointRef`, the
/// ref-safe chat id and turn id (the same ids "Reset chat" restores).
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TurnArg {
    pub session_id: String,
    pub turn_id: String,
}

/// Runs one turn; events arrive meanwhile. Resolves with the turn's end
/// (`{ outcome, message?, turnChanges? }`).
#[tauri::command]
pub async fn reason_prompt(
    app: AppHandle,
    state: State<'_, ReasonChats>,
    chat_id: String,
    text: String,
    turn: Option<TurnArg>,
) -> Result<Value, String> {
    let provider = state.provider(&app)?;
    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();
    let (end, changes) = tauri::async_runtime::spawn_blocking(move || {
        let target = match (&cwd, &turn) {
            (Some(workspace), Some(turn)) => Some(TurnTarget {
                workspace,
                session_id: &turn.session_id,
                turn_id: &turn.turn_id,
            }),
            _ => None,
        };
        around_turn(target, || provider.prompt(&chat_id, &text))
    })
    .await
    .map_err(|e| e.to_string())?;
    let mut out = wire::turn_end_json(&end);
    if let Some(files) = changes {
        out["turnChanges"] = serde_json::to_value(files).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

#[tauri::command]
pub fn reason_cancel(state: State<'_, ReasonChats>, chat_id: String) {
    if let Some(p) = state.provider.lock().unwrap().as_ref() {
        p.cancel(&chat_id);
    }
}

/// Recent Sessions in the signed-in Workspace, newest first.
#[tauri::command]
pub async fn reason_list_sessions(
    app: AppHandle,
    state: State<'_, ReasonChats>,
) -> Result<Vec<Value>, String> {
    let provider = state.provider(&app)?;
    let list = tauri::async_runtime::spawn_blocking(move || provider.list_sessions())
        .await
        .map_err(|e| e.to_string())??;
    Ok(list.iter().map(wire::session_json).collect())
}
