//! Tauri commands for chats whose agent is Reason ([`crate::reason_acp`]).
//!
//! One [`ReasonProvider`] (one `reason acp` process) serves every Reason
//! chat; it is started on first use, in the user's home folder. Events
//! stream to the window as [`wire::EVENT`] with the payloads in
//! [`wire::event_json`]. The UI flow:
//!
//! 1. `reason_open_chat(chatId, cwd, sessionId?, config?)` when a Reason
//!    chat is shown; pass the Session id saved from its `sessionStarted`
//!    event so a chat reopened after a restart resumes its Session, in the
//!    workspace that has it (kept in `reason-session-workspaces.json`).
//!    `config` (`[{ id, value }]`, e.g. `model`, `reasoning_effort`) is set
//!    on the Session when it is created; one Reason does not offer comes
//!    back as a `notice` event.
//!    `reason_set_config(chatId, config)` changes them later (a model pick
//!    in a running chat): the open Session gets them before its next prompt.
//! 2. `reason_prompt(chatId, text, attachments?, turn?)` for the first
//!    message and every follow-up; it resolves with the turn's end once the
//!    turn is over. `attachments` (`[{ name, text }]`) go to Reason as
//!    embedded files after the text. With `turn: { sessionId, turnId }` the
//!    chat folder is checkpointed as `session-<sessionId>-turn-<turnId>-start|end`
//!    before and after the turn ([`crate::turn_checkpoint`]) and the result
//!    carries `turnChanges`, the files the turn changed (absent when a
//!    checkpoint was skipped or the turn touched more than 200 files).
//! 3. `reason_cancel(chatId)` for Stop.
//! 4. `reason_models()` lists the models Reason offers. After each turn a
//!    `sessionModel` event (`{ model, effort }`) says what the Session ran.
//! 5. `reason_answer_permission(chatId, requestId, optionId?)` answers a
//!    `permissionRequest` event: with the chosen option, or `cancelled`
//!    without one. A `permissionResolved` event follows.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::reason_acp::cli::{find_reason_cli, LaunchConfig};
use crate::reason_acp::provider::{Attachment, ConfigChoice, ProviderEvent, ReasonProvider, Sink};
use crate::reason_acp::wire;
use crate::turn_checkpoint::{around_turn, TurnTarget};

/// JS `{ id, value }`: one Session config option.
#[derive(Debug, Deserialize)]
pub struct ConfigArg {
    pub id: String,
    pub value: String,
}

/// JS `{ name, text }`: one attachment sent with a prompt.
#[derive(Debug, Deserialize)]
pub struct AttachmentArg {
    pub name: String,
    pub text: String,
}

#[derive(Default)]
pub struct ReasonChats {
    provider: Mutex<Option<Arc<ReasonProvider>>>,
    /// Each open chat's folder, checkpointed around its turns.
    cwds: Mutex<HashMap<String, PathBuf>>,
}

/// The provider's Session-to-workspace map, in the app data folder.
const SESSION_STORE: &str = "reason-session-workspaces.json";

fn home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set".to_string())
}

pub(crate) fn cli_path() -> Option<PathBuf> {
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
        let store = app
            .path()
            .app_data_dir()
            .ok()
            .map(|d| d.join(SESSION_STORE));
        let app = app.clone();
        let sink: Sink = Arc::new(move |chat: &str, ev: ProviderEvent| {
            let event = wire::event_json(chat, &ev);
            crate::e2e::log_event("reason", &event);
            let _ = app.emit(wire::EVENT, event);
        });
        let mut provider = ReasonProvider::new(launch, home()?, sink);
        // Each Session's workspace, so a chat resumes there after a restart
        // even when the Reason desktop app has another workspace selected.
        if let Some(store) = store {
            provider = provider.with_session_store(store);
        }
        let provider = Arc::new(provider);
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
    config: Option<Vec<ConfigArg>>,
) -> Result<(), String> {
    let provider = state.provider(&app)?;
    let cwd = PathBuf::from(cwd);
    provider.open_chat(&chat_id, &cwd, session_id);
    let config = config.unwrap_or_default().into_iter();
    let config = config.map(|c| ConfigChoice {
        id: c.id,
        value: c.value,
    });
    provider.set_config(&chat_id, config.collect());
    state.cwds.lock().unwrap().insert(chat_id, cwd);
    Ok(())
}

/// A chat's new config options, for its open Session's next prompt.
#[tauri::command]
pub fn reason_set_config(state: State<'_, ReasonChats>, chat_id: String, config: Vec<ConfigArg>) {
    if let Some(p) = state.provider.lock().unwrap().as_ref() {
        let config = config.into_iter().map(|c| ConfigChoice {
            id: c.id,
            value: c.value,
        });
        p.set_config(&chat_id, config.collect());
    }
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
    attachments: Option<Vec<AttachmentArg>>,
    turn: Option<TurnArg>,
) -> Result<Value, String> {
    let provider = state.provider(&app)?;
    let attachments: Vec<Attachment> = attachments
        .unwrap_or_default()
        .into_iter()
        .map(|a| Attachment {
            name: a.name,
            text: a.text,
        })
        .collect();
    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();
    // Announced before the start checkpoint, so a Stop while it is saved
    // still stops this prompt.
    let ticket = provider.expect_prompt(&chat_id);
    let (end, changes) = tauri::async_runtime::spawn_blocking(move || {
        let target = match (&cwd, &turn) {
            (Some(workspace), Some(turn)) => Some(TurnTarget {
                workspace,
                session_id: &turn.session_id,
                turn_id: &turn.turn_id,
            }),
            _ => None,
        };
        around_turn(target, || {
            provider.prompt_expected(&chat_id, &text, &attachments, ticket)
        })
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

/// Answers the chat's open permission request; false when it is no longer open.
#[tauri::command]
pub fn reason_answer_permission(
    state: State<'_, ReasonChats>,
    chat_id: String,
    request_id: String,
    option_id: Option<String>,
) -> bool {
    let provider = state.provider.lock().unwrap().clone();
    provider.is_some_and(|p| p.answer_permission(&chat_id, &request_id, option_id.as_deref()))
}

/// The models Reason offers (`{ current, options: [{ value, name, description? }] }`).
#[tauri::command]
pub async fn reason_models(app: AppHandle, state: State<'_, ReasonChats>) -> Result<Value, String> {
    let provider = state.provider(&app)?;
    let list = tauri::async_runtime::spawn_blocking(move || provider.models())
        .await
        .map_err(|e| e.to_string())??;
    Ok(wire::models_json(&list))
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
