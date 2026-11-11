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
//!
//! A permission prompt goes to the UI as a
//! [`ProviderEvent::PermissionRequested`] (a tool, a plan or questions, see
//! [`super::interact`]) and waits for [`ClaudeRunner::respond`]. Stop denies
//! what is still waiting; the turn's end and the process exiting drop it.
//! Each one answered or dropped is reported with
//! [`ProviderEvent::PermissionResolved`].

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::Value;

use crate::agent::claude_stream::{ClaudeEvent, PermissionDecision};
use crate::agent::{ClaudeLaunch, ClaudeSession, PermissionMode, SessionEvent};
use crate::reason_acp::provider::{ProviderEvent, Sink, TurnEnd};

use super::interact::{self, Answer};
use super::map::TurnMapper;

/// Builds the launch for a chat: its folder and the session to resume.
pub type Launcher =
    Arc<dyn Fn(&Path, Option<String>) -> Result<ClaudeLaunch, String> + Send + Sync>;

const STDERR_TAIL: usize = 20;

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize)]
pub struct ChatOptions {
    pub model: Option<String>,
    pub effort: Option<String>,
    pub permission_mode: Option<PermissionMode>,
}

struct Live {
    directories: Vec<PathBuf>,
    options: ChatOptions,
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
    /// Permission prompts waiting for the user: request id to tool and input.
    asks: HashMap<String, (String, Value)>,
}

impl TurnState {
    /// Drops every waiting prompt, oldest request id first.
    fn take_asks(&mut self) -> Vec<(String, (String, Value))> {
        let mut out: Vec<_> = self.asks.drain().collect();
        out.sort_by(|a, b| a.0.cmp(&b.0));
        out
    }
}

struct Chat {
    cwd: PathBuf,
    /// Claude session id to resume when a process starts.
    resume: Option<String>,
    live: Option<Live>,
    /// A prompt was announced ([`ClaudeRunner::expect_prompt`]) and has not
    /// been sent yet.
    expected: bool,
    /// Stop was pressed while the expected prompt was not sent yet.
    stopped_before_send: bool,
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
            expected: false,
            stopped_before_send: false,
        });
        if chat.live.is_none() {
            chat.cwd = cwd.to_owned();
            if session_id.is_some() {
                chat.resume = session_id;
            }
        }
    }

    pub fn busy(&self, chat_id: &str) -> bool {
        self.chats.lock().unwrap().get(chat_id).is_some_and(|chat| {
            chat.expected || chat.live.as_ref().is_some_and(|live| !live.state.lock().unwrap().waiting.is_empty())
        })
    }

    pub fn approves_plan(&self, chat_id: &str, id: &str, answer: &Answer) -> bool {
        if !matches!(answer, Answer::Plan { approved: true, .. }) { return false; }
        self.chats.lock().unwrap().get(chat_id).and_then(|chat| chat.live.as_ref()).is_some_and(|live| {
            live.state.lock().unwrap().asks.get(id).is_some_and(|(tool, _)| tool == "ExitPlanMode")
        })
    }

    pub fn abandon_prompt(&self, chat_id: &str) {
        if let Some(chat) = self.chats.lock().unwrap().get_mut(chat_id) {
            chat.expected = false;
            chat.stopped_before_send = false;
        }
    }

    /// Announces a prompt about to be sent (after the turn's start
    /// checkpoint), so a Stop before it is sent still stops it.
    pub fn expect_prompt(&self, chat_id: &str) {
        if let Some(chat) = self.chats.lock().unwrap().get_mut(chat_id) {
            chat.expected = true;
            chat.stopped_before_send = false;
        }
    }

    /// Sends `text` as the chat's next turn and waits for that turn to end.
    #[cfg(test)]
    pub fn prompt(&self, chat_id: &str, text: &str) -> TurnEnd {
        self.prompt_with_directories(chat_id, text, &[])
    }

    #[cfg(test)]
    pub fn prompt_with_directories(&self, chat_id: &str, text: &str, directories: &[PathBuf]) -> TurnEnd {
        self.prompt_with_options(chat_id, text, directories, &ChatOptions::default())
    }

    pub fn prompt_with_options(
        &self,
        chat_id: &str,
        text: &str,
        directories: &[PathBuf],
        options: &ChatOptions,
    ) -> TurnEnd {
        let rx = {
            let mut chats = self.chats.lock().unwrap();
            let Some(chat) = chats.get_mut(chat_id) else {
                return self.fail_now(chat_id, "This chat was not opened.".into());
            };
            chat.expected = false;
            if std::mem::take(&mut chat.stopped_before_send) {
                let end = TurnEnd::Cancelled;
                (self.sink)(chat_id, ProviderEvent::TurnEnded(end.clone()));
                return end;
            }
            if let Err(e) = self.ensure_live(chat_id, chat, directories, options) {
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
    /// A Stop before an expected prompt was sent cancels that prompt.
    pub fn cancel(&self, chat_id: &str) {
        let mut chats = self.chats.lock().unwrap();
        let Some(chat) = chats.get_mut(chat_id) else {
            return;
        };
        let running = chat
            .live
            .as_ref()
            .is_some_and(|live| !live.state.lock().unwrap().waiting.is_empty());
        if !running {
            if chat.expected {
                chat.stopped_before_send = true;
            }
            return;
        }
        let live = chat.live.as_ref().unwrap();
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
        let asks = live.state.lock().unwrap().take_asks();
        for (id, (tool, input)) in asks {
            (self.sink)(
                chat_id,
                ProviderEvent::PermissionResolved {
                    request_id: id.clone(),
                },
            );
            if let Ok(d) = interact::decision(&tool, &input, &Answer::Cancel) {
                let _ = session.answer_permission(id, d);
            }
        }
    }

    /// Answers the chat's waiting permission prompt `id`.
    pub fn respond(&self, chat_id: &str, id: &str, answer: &Answer) -> Result<(), String> {
        let chats = self.chats.lock().unwrap();
        let live = chats
            .get(chat_id)
            .and_then(|c| c.live.as_ref())
            .ok_or("This chat has no running Claude Code.")?;
        let (tool, input) = live
            .state
            .lock()
            .unwrap()
            .asks
            .get(id)
            .cloned()
            .ok_or_else(|| format!("No request {id} is waiting in this chat."))?;
        let decision = interact::decision(&tool, &input, answer)?;
        live.state.lock().unwrap().asks.remove(id);
        // Resolved before the answer: the agent may end the turn right after it.
        (self.sink)(
            chat_id,
            ProviderEvent::PermissionResolved {
                request_id: id.into(),
            },
        );
        let sent = live
            .session
            .lock()
            .unwrap()
            .answer_permission(id.to_owned(), decision);
        sent.map_err(|e| format!("Could not answer Claude Code: {e}"))
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

    fn ensure_live(
        &self,
        chat_id: &str,
        chat: &mut Chat,
        directories: &[PathBuf],
        options: &ChatOptions,
    ) -> Result<(), String> {
        if let Some(live) = &chat.live {
            let st = live.state.lock().unwrap();
            if st.alive {
                if live.directories != directories {
                    return Err("Linked directories changed. Start a new Claude Code chat to apply them; live-session directory changes are not supported yet.".into());
                }
                if live.options == *options {
                    return Ok(());
                }
                if !st.waiting.is_empty() {
                    return Err("Wait for the current Claude Code turn to end before changing model, effort or Plan mode.".into());
                }
            }
            if let Some(id) = st.mapper.session_id() {
                chat.resume = Some(id.to_owned());
            }
            drop(st);
            let mut session = live.session.lock().unwrap();
            session.kill().map_err(|e| format!("Could not restart Claude Code: {e}"))?;
            session.wait().map_err(|e| format!("Could not wait for Claude Code to exit: {e}"))?;
        }
        chat.live = None;
        let mut launch = (self.launcher)(&chat.cwd, chat.resume.clone())?;
        launch.add_dirs = directories.to_vec();
        launch.model = options.model.clone();
        launch.effort = options.effort.clone();
        if let Some(mode) = options.permission_mode { launch.permission_mode = mode; }
        let mut session = ClaudeSession::spawn(&launch)
            .map_err(|e| format!("Could not start Claude Code: {e}"))?;
        let events = session.take_events();
        let state = Arc::new(Mutex::new(TurnState {
            mapper: TurnMapper::new(&chat.cwd, chat.resume.clone()),
            waiting: VecDeque::new(),
            stderr: VecDeque::new(),
            alive: true,
            stopping: false,
            asks: HashMap::new(),
        }));
        let session = Arc::new(Mutex::new(session));
        spawn_reader(
            chat_id.to_owned(),
            events,
            session.clone(),
            state.clone(),
            self.sink.clone(),
        );
        chat.live = Some(Live {
            directories: directories.to_vec(),
            options: options.clone(),
            session,
            state,
        });
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
                input,
            }) => {
                let request = interact::request_of(request_id.clone(), &tool_name, &input);
                let mut st = state.lock().unwrap();
                if st.waiting.is_empty() {
                    // No turn of ours is running: nobody would see it.
                    drop(st);
                    let decision = PermissionDecision::Deny {
                        message: "No turn is running to ask the user.".into(),
                        interrupt: false,
                    };
                    let _ = session
                        .lock()
                        .unwrap()
                        .answer_permission(request_id, decision);
                    continue;
                }
                st.asks.insert(request_id, (tool_name, input));
                sink(&chat_id, ProviderEvent::PermissionRequested(request));
            }
            SessionEvent::Event(e) => {
                let mut st = state.lock().unwrap();
                for out in st.mapper.map(&e) {
                    let ended = match &out {
                        ProviderEvent::TurnEnded(end) => Some(end.clone()),
                        _ => None,
                    };
                    if ended.is_some() {
                        st.stopping = false;
                        for (id, _) in st.take_asks() {
                            sink(
                                &chat_id,
                                ProviderEvent::PermissionResolved { request_id: id },
                            );
                        }
                    }
                    sink(&chat_id, out);
                    // The waiting prompt returns once its end has been emitted.
                    if let Some(end) = ended {
                        if let Some(tx) = st.waiting.pop_front() {
                            let _ = tx.send(end);
                        }
                    }
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
                for (id, _) in st.take_asks() {
                    sink(
                        &chat_id,
                        ProviderEvent::PermissionResolved { request_id: id },
                    );
                }
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
                    sink(&chat_id, ProviderEvent::TurnEnded(end.clone()));
                    let _ = tx.send(end.clone());
                }
                return;
            }
        }
    });
}
