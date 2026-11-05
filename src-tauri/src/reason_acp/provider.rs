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
//!   second Stop sends it again, which Reason treats as a hard stop.
//! * After the app or the agent restarts, a chat with a stored id is
//!   reattached with `session/resume` (no history replay; the app keeps its
//!   own transcript) before its next prompt.
//! * An error Reason sends as reply text (see [`super::updates`]) ends the
//!   turn as [`TurnEnd::Failed`] even though the prompt says `end_turn`.

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

    /// Sends `text` and blocks until the turn ends; events stream to the
    /// sink meanwhile. Call it from a worker thread.
    pub fn prompt(&self, chat: &str, text: &str) -> TurnEnd {
        let end = self.run_prompt(chat, text);
        (self.sink)(chat, ProviderEvent::TurnEnded(end.clone()));
        end
    }

    fn run_prompt(&self, chat: &str, text: &str) -> TurnEnd {
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
            if let Some(prev) = &mut c.turn {
                prev.superseded = true;
            }
            c.turn = Some(Turn {
                seq,
                ..Turn::default()
            });
            seq
        };
        let params = json!({ "sessionId": session_id,
            "prompt": [{ "type": "text", "text": text }] });
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

    /// The chat's Session, open in the running agent process.
    fn ensure_session(&self, chat: &str) -> Result<(Arc<RpcConnection>, String), String> {
        let (conn, generation) = self.ensure_agent()?;
        let (cwd, known, open_in) = {
            let s = self.shared.lock().unwrap();
            let c = s.chats.get(chat).ok_or("unknown chat")?;
            (c.cwd.clone(), c.session_id.clone(), c.open_in)
        };
        let base = json!({ "cwd": cwd, "mcpServers": [] });
        let id = match known {
            Some(id) if open_in == Some(generation) => return Ok((conn, id)),
            Some(id) => {
                let mut params = base;
                params["sessionId"] = json!(id);
                conn.call("session/resume", params, SETUP_TIMEOUT)
                    .map_err(|e| format!("Could not resume the Reason session: {e}"))?;
                id
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
                id
            }
        };
        let mut s = self.shared.lock().unwrap();
        s.by_session.insert(id.clone(), chat.into());
        if let Some(c) = s.chats.get_mut(chat) {
            c.session_id = Some(id.clone());
            c.open_in = Some(generation);
        }
        Ok((conn, id))
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
