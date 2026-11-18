//! Tauri commands for Claude Code chats. Events stream to the window as
//! [`EVENT`], with the same payloads as Reason chats
//! ([`crate::reason_acp::wire::event_json`]).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

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
                    let settings = settings_app.state::<SettingsService>();
                    // H5a: use claude_launch_for_chat() to wire all settings fields
                    // (model, effort, outputStyle, fastMode, ultracode, permission_mode).
                    let mut launch = settings.inner().claude_launch_for_chat(cwd)?;
                    launch.resume = resume;
                    // H5c: inject login-shell PATH so Claude's Bash tool finds system
                    // tools when launched from Finder (mirrors codex_chat.rs:161).
                    if let Some(path) = crate::agent_launch::login_shell_path() {
                        launch.env.set("PATH", path.to_string_lossy());
                    }
                    // "Use Claude Code with Chrome" (Settings > Agents).
                    launch.chrome = settings_app
                        .try_state::<crate::db::Db>()
                        .and_then(|db| {
                            tauri::async_runtime::block_on(crate::app_prefs::commands::load(&db.0))
                                .ok()
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
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn claude_prompt(
    app: AppHandle,
    chat_id: String,
    text: String,
    turn: Option<TurnArg>,
    workspace_id: Option<String>,
    options: Option<ChatOptions>,
    on_handoff: tauri::ipc::Channel<()>,
) -> Result<Value, String> {
    let mut options = options.unwrap_or_default();
    let logical_id = crate::local_plan_mode::logical_chat_id(&chat_id).to_owned();
    let gate = app
        .state::<crate::local_plan_mode::LocalPlanModes>()
        .gate(&logical_id);
    let mode_lease = gate.lock_owned().await;
    let settings = app
        .state::<SettingsService>()
        .get()
        .map_err(|e| e.to_string())?;
    let db = app.state::<crate::db::Db>();
    // Chrome changes recreate an idle generator, just like other launch options.
    // Read the authoritative preference each turn, not a caller-supplied value.
    options.chrome_enabled = Some(crate::app_prefs::commands::load(&db.0).await?.chrome_mode_enabled);
    let mode =
        crate::local_plan_mode::load(&db.0, &logical_id, settings.models.default_plan_mode).await?;
    options.permission_mode = Some(crate::local_plan_mode::claude_permission(
        mode,
        &settings,
    ));
    let state = app.state::<ClaudeChats>();
    let runner = state.runner(&app);
    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();
    // Local settings changes recreate an idle generator. Capture once so the
    // reuse key and the next launch use the same authoritative environment.
    options.local_env = cwd.as_deref().map(|cwd| {
        crate::settings::effective::local_env_for_dir(cwd)
            .into_iter()
            .map(|(key, value)| (key, crate::agent::SecretString::new(value)))
            .collect()
    });
    // Stop also covers the database lookup before dispatch.
    runner.expect_prompt(&chat_id);
    drop(mode_lease);
    let directories: Result<Vec<PathBuf>, String> = async {
        if let Some(id) = workspace_id {
            let db = app.state::<crate::db::Db>();
            let source = openconductor_db::workspaces::get(&db.0, &id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "The source workspace no longer exists.".to_string())?;
            let expected = source
                .workspace
                .workspace_path
                .or(source.root_path)
                .map(PathBuf::from);
            if expected.is_none() || expected != cwd {
                return Err("The chat folder does not match the source workspace.".into());
            }
            let paths = openconductor_db::workspace_links::resolve(&db.0, &id)
                .await
                .map_err(|e| e.to_string())?;
            let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
            if paths.iter().any(|path| !path.is_absolute()) {
                return Err("Saved workspace links contain a non-local directory.".into());
            }
            Ok(paths)
        } else {
            Ok(Vec::new())
        }
    }
    .await;
    let directories = match directories {
        Ok(paths) => paths,
        Err(error) => {
            runner.abandon_prompt(&chat_id);
            return Err(error);
        }
    };
    let (end, changes) = tauri::async_runtime::spawn_blocking(move || {
        // Resolve once off the async runtime. Reuse and launch must compare and
        // consume the same server-owned path, including reset to the bundle.
        options.executable_path = match crate::agent_launch::launch(&app, Agent::Claude) {
            Ok(path) => Some(path),
            Err(error) => {
                runner.abandon_prompt(&chat_id);
                return Err(error);
            }
        };
        let target = match (&cwd, &turn) {
            (Some(workspace), Some(turn)) => Some(TurnTarget {
                workspace,
                session_id: &turn.session_id,
                turn_id: &turn.turn_id,
            }),
            _ => None,
        };
        Ok(around_turn(target, || {
            runner.prompt_with_handoff(
                &chat_id,
                &text,
                &directories,
                &options,
                Some(Box::new(move || {
                    let _ = on_handoff.send(());
                })),
            )
        }))
    })
    .await
    .map_err(|e| e.to_string())??;
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
    let gate = app
        .state::<crate::local_plan_mode::LocalPlanModes>()
        .gate(logical_id);
    let _mode_lease = gate.lock_owned().await;
    let runner = state.runner(&app);
    let approved = runner.approves_plan(&chat_id, &id, &answer);
    let post_plan_mode = if approved {
        let settings = app.state::<SettingsService>().get().map_err(|e| e.to_string())?;
        Some(settings.claude_permission_mode(false))
    } else {
        None
    };
    let db = app.state::<crate::db::Db>();
    let previous = if approved {
        let previous = crate::local_plan_mode::load(&db.0, logical_id, false).await?;
        crate::local_plan_mode::save(
            &db.0,
            logical_id,
            openconductor_db::sessions::PermissionMode::Default,
        )
        .await?;
        Some(previous)
    } else {
        None
    };
    if let Err(error) = runner.respond(&chat_id, &id, &answer, post_plan_mode) {
        if let Some(previous) = previous {
            crate::local_plan_mode::save(&db.0, logical_id, previous).await?;
        }
        return Err(error);
    }
    if approved {
        crate::local_plan_mode::emit(
            &app,
            logical_id,
            openconductor_db::sessions::PermissionMode::Default,
        );
    }
    Ok(())
}
