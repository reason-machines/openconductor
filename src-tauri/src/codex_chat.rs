//! Tauri commands for chats whose agent is Codex ([`crate::agent::codex_runner`]).
//!
//! Each chat (the chat id is the workspace id) has its own `codex app-server`,
//! started on the chat's first prompt in the workspace folder, with the Codex
//! provider chosen in settings (its CLI login by default). Events stream to the
//! window as [`EVENT`]: a [`Payload`] with the `chatId` added. The UI flow:
//!
//! 1. `codex_open_chat(chatId, cwd, threadId?, policy?)` when a Codex chat is
//!    shown; pass the thread id saved from its `threadStarted` event so a chat
//!    reopened after a restart resumes its thread.
//! 2. `codex_prompt(chatId, text, model?, effort?)` for each message; it
//!    resolves with the prompt's end (`{ outcome, message? }`), which also
//!    arrives as a `turnEnded` event.
//! 3. `codex_answer(chatId, requestId, decision)` for an `approval` event.
//! 4. `codex_cancel(chatId)` for Stop; `codex_close_chat(chatId)` ends the
//!    process (archive, app exit).

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::agent::codex_cli::{
    find_codex_cli, ApprovalPolicy, CodexLaunch, CodexPolicy, SandboxMode,
};
use crate::agent::codex_rpc::{ApprovalDecision, RequestId, ThreadOptions};
use crate::agent::codex_runner::{CodexRunner, RunnerConfig, Sink, Timeouts};
use crate::agent::codex_wire::{Payload, TurnEnd};
use crate::agent::AgentKind;
use crate::settings::service::SettingsService;

pub const EVENT: &str = "codex-chat-event";

#[derive(Default)]
pub struct CodexChats {
    chats: Mutex<HashMap<String, Arc<CodexRunner>>>,
    /// The user's login-shell `PATH`, read once.
    shell_path: OnceLock<Option<OsString>>,
}

/// Until the chat offers a choice: ask before commands outside the
/// workspace, write only inside it.
fn default_policy() -> CodexPolicy {
    CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::WorkspaceWrite)
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

impl CodexChats {
    /// `PATH` from the user's login shell, falling back to the app's own.
    fn path(&self) -> Option<OsString> {
        self.shell_path
            .get_or_init(|| {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
                oc_scripts::shell_env::capture(&shell, None)
                    .and_then(|env| env.get("PATH").map(OsString::from))
                    .or_else(|| std::env::var_os("PATH"))
            })
            .clone()
    }

    fn cli(&self) -> Option<PathBuf> {
        find_codex_cli(self.path().as_deref(), home().as_deref())
    }

    fn get(&self, chat_id: &str) -> Result<Arc<CodexRunner>, String> {
        self.chats
            .lock()
            .unwrap()
            .get(chat_id)
            .cloned()
            .ok_or_else(|| format!("Codex chat {chat_id} is not open"))
    }

    /// Ends every chat's process (app exit).
    pub fn close_all(&self) {
        let chats = std::mem::take(&mut *self.chats.lock().unwrap());
        drop(chats);
    }
}

fn event_json(chat_id: &str, payload: &Payload) -> Value {
    let mut v = serde_json::to_value(payload).unwrap_or(Value::Null);
    if let Value::Object(map) = &mut v {
        map.insert("chatId".into(), Value::String(chat_id.to_owned()));
    }
    v
}

/// Absolute path of the `codex` the chat would run, or null.
#[tauri::command]
pub async fn codex_cli_path(state: State<'_, CodexChats>) -> Result<Option<String>, String> {
    Ok(state.cli().map(|p| p.display().to_string()))
}

/// Opens the chat (no process yet). Opening an open chat keeps it as is.
#[tauri::command]
pub async fn codex_open_chat(
    app: AppHandle,
    state: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
    chat_id: String,
    cwd: String,
    thread_id: Option<String>,
    policy: Option<CodexPolicy>,
) -> Result<(), String> {
    if state.chats.lock().unwrap().contains_key(&chat_id) {
        return Ok(());
    }
    let cli = state.cli().ok_or(
        "The Codex CLI was not found. Install it (npm i -g @openai/codex), then sign in with `codex login`.",
    )?;
    let mut env = settings.launch_env(AgentKind::Codex)?;
    if let Some(path) = state.path() {
        env.set("PATH", path.to_string_lossy());
    }
    let cwd = PathBuf::from(cwd);
    let mut launch = CodexLaunch::new(&cwd, env);
    launch.executable = cli;
    let config = RunnerConfig {
        launch,
        thread: ThreadOptions {
            cwd: Some(cwd),
            model: None,
            policy: policy.unwrap_or_else(default_policy),
            developer_instructions: None,
        },
        resume: thread_id,
        client_name: "openconductor".into(),
        client_version: env!("CARGO_PKG_VERSION").into(),
        timeouts: Timeouts::default(),
    };
    let chat = chat_id.clone();
    let sink: Sink = Arc::new(move |payload: Payload| {
        let _ = app.emit(EVENT, event_json(&chat, &payload));
    });
    let runner = Arc::new(CodexRunner::start(config, sink));
    state.chats.lock().unwrap().entry(chat_id).or_insert(runner);
    Ok(())
}

/// Runs one prompt (after any still queued); events arrive meanwhile.
/// Without `effort`, the Codex thinking level from settings is used.
#[tauri::command]
pub async fn codex_prompt(
    state: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
    chat_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
) -> Result<TurnEnd, String> {
    let runner = state.get(&chat_id)?;
    let effort = effort.or_else(|| {
        let level = settings.get().ok()?.models.codex.default_thinking_level;
        serde_json::to_value(level)
            .ok()?
            .as_str()
            .map(str::to_owned)
    });
    let end = runner.prompt(text, model, effort);
    tauri::async_runtime::spawn_blocking(move || {
        end.recv()
            .unwrap_or_else(|_| TurnEnd::failed("The Codex chat closed."))
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn codex_cancel(state: State<'_, CodexChats>, chat_id: String) -> Result<(), String> {
    state.get(&chat_id)?.cancel();
    Ok(())
}

#[tauri::command]
pub fn codex_answer(
    state: State<'_, CodexChats>,
    chat_id: String,
    request_id: RequestId,
    decision: ApprovalDecision,
) -> Result<(), String> {
    state.get(&chat_id)?.answer(request_id, decision);
    Ok(())
}

/// Ends the chat's process; a later `codex_open_chat` starts over.
#[tauri::command]
pub async fn codex_close_chat(state: State<'_, CodexChats>, chat_id: String) -> Result<(), String> {
    let runner = state.chats.lock().unwrap().remove(&chat_id);
    // Dropping the last handle joins the runner thread, which can take a
    // moment while a call is in flight.
    tauri::async_runtime::spawn_blocking(move || drop(runner))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::codex_wire::Outcome;

    #[test]
    fn events_carry_the_chat_id_beside_the_payload() {
        let v = event_json(
            "ws-1",
            &Payload::TurnEnded {
                end: TurnEnd {
                    outcome: Outcome::Completed,
                    message: None,
                },
            },
        );
        assert_eq!(
            v,
            serde_json::json!({"type": "turnEnded", "outcome": "completed", "chatId": "ws-1"})
        );
    }

    #[test]
    fn prompt_arguments_parse_from_the_frontend_shapes() {
        let policy: CodexPolicy = serde_json::from_value(
            serde_json::json!({"approvalPolicy": "never", "sandbox": "read-only"}),
        )
        .unwrap();
        assert_eq!(
            policy,
            CodexPolicy::new(ApprovalPolicy::Never, SandboxMode::ReadOnly)
        );
        let id: RequestId = serde_json::from_value(serde_json::json!(0)).unwrap();
        assert_eq!(id, RequestId::Int(0));
        let d: ApprovalDecision =
            serde_json::from_value(serde_json::json!("acceptForSession")).unwrap();
        assert_eq!(d, ApprovalDecision::AcceptForSession);
    }
}
