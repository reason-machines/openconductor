//! Claude Code chats: one `claude` process per chat, kept running between
//! turns (stream-json input takes every follow-up on the same stdin).
//!
//! A reader thread per process maps its events ([`super::map`]) and hands
//! them to the [`Sink`]. [`ClaudeRunner::prompt`] blocks until its own turn
//! ends. Follow-ups sent while a turn runs queue in the CLI and end in
//! order, so waiters are a FIFO. Stop sends `interrupt`; a second Stop
//! kills the process. A process that exits fails the turns still waiting
//! with the last stderr lines; the next prompt starts a new process that
//! resumes the same Claude session.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::agent::claude_stream::{ClaudeEvent, PermissionDecision};
use crate::agent::{ClaudeLaunch, ClaudeSession, SessionEvent};
use crate::reason_acp::provider::{ProviderEvent, Sink, TurnEnd};

use super::map::TurnMapper;

/// Builds the launch for a chat: its folder and the session to resume.
pub type Launcher =
    Arc<dyn Fn(&Path, Option<String>) -> Result<ClaudeLaunch, String> + Send + Sync>;

const STDERR_TAIL: usize = 20;

struct Live {
    session: Arc<Mutex<ClaudeSession>>,
    state: Arc<Mutex<TurnState>>,
}

struct TurnState {
    mapper: TurnMapper,
    /// One per prompt sent and not yet ended, oldest first.
    waiting: VecDeque<Sender<TurnEnd>>,
    stderr: VecDeque<String>,
    alive: bool,
    /// Stop was pressed during the current turn.
    stopping: bool,
}

struct Chat {
    cwd: PathBuf,
    /// Claude session id to resume when a process starts.
    resume: Option<String>,
    live: Option<Live>,
}

pub struct ClaudeRunner {
    launcher: Launcher,
    sink: Sink,
    chats: Mutex<HashMap<String, Chat>>,
}

impl ClaudeRunner {
    pub fn new(launcher: Launcher, sink: Sink) -> Self {
        Self {
            launcher,
            sink,
            chats: Mutex::new(HashMap::new()),
        }
    }

    /// Registers a chat (or moves it to `cwd`). `session_id` is the Claude
    /// session saved from an earlier `sessionStarted`; the first prompt
    /// resumes it. A chat whose process runs keeps it.
    pub fn open_chat(&self, chat_id: &str, cwd: &Path, session_id: Option<String>) {
        let mut chats = self.chats.lock().unwrap();
        let chat = chats.entry(chat_id.to_owned()).or_insert_with(|| Chat {
            cwd: cwd.to_owned(),
            resume: None,
            live: None,
        });
        if chat.live.is_none() {
            chat.cwd = cwd.to_owned();
            if session_id.is_some() {
                chat.resume = session_id;
            }
        }
    }

    /// Sends `text` as the chat's next turn and waits for that turn to end.
    pub fn prompt(&self, chat_id: &str, text: &str) -> TurnEnd {
        let rx = {
            let mut chats = self.chats.lock().unwrap();
            let Some(chat) = chats.get_mut(chat_id) else {
                return self.fail_now(chat_id, "This chat was not opened.".into());
            };
            if let Err(e) = self.ensure_live(chat_id, chat) {
                return self.fail_now(chat_id, e);
            }
            let live = chat.live.as_ref().unwrap();
            let (tx, rx) = mpsc::channel();
            {
                let mut st = live.state.lock().unwrap();
                if st.waiting.is_empty() {
                    st.mapper.turn_started();
                    st.stopping = false;
                }
                st.waiting.push_back(tx);
            }
            if let Err(e) = live.session.lock().unwrap().send_user(text) {
                live.state.lock().unwrap().waiting.pop_back();
                return self.fail_now(
                    chat_id,
                    format!("Could not send the message to Claude Code: {e}"),
                );
            }
            rx
        };
        rx.recv().unwrap_or_else(|_| {
            TurnEnd::Failed("Claude Code stopped before the turn ended.".into())
        })
    }

    /// Stop: interrupts the running turn; pressed again, kills the process.
    pub fn cancel(&self, chat_id: &str) {
        let chats = self.chats.lock().unwrap();
        let Some(live) = chats.get(chat_id).and_then(|c| c.live.as_ref()) else {
            return;
        };
        let again = {
            let mut st = live.state.lock().unwrap();
            if st.waiting.is_empty() {
                return;
            }
            st.mapper.stop_requested();
            std::mem::replace(&mut st.stopping, true)
        };
        let mut session = live.session.lock().unwrap();
        // A second Stop, or an interrupt that cannot be sent, ends the process.
        if again || session.interrupt().is_err() {
            let _ = session.kill();
        }
    }

    /// The Claude session id of a chat, once its process reported one.
    pub fn session_id(&self, chat_id: &str) -> Option<String> {
        let chats = self.chats.lock().unwrap();
        let chat = chats.get(chat_id)?;
        match &chat.live {
            Some(live) => live
                .state
                .lock()
                .unwrap()
                .mapper
                .session_id()
                .map(str::to_owned),
            None => chat.resume.clone(),
        }
    }

    fn fail_now(&self, chat_id: &str, message: String) -> TurnEnd {
        let end = TurnEnd::Failed(message);
        (self.sink)(chat_id, ProviderEvent::TurnEnded(end.clone()));
        end
    }

    fn ensure_live(&self, chat_id: &str, chat: &mut Chat) -> Result<(), String> {
        if let Some(live) = &chat.live {
            let st = live.state.lock().unwrap();
            if st.alive {
                return Ok(());
            }
            // The process exited: resume its session in a new one.
            if let Some(id) = st.mapper.session_id() {
                chat.resume = Some(id.to_owned());
            }
        }
        chat.live = None;
        let launch = (self.launcher)(&chat.cwd, chat.resume.clone())?;
        let mut session = ClaudeSession::spawn(&launch)
            .map_err(|e| format!("Could not start Claude Code: {e}"))?;
        let events = session.take_events();
        let state = Arc::new(Mutex::new(TurnState {
            mapper: TurnMapper::new(&chat.cwd, chat.resume.clone()),
            waiting: VecDeque::new(),
            stderr: VecDeque::new(),
            alive: true,
            stopping: false,
        }));
        let session = Arc::new(Mutex::new(session));
        spawn_reader(
            chat_id.to_owned(),
            events,
            session.clone(),
            state.clone(),
            self.sink.clone(),
        );
        chat.live = Some(Live { session, state });
        Ok(())
    }
}

fn spawn_reader(
    chat_id: String,
    events: Receiver<SessionEvent>,
    session: Arc<Mutex<ClaudeSession>>,
    state: Arc<Mutex<TurnState>>,
    sink: Sink,
) {
    thread::spawn(move || loop {
        let Ok(event) = events.recv() else { return };
        match event {
            SessionEvent::Event(ClaudeEvent::PermissionPrompt {
                request_id,
                tool_name,
                ..
            }) => {
                // Chats run in bypassPermissions, so this is not expected;
                // the app has no prompt UI yet, so refuse rather than hang.
                let decision = PermissionDecision::Deny {
                    message: format!(
                        "OpenConductor cannot answer permission prompts yet ({tool_name})."
                    ),
                    interrupt: false,
                };
                let _ = session
                    .lock()
                    .unwrap()
                    .answer_permission(request_id, decision);
            }
            SessionEvent::Event(e) => {
                let mut st = state.lock().unwrap();
                for out in st.mapper.map(&e) {
                    if let ProviderEvent::TurnEnded(end) = &out {
                        st.stopping = false;
                        if let Some(tx) = st.waiting.pop_front() {
                            let _ = tx.send(end.clone());
                        }
                    }
                    sink(&chat_id, out);
                }
            }
            SessionEvent::BadLine { line, error } => {
                eprintln!("claude chat {chat_id}: {error}: {line}");
            }
            SessionEvent::Stderr(line) => {
                let mut st = state.lock().unwrap();
                if st.stderr.len() == STDERR_TAIL {
                    st.stderr.pop_front();
                }
                st.stderr.push_back(line);
            }
            SessionEvent::Closed => {
                // Let stderr's last lines arrive.
                thread::sleep(Duration::from_millis(200));
                let rest: Vec<SessionEvent> = events.try_iter().collect();
                let mut st = state.lock().unwrap();
                for e in rest {
                    if let SessionEvent::Stderr(line) = e {
                        st.stderr.push_back(line);
                    }
                }
                st.alive = false;
                let end = if st.stopping {
                    TurnEnd::Cancelled
                } else {
                    let tail: Vec<&str> = st.stderr.iter().map(String::as_str).collect();
                    let detail = tail.join("\n");
                    TurnEnd::Failed(if detail.trim().is_empty() {
                        "Claude Code exited before the turn ended.".into()
                    } else {
                        format!("Claude Code exited before the turn ended:\n{detail}")
                    })
                };
                while let Some(tx) = st.waiting.pop_front() {
                    let _ = tx.send(end.clone());
                    sink(&chat_id, ProviderEvent::TurnEnded(end.clone()));
                }
                return;
            }
        }
    });
}
