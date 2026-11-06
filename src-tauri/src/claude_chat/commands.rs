//! Tauri commands for Claude Code chats. Events stream to the window as
//! [`EVENT`], with the same payloads as Reason chats
//! ([`crate::reason_acp::wire::event_json`]).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::agent::{AgentKind, ClaudeLaunch, PermissionMode};
use crate::agent_binaries::Agent;
use crate::reason_acp::provider::{ProviderEvent, Sink};
use crate::reason_acp::wire;
use crate::reason_chat::TurnArg;
use crate::settings::service::SettingsService;
use crate::turn_checkpoint::{around_turn, TurnTarget};

use super::interact::Answer;
use super::runner::{ClaudeRunner, Launcher};

pub const EVENT: &str = "claude-chat-event";

#[derive(Default)]
pub struct ClaudeChats {
    runner: OnceLock<Arc<ClaudeRunner>>,
    /// Each open chat's folder, checkpointed around its turns.
    cwds: Mutex<HashMap<String, PathBuf>>,
}

impl ClaudeChats {
    fn runner(&self, app: &AppHandle) -> Arc<ClaudeRunner> {
        self.runner
            .get_or_init(|| {
                let settings_app = app.clone();
                let launcher: Launcher = Arc::new(move |cwd, resume| {
                    // Settings path, else the bundled copy (waits for its
                    // download), else the CLI on PATH (agent_launch.rs).
                    let exe = crate::agent_launch::launch(&settings_app, Agent::Claude)?;
                    let settings = settings_app.state::<SettingsService>();
                    let env = settings.launch_env(AgentKind::Claude)?;
                    let mut launch = ClaudeLaunch::new(cwd, env);
                    launch.executable = exe;
                    launch.resume = resume;
                    // Account › "Claude Code tool approvals" (Conductor's
                    // `tool_approvals_enabled`, off by default): ask before
                    // tools run; otherwise the agent works in the workspace's
                    // own worktree without asking.
                    let approvals = settings.inner().get().map(|s| s.tool_approvals_enabled);
                    launch.permission_mode = if approvals.unwrap_or(false) {
                        PermissionMode::Default
                    } else {
                        PermissionMode::BypassPermissions
                    };
                    // "Use Claude Code with Chrome" (Settings › Agents): the
                    // reference sidecar adds `extraArgs: { chrome: null }`.
                    // The launcher runs on a blocking thread (claude_prompt's
                    // spawn_blocking), so it can wait on the database.
                    launch.chrome = settings_app
                        .try_state::<crate::db::Db>()
                        .and_then(|db| {
                            tauri::async_runtime::block_on(crate::app_prefs::commands::load(&db.0)).ok()
                        })
                        .is_some_and(|p| p.chrome_mode_enabled);
                    Ok(launch)
                });
                let emit_app = app.clone();
                let sink: Sink = Arc::new(move |chat: &str, ev: ProviderEvent| {
                    let payload = wire::event_json(chat, &ev);
                    crate::e2e::log_event("claude", &payload);
                    let _ = emit_app.emit(EVENT, payload);
                });
                Arc::new(ClaudeRunner::new(launcher, sink))
            })
            .clone()
    }
}

/// Absolute path of the `claude` CLI chats would run now, or null.
#[tauri::command]
pub fn claude_cli_path(app: AppHandle) -> Option<String> {
    crate::agent_launch::current(&app, Agent::Claude).map(|r| r.path.display().to_string())
}

#[tauri::command]
pub fn claude_open_chat(
    app: AppHandle,
    state: State<'_, ClaudeChats>,
    chat_id: String,
    cwd: String,
    session_id: Option<String>,
) {
    let cwd = PathBuf::from(cwd);
    state.runner(&app).open_chat(&chat_id, &cwd, session_id);
    state.cwds.lock().unwrap().insert(chat_id, cwd);
}

/// Runs one turn; events arrive meanwhile. With `turn`, the workspace is
/// checkpointed before and after it, as for Reason chats
/// (`crate::reason_chat::reason_prompt`). Resolves with the turn's end
/// (`{ outcome, message?, turnChanges? }`).
#[tauri::command]
pub async fn claude_prompt(
    app: AppHandle,
    state: State<'_, ClaudeChats>,
    chat_id: String,
    text: String,
    turn: Option<TurnArg>,
) -> Result<Value, String> {
    let runner = state.runner(&app);
    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();
    // Announced before the start checkpoint, so a Stop while it is saved
    // still stops this prompt.
    runner.expect_prompt(&chat_id);
    let (end, changes) = tauri::async_runtime::spawn_blocking(move || {
        let target = match (&cwd, &turn) {
            (Some(workspace), Some(turn)) => Some(TurnTarget {
                workspace,
                session_id: &turn.session_id,
                turn_id: &turn.turn_id,
            }),
            _ => None,
        };
        around_turn(target, || runner.prompt(&chat_id, &text))
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
pub fn claude_cancel(app: AppHandle, state: State<'_, ClaudeChats>, chat_id: String) {
    state.runner(&app).cancel(&chat_id);
}

/// Answers the chat's waiting request `id` (a `permissionRequest` event):
/// `{ kind: "option", optionId: "allow" | "deny" }` for a tool,
/// `{ kind: "plan", approved, feedback? }` for a plan, `{ kind: "answers",
/// answers }` for questions, or `{ kind: "cancel" }`.
#[tauri::command]
pub fn claude_respond(
    app: AppHandle,
    state: State<'_, ClaudeChats>,
    chat_id: String,
    id: String,
    answer: Value,
) -> Result<(), String> {
    let answer = Answer::from_json(&answer)?;
    state.runner(&app).respond(&chat_id, &id, &answer)
}
