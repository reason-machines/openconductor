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

use crate::agent::AgentKind;
use crate::reason_acp::account::{Account, CommandResult, LoginPrompt};
use crate::reason_acp::cli::{find_reason_cli, CliEnv, LaunchConfig};
use crate::reason_acp::cloud::CallError;
use crate::reason_acp::cloud::CloudSetup;
use crate::reason_acp::provider::{Attachment, ConfigChoice, ProviderEvent, ReasonProvider, Sink};
use crate::reason_acp::wire;
use crate::settings::service::SettingsService;
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

/// How `reason` runs per Settings › Agents › Reason: the executable path
/// override (else the installed CLI), the provider's environment (an API
/// key) and the workspace new chats open in.
fn configured(app: &AppHandle) -> Result<(LaunchConfig, Option<String>), String> {
    let service = app.state::<SettingsService>();
    let settings = service.get().map_err(|e| e.to_string())?;
    let cli = match settings.reason_executable_path.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => cli_path().ok_or(
            "The Reason CLI was not found. Install it, then sign in from Settings › Agents › Reason.",
        )?,
    };
    let launch_env = service.launch_env(AgentKind::Reason)?;
    let mut env = CliEnv::default();
    for name in launch_env.removed_vars() {
        env.remove(name);
    }
    for (name, value) in launch_env.set_vars() {
        env.set(name, value.expose());
    }
    let launch = LaunchConfig::new(cli).map_err(|e| e.to_string())?.env(env);
    let workspace = settings.reason.workspace.filter(|w| !w.trim().is_empty());
    Ok((launch, workspace))
}

impl ReasonChats {
    fn provider(&self, app: &AppHandle) -> Result<Arc<ReasonProvider>, String> {
        let (launch, workspace) = configured(app)?;
        let mut slot = self.provider.lock().unwrap();
        if let Some(p) = slot.as_ref() {
            p.reconfigure(launch, workspace);
            return Ok(p.clone());
        }
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
        provider.reconfigure_workspace(workspace);
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
pub fn reason_cli_path(app: AppHandle) -> Option<String> {
    configured(&app)
        .ok()
        .map(|(l, _)| l.cli().display().to_string())
}

/// Runs `f` with the configured CLI off the UI thread, in the home folder.
async fn with_cli<T: Send + 'static>(
    app: &AppHandle,
    f: impl FnOnce(&LaunchConfig, &std::path::Path) -> T + Send + 'static,
) -> Result<T, String> {
    let (launch, _) = configured(app)?;
    let dir = home()?;
    tauri::async_runtime::spawn_blocking(move || f(&launch, &dir))
        .await
        .map_err(|e| e.to_string())
}

/// Settings › Agents › Reason's status: `reason status --json` with the
/// configured CLI and key (version, account, workspaces, this computer).
#[tauri::command]
pub async fn reason_account_status(app: AppHandle) -> Result<Account, String> {
    with_cli(&app, |l, dir| l.account(dir))
        .await?
        .ok_or_else(|| "`reason status` did not answer".into())
}

/// Settings › Cloud setup: whether the configured `reason` login can run
/// cloud workspaces (Reason Sessions on Reason cloud computers). Four
/// `reason call` reads of the Reason HTTP API, run at the same time.
#[tauri::command]
pub async fn reason_cloud_setup(app: AppHandle) -> Result<CloudSetup, String> {
    with_cli(&app, |l, dir| l.cloud_setup(dir)).await
}

/// Starts signing in from the app: the link to open and the code it shows.
/// The page polls [`reason_account_status`] until the account appears.
#[tauri::command]
pub async fn reason_login_start(app: AppHandle) -> Result<LoginPrompt, String> {
    with_cli(&app, |l, dir| l.login(dir)).await?
}

/// Paths Settings › Agents › Reason shows: the installed `reason` ("Use
/// system Reason") and the CLI's own config folder (`~/.config/reason`,
/// where it keeps its login, connection and preferences).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasonPaths {
    pub system_cli: Option<String>,
    pub config_dir: Option<String>,
}

#[tauri::command]
pub fn reason_paths() -> ReasonPaths {
    ReasonPaths {
        system_cli: cli_path().map(|p| p.display().to_string()),
        config_dir: home()
            .ok()
            .map(|h| h.join(".config/reason").display().to_string()),
    }
}

/// One public Reason API operation through `reason call`, in the configured
/// Workspace: Routines read and change Reason Loops with it. Only the
/// operations in [`crate::reason_acp::api::OPERATIONS`] run.
#[tauri::command]
pub async fn reason_api_call(
    app: AppHandle,
    operation: String,
    input: Value,
) -> Result<Value, CallError> {
    let unavailable = |message: String| CallError {
        code: "reason_unavailable".into(),
        message,
    };
    let (launch, workspace) = configured(&app).map_err(unavailable)?;
    let launch = launch
        .in_workspace(workspace.as_deref())
        .map_err(|e| unavailable(e.to_string()))?;
    let dir = home().map_err(unavailable)?;
    tauri::async_runtime::spawn_blocking(move || launch.api_call(&dir, &operation, &input))
        .await
        .map_err(|e| CallError {
            code: "no_answer".into(),
            message: e.to_string(),
        })?
}

/// "Connect" next to "This Mac": `reason connect`.
#[tauri::command]
pub async fn reason_connect_computer(app: AppHandle) -> Result<CommandResult, String> {
    with_cli(&app, |l, dir| l.connect_computer(dir)).await
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
