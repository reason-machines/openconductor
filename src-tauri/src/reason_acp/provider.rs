//! The Reason provider: one `reason acp` process, one Reason Session per
//! chat.
//!
//! * A chat's first prompt opens its Session with `session/new`; the app
//!   stores the id ([`ProviderEvent::SessionStarted`]) next to the chat.
//! * A follow-up is another `session/prompt` on the same Session. Sent
//!   while a turn runs, Reason steers the running Session with it and ends
//!   the earlier prompt with `cancelled`; that turn ends
//!   [`TurnEnd::Superseded`], not `Cancelled`.
//! * Stop sends `session/cancel`; the prompt then ends `cancelled`. A
//!   second Stop sends it again, which Reason treats as a hard stop. A
//!   prompt announced with [`ReasonProvider::expect_prompt`] but not sent
//!   yet (the app saves the start checkpoint first) is stopped too: it ends
//!   `cancelled` without being sent.
//! * After the app or the agent restarts, a chat with a stored id is
//!   reattached with `session/resume` (no history replay; the app keeps its
//!   own transcript) before its next prompt.
//! * A Session lives in the workspace `reason` used when it was created,
//!   and `reason acp` without `--workspace` follows the Reason desktop app's
//!   selection, which can change in between. `session/resume` of a Session
//!   the workspace in use cannot see still succeeds (0.2.690 hides the 404)
//!   and the next prompt then fails `409 client_session_id_conflict`: it
//!   tries to create a Session under the taken id. So the provider runs one
//!   agent per workspace (`reason --workspace SLUG acp`), remembers each
//!   Session's workspace ([`ReasonProvider::with_session_store`]). Legacy
//!   Sessions without a binding are located with `reason session get`;
//!   unknown ownership fails before resume. New chats require the workspace
//!   chosen in Settings, independently of the CLI's selection.
//! * An error Reason sends as reply text (see [`super::updates`]) ends the
//!   turn as [`TurnEnd::Failed`] even though the prompt says `end_turn`.
//! * A chat can ask for Session config options (`model`,
//!   `reasoning_effort`) with [`ReasonProvider::set_config`]. They are set
//!   with `session/set_config_option` right after `session/new`, only when
//!   the Session offers the value: Reason resets a value it does not offer
//!   to its default without an error, so the provider checks first and
//!   sends a [`ProviderEvent::Notice`] instead. Options changed while the
//!   Session is open (a model pick in a running chat) are set on that same
//!   Session before its next prompt, and on a resumed one before its first,
//!   as Conductor's ACP runner reconciles them (`reconcileSessionConfig`).
//!   A follow-up that steers a running turn leaves them for the prompt after
//!   it.
//! * Reason reports no model in the ACP stream, and with the model option
//!   "default" (Auto) it picks one per turn. After each turn the provider
//!   asks `reason session get` which model and effort the Session ran on
//!   and reports them as [`ProviderEvent::SessionModel`].
//! * [`ReasonProvider::models`] lists the models Reason offers: the `model`
//!   option of a `session/new` that is closed again unprompted (Reason keeps
//!   no Session that never got a prompt).
//! * A prompt can carry attachments, sent as embedded `resource` blocks
//!   after the text (Reason advertises `embeddedContext`).
//! * `session/request_permission` (Reason asks before a tool call) is held
//!   until the app answers it ([`ReasonProvider::answer_permission`]) and
//!   reported as [`ProviderEvent::PermissionRequested`]; the chat's session
//!   shows `needs_user_permission` meanwhile, as Conductor's tool approval
//!   does. Stop and the end of the turn answer what is still open with
//!   `cancelled`, as ACP requires.

use super::cli::{AgentProcess, LaunchConfig, Presence, RunningModel};
use super::rpc::{CallError, Incoming, Responder, RpcConnection, RpcError};
use super::updates::{computer_is_cloud, parse_update, AgentEvent, ReasonError, UpdateContext};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const SETUP_TIMEOUT: Option<Duration> = Some(Duration::from_secs(60));

#[derive(Debug, Clone, PartialEq)]
pub enum ProviderEvent {
    /// The chat's Reason Session id; persist it to resume after a restart.
    SessionStarted {
        session_id: String,
    },
    Agent(AgentEvent),
    TurnEnded(TurnEnd),
    Usage {
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
    },
    /// Something the app should tell the user about the chat, e.g. that a
    /// requested model is not offered and Reason's default runs instead.
    Notice(String),
    /// The agent waits on the user: Reason asks to run a tool
    /// (`session/request_permission`, answered with
    /// [`ReasonProvider::answer_permission`]); Claude Code also asks to
    /// approve a plan or answer questions (`crate::claude_chat::interact`).
    PermissionRequested(PermissionRequest),
    /// A request was answered or withdrawn.
    PermissionResolved {
        request_id: String,
    },
    /// The model and effort the chat's Session ran its last turn on.
    SessionModel(RunningModel),
}

/// One model Reason offers (an option of the Session's `model` option).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelOption {
    /// Reason model id, e.g. `byok:anthropic:claude-opus-5-5`; `default` is Auto.
    pub value: String,
    /// Reason's name for it, e.g. `Claude Opus 5.5`.
    pub name: String,
    /// e.g. `Claude · Subscription`.
    pub description: Option<String>,
}

/// The models a new Session offers, and the one it starts on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelList {
    pub current: String,
    pub options: Vec<ModelOption>,
}

/// The `model` option of a Session's `configOptions`.
pub fn model_list(config_options: &Value) -> Option<ModelList> {
    let options = config_options.as_array()?;
    let opt = options.iter().find(|o| o["id"] == "model")?;
    let list = opt["options"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let options = list
        .iter()
        .filter_map(|o| {
            let value = o["value"].as_str()?.to_string();
            let name = o["name"].as_str().unwrap_or(&value).to_string();
            let description = o["description"].as_str().map(str::to_string);
            Some(ModelOption {
                value,
                name,
                description,
            })
        })
        .collect();
    let current = opt["currentValue"]
        .as_str()
        .unwrap_or("default")
        .to_string();
    Some(ModelList { current, options })
}

/// One request the agent waits on, as the app shows it.
#[derive(Debug, Clone, PartialEq)]
pub struct PermissionRequest {
    /// Provider-made id the answer names.
    pub request_id: String,
    /// The tool call's title, e.g. `bash: rm -rf build`.
    pub title: String,
    pub options: Vec<PermissionOption>,
    pub ask: Ask,
}

/// What a request asks of the user. Conductor 0.87.6 (REA-read
/// `index-BGEQ8YjU.js`, frontend RPC methods `TOOL_APPROVAL`,
/// `EXIT_PLAN_MODE`, `ASK_USER_QUESTION`) shows each with its own card and
/// session status: `needs_user_permission`, `needs_plan_response`,
/// `needs_user_input`.
#[derive(Debug, Clone, PartialEq)]
pub enum Ask {
    /// Run this tool call? `tool` is the tool's name (`Bash`) or ACP kind
    /// (`execute`), empty when unknown; `input` its arguments, `Null` when
    /// the agent sent none. Answered with one of the request's options.
    Tool { tool: String, input: Value },
    /// Approve this plan, or keep planning.
    Plan { plan: String },
    /// Answer these questions.
    Questions(Vec<Question>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Question {
    pub header: String,
    pub question: String,
    pub options: Vec<QuestionOption>,
    pub multi_select: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

/// One choice offered with a permission request.
#[derive(Debug, Clone, PartialEq)]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    /// `allow_once`, `allow_always`, `reject_once` or `reject_always`.
    pub kind: String,
}

/// A permission request waiting for the app's answer.
struct PendingPermission {
    chat: String,
    rpc_id: Value,
    out: Responder,
}

/// A Session config option to set when the chat's Session is created.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigChoice {
    /// The option's id, e.g. `model` or `reasoning_effort`.
    pub id: String,
    pub value: String,
}

/// Text sent along with a prompt as an embedded resource.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attachment {
    /// File name shown to the agent, e.g. `Review request.md`.
    pub name: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TurnEnd {
    Completed,
    /// Stopped by the user.
    Cancelled,
    /// A follow-up sent during the turn took over the Session.
    Superseded,
    Failed(String),
}

pub type Sink = Arc<dyn Fn(&str, ProviderEvent) + Send + Sync>;

/// A Session as `session/list` reports it.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionInfo {
    pub session_id: String,
    pub title: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Default)]
struct Chat {
    cwd: PathBuf,
    session_id: Option<String>,
    /// Agent process generation the Session is open in.
    open_in: Option<u64>,
    turn: Option<Turn>,
    /// Workspace (slug) of the Session's agent; `None` is `reason`'s default.
    workspace: Option<String>,
    /// Reason said the Session runs on Reason cloud (see `computer_is_cloud`).
    on_cloud: bool,
    /// Config options the chat wants its Session to run on.
    config: Vec<ConfigChoice>,
    /// The options last set on the open Session; `None` until they are set
    /// on a new or resumed Session.
    applied: Option<Vec<ConfigChoice>>,
    /// The Session's `configOptions` as Reason last reported them; null when
    /// unknown (a resumed Session that reported none).
    options: Value,
    /// Prompts announced by `expect_prompt` and not sent yet, with whether
    /// a Stop came for them meanwhile.
    pending: HashMap<u64, bool>,
}

#[derive(Default)]
struct Turn {
    seq: u64,
    stop_requested: bool,
    superseded: bool,
    in_text: bool,
    error: Option<ReasonError>,
}

#[derive(Default)]
struct Shared {
    chats: HashMap<String, Chat>,
    /// Reason Session id to chat id.
    by_session: HashMap<String, String>,
    next_turn: u64,
    next_ticket: u64,
    /// Open permission requests by `request_id`.
    permissions: HashMap<String, PendingPermission>,
    next_permission: u64,
}

struct Agent {
    _process: AgentProcess,
    conn: Arc<RpcConnection>,
    generation: u64,
}

/// Workspace slug by Reason Session id, kept in a JSON file when the app
/// gives one, so a chat resumes in its Session's workspace after a restart.
#[derive(Default)]
struct SessionWorkspaces {
    path: Option<PathBuf>,
    by_session: HashMap<String, String>,
}

impl SessionWorkspaces {
    fn load(path: PathBuf) -> Self {
        let by_session = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        SessionWorkspaces {
            path: Some(path),
            by_session,
        }
    }

    fn get(&self, session_id: &str) -> Option<String> {
        self.by_session.get(session_id).cloned()
    }

    fn set(&mut self, session_id: &str, workspace: &str) -> Result<(), String> {
        if self.get(session_id).as_deref() == Some(workspace) {
            return Ok(());
        }
        let mut saved = self.by_session.clone();
        saved.insert(session_id.into(), workspace.into());
        if let Some(path) = &self.path {
            let persist = || -> Result<(), Box<dyn std::error::Error>> {
                if let Some(dir) = path.parent() {
                    std::fs::create_dir_all(dir)?;
                }
                let text = serde_json::to_vec_pretty(&saved)?;
                let temp = path.with_extension("json.tmp");
                std::fs::write(&temp, text)?;
                std::fs::rename(temp, path)?;
                Ok(())
            };
            persist().map_err(|e| format!("Could not save this Reason Session's workspace: {e}. The message was not sent; retry after fixing app storage."))?;
        }
        self.by_session = saved;
        Ok(())
    }
}

pub struct ReasonProvider {
    /// How `reason` starts; [`ReasonProvider::reconfigure`] changes it.
    launch: Mutex<LaunchConfig>,
    /// The launch changed while agents ran with the old one: they restart
    /// before the next prompt when no turn runs.
    stale: Mutex<bool>,
    /// Settings › Agents › Reason's workspace for new Sessions; `None`
    /// requires a selection before creating a Session.
    new_workspace: Mutex<Option<String>>,
    /// Folder the agent process runs in (the user's home folder).
    dir: PathBuf,
    sink: Sink,
    shared: Arc<Mutex<Shared>>,
    /// Running agents by workspace (`None`: `reason`'s default workspace).
    agents: Mutex<HashMap<Option<String>, Agent>>,
    generations: Mutex<u64>,
    workspaces: Mutex<SessionWorkspaces>,
}

impl ReasonProvider {
    pub fn new(launch: LaunchConfig, dir: PathBuf, sink: Sink) -> Self {
        ReasonProvider {
            launch: Mutex::new(launch),
            stale: Mutex::new(false),
            new_workspace: Mutex::default(),
            dir,
            sink,
            shared: Arc::default(),
            agents: Mutex::default(),
            generations: Mutex::new(0),
            workspaces: Mutex::default(),
        }
    }

    /// Keeps each Session's workspace in `path` (JSON), across restarts.
    pub fn with_session_store(self, path: PathBuf) -> Self {
        *self.workspaces.lock().unwrap() = SessionWorkspaces::load(path);
        self
    }

    fn launch(&self) -> LaunchConfig {
        self.launch.lock().unwrap().clone()
    }

    /// Applies Settings › Agents › Reason: the CLI, its environment (the
    /// API key) and the workspace new Sessions open in. A changed launch
    /// restarts the agents now when no turn runs, else before the next
    /// prompt once none does; chats resume their Sessions there.
    pub fn reconfigure(&self, launch: LaunchConfig, new_workspace: Option<String>) {
        *self.new_workspace.lock().unwrap() = new_workspace;
        {
            let mut current = self.launch.lock().unwrap();
            if *current == launch {
                return;
            }
            *current = launch;
        }
        *self.stale.lock().unwrap() = true;
        self.restart_if_stale();
    }

    /// Sets only the workspace new Sessions open in.
    pub fn reconfigure_workspace(&self, new_workspace: Option<String>) {
        *self.new_workspace.lock().unwrap() = new_workspace;
    }

    fn restart_if_stale(&self) {
        let busy = self
            .shared
            .lock()
            .unwrap()
            .chats
            .values()
            .any(|c| c.turn.is_some());
        let mut stale = self.stale.lock().unwrap();
        if *stale && !busy {
            *stale = false;
            self.shutdown();
        }
    }

    fn workspace_for_new(&self) -> Result<String, String> {
        self.new_workspace
            .lock()
            .unwrap()
            .clone()
            .filter(|w| !w.trim().is_empty())
            .ok_or_else(|| "Choose a workspace in Settings › Agents › Reason before starting a new chat. The message was not sent.".into())
    }

    /// Registers a chat working in `cwd`, with its stored Session id when
    /// it had one before a restart. No process is started yet.
    pub fn open_chat(&self, chat: &str, cwd: &Path, session_id: Option<String>) {
        let workspace = session_id
            .as_deref()
            .and_then(|id| self.workspaces.lock().unwrap().get(id));
        let mut s = self.shared.lock().unwrap();
        if let Some(id) = &session_id {
            s.by_session.insert(id.clone(), chat.into());
        }
        s.chats.insert(
            chat.into(),
            Chat {
                cwd: cwd.into(),
                session_id,
                workspace,
                ..Chat::default()
            },
        );
    }

    /// The models Reason offers new Sessions in the selected workspace.
    pub fn models(&self) -> Result<ModelList, String> {
        self.restart_if_stale();
        let workspace = self.workspace_for_new()?;
        let (conn, _) = self.ensure_agent(Some(&workspace))?;
        let base = json!({ "cwd": self.dir, "mcpServers": [] });
        let v = conn
            .call("session/new", base, SETUP_TIMEOUT)
            .map_err(|e| e.to_string())?;
        if let Some(id) = v["sessionId"].as_str() {
            let _ = conn.call("session/close", json!({ "sessionId": id }), SETUP_TIMEOUT);
        }
        model_list(&v["configOptions"]).ok_or_else(|| "Reason offers no model option".into())
    }

    /// Config options for the chat's Session: set when `session/new`
    /// creates it, or on the open Session before its next prompt.
    pub fn set_config(&self, chat: &str, config: Vec<ConfigChoice>) {
        if let Some(c) = self.shared.lock().unwrap().chats.get_mut(chat) {
            c.config = config;
        }
    }

    /// Sends `text` and blocks until the turn ends; events stream to the
    /// sink meanwhile. Call it from a worker thread.
    pub fn prompt(&self, chat: &str, text: &str) -> TurnEnd {
        self.prompt_with(chat, text, &[])
    }

    /// [`Self::prompt`] with attachments sent after the text.
    pub fn prompt_with(&self, chat: &str, text: &str, attachments: &[Attachment]) -> TurnEnd {
        self.prompt_expected(chat, text, attachments, None)
    }

    /// Announces a prompt that is about to be sent after other work (the
    /// app saves the turn's start checkpoint first): a Stop meanwhile ends
    /// that prompt `cancelled` instead of being lost. Pass the ticket to
    /// [`Self::prompt_expected`]. `None` for a chat that is not open.
    pub fn expect_prompt(&self, chat: &str) -> Option<u64> {
        let mut s = self.shared.lock().unwrap();
        s.next_ticket += 1;
        let ticket = s.next_ticket;
        s.chats.get_mut(chat)?.pending.insert(ticket, false);
        Some(ticket)
    }

    /// [`Self::prompt_with`] for a prompt announced with
    /// [`Self::expect_prompt`].
    pub fn prompt_expected(
        &self,
        chat: &str,
        text: &str,
        attachments: &[Attachment],
        ticket: Option<u64>,
    ) -> TurnEnd {
        let end = self.run_prompt(chat, text, attachments, ticket);
        let idle = {
            let mut s = self.shared.lock().unwrap();
            if let Some(c) = s.chats.get_mut(chat) {
                if let Some(t) = ticket {
                    c.pending.remove(&t);
                }
            }
            s.chats.get(chat).is_none_or(|c| c.turn.is_none())
        };
        // No turn runs any more: nothing can use an answer to what is open.
        if idle {
            self.withdraw_permissions(chat);
        }
        (self.sink)(chat, ProviderEvent::TurnEnded(end.clone()));
        self.report_model(chat);
        end
    }

    /// Asks Reason, off this thread, which model the chat's Session ran on
    /// and reports it as [`ProviderEvent::SessionModel`].
    fn report_model(&self, chat: &str) {
        let (session_id, workspace) = {
            let s = self.shared.lock().unwrap();
            match s.chats.get(chat) {
                Some(Chat {
                    session_id: Some(id),
                    workspace,
                    ..
                }) => (id.clone(), workspace.clone()),
                _ => return,
            }
        };
        let (launch, dir, sink, chat) = (
            self.launch(),
            self.dir.clone(),
            self.sink.clone(),
            chat.to_string(),
        );
        std::thread::spawn(move || {
            if let Some(m) = launch.session_model(&dir, workspace.as_deref(), &session_id) {
                sink(&chat, ProviderEvent::SessionModel(m));
            }
        });
    }

    fn run_prompt(
        &self,
        chat: &str,
        text: &str,
        attachments: &[Attachment],
        ticket: Option<u64>,
    ) -> TurnEnd {
        self.restart_if_stale();
        let (conn, session_id) = match self.ensure_session(chat) {
            Ok(v) => v,
            Err(e) => return TurnEnd::Failed(e),
        };
        let seq = {
            let mut s = self.shared.lock().unwrap();
            s.next_turn += 1;
            let seq = s.next_turn;
            let Some(c) = s.chats.get_mut(chat) else {
                return TurnEnd::Failed("unknown chat".into());
            };
            // Stopped before it was sent: Reason never hears of it.
            if ticket.and_then(|t| c.pending.remove(&t)) == Some(true) {
                return TurnEnd::Cancelled;
            }
            if let Some(prev) = &mut c.turn {
                prev.superseded = true;
            }
            c.turn = Some(Turn {
                seq,
                ..Turn::default()
            });
            seq
        };
        let cwd = {
            let s = self.shared.lock().unwrap();
            s.chats.get(chat).map(|c| c.cwd.clone()).unwrap_or_default()
        };
        let params = json!({ "sessionId": session_id,
            "prompt": prompt_blocks(text, attachments, &cwd) });
        let result = conn.call("session/prompt", params, None);

        let mut s = self.shared.lock().unwrap();
        let c = s.chats.get_mut(chat).expect("chat");
        let turn = match &c.turn {
            Some(t) if t.seq == seq => c.turn.take().unwrap(),
            // A follow-up replaced this turn's state.
            _ => Turn {
                superseded: true,
                ..Turn::default()
            },
        };
        match result {
            Ok(v) => match v["stopReason"].as_str().unwrap_or("end_turn") {
                "cancelled" if turn.superseded && !turn.stop_requested => TurnEnd::Superseded,
                "cancelled" => TurnEnd::Cancelled,
                "error" => TurnEnd::Failed(error_text(&v["error"])),
                _ => match turn.error {
                    Some(e) => {
                        if e.code.as_deref() == Some("client_session_id_conflict") {
                            // Reattach (and look for its workspace) next time.
                            c.open_in = None;
                        }
                        TurnEnd::Failed(explain(e, &c.cwd))
                    }
                    None => TurnEnd::Completed,
                },
            },
            Err(CallError::Closed(why)) => {
                c.open_in = None;
                TurnEnd::Failed(format!("Reason stopped ({why})"))
            }
            Err(e) => TurnEnd::Failed(e.to_string()),
        }
    }

    /// Stops the chat's running turn. Safe to call when nothing runs.
    pub fn cancel(&self, chat: &str) {
        let session_id = {
            let mut s = self.shared.lock().unwrap();
            let Some(c) = s.chats.get_mut(chat) else {
                return;
            };
            for stopped in c.pending.values_mut() {
                *stopped = true;
            }
            let Some(turn) = &mut c.turn else {
                return;
            };
            turn.stop_requested = true;
            (c.session_id.clone(), c.workspace.clone())
        };
        let (session_id, workspace) = session_id;
        let conn = self
            .agents
            .lock()
            .unwrap()
            .get(&workspace)
            .map(|a| a.conn.clone());
        if let (Some(conn), Some(id)) = (conn, session_id) {
            let _ = conn.notify("session/cancel", json!({ "sessionId": id }));
        }
        // After session/cancel, so the agent knows the turn is stopping when
        // its permission request comes back `cancelled`.
        self.withdraw_permissions(chat);
    }

    /// Answers the chat's permission request with `option_id`, or as
    /// `cancelled` when `None`. False when the request is not open (already
    /// answered, withdrawn, or another chat's).
    pub fn answer_permission(&self, chat: &str, request_id: &str, option_id: Option<&str>) -> bool {
        let pending = {
            let mut s = self.shared.lock().unwrap();
            match s.permissions.get(request_id) {
                Some(p) if p.chat == chat => s.permissions.remove(request_id),
                _ => None,
            }
        };
        let Some(p) = pending else {
            return false;
        };
        let outcome = match option_id {
            Some(id) => json!({ "outcome": "selected", "optionId": id }),
            None => json!({ "outcome": "cancelled" }),
        };
        let _ = p.out.respond(&p.rpc_id, Ok(json!({ "outcome": outcome })));
        (self.sink)(
            chat,
            ProviderEvent::PermissionResolved {
                request_id: request_id.into(),
            },
        );
        true
    }

    /// Answers every open permission request of the chat with `cancelled`.
    fn withdraw_permissions(&self, chat: &str) {
        let open: Vec<String> = {
            let s = self.shared.lock().unwrap();
            let mut ids: Vec<String> = s
                .permissions
                .iter()
                .filter(|(_, p)| p.chat == chat)
                .map(|(id, _)| id.clone())
                .collect();
            ids.sort();
            ids
        };
        for id in open {
            self.answer_permission(chat, &id, None);
        }
    }

    /// Recent Sessions in the signed-in Workspace, newest first.
    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>, String> {
        let agent = self.ensure_agent(None)?;
        let params = json!({ "cwd": self.dir });
        let v = agent.0.call("session/list", params, SETUP_TIMEOUT);
        let v = v.map_err(|e| e.to_string())?;
        let list = v["sessions"].as_array().cloned().unwrap_or_default();
        Ok(list
            .iter()
            .filter_map(|s| {
                Some(SessionInfo {
                    session_id: s["sessionId"].as_str()?.into(),
                    title: s["title"].as_str().map(str::to_string),
                    updated_at: s["updatedAt"].as_str().map(str::to_string),
                })
            })
            .collect())
    }

    /// Kills the agent process. Chats keep their Session ids and resume on
    /// their next prompt.
    pub fn shutdown(&self) {
        self.agents.lock().unwrap().clear();
    }

    /// The chat's Session, open in the running agent process of its
    /// workspace, with the chat's config options set on it.
    fn ensure_session(&self, chat: &str) -> Result<(Arc<RpcConnection>, String), String> {
        let (cwd, known, open_in, workspace) = {
            let s = self.shared.lock().unwrap();
            let c = s.chats.get(chat).ok_or("unknown chat")?;
            (
                c.cwd.clone(),
                c.session_id.clone(),
                c.open_in,
                c.workspace.clone(),
            )
        };
        if let (Some(id), Some(open_in)) = (&known, open_in) {
            if let Some((conn, generation)) = self.live_agent(&workspace) {
                if generation == open_in {
                    self.reconcile_config(chat, &conn, id);
                    return Ok((conn, id.clone()));
                }
            }
        }
        let base = json!({ "cwd": cwd, "mcpServers": [] });
        let (conn, generation, id, workspace, options) = match known {
            Some(id) => {
                let workspace = self.locate(&id, workspace)?;
                let (conn, generation) = self.ensure_agent(workspace.as_deref())?;
                let mut params = base;
                params["sessionId"] = json!(id);
                let v = conn
                    .call("session/resume", params, SETUP_TIMEOUT)
                    .map_err(|e| format!("Could not resume the Reason session: {e}"))?;
                (conn, generation, id, workspace, v["configOptions"].clone())
            }
            None => {
                let workspace = Some(self.workspace_for_new()?);
                let (conn, generation) = self.ensure_agent(workspace.as_deref())?;
                let v = conn
                    .call("session/new", base, SETUP_TIMEOUT)
                    .map_err(|e| e.to_string())?;
                let id = v["sessionId"].as_str().ok_or("no sessionId")?.to_string();
                if let Some(w) = &workspace {
                    self.workspaces.lock().unwrap().set(&id, w)?;
                }
                (self.sink)(
                    chat,
                    ProviderEvent::SessionStarted {
                        session_id: id.clone(),
                    },
                );
                (conn, generation, id, workspace, v["configOptions"].clone())
            }
        };
        {
            let mut s = self.shared.lock().unwrap();
            s.by_session.insert(id.clone(), chat.into());
            if let Some(c) = s.chats.get_mut(chat) {
                c.session_id = Some(id.clone());
                c.open_in = Some(generation);
                c.workspace = workspace;
                c.options = options;
                c.applied = None;
            }
        }
        self.reconcile_config(chat, &conn, &id);
        Ok((conn, id))
    }

    /// Sets the chat's wanted options on its open Session when they differ
    /// from what was last set there. Not while a turn runs: a follow-up
    /// steering it leaves them for the next prompt.
    fn reconcile_config(&self, chat: &str, conn: &RpcConnection, id: &str) {
        let (wanted, mut options) = {
            let s = self.shared.lock().unwrap();
            let Some(c) = s.chats.get(chat) else {
                return;
            };
            if c.turn.is_some() || c.applied.as_ref() == Some(&c.config) {
                return;
            }
            (c.config.clone(), c.options.clone())
        };
        // A resumed Session may not report its options: send each and check
        // what Reason answers with.
        let known = options.is_array();
        let (set, mut notices) = if known {
            plan_config(&options, &wanted)
        } else {
            (wanted.clone(), Vec::new())
        };
        for choice in &set {
            let params = json!({ "sessionId": id, "configId": choice.id,
                "value": choice.value });
            match conn.call("session/set_config_option", params, SETUP_TIMEOUT) {
                Ok(v) if v["configOptions"].is_array() => options = v["configOptions"].clone(),
                Ok(_) => {}
                Err(e) => notices.push(format!(
                    "Could not set {} to {}: {e}. Reason's default is used.",
                    choice.id, choice.value
                )),
            }
        }
        if !known && options.is_array() {
            notices.extend(unapplied(&options, &set));
        }
        {
            let mut s = self.shared.lock().unwrap();
            if let Some(c) = s.chats.get_mut(chat) {
                c.applied = Some(wanted);
                c.options = options;
            }
        }
        for n in notices {
            (self.sink)(chat, ProviderEvent::Notice(n));
        }
    }

    /// The persisted workspace for Session `id`, or a signed-in workspace
    /// that demonstrably has a legacy Session without a binding. Unknown ownership never falls back to the
    /// CLI's current selection.
    /// A Session no signed-in workspace has is an error: resuming it would
    /// end in `409 client_session_id_conflict`.
    fn locate(&self, id: &str, hint: Option<String>) -> Result<Option<String>, String> {
        if hint.is_some() {
            // Persisted ownership is authoritative, including while offline.
            return Ok(hint);
        }
        let unknown = || format!("Could not verify this chat's Reason Session {id} workspace. The message was not sent. Reconnect Reason and retry; existing chat history is preserved.");
        let Some(signed_in) = self.launch().whoami(&self.dir) else {
            return Err(unknown());
        };
        let mut unsure = false;
        let mut order: Vec<&String> = signed_in.selected.iter().collect();
        order.extend(
            signed_in
                .saved
                .iter()
                .filter(|w| Some(*w) != signed_in.selected.as_ref()),
        );
        for w in order.into_iter().filter(|w| Some(*w) != hint.as_ref()) {
            match self.launch().session_presence(&self.dir, w, id) {
                Presence::Found => {
                    self.workspaces.lock().unwrap().set(id, w)?;
                    return Ok(Some(w.clone()));
                }
                Presence::Unknown => unsure = true,
                Presence::Missing => {}
            }
        }
        if unsure {
            return Err(unknown());
        }
        Err(format!(
            "This chat's Reason Session {id} is not in any workspace the Reason CLI is \
             signed in to ({}), so the message was not sent. Sign in to the workspace \
             that has it (`reason login`), or use Reset chat to start a new Session.",
            signed_in.saved.join(", ")
        ))
    }

    /// The running agent of `workspace`, if its process is still up.
    fn live_agent(&self, workspace: &Option<String>) -> Option<(Arc<RpcConnection>, u64)> {
        let agents = self.agents.lock().unwrap();
        let a = agents.get(workspace).filter(|a| !a.conn.is_closed())?;
        Some((a.conn.clone(), a.generation))
    }

    /// The running agent, started and initialized when needed.
    fn ensure_agent(&self, workspace: Option<&str>) -> Result<(Arc<RpcConnection>, u64), String> {
        let key = workspace.map(str::to_string);
        let mut agents = self.agents.lock().unwrap();
        if let Some(a) = agents.get(&key).filter(|a| !a.conn.is_closed()) {
            return Ok((a.conn.clone(), a.generation));
        }
        let launch = self
            .launch()
            .in_workspace(workspace)
            .map_err(|e| e.to_string())?;
        let (process, stdin, stdout) = AgentProcess::spawn(&launch, &self.dir)
            .map_err(|e| format!("Could not start {}: {e}", launch.cli().display()))?;
        let generation = {
            let mut g = self.generations.lock().unwrap();
            *g += 1;
            *g
        };
        let handler = updates_handler(self.shared.clone(), self.sink.clone());
        let conn = Arc::new(RpcConnection::start(stdout, stdin, handler));
        let init = json!({
            "protocolVersion": 1,
            "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false },
                                    "terminal": false },
            "clientInfo": { "name": "openconductor", "version": env!("CARGO_PKG_VERSION") },
        });
        conn.call("initialize", init, SETUP_TIMEOUT).map_err(|e| {
            let log = process.stderr_tail().join("\n");
            format!("Reason did not start: {e}\n{log}")
                .trim()
                .to_string()
        })?;
        agents.insert(
            key,
            Agent {
                _process: process,
                conn: conn.clone(),
                generation,
            },
        );
        Ok((conn, generation))
    }
}

/// Reason answers a local Session whose folder is outside the home folder
/// with `device_not_found` (or `local_device_cwd_outside_home`); say why.
fn explain(e: ReasonError, cwd: &Path) -> String {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let outside = home.as_ref().is_some_and(|h| !cwd.starts_with(h));
    match e.code.as_deref() {
        Some("device_not_found" | "local_device_cwd_outside_home") if outside => format!(
            "{} Reason runs Sessions on this computer only in folders inside your home \
             folder ({}), and {} is outside it.",
            e.message,
            home.unwrap_or_default().display(),
            cwd.display()
        ),
        Some("client_session_id_conflict") => format!(
            "{} Reason could not reach this chat's Session from the workspace the Reason \
             CLI uses now; send the message again to look for it in your other workspaces.",
            e.message
        ),
        _ => e.message,
    }
}

/// Which wanted options to set, given the `configOptions` a new Session
/// reports, and a notice for each one it cannot take: no such option, or a
/// value the option does not offer (Reason would silently reset it).
pub fn plan_config(options: &Value, wanted: &[ConfigChoice]) -> (Vec<ConfigChoice>, Vec<String>) {
    let mut set = Vec::new();
    let mut notices = Vec::new();
    let options = options.as_array().map(Vec::as_slice).unwrap_or_default();
    for w in wanted {
        let Some(opt) = options.iter().find(|o| o["id"] == w.id.as_str()) else {
            notices.push(format!(
                "Reason has no \"{}\" option, so {} was not applied.",
                w.id, w.value
            ));
            continue;
        };
        let name = opt["name"].as_str().unwrap_or(&w.id);
        if opt["currentValue"] == w.value.as_str() {
            continue;
        }
        let offered = opt["options"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default();
        if offered.iter().any(|o| o["value"] == w.value.as_str()) {
            set.push(w.clone());
        } else {
            notices.push(format!(
                "Reason does not offer {} \"{}\" for this chat, so it uses Reason's default.",
                name.to_lowercase(),
                w.value
            ));
        }
    }
    (set, notices)
}

/// A notice for each option that Reason's reported `configOptions` do not
/// hold at the value that was sent: Reason reset it to its default.
fn unapplied(options: &Value, sent: &[ConfigChoice]) -> Vec<String> {
    let options = options.as_array().map(Vec::as_slice).unwrap_or_default();
    sent.iter()
        .filter_map(|w| {
            let Some(opt) = options.iter().find(|o| o["id"] == w.id.as_str()) else {
                return Some(format!(
                    "Reason has no \"{}\" option, so {} was not applied.",
                    w.id, w.value
                ));
            };
            let name = opt["name"].as_str().unwrap_or(&w.id);
            (opt["currentValue"] != w.value.as_str()).then(|| {
                format!(
                    "Reason does not offer {} \"{}\" for this chat, so it uses Reason's default.",
                    name.to_lowercase(),
                    w.value
                )
            })
        })
        .collect()
}

/// The `session/prompt` content: the text, then each attachment as an
/// embedded resource named as a file in the chat's folder.
pub fn prompt_blocks(text: &str, attachments: &[Attachment], cwd: &Path) -> Value {
    let mut blocks = vec![json!({ "type": "text", "text": text })];
    for a in attachments {
        let mime = if a.name.ends_with(".md") {
            "text/markdown"
        } else {
            "text/plain"
        };
        blocks.push(json!({ "type": "resource", "resource": {
            "uri": file_uri(&cwd.join(&a.name)), "mimeType": mime, "text": a.text } }));
    }
    Value::Array(blocks)
}

/// `file://` URI of an absolute path, percent-encoding all but unreserved
/// characters and `/`.
fn file_uri(path: &Path) -> String {
    let mut out = String::from("file://");
    for b in path.to_string_lossy().bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// The app's view of `session/request_permission` params: the tool call's
/// title (else its kind, else "Tool call") and the offered options.
pub fn permission_request(request_id: String, params: &Value) -> PermissionRequest {
    let call = &params["toolCall"];
    let title = [&call["title"], &call["kind"]]
        .into_iter()
        .find_map(|v| v.as_str().filter(|t| !t.trim().is_empty()))
        .unwrap_or("Tool call")
        .to_string();
    let options = params["options"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let options = options
        .iter()
        .filter_map(|o| {
            Some(PermissionOption {
                option_id: o["optionId"].as_str()?.into(),
                name: o["name"].as_str().unwrap_or_default().into(),
                kind: o["kind"].as_str().unwrap_or_default().into(),
            })
        })
        .collect();
    let ask = Ask::Tool {
        tool: call["kind"].as_str().unwrap_or_default().into(),
        input: call.get("rawInput").cloned().unwrap_or(Value::Null),
    };
    PermissionRequest {
        request_id,
        title,
        options,
        ask,
    }
}

fn error_text(v: &Value) -> String {
    v["message"]
        .as_str()
        .unwrap_or("Reason reported an error")
        .into()
}

/// Routes `session/update` to the chat that owns the Session. Reason runs
/// its own tools, so client-side methods (fs, terminal, permission) are
/// refused.
fn updates_handler(shared: Arc<Mutex<Shared>>, sink: Sink) -> super::rpc::Handler {
    Box::new(move |msg: Incoming, out: &Responder| match msg {
        Incoming::Notification { method, params } if method == "session/update" => {
            let routed = {
                let mut s = shared.lock().unwrap();
                let sid = params["sessionId"].as_str().unwrap_or_default();
                let chat_id = s.by_session.get(sid).cloned();
                chat_id.and_then(|id| {
                    let c = s.chats.get_mut(&id)?;
                    if let Some(cloud) = computer_is_cloud(&params["update"]) {
                        c.on_cloud = cloud;
                    }
                    let ctx = UpdateContext {
                        cwd: &c.cwd,
                        turn_running: c.turn.is_some(),
                        in_text: c.turn.as_ref().is_some_and(|t| t.in_text),
                        cloud_session: c.session_id.as_deref().filter(|_| c.on_cloud),
                    };
                    let ev = parse_update(&params["update"], ctx)?;
                    if let Some(t) = &mut c.turn {
                        t.in_text = matches!(ev, AgentEvent::Text(_));
                        if let AgentEvent::Error(e) = &ev {
                            t.error = Some(e.clone());
                        }
                    }
                    Some((id, ev))
                })
            };
            if let Some((chat, ev)) = routed {
                sink(&chat, ProviderEvent::Agent(ev));
            }
        }
        Incoming::Request { id, method, params } if method == "session/request_permission" => {
            let routed = {
                let mut s = shared.lock().unwrap();
                let sid = params["sessionId"].as_str().unwrap_or_default();
                match s.by_session.get(sid).cloned() {
                    Some(chat) => {
                        s.next_permission += 1;
                        let request_id = format!("permission-{}", s.next_permission);
                        let pending = PendingPermission {
                            chat: chat.clone(),
                            rpc_id: id.clone(),
                            out: out.clone(),
                        };
                        s.permissions.insert(request_id.clone(), pending);
                        Some((chat, permission_request(request_id, &params)))
                    }
                    None => None,
                }
            };
            match routed {
                Some((chat, request)) => sink(&chat, ProviderEvent::PermissionRequested(request)),
                // No chat to ask: the tool call does not run.
                None => {
                    let _ = out.respond(&id, Ok(json!({ "outcome": { "outcome": "cancelled" } })));
                }
            }
        }
        Incoming::Request { id, method, .. } => {
            let message = format!("{method} is not supported by OpenConductor");
            let code = super::rpc::codes::METHOD_NOT_FOUND;
            let _ = out.respond(&id, Err(RpcError { code, message }));
        }
        _ => {}
    })
}
