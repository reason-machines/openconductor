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
//! 3. `codex_answer(chatId, requestId, decision)` for an `approval` event;
//!    `codex_respond(chatId, requestId, answer)` for a `consent` event (an MCP
//!    elicitation or a permission request), where `answer` is
//!    `{action: "accept", content?}`, `{action: "decline"}`,
//!    `{action: "cancel"}` or `{action: "grant", grantedPermissions, scope}`.
//! 4. `codex_cancel(chatId)` for Stop; `codex_close_chat(chatId)` ends the
//!    process (archive, app exit).

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::agent::codex_cli::{ApprovalPolicy, CodexPolicy, SandboxMode};
use crate::agent::codex_consent::ConsentAnswer;
use crate::agent::codex_rpc::{ApprovalDecision, RequestId, ThreadOptions, TurnOptions};
use crate::agent::codex_runner::{CodexRunner, RunnerConfig, Sink, Timeouts};
use crate::agent::codex_wire::{Payload, TurnEnd};
use crate::agent_binaries::{Agent, BinaryManager};
use crate::settings::service::SettingsService;

pub const EVENT: &str = "codex-chat-event";

#[derive(Default)]
pub struct CodexChats {
    chats: Mutex<HashMap<String, Arc<CodexRunner>>>,
    /// The bundled-binary store, for [`Self::executable`].
    binaries: OnceLock<BinaryManager>,
}

/// Conductor's default when a session sets neither: never ask, full
/// access (`rd3` in its sidecar; `evidence/providers/codex-conductor-client.md`).
fn default_policy() -> CodexPolicy {
    CodexPolicy::new(ApprovalPolicy::Never, SandboxMode::DangerFullAccess)
}

impl CodexChats {
    pub fn with_binaries(binaries: BinaryManager) -> Self {
        let chats = Self::default();
        let _ = chats.binaries.set(binaries);
        chats
    }

    /// `PATH` from the user's login shell, falling back to the app's own.
    pub(crate) fn path(&self) -> Option<OsString> {
        crate::agent_launch::login_shell_path()
    }

    /// The `codex` a chat would run now, without downloading (account and
    /// sign-in): "Codex executable path", else the verified bundled copy,
    /// else the CLI on the login shell's `PATH` ([`crate::agent_launch`]).
    pub(crate) fn executable(&self, settings: &SettingsService) -> Option<PathBuf> {
        let custom = settings.get().ok().and_then(|s| s.codex_executable_path);
        crate::agent_launch::current_with(Agent::Codex, custom.as_deref(), self.binaries.get())
            .map(|r| r.path)
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

enum OpenPolicyDecision {
    ExistingRunner,
    NewRunner(CodexPolicy),
}

fn open_policy_event(
    chat_id: &str,
    incoming_policy: Option<CodexPolicy>,
    decision: OpenPolicyDecision,
) -> Value {
    let (existing_runner, selected_policy) = match decision {
        OpenPolicyDecision::ExistingRunner => (true, None),
        OpenPolicyDecision::NewRunner(policy) => (false, Some(policy)),
    };
    serde_json::json!({
        "chatId": chat_id,
        "incomingPolicy": incoming_policy,
        "existingRunner": existing_runner,
        "selectedPolicy": selected_policy,
    })
}

/// Absolute path of the `codex` the chat would run now, or null.
#[tauri::command]
pub async fn codex_cli_path<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    Ok(crate::agent_launch::current(&app, Agent::Codex).map(|r| r.path.display().to_string()))
}

/// Opens the chat (no process yet). Opening an open chat keeps it as is.
#[tauri::command]
pub async fn codex_open_chat<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
    chat_id: String,
    cwd: String,
    thread_id: Option<String>,
    policy: Option<CodexPolicy>,
) -> Result<(), String> {
    if state.chats.lock().unwrap().contains_key(&chat_id) {
        if crate::e2e::enabled() {
            crate::e2e::log_event(
                "codex-open",
                &open_policy_event(&chat_id, policy, OpenPolicyDecision::ExistingRunner),
            );
        }
        return Ok(());
    }
    let cwd = PathBuf::from(cwd);
    // Model, effort, personality and provider come from settings, as
    // Conductor's launch (`Ohe`). The executable is the Settings path, else
    // the bundled copy (waits for its download), else the CLI on the login
    // shell's PATH (agent_launch.rs).
    let mut launch = settings.codex_launch(&cwd)?;
    // Per-turn requests carry effort and Fast; process overrides would mask explicit off.
    launch.config.retain(|(key, _)| key != "model_reasoning_effort" && key != "service_tier");
    let launch_app = app.clone();
    launch.executable = tauri::async_runtime::spawn_blocking(move || {
        crate::agent_launch::launch(&launch_app, Agent::Codex)
    })
    .await
    .map_err(|e| e.to_string())??;
    if let Some(path) = state.path() {
        launch.env.set("PATH", path.to_string_lossy());
    }
    let config = RunnerConfig {
        launch,
        thread: ThreadOptions {
            cwd: Some(cwd),
            model: None,
            policy: policy.unwrap_or_else(default_policy),
            developer_instructions: None,
            fast_mode: Some(settings.get().map_err(|e| e.to_string())?.models.default_fast_mode),
        },
        resume: thread_id,
        client_name: "openconductor".into(),
        client_version: env!("CARGO_PKG_VERSION").into(),
        timeouts: Timeouts::default(),
    };
    if crate::e2e::enabled() {
        crate::e2e::log_event(
            "codex-open",
            &open_policy_event(&chat_id, policy, OpenPolicyDecision::NewRunner(config.thread.policy)),
        );
    }
    let chat = chat_id.clone();
    let sink: Sink = Arc::new(move |payload: Payload| {
        let event = event_json(&chat, &payload);
        crate::e2e::log_event("codex", &event);
        let _ = app.emit(EVENT, event);
    });
    let runner = Arc::new(CodexRunner::start(config, sink));
    state.chats.lock().unwrap().entry(chat_id).or_insert(runner);
    Ok(())
}

fn prompt_effort(
    model: Option<&str>,
    effort: Option<String>,
    default_effort: impl FnOnce() -> Option<String>,
) -> Option<String> {
    if model.is_some() { effort } else { effort.or_else(default_effort) }
}

/// Runs one prompt (after any still queued); events arrive meanwhile.
/// Without a picked model or effort, the Codex thinking level from settings is used.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn codex_prompt(
    state: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
    chat_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    fast_mode: Option<bool>,
    on_handoff: tauri::ipc::Channel<()>,
) -> Result<TurnEnd, String> {
    let runner = state.get(&chat_id)?;
    let effort = prompt_effort(model.as_deref(), effort, || {
        let level = settings.get().ok()?.models.codex.default_thinking_level;
        serde_json::to_value(level)
            .ok()?
            .as_str()
            .map(str::to_owned)
    });
    let fast_mode = fast_mode.or_else(|| settings.get().ok().map(|s| s.models.default_fast_mode));
    let end = runner.prompt_with_handoff(
        text,
        TurnOptions {
            model,
            effort,
            fast_mode,
        },
        Some(Box::new(move || {
            let _ = on_handoff.send(());
        })),
    );
    tauri::async_runtime::spawn_blocking(move || {
        end.recv()
            .unwrap_or_else(|_| TurnEnd::failed("The Codex chat closed."))
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn codex_mcp_status(
    state: State<'_, CodexChats>,
    chat_id: String,
) -> Result<Vec<crate::agent::mcp_status::McpServer>, String> {
    let runner = state.get(&chat_id)?;
    let reply = runner.mcp_status(crate::agent::mcp_status::TIMEOUT);
    drop(runner);
    tauri::async_runtime::spawn_blocking(move || reply.receive())
        .await
        .map_err(|e| e.to_string())?
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

/// Answers a `consent` event; the turn goes on once Codex has the answer.
#[tauri::command]
pub fn codex_respond(
    state: State<'_, CodexChats>,
    chat_id: String,
    request_id: RequestId,
    answer: ConsentAnswer,
) -> Result<(), String> {
    state.get(&chat_id)?.respond(request_id, answer);
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
    fn picked_model_effort_does_not_inherit_app_defaults() {
        assert_eq!(prompt_effort(Some("dynamic-model"), None, || panic!("explicit model must not read default effort")), None);
        assert_eq!(prompt_effort(Some("dynamic-model"), Some("high".into()), || panic!("explicit effort must not read defaults")), Some("high".into()));
        assert_eq!(prompt_effort(None, Some("low".into()), || panic!("explicit effort must not read defaults")), Some("low".into()));
        assert_eq!(prompt_effort(None, None, || Some("medium".into())), Some("medium".into()));
    }

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
    fn new_runner_policy_event_preserves_the_supplied_policy() {
        let policy = CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::WorkspaceWrite);
        assert_eq!(
            open_policy_event("ws-1", Some(policy), OpenPolicyDecision::NewRunner(policy)),
            serde_json::json!({
                "chatId": "ws-1",
                "incomingPolicy": {"approvalPolicy": "on-request", "sandbox": "workspace-write"},
                "existingRunner": false,
                "selectedPolicy": {"approvalPolicy": "on-request", "sandbox": "workspace-write"},
            })
        );
    }

    #[test]
    fn new_runner_policy_event_distinguishes_missing_and_inherited_policy() {
        assert_eq!(
            open_policy_event("ws-1", None, OpenPolicyDecision::NewRunner(default_policy())),
            serde_json::json!({
                "chatId": "ws-1",
                "incomingPolicy": null,
                "existingRunner": false,
                "selectedPolicy": {"approvalPolicy": "never", "sandbox": "danger-full-access"},
            })
        );
        assert_eq!(
            open_policy_event("ws-1", Some(CodexPolicy::inherit()), OpenPolicyDecision::NewRunner(CodexPolicy::inherit())),
            serde_json::json!({
                "chatId": "ws-1",
                "incomingPolicy": {},
                "existingRunner": false,
                "selectedPolicy": {},
            })
        );
    }

    #[test]
    fn existing_runner_policy_event_does_not_claim_its_retained_policy() {
        for incoming in [None, Some(CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::ReadOnly))] {
            assert_eq!(
                open_policy_event("ws-1", incoming, OpenPolicyDecision::ExistingRunner),
                serde_json::json!({
                    "chatId": "ws-1",
                    "incomingPolicy": incoming,
                    "existingRunner": true,
                    "selectedPolicy": null,
                })
            );
        }
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

    /// The real `codex` through the app's own commands and event stream,
    /// called with the JSON the frontend sends (`codexChat.ts`). Set
    /// `OPENCONDUCTOR_CODEX_IPC_E2E` to a file for the event log; needs a
    /// signed-in `codex` that `codex_cli_path` finds. Two prompts in one
    /// chat with approval `untrusted` (Codex asks before any command not on
    /// its trusted list): approvals answered Allow, then a follow-up on the
    /// same thread.
    #[test]
    fn live_ipc_chat_with_the_signed_in_codex() {
        use std::sync::Mutex as StdMutex;
        use std::time::{Duration, Instant};
        use tauri::ipc::{CallbackFn, InvokeBody};
        use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
        use tauri::webview::InvokeRequest;
        use tauri::{Listener, WebviewWindowBuilder};

        use crate::agent::MemorySecretStore;

        let Some(log) = std::env::var_os("OPENCONDUCTOR_CODEX_IPC_E2E") else {
            eprintln!("OPENCONDUCTOR_CODEX_IPC_E2E unset; live Codex IPC test skipped");
            return;
        };
        let root = std::env::temp_dir().join(format!("oc-codex-ipc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let ws = root.join("ws");
        std::fs::create_dir_all(&ws).unwrap();
        let ws = ws.canonicalize().unwrap();
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&ws)
            .status()
            .unwrap();

        let app = mock_builder()
            .manage(CodexChats::default())
            .manage(SettingsService::new(
                root.join("settings.toml"),
                Arc::new(MemorySecretStore::new()),
            ))
            .invoke_handler(tauri::generate_handler![
                codex_cli_path,
                codex_open_chat,
                codex_prompt,
                codex_answer,
                codex_cancel,
                codex_close_chat
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let events: Arc<StdMutex<Vec<Value>>> = Arc::default();
        let seen = events.clone();
        app.listen(EVENT, move |e| {
            seen.lock()
                .unwrap()
                .push(serde_json::from_str(e.payload()).unwrap());
        });

        let invoke =
            |webview: &tauri::WebviewWindow<tauri::test::MockRuntime>, cmd: &str, body: Value| {
                get_ipc_response(
                    webview,
                    InvokeRequest {
                        cmd: cmd.into(),
                        callback: CallbackFn(0),
                        error: CallbackFn(1),
                        // The webview's own URL is local, so the ACL lets app commands through.
                        url: webview.url().unwrap(),
                        body: InvokeBody::Json(body),
                        headers: Default::default(),
                        invoke_key: INVOKE_KEY.to_string(),
                    },
                )
                .map(|b| b.deserialize::<Value>().unwrap())
            };

        let cli = invoke(&webview, "codex_cli_path", serde_json::json!({})).unwrap();
        eprintln!("codex_cli_path: {cli}");
        assert!(cli.as_str().is_some_and(|p| p.ends_with("/codex")), "{cli}");
        invoke(
            &webview,
            "codex_open_chat",
            serde_json::json!({
                "chatId": "ws-e2e",
                "cwd": ws.display().to_string(),
                "threadId": null,
                "policy": {"approvalPolicy": "untrusted", "sandbox": "workspace-write"}
            }),
        )
        .unwrap();

        // Runs one prompt on its own thread while this one answers approvals.
        let answered = std::cell::Cell::new(0);
        let prompt = |text: &'static str| {
            let w = webview.clone();
            let handle = std::thread::spawn(move || {
                invoke(
                    &w,
                    "codex_prompt",
                    serde_json::json!({"chatId": "ws-e2e", "text": text}),
                )
            });
            let deadline = Instant::now() + Duration::from_secs(300);
            while !handle.is_finished() {
                assert!(Instant::now() < deadline, "prompt did not finish in 300 s");
                let approvals: Vec<Value> = events
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|e| e["type"] == "approval")
                    .cloned()
                    .collect();
                for a in approvals.iter().skip(answered.get()) {
                    eprintln!("approval: {}", a["command"]);
                    invoke(
                        &webview,
                        "codex_answer",
                        serde_json::json!({"chatId": "ws-e2e", "requestId": a["requestId"], "decision": "accept"}),
                    )
                    .unwrap();
                }
                answered.set(approvals.len());
                std::thread::sleep(Duration::from_millis(100));
            }
            handle.join().unwrap().unwrap()
        };

        let end = prompt(
            "Create a file named hello.txt in the current folder containing exactly the line `hello from codex`, then run `cat hello.txt` and reply with its output only.",
        );
        eprintln!("turn 1 end: {end}");
        assert_eq!(end["outcome"], "completed", "{end}");
        assert_eq!(
            std::fs::read_to_string(ws.join("hello.txt"))
                .unwrap()
                .trim(),
            "hello from codex"
        );
        let end = prompt("What did hello.txt contain? Answer with the text only.");
        eprintln!("turn 2 end: {end}");
        assert_eq!(end["outcome"], "completed", "{end}");
        invoke(
            &webview,
            "codex_close_chat",
            serde_json::json!({"chatId": "ws-e2e"}),
        )
        .unwrap();

        let events = events.lock().unwrap().clone();
        std::fs::write(&log, serde_json::to_string_pretty(&events).unwrap()).unwrap();
        let of = |kind: &str| events.iter().filter(|e| e["type"] == kind).count();
        assert_eq!(of("threadStarted"), 1, "one thread for both prompts");
        assert_eq!(of("turnEnded"), 2);
        assert!(events.iter().all(|e| e["chatId"] == "ws-e2e"));
        let finals: Vec<&str> = events
            .iter()
            .filter(|e| e["type"] == "message" && e["phase"] == "final_answer")
            .filter_map(|e| e["text"].as_str())
            .collect();
        eprintln!(
            "final answers: {finals:?}; approvals: {}; tools: {}",
            of("approval"),
            of("tool")
        );
        assert_eq!(finals.len(), 2, "{finals:?}");
        assert!(of("approval") >= 1, "Codex asked for no approval");
        assert!(
            finals.iter().all(|t| t.contains("hello from codex")),
            "{finals:?}"
        );
    }
}
