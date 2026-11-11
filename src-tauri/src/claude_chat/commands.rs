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
use super::runner::{ChatOptions, ClaudeRunner, Launcher};

pub const EVENT: &str = "claude-chat-event";

#[derive(Default)]
pub struct ClaudeChats {
    runner: OnceLock<Arc<ClaudeRunner>>,
    /// Each open chat's folder, checkpointed around its turns.
    cwds: Mutex<HashMap<String, PathBuf>>,
}

impl ClaudeChats {
    pub fn busy(&self, app: &AppHandle, chat_id: &str) -> bool {
        self.runner(app).busy(&format!("{chat_id}:claude"))
    }

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
    workspace_id: Option<String>,
    options: Option<ChatOptions>,
) -> Result<Value, String> {
    let mut options = options.unwrap_or_default();
    let logical_id = crate::local_plan_mode::logical_chat_id(&chat_id).to_owned();
    let gate = app.state::<crate::local_plan_mode::LocalPlanModes>().gate(&logical_id);
    let mode_lease = gate.lock_owned().await;
    let settings = app.state::<SettingsService>().get().map_err(|e| e.to_string())?;
    let db = app.state::<crate::db::Db>();
    let mode = crate::local_plan_mode::load(&db.0, &logical_id, settings.models.default_plan_mode).await?;
    options.permission_mode = Some(crate::local_plan_mode::claude_permission(mode, settings.tool_approvals_enabled));
    let runner = state.runner(&app);
    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();
    // Stop also covers the database lookup before dispatch.
    runner.expect_prompt(&chat_id);
    drop(mode_lease);
    let directories: Result<Vec<PathBuf>, String> = async { if let Some(id) = workspace_id {
        let db = app.state::<crate::db::Db>();
        let source = openconductor_db::workspaces::get(&db.0, &id).await.map_err(|e| e.to_string())?
            .ok_or_else(|| "The source workspace no longer exists.".to_string())?;
        let expected = source.workspace.workspace_path.or(source.root_path).map(PathBuf::from);
        if expected.is_none() || expected != cwd {
            return Err("The chat folder does not match the source workspace.".into());
        }
        let paths = openconductor_db::workspace_links::resolve(&db.0, &id).await.map_err(|e| e.to_string())?;
        let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
        if paths.iter().any(|path| !path.is_absolute()) {
            return Err("Saved workspace links contain a non-local directory.".into());
        }
        Ok(paths)
    } else { Ok(Vec::new()) } }.await;
    let directories = match directories {
        Ok(paths) => paths,
        Err(error) => { runner.abandon_prompt(&chat_id); return Err(error); }
    };
    let (end, changes) = tauri::async_runtime::spawn_blocking(move || {
        let target = match (&cwd, &turn) {
            (Some(workspace), Some(turn)) => Some(TurnTarget {
                workspace,
                session_id: &turn.session_id,
                turn_id: &turn.turn_id,
            }),
            _ => None,
        };
        around_turn(target, || runner.prompt_with_options(&chat_id, &text, &directories, &options))
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
pub async fn claude_respond(
    app: AppHandle,
    state: State<'_, ClaudeChats>,
    chat_id: String,
    id: String,
    answer: Value,
) -> Result<(), String> {
    let answer = Answer::from_json(&answer)?;
    let logical_id = crate::local_plan_mode::logical_chat_id(&chat_id);
    let gate = app.state::<crate::local_plan_mode::LocalPlanModes>().gate(logical_id);
    let _mode_lease = gate.lock_owned().await;
    let runner = state.runner(&app);
    let approved = runner.approves_plan(&chat_id, &id, &answer);
    let db = app.state::<crate::db::Db>();
    let previous = if approved {
        let previous = crate::local_plan_mode::load(&db.0, logical_id, false).await?;
        crate::local_plan_mode::save(&db.0, logical_id, openconductor_db::sessions::PermissionMode::Default).await?;
        Some(previous)
    } else { None };
    if let Err(error) = runner.respond(&chat_id, &id, &answer) {
        if let Some(previous) = previous { crate::local_plan_mode::save(&db.0, logical_id, previous).await?; }
        return Err(error);
    }
    if approved { crate::local_plan_mode::emit(&app, logical_id, openconductor_db::sessions::PermissionMode::Default); }
    Ok(())
}
