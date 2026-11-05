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
//! * A prompt can carry attachments, sent as embedded `resource` blocks
//!   after the text (Reason advertises `embeddedContext`).

use super::cli::{AgentProcess, LaunchConfig};
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
    /// Something the app should tell the user about the chat, e.g. that a
    /// requested model is not offered and Reason's default runs instead.
    Notice(String),
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
}

struct Agent {
    _process: AgentProcess,
    conn: Arc<RpcConnection>,
    generation: u64,
}

pub struct ReasonProvider {
    launch: LaunchConfig,
    /// Folder the agent process runs in (the user's home folder).
    dir: PathBuf,
    sink: Sink,
    shared: Arc<Mutex<Shared>>,
    agent: Mutex<Option<Agent>>,
    generations: Mutex<u64>,
}

impl ReasonProvider {
    pub fn new(launch: LaunchConfig, dir: PathBuf, sink: Sink) -> Self {
        ReasonProvider {
            launch,
            dir,
            sink,
            shared: Arc::default(),
            agent: Mutex::new(None),
            generations: Mutex::new(0),
        }
    }

    /// Registers a chat working in `cwd`, with its stored Session id when
    /// it had one before a restart. No process is started yet.
    pub fn open_chat(&self, chat: &str, cwd: &Path, session_id: Option<String>) {
        let mut s = self.shared.lock().unwrap();
        if let Some(id) = &session_id {
            s.by_session.insert(id.clone(), chat.into());
        }
        s.chats.insert(
            chat.into(),
            Chat {
                cwd: cwd.into(),
                session_id,
                ..Chat::default()
            },
        );
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
        if let Some(t) = ticket {
            if let Some(c) = self.shared.lock().unwrap().chats.get_mut(chat) {
                c.pending.remove(&t);
            }
        }
        (self.sink)(chat, ProviderEvent::TurnEnded(end.clone()));
        end
    }

    fn run_prompt(
        &self,
        chat: &str,
        text: &str,
        attachments: &[Attachment],
        ticket: Option<u64>,
    ) -> TurnEnd {
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
                    Some(e) => TurnEnd::Failed(explain(e, &c.cwd)),
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
            c.session_id.clone()
        };
        let conn = self.agent.lock().unwrap().as_ref().map(|a| a.conn.clone());
        if let (Some(conn), Some(id)) = (conn, session_id) {
            let _ = conn.notify("session/cancel", json!({ "sessionId": id }));
        }
    }

    /// Recent Sessions in the signed-in Workspace, newest first.
    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>, String> {
        let agent = self.ensure_agent()?;
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
        self.agent.lock().unwrap().take();
    }

    /// The chat's Session, open in the running agent process, with the
    /// chat's config options set on it.
    fn ensure_session(&self, chat: &str) -> Result<(Arc<RpcConnection>, String), String> {
        let (conn, generation) = self.ensure_agent()?;
        let (cwd, known, open_in) = {
            let s = self.shared.lock().unwrap();
            let c = s.chats.get(chat).ok_or("unknown chat")?;
            (c.cwd.clone(), c.session_id.clone(), c.open_in)
        };
        let base = json!({ "cwd": cwd, "mcpServers": [] });
        let (id, opened) = match known {
            Some(id) if open_in == Some(generation) => (id, None),
            Some(id) => {
                let mut params = base;
                params["sessionId"] = json!(id);
                let v = conn
                    .call("session/resume", params, SETUP_TIMEOUT)
                    .map_err(|e| format!("Could not resume the Reason session: {e}"))?;
                (id, Some(v["configOptions"].clone()))
            }
            None => {
                let v = conn
                    .call("session/new", base, SETUP_TIMEOUT)
                    .map_err(|e| e.to_string())?;
                let id = v["sessionId"].as_str().ok_or("no sessionId")?.to_string();
                (self.sink)(
                    chat,
                    ProviderEvent::SessionStarted {
                        session_id: id.clone(),
                    },
                );
                (id, Some(v["configOptions"].clone()))
            }
        };
        {
            let mut s = self.shared.lock().unwrap();
            s.by_session.insert(id.clone(), chat.into());
            if let Some(c) = s.chats.get_mut(chat) {
                c.session_id = Some(id.clone());
                c.open_in = Some(generation);
                if let Some(options) = opened {
                    c.options = options;
                    c.applied = None;
                }
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

    /// The running agent, started and initialized when needed.
    fn ensure_agent(&self) -> Result<(Arc<RpcConnection>, u64), String> {
        let mut slot = self.agent.lock().unwrap();
        if let Some(a) = slot.as_ref().filter(|a| !a.conn.is_closed()) {
            return Ok((a.conn.clone(), a.generation));
        }
        let (process, stdin, stdout) = AgentProcess::spawn(&self.launch, &self.dir)
            .map_err(|e| format!("Could not start {}: {e}", self.launch.cli().display()))?;
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
        *slot = Some(Agent {
            _process: process,
            conn: conn.clone(),
            generation,
        });
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
        Incoming::Request { id, method, .. } => {
            let message = format!("{method} is not supported by OpenConductor");
            let code = super::rpc::codes::METHOD_NOT_FOUND;
            let _ = out.respond(&id, Err(RpcError { code, message }));
        }
        _ => {}
    })
}
