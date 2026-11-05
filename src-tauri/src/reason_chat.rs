//! Tauri commands for chats whose agent is Reason ([`crate::reason_acp`]).
//!
//! One [`ReasonProvider`] (one `reason acp` process) serves every Reason
//! chat; it is started on first use, in the user's home folder. Events
//! stream to the window as [`wire::EVENT`] with the payloads in
//! [`wire::event_json`]. The UI flow:
//!
//! 1. `reason_open_chat(chatId, cwd, sessionId?, config?)` when a Reason
//!    chat is shown; pass the Session id saved from its `sessionStarted`
//!    event so a chat reopened after a restart resumes its Session.
//!    `config` (`[{ id, value }]`, e.g. `model`, `reasoning_effort`) is set
//!    on the Session when it is created; one Reason does not offer comes
//!    back as a `notice` event.
//! 2. `reason_prompt(chatId, text, attachments?)` for the first message and
//!    every follow-up; it resolves with the turn's end once the turn is
//!    over. `attachments` (`[{ name, text }]`) go to Reason as embedded
//!    files after the text.
//! 3. `reason_cancel(chatId)` for Stop.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::reason_acp::cli::{find_reason_cli, LaunchConfig};
use crate::reason_acp::provider::{Attachment, ConfigChoice, ProviderEvent, ReasonProvider, Sink};
use crate::reason_acp::wire;

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
    config: Option<Vec<ConfigArg>>,
) -> Result<(), String> {
    let provider = state.provider(&app)?;
    provider.open_chat(&chat_id, &PathBuf::from(cwd), session_id);
    let config = config.unwrap_or_default().into_iter();
    let config = config.map(|c| ConfigChoice {
        id: c.id,
        value: c.value,
    });
    provider.set_config(&chat_id, config.collect());
    Ok(())
}

/// Runs one turn; events arrive meanwhile. Resolves with the turn's end
/// (`{ outcome, message? }`).
#[tauri::command]
pub async fn reason_prompt(
    app: AppHandle,
    state: State<'_, ReasonChats>,
    chat_id: String,
    text: String,
    attachments: Option<Vec<AttachmentArg>>,
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
    let end = tauri::async_runtime::spawn_blocking(move || {
        provider.prompt_with(&chat_id, &text, &attachments)
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(wire::turn_end_json(&end))
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
