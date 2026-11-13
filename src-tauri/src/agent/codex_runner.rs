//! One Codex chat: a thread that owns its `codex app-server`
//! ([`CodexSession`]) and runs the chat's prompts one at a time.
//!
//! The app talks to a [`CodexRunner`]: [`CodexRunner::prompt`] queues a
//! prompt and hands back a receiver for its [`TurnEnd`];
//! [`CodexRunner::cancel`] stops the running prompt and drops queued ones;
//! [`CodexRunner::answer`] answers an approval and [`CodexRunner::respond`]
//! an MCP elicitation or permission request ([`super::codex_consent`]).
//! Everything the chat shows
//! goes to the [`Sink`] as [`Payload`]s, in order, ending each prompt with
//! exactly one [`Payload::TurnEnded`].
//!
//! The process starts on the first prompt (so a chat that is only looked at
//! never starts Codex) and is started again, resuming the same thread, if it
//! exits. MCP elicitations and permission requests wait for the user, as in
//! Conductor; Stop and the end of the turn answer any still open the way
//! Conductor's `cancelCodexMcpConsent` does. Other requests the app has no
//! UI for are answered the way Conductor's sidecar answers them when it has
//! no handler (`evidence/providers/codex-conductor-client.md`): user input
//! with no answers, anything else with an error, so a turn never waits on
//! them.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use super::codex_cli::CodexLaunch;
use super::codex_consent::{self, consent, ConsentAnswer, ConsentKind};
use super::codex_events::{Notification, ServerMessage, ServerRequest};
use super::codex_rpc::{ApprovalDecision, ClientRequest, RequestId, ThreadOptions, TurnOptions};
use super::mcp_status::{self, McpServer, StatusQuery, StatusReply};
use super::codex_session::{CallError, CodexEvent, CodexSession};
use super::codex_wire::{payloads, Payload, TurnEnd};

/// Receives every payload of one chat, in order, on the runner's thread.
pub type Sink = Arc<dyn Fn(Payload) + Send + Sync>;

/// How long to wait for the app-server's answers.
#[derive(Debug, Clone, Copy)]
pub struct Timeouts {
    pub initialize: Duration,
    pub thread: Duration,
    pub turn_start: Duration,
    pub interrupt: Duration,
}

impl Default for Timeouts {
    fn default() -> Self {
        Timeouts {
            initialize: Duration::from_secs(20),
            thread: Duration::from_secs(60),
            turn_start: Duration::from_secs(60),
            interrupt: Duration::from_secs(15),
        }
    }
}

/// Everything a chat's app-server is started with.
#[derive(Debug, Clone)]
pub struct RunnerConfig {
    pub launch: CodexLaunch,
    /// Settings for `thread/start` and `thread/resume`.
    pub thread: ThreadOptions,
    /// A thread to resume (saved from an earlier [`Payload::ThreadStarted`]).
    pub resume: Option<String>,
    /// `clientInfo` sent in `initialize`.
    pub client_name: String,
    pub client_version: String,
    pub timeouts: Timeouts,
}

/// JSON-RPC "method not found", for requests the app does not handle.
const UNSUPPORTED: i64 = -32601;

/// Conductor's answer to a request it has no handler for, when it gives
/// one instead of an error.
fn default_answer(method: &str) -> Option<Value> {
    match method {
        "item/tool/requestUserInput" => Some(json!({ "answers": {} })),
        "mcpServer/elicitation/request" => Some(json!({ "action": "cancel", "content": null })),
        _ => None,
    }
}
/// Stderr lines kept to explain an unexpected exit.
const STDERR_KEPT: usize = 8;

struct Prompt {
    text: String,
    options: TurnOptions,
    done: Sender<TurnEnd>,
    on_handoff: Option<Box<dyn FnOnce() + Send>>,
}

enum Cmd {
    Prompt(Prompt),
    Cancel,
    Answer(RequestId, ApprovalDecision),
    Respond(RequestId, ConsentAnswer),
    McpStatus(StatusQuery),
}

/// Handle to one chat's runner thread. Dropping it stops the thread and
/// kills the app-server.
pub struct CodexRunner {
    tx: Option<Sender<Cmd>>,
    thread: Option<JoinHandle<()>>,
}

impl CodexRunner {
    pub fn start(config: RunnerConfig, sink: Sink) -> Self {
        let (tx, rx) = mpsc::channel();
        let worker = Worker {
            config,
            sink,
            session: None,
            thread_id: None,
            queue: VecDeque::new(),
            running: None,
            stderr: VecDeque::new(),
            consents: HashMap::new(),
            mcp_status: None,
        };
        let thread = thread::Builder::new()
            .name("codex-chat".into())
            .spawn(move || worker.run(rx))
            .expect("spawn codex chat thread");
        CodexRunner {
            tx: Some(tx),
            thread: Some(thread),
        }
    }

    fn send(&self, cmd: Cmd) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(cmd);
        }
    }

    /// Queues a prompt; the receiver gets its end (also sent to the sink).
    pub fn prompt(&self, text: impl Into<String>, options: TurnOptions) -> Receiver<TurnEnd> {
        self.prompt_with_handoff(text, options, None)
    }

    pub fn prompt_with_handoff(
        &self,
        text: impl Into<String>,
        options: TurnOptions,
        on_handoff: Option<Box<dyn FnOnce() + Send>>,
    ) -> Receiver<TurnEnd> {
        let (done, end) = mpsc::channel();
        self.send(Cmd::Prompt(Prompt {
            text: text.into(),
            options,
            done,
            on_handoff,
        }));
        end
    }

    pub fn mcp_status(&self, timeout: Duration) -> StatusReply {
        let deadline = Instant::now() + timeout;
        let (done, result) = mpsc::channel();
        self.send(Cmd::McpStatus(StatusQuery { deadline, done }));
        StatusReply { deadline, result }
    }

    /// Stops the running prompt and cancels the queued ones.
    pub fn cancel(&self) {
        self.send(Cmd::Cancel);
    }

    pub fn answer(&self, request: RequestId, decision: ApprovalDecision) {
        self.send(Cmd::Answer(request, decision));
    }

    /// Answers an open MCP elicitation or permission request.
    pub fn respond(&self, request: RequestId, answer: ConsentAnswer) {
        self.send(Cmd::Respond(request, answer));
    }
}

impl Drop for CodexRunner {
    fn drop(&mut self) {
        self.tx = None;
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

struct Running {
    prompt: Prompt,
    turn_id: String,
}

struct PendingMcpStatus {
    request_id: RequestId,
    rows: Vec<McpServer>,
    cursors: HashSet<String>,
    query: StatusQuery,
}

struct Worker {
    config: RunnerConfig,
    sink: Sink,
    session: Option<CodexSession>,
    /// The chat's thread once opened; resumed after a restart.
    thread_id: Option<String>,
    queue: VecDeque<Prompt>,
    running: Option<Running>,
    stderr: VecDeque<String>,
    /// Elicitations and permission requests waiting on the user.
    consents: HashMap<RequestId, ConsentKind>,
    mcp_status: Option<PendingMcpStatus>,
}

const POLL: Duration = Duration::from_millis(25);

impl Worker {
    fn run(mut self, rx: Receiver<Cmd>) {
        loop {
            self.expire_mcp_status();
            loop {
                match rx.try_recv() {
                    Ok(cmd) => self.handle(cmd),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => return self.shut_down(),
                }
            }
            if self.running.is_none() {
                if let Some(prompt) = self.queue.pop_front() {
                    self.begin(prompt);
                    continue;
                }
            }
            match self.session.as_mut() {
                Some(session) => {
                    if let Some(event) = session.next_event(POLL) {
                        self.on_event(event);
                    }
                }
                None => match rx.recv() {
                    Ok(cmd) => self.handle(cmd),
                    Err(_) => return self.shut_down(),
                },
            }
        }
    }

    fn emit(&self, payload: Payload) {
        (self.sink)(payload);
    }

    fn finish(&self, prompt: Prompt, end: TurnEnd) {
        self.emit(Payload::TurnEnded { end: end.clone() });
        let _ = prompt.done.send(end);
    }

    fn shut_down(mut self) {
        self.fail_mcp_status("The Codex chat closed.");
        for prompt in std::mem::take(&mut self.queue) {
            self.finish(prompt, TurnEnd::cancelled());
        }
        if let Some(r) = self.running.take() {
            self.finish(r.prompt, TurnEnd::cancelled());
        }
        // Dropping the session kills the process.
        self.session = None;
    }

    fn handle(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::Prompt(p) => self.queue.push_back(p),
            Cmd::McpStatus(query) => self.start_mcp_status(query),
            Cmd::Cancel => {
                self.close_consents();
                for prompt in std::mem::take(&mut self.queue) {
                    self.finish(prompt, TurnEnd::cancelled());
                }
                if self.running.is_none() {
                    return;
                }
                let timeout = self.config.timeouts.interrupt;
                let Some(session) = self.session.as_mut() else {
                    return;
                };
                // Codex answers with turn/completed (interrupted), which
                // ends the prompt.
                match session.interrupt(timeout) {
                    Ok(()) | Err(CallError::NoActiveTurn) => {}
                    Err(e) => {
                        if matches!(e, CallError::Closed { .. } | CallError::Io(_)) {
                            self.fail_mcp_status("The Codex transport closed while stopping.");
                        }
                        self.emit(Payload::Notice {
                            message: format!("Could not stop Codex: {e}"),
                            will_retry: false,
                        });
                    }
                }
            }
            Cmd::Answer(id, decision) => {
                if let Some(session) = self.session.as_mut() {
                    if let Err(e) = session.answer(&id, decision) {
                        self.fail_mcp_status("Could not write to the Codex transport.");
                        self.emit(Payload::Notice {
                            message: format!("Could not answer Codex: {e}"),
                            will_retry: false,
                        });
                    }
                }
            }
            Cmd::Respond(id, answer) => {
                // Already answered (Stop, the turn's end, or Codex itself).
                let Some(kind) = self.consents.get(&id).copied() else {
                    return;
                };
                match codex_consent::codex_result(kind, &answer) {
                    Ok(result) => {
                        self.consents.remove(&id);
                        self.send_consent(id, result);
                    }
                    Err(e) => self.emit(Payload::Notice {
                        message: format!("Could not answer Codex: {e}"),
                        will_retry: false,
                    }),
                }
            }
        }
    }

    fn fail_mcp_status(&mut self, message: &str) {
        if let Some(pending) = self.mcp_status.take() {
            let _ = pending.query.done.send(Err(message.into()));
        }
    }

    fn expire_mcp_status(&mut self) {
        if self.mcp_status.as_ref().is_some_and(|p| Instant::now() >= p.query.deadline) {
            self.fail_mcp_status(mcp_status::TIMED_OUT);
        }
    }

    fn start_mcp_status(&mut self, query: StatusQuery) {
        self.expire_mcp_status();
        let error = if Instant::now() >= query.deadline {
            Some(mcp_status::TIMED_OUT)
        } else if self.mcp_status.is_some() {
            Some("An MCP status query is already pending.")
        } else if self.session.is_none() {
            Some("MCP status is unavailable: the Codex session is not running.")
        } else {
            None
        };
        if let Some(error) = error {
            let _ = query.done.send(Err(error.into()));
            return;
        }
        let session = self.session.as_mut().expect("live session checked");
        match session.send_request(&ClientRequest::McpServerStatusList { cursor: None }) {
            Ok(request_id) => self.mcp_status = Some(PendingMcpStatus {
                request_id, rows: vec![], cursors: HashSet::new(), query,
            }),
            Err(e) => { let _ = query.done.send(Err(format!("Could not query Codex MCP status: {e}"))); }
        }
    }

    fn resolve_mcp_status(&mut self, event: &CodexEvent) -> bool {
        self.expire_mcp_status();
        let Some(pending) = &self.mcp_status else { return false; };
        let result = match event {
            CodexEvent::Message(ServerMessage::Response { id, result }) if id == &pending.request_id => {
                mcp_status::decode_page(result.clone())
            }
            CodexEvent::Message(ServerMessage::ErrorResponse { id: Some(id), code, message }) if id == &pending.request_id => {
                Err(format!("Codex MCP status error {code}: {message}"))
            }
            CodexEvent::BadLine { line, .. } => {
                let id = serde_json::from_str::<Value>(line).ok()
                    .and_then(|v| serde_json::from_value::<RequestId>(v.get("id")?.clone()).ok());
                if id.as_ref() != Some(&pending.request_id) { return false; }
                Err("Invalid Codex MCP status response.".into())
            }
            _ => return false,
        };
        let mut pending = self.mcp_status.take().expect("pending query matched");
        match result {
            Err(e) => { let _ = pending.query.done.send(Err(e)); }
            Ok((rows, cursor)) => {
                pending.rows.extend(rows);
                if Instant::now() >= pending.query.deadline {
                    let _ = pending.query.done.send(Err(mcp_status::TIMED_OUT.into()));
                } else if let Some(cursor) = cursor {
                    if !pending.cursors.insert(cursor.clone()) {
                        let _ = pending.query.done.send(Err("Codex repeated an MCP status cursor.".into()));
                    } else if let Some(session) = self.session.as_mut() {
                        match session.send_request(&ClientRequest::McpServerStatusList { cursor: Some(cursor) }) {
                            Ok(id) => { pending.request_id = id; self.mcp_status = Some(pending); }
                            Err(e) => { let _ = pending.query.done.send(Err(format!("Could not query Codex MCP status: {e}"))); }
                        }
                    } else {
                        let _ = pending.query.done.send(Err("The Codex transport closed.".into()));
                    }
                } else {
                    let _ = pending.query.done.send(Ok(pending.rows));
                }
            }
        }
        true
    }

    /// Sends a consent's result and tells the window it is answered.
    fn send_consent(&mut self, id: RequestId, result: Value) {
        if let Some(session) = self.session.as_mut() {
            if let Err(e) = session.respond(&id, result) {
                self.fail_mcp_status("Could not write to the Codex transport.");
                self.emit(Payload::Notice {
                    message: format!("Could not answer Codex: {e}"),
                    will_retry: false,
                });
            }
        }
        self.emit(Payload::ApprovalResolved { request_id: id });
    }

    /// Answers every open consent as Stop does: cancel an elicitation,
    /// decline permissions.
    fn close_consents(&mut self) {
        for (id, kind) in std::mem::take(&mut self.consents) {
            let result = codex_consent::codex_result(kind, &codex_consent::stopped(kind))
                .expect("a stop answer fits its own kind");
            self.send_consent(id, result);
        }
    }

    /// Starts the app-server and opens the chat's thread, if not running.
    fn ensure_session(&mut self, options: &TurnOptions) -> Result<(), String> {
        if self.session.is_some() {
            return Ok(());
        }
        let c = &self.config;
        let mut thread_options = c.thread.clone();
        thread_options.fast_mode = options.fast_mode.or(thread_options.fast_mode);
        let mut session =
            CodexSession::spawn(&c.launch).map_err(|e| format!("Codex could not start: {e}"))?;
        session
            .initialize(&c.client_name, &c.client_version, c.timeouts.initialize)
            .map_err(|e| format!("Codex did not start: {e}"))?;
        let resume = self.thread_id.clone().or_else(|| c.resume.clone());
        let opened = match resume {
            Some(id) => {
                match session.open_thread(
                    Some(id.clone()),
                    thread_options.clone(),
                    c.timeouts.thread,
                ) {
                    Ok(t) => Ok((t, true)),
                    Err(e @ CallError::Rpc { .. }) => {
                        self.emit(Payload::Notice {
                            message: format!(
                                "Could not resume Codex thread {id} ({e}); started a new thread."
                            ),
                            will_retry: false,
                        });
                        session
                            .open_thread(None, thread_options.clone(), c.timeouts.thread)
                            .map(|t| (t, false))
                    }
                    Err(e) => Err(e),
                }
            }
            None => session
                .open_thread(None, thread_options, c.timeouts.thread)
                .map(|t| (t, false)),
        };
        let (thread_id, resumed) =
            opened.map_err(|e| format!("Codex could not open a thread: {e}"))?;
        self.thread_id = Some(thread_id.clone());
        self.session = Some(session);
        self.emit(Payload::ThreadStarted { thread_id, resumed });
        Ok(())
    }

    fn begin(&mut self, mut prompt: Prompt) {
        prompt.options.fast_mode = prompt.options.fast_mode.or(self.config.thread.fast_mode);
        if let Err(message) = self.ensure_session(&prompt.options) {
            self.fail_mcp_status("The Codex session was replaced.");
            self.session = None;
            return self.finish(prompt, TurnEnd::failed(message));
        }
        let timeout = self.config.timeouts.turn_start;
        let session = self.session.as_mut().expect("session started");
        match session.start_turn_with_handoff(
            prompt.text.clone(),
            prompt.options.clone(),
            timeout,
            prompt.on_handoff.take(),
        ) {
            Ok(turn_id) => self.running = Some(Running { prompt, turn_id }),
            Err(e) => {
                if matches!(e, CallError::Closed { .. } | CallError::Io(_)) {
                    self.fail_mcp_status("The Codex transport closed starting the turn.");
                    self.session = None;
                }
                self.finish(
                    prompt,
                    TurnEnd::failed(format!("Codex did not start the turn: {e}")),
                );
            }
        }
    }

    fn on_event(&mut self, event: CodexEvent) {
        if self.resolve_mcp_status(&event) { return; }
        match event {
            CodexEvent::Message(message) => {
                for p in payloads(&message) {
                    self.emit(p);
                }
                match message {
                    ServerMessage::Notification(Notification::TurnCompleted { turn, .. }) => {
                        if self.running.as_ref().map(|r| r.turn_id.as_str()) == Some(&turn.id) {
                            // A request the turn no longer waits on.
                            self.close_consents();
                            let r = self.running.take().expect("running");
                            let end = TurnEnd::from_status(&turn.status, turn.error.as_deref());
                            self.finish(r.prompt, end);
                        }
                    }
                    ServerMessage::Request(ServerRequest::Other { id, method, params }) => {
                        // Shown as a card by `payloads` above; held for the user.
                        if let Some(c) = consent(&id, &method, &params) {
                            self.consents.insert(id, c.kind);
                            return;
                        }
                        let answer = default_answer(&method);
                        if let Some(s) = self.session.as_mut() {
                            let result = match &answer {
                                Some(result) => s.respond(&id, result.clone()),
                                None => s.reject(
                                    &id,
                                    UNSUPPORTED,
                                    &format!("OpenConductor does not support {method} yet"),
                                ),
                            };
                            if result.is_err() {
                                self.fail_mcp_status("Could not write to the Codex transport.");
                            }
                        }
                        self.emit(Payload::Notice {
                            message: format!(
                                "Codex asked for {method}, which OpenConductor does not support yet; {}.",
                                if answer.is_some() { "answered with nothing" } else { "declined" }
                            ),
                            will_retry: false,
                        });
                    }
                    _ => {}
                }
            }
            CodexEvent::Stderr(line) => {
                eprintln!("codex: {line}");
                if self.stderr.len() == STDERR_KEPT {
                    self.stderr.pop_front();
                }
                self.stderr.push_back(line);
            }
            CodexEvent::BadLine { line, error } => eprintln!("codex: {error}: {line}"),
            CodexEvent::Closed => {
                self.fail_mcp_status("The Codex transport closed.");
                // Nobody is left to answer: just close the cards.
                for (id, _) in std::mem::take(&mut self.consents) {
                    self.emit(Payload::ApprovalResolved { request_id: id });
                }
                // Stderr is read on its own thread: collect what is still
                // in flight so the exit can be explained.
                if let Some(mut session) = self.session.take() {
                    while let Some(event) = session.next_event(Duration::from_millis(200)) {
                        if let CodexEvent::Stderr(line) = event {
                            self.on_event(CodexEvent::Stderr(line));
                        }
                    }
                }
                if let Some(r) = self.running.take() {
                    let mut message = "Codex exited during the turn.".to_owned();
                    if !self.stderr.is_empty() {
                        message.push('\n');
                        message.push_str(&Vec::from(self.stderr.clone()).join("\n"));
                    }
                    self.finish(r.prompt, TurnEnd::failed(message));
                }
            }
        }
    }
}

#[cfg(all(test, unix))]
#[path = "codex_mcp_status_tests.rs"]
mod mcp_status_tests;

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;
    use std::time::Instant;

    use serde_json::{json, Value};

    use super::super::codex_cli::{ApprovalPolicy, CodexPolicy, SandboxMode};
    use super::super::codex_wire::Outcome;
    use super::super::test_exe::write_executable;
    use super::super::{AgentKind, LaunchEnv};
    use super::*;

    const WAIT: Duration = Duration::from_secs(15);

    /// A stand-in app-server that plays a recorded Codex 0.166.0 turn: a
    /// command approval, the command, then the reply. A prompt containing
    /// "slow" waits for an interrupt; "ask" sends a request the app does not
    /// handle; "perm" asks for permissions and "elicit" for MCP input, both
    /// held for the user; "die" exits mid-turn. Logs stdin to `<script>.stdin`.
    const FAKE: &str = r#"#!/bin/sh
n=0
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$0.stdin"
  id=$(printf '%s' "$line" | sed -n 's/^{"id":\([0-9]*\),.*/\1/p')
  case "$line" in
    *'"method":"initialize"'*) echo "{\"id\":$id,\"result\":{\"userAgent\":\"fake/0\"}}" ;;
    *'"method":"thread/start"'*) echo "{\"id\":$id,\"result\":{\"thread\":{\"id\":\"t-new\"}}}" ;;
    *'"method":"thread/resume"'*'"t-gone"'*) echo "{\"error\":{\"code\":-32600,\"message\":\"no rollout found\"},\"id\":$id}" ;;
    *'"method":"thread/resume"'*) echo "{\"id\":$id,\"result\":{\"thread\":{\"id\":\"t-old\"}}}" ;;
    *'"method":"turn/start"'*)
      n=$((n+1)); turn="u$n"
      echo "{\"id\":$id,\"result\":{\"turn\":{\"id\":\"$turn\",\"items\":[],\"status\":\"inProgress\"}}}"
      echo "{\"method\":\"turn/started\",\"params\":{\"threadId\":\"t\",\"turn\":{\"id\":\"$turn\",\"items\":[],\"status\":\"inProgress\"}}}"
      case "$line" in
        *slow*) ;;
        *die*) echo 'boom' >&2; exit 3 ;;
        *ask*)
          echo '{"id":77,"method":"item/tool/requestUserInput","params":{"threadId":"t","turnId":"'$turn'","itemId":"q1","questions":[]}}' ;;
        *perm*)
          echo '{"id":78,"method":"item/permissions/requestApproval","params":{"threadId":"t","turnId":"'$turn'","itemId":"p1","startedAtMs":1,"cwd":"/ws","reason":"needs the network","permissions":{"network":{"enabled":true}}}}' ;;
        *elicit*)
          echo '{"id":79,"method":"mcpServer/elicitation/request","params":{"threadId":"t","turnId":"'$turn'","serverName":"linear","mode":"form","message":"Which team?","requestedSchema":{"type":"object","properties":{"team":{"type":"string"}}},"_meta":null}}' ;;
        *)
          echo '{"id":0,"method":"item/commandExecution/requestApproval","params":{"threadId":"t","turnId":"'$turn'","itemId":"exec-1","command":"cat hello.txt","cwd":"/ws","availableDecisions":["accept","cancel"]}}' ;;
      esac ;;
    *'"decision":"accept"'*)
      echo '{"method":"item/completed","params":{"item":{"type":"commandExecution","id":"exec-1","command":"cat hello.txt","cwd":"/ws","status":"completed","commandActions":[],"aggregatedOutput":"hi","exitCode":0},"threadId":"t","turnId":"u'$n'"}}'
      echo '{"method":"item/agentMessage/delta","params":{"threadId":"t","turnId":"u'$n'","itemId":"m1","delta":"hi"}}'
      echo '{"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u'$n'","items":[],"status":"completed"}}}' ;;
    *'"answers":{}'*)
      echo '{"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u'$n'","items":[],"status":"failed","error":{"message":"needed input"}}}}' ;;
    *'"id":78,"result"'*)
      echo '{"method":"serverRequest/resolved","params":{"threadId":"t","requestId":78}}'
      echo '{"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u'$n'","items":[],"status":"completed"}}}' ;;
    *'"method":"turn/interrupt"'*)
      echo "{\"id\":$id,\"result\":{}}"
      echo '{"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u'$n'","items":[],"status":"interrupted"}}}' ;;
  esac
done
"#;

    fn script() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-codex-runner-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        // PIDs repeat across sandboxes: start from an empty folder.
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("codex");
        write_executable(&path, FAKE, 0o755);
        path
    }

    fn config(exe: &Path, resume: Option<&str>) -> RunnerConfig {
        let mut launch = CodexLaunch::new(exe.parent().unwrap(), LaunchEnv::new());
        launch.executable = exe.to_path_buf();
        RunnerConfig {
            launch,
            thread: ThreadOptions {
                policy: CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::WorkspaceWrite),
                ..ThreadOptions::default()
            },
            resume: resume.map(str::to_owned),
            client_name: "openconductor".into(),
            client_version: "0.0.0".into(),
            timeouts: Timeouts::default(),
        }
    }

    type Seen = Arc<Mutex<Vec<Value>>>;

    fn runner(config: RunnerConfig) -> (CodexRunner, Seen) {
        let seen: Seen = Arc::default();
        let s = seen.clone();
        let sink: Sink =
            Arc::new(move |p| s.lock().unwrap().push(serde_json::to_value(p).unwrap()));
        (CodexRunner::start(config, sink), seen)
    }

    /// Waits until a payload of `kind` arrives; returns it.
    fn wait_for(seen: &Seen, kind: &str, nth: usize) -> Value {
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline {
            let found: Vec<Value> = seen
                .lock()
                .unwrap()
                .iter()
                .filter(|p| p["type"] == kind)
                .cloned()
                .collect();
            if let Some(p) = found.get(nth) {
                return p.clone();
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("no {kind} #{nth}; saw {:?}", seen.lock().unwrap());
    }

    fn sent(exe: &Path) -> Vec<Value> {
        fs::read_to_string(exe.with_extension("stdin"))
            .unwrap_or_default()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    #[test]
    fn a_prompt_runs_through_approval_to_its_end() {
        let exe = script();
        let (r, seen) = runner(config(&exe, None));
        assert!(
            !exe.with_extension("stdin").exists(),
            "no process before a prompt"
        );
        let end = r.prompt(
            "make hello.txt",
            TurnOptions {
                effort: Some("high".into()),
                ..TurnOptions::default()
            },
        );
        let approval = wait_for(&seen, "approval", 0);
        assert_eq!(approval["decisions"], json!(["accept", "cancel"]));
        assert_eq!(approval["requestId"], json!(0));
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(end.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        let kinds: Vec<String> = seen
            .lock()
            .unwrap()
            .iter()
            .map(|p| p["type"].as_str().unwrap().to_owned())
            .collect();
        assert_eq!(
            kinds,
            [
                "threadStarted",
                "turnStarted",
                "approval",
                "tool",
                "text",
                "turnEnded"
            ]
        );
        let s = sent(&exe);
        assert_eq!(s[2]["params"]["approvalPolicy"], "on-request");
        assert_eq!(s[3]["params"]["effort"], "high");
        assert_eq!(s[4], json!({"id": 0, "result": {"decision": "accept"}}));

        // A follow-up reuses the process and thread.
        let end = r.prompt("again", TurnOptions::default());
        wait_for(&seen, "approval", 1);
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(end.recv_timeout(WAIT).unwrap().outcome, Outcome::Completed);
        let methods: Vec<Value> = sent(&exe).iter().map(|v| v["method"].clone()).collect();
        assert_eq!(methods.iter().filter(|m| *m == "initialize").count(), 1);
        assert_eq!(methods.iter().filter(|m| *m == "thread/start").count(), 1);
    }

    #[test]
    fn fast_snapshots_reach_initial_and_queued_turns_without_restarting() {
        let exe = script();
        let mut setup = config(&exe, None);
        setup.thread.fast_mode = Some(true);
        let (r, seen) = runner(setup);
        let first = r.prompt(
            "first off",
            TurnOptions {
                model: Some("gpt-5.4".into()),
                effort: Some("high".into()),
                fast_mode: Some(false),
            },
        );
        wait_for(&seen, "approval", 0);
        let queued = r.prompt(
            "queued on",
            TurnOptions {
                model: Some("gpt-5.4".into()),
                effort: Some("low".into()),
                fast_mode: Some(true),
            },
        );
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(first.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        wait_for(&seen, "approval", 1);
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(queued.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        let inherited = r.prompt("default on", TurnOptions::default());
        wait_for(&seen, "approval", 2);
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(inherited.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        let sent = sent(&exe);
        assert_eq!(
            sent.iter().filter(|v| v["method"] == "initialize").count(),
            1
        );
        assert_eq!(
            sent.iter()
                .filter(|v| v["method"] == "thread/start")
                .count(),
            1
        );
        let initial = sent.iter().find(|v| v["method"] == "thread/start").unwrap();
        assert_eq!(initial["params"].get("serviceTier"), Some(&Value::Null));
        let turns: Vec<_> = sent
            .iter()
            .filter(|v| v["method"] == "turn/start")
            .collect();
        assert_eq!(turns[0]["params"].get("serviceTier"), Some(&Value::Null));
        assert_eq!(turns[1]["params"]["serviceTier"], "fast");
        assert_eq!(turns[2]["params"]["serviceTier"], "fast");
        assert_eq!(turns[0]["params"]["effort"], "high");
        assert_eq!(turns[1]["params"]["effort"], "low");
        assert_eq!(turns[1]["params"]["model"], "gpt-5.4");
    }

    #[test]
    fn fast_off_reaches_saved_resume_and_failed_resume_fallback() {
        for resume in ["t-old", "t-gone"] {
            let exe = script();
            let mut setup = config(&exe, Some(resume));
            setup.thread.fast_mode = Some(true);
            let (r, seen) = runner(setup);
            r.prompt(
                "slow",
                TurnOptions {
                    fast_mode: Some(false),
                    ..TurnOptions::default()
                },
            );
            wait_for(&seen, "threadStarted", 0);
            let sent = sent(&exe);
            let opens: Vec<_> = sent
                .iter()
                .filter(|v| v["method"] == "thread/start" || v["method"] == "thread/resume")
                .collect();
            assert_eq!(opens.len(), if resume == "t-gone" { 2 } else { 1 });
            for request in opens {
                assert_eq!(
                    request["params"].get("serviceTier"),
                    Some(&Value::Null),
                    "{request}"
                );
            }
            drop(r);
        }
    }

    #[test]
    fn fast_off_reaches_reopening_after_a_process_exit() {
        let exe = script();
        let (r, seen) = runner(config(&exe, None));
        let failed = r.prompt(
            "die",
            TurnOptions {
                fast_mode: Some(true),
                ..TurnOptions::default()
            },
        );
        assert_eq!(failed.recv_timeout(WAIT).unwrap().outcome, Outcome::Failed);
        let end = r.prompt(
            "after",
            TurnOptions {
                fast_mode: Some(false),
                ..TurnOptions::default()
            },
        );
        wait_for(&seen, "approval", 0);
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(end.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        let sent = sent(&exe);
        let resumed = sent
            .iter()
            .find(|v| v["method"] == "thread/resume")
            .unwrap();
        assert_eq!(resumed["params"]["threadId"], "t-new");
        assert_eq!(resumed["params"].get("serviceTier"), Some(&Value::Null));
        let turns: Vec<_> = sent
            .iter()
            .filter(|v| v["method"] == "turn/start")
            .collect();
        assert_eq!(turns[0]["params"]["serviceTier"], "fast");
        assert_eq!(turns[1]["params"].get("serviceTier"), Some(&Value::Null));
    }

    #[test]
    fn cancel_interrupts_the_turn_and_drops_queued_prompts() {
        let exe = script();
        let (r, seen) = runner(config(&exe, None));
        let first = r.prompt("slow", TurnOptions::default());
        let queued = r.prompt("next", TurnOptions::default());
        wait_for(&seen, "turnStarted", 0);
        r.cancel();
        assert_eq!(queued.recv_timeout(WAIT).unwrap(), TurnEnd::cancelled());
        assert_eq!(first.recv_timeout(WAIT).unwrap(), TurnEnd::cancelled());
        let s = sent(&exe);
        let interrupt = s.iter().find(|v| v["method"] == "turn/interrupt").unwrap();
        assert_eq!(
            interrupt["params"],
            json!({"threadId": "t-new", "turnId": "u1"})
        );
        assert_eq!(
            s.iter().filter(|v| v["method"] == "turn/start").count(),
            1,
            "the queued prompt never started"
        );
        // Cancel with nothing running is harmless.
        r.cancel();
    }

    #[test]
    fn resumes_a_saved_thread_or_starts_fresh() {
        let exe = script();
        let (r, seen) = runner(config(&exe, Some("t-old")));
        r.prompt("slow", TurnOptions::default());
        assert_eq!(
            wait_for(&seen, "threadStarted", 0),
            json!({"type": "threadStarted", "threadId": "t-old", "resumed": true})
        );
        drop(r);

        let exe = script();
        let (r, seen) = runner(config(&exe, Some("t-gone")));
        r.prompt("slow", TurnOptions::default());
        assert_eq!(
            wait_for(&seen, "threadStarted", 0),
            json!({"type": "threadStarted", "threadId": "t-new", "resumed": false})
        );
        let notice = wait_for(&seen, "notice", 0);
        assert!(
            notice["message"].as_str().unwrap().contains("t-gone"),
            "{notice}"
        );
    }

    #[test]
    fn unsupported_requests_are_declined_and_exits_fail_the_turn() {
        let exe = script();
        let (r, seen) = runner(config(&exe, None));
        let end = r.prompt("ask me", TurnOptions::default());
        assert_eq!(
            end.recv_timeout(WAIT).unwrap(),
            TurnEnd::failed("needed input")
        );
        let reply = sent(&exe).into_iter().find(|v| v["id"] == 77).unwrap();
        assert_eq!(reply, json!({"id": 77, "result": {"answers": {}}}));
        assert!(wait_for(&seen, "notice", 0)["message"]
            .as_str()
            .unwrap()
            .contains("item/tool/requestUserInput"));

        let end = r.prompt("die", TurnOptions::default());
        let end = end.recv_timeout(WAIT).unwrap();
        assert_eq!(end.outcome, Outcome::Failed);
        assert!(end.message.as_deref().unwrap().contains("boom"), "{end:?}");

        // The next prompt starts a new process on the same thread.
        let end = r.prompt("after", TurnOptions::default());
        wait_for(&seen, "approval", 0);
        r.answer(RequestId::Int(0), ApprovalDecision::Accept);
        assert_eq!(end.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        let resumed = sent(&exe)
            .into_iter()
            .find(|v| v["method"] == "thread/resume")
            .unwrap();
        assert_eq!(resumed["params"]["threadId"], "t-new");
    }

    #[test]
    fn a_permission_request_waits_for_the_users_grant() {
        let exe = script();
        let (r, seen) = runner(config(&exe, None));
        let end = r.prompt("perm", TurnOptions::default());
        let card = wait_for(&seen, "consent", 0);
        assert_eq!(card["kind"], "permissions");
        assert_eq!(card["serverName"], "codex");
        assert_eq!(card["reason"], "needs the network");
        assert_eq!(card["permissions"], json!({"network": {"enabled": true}}));
        // Nothing is answered until the user does.
        thread::sleep(Duration::from_millis(200));
        assert!(sent(&exe).iter().all(|v| v["id"] != 78));
        assert!(end.try_recv().is_err(), "the turn waits");

        let grant: ConsentAnswer = serde_json::from_value(json!({
            "action": "grant", "grantedPermissions": card["permissions"], "scope": "turn"
        }))
        .unwrap();
        r.respond(RequestId::Int(78), grant.clone());
        assert_eq!(end.recv_timeout(WAIT).unwrap(), TurnEnd::completed());
        let reply = sent(&exe).into_iter().find(|v| v["id"] == 78).unwrap();
        assert_eq!(
            reply,
            json!({"id": 78, "result": {"permissions": {"network": {"enabled": true}}, "scope": "turn"}})
        );
        assert_eq!(
            wait_for(&seen, "approvalResolved", 0),
            json!({"type": "approvalResolved", "requestId": 78})
        );
        // A second answer to the same request sends nothing more.
        r.respond(RequestId::Int(78), grant);
        thread::sleep(Duration::from_millis(200));
        assert_eq!(sent(&exe).iter().filter(|v| v["id"] == 78).count(), 1);
    }

    #[test]
    fn stop_cancels_an_open_elicitation_before_interrupting() {
        let exe = script();
        let (r, seen) = runner(config(&exe, None));
        let end = r.prompt("elicit", TurnOptions::default());
        let card = wait_for(&seen, "consent", 0);
        assert_eq!(card["kind"], "elicitation");
        assert_eq!(card["serverName"], "linear");
        assert_eq!(card["mode"], "form");
        assert_eq!(card["message"], "Which team?");
        r.cancel();
        assert_eq!(end.recv_timeout(WAIT).unwrap(), TurnEnd::cancelled());
        let lines = sent(&exe);
        let reply = lines.iter().position(|v| v["id"] == 79).expect("answered");
        assert_eq!(
            lines[reply]["result"],
            json!({"action": "cancel", "content": null, "_meta": null})
        );
        let interrupt = lines
            .iter()
            .position(|v| v["method"] == "turn/interrupt")
            .expect("interrupted");
        assert!(reply < interrupt, "answered before the interrupt");
        wait_for(&seen, "approvalResolved", 0);
    }

    #[test]
    fn a_missing_codex_fails_the_prompt_with_its_path() {
        let mut c = config(&script(), None);
        c.launch.executable = PathBuf::from("/nonexistent/codex");
        let (r, seen) = runner(c);
        let end = r
            .prompt("hi", TurnOptions::default())
            .recv_timeout(WAIT)
            .unwrap();
        assert_eq!(end.outcome, Outcome::Failed);
        assert!(end.message.unwrap().contains("/nonexistent/codex"));
        assert_eq!(wait_for(&seen, "turnEnded", 0)["outcome"], "failed");
    }

    /// Runs one real turn when `OPENCONDUCTOR_CODEX_BIN` names a signed-in
    /// `codex` (uses the user's own CODEX_HOME). Approvals are accepted.
    #[test]
    fn live_signed_in_codex_answers_a_prompt() {
        let Some(bin) = std::env::var_os("OPENCONDUCTOR_CODEX_BIN") else {
            eprintln!("OPENCONDUCTOR_CODEX_BIN unset; live Codex runner test skipped");
            return;
        };
        let ws = script().parent().unwrap().to_path_buf();
        let mut launch = CodexLaunch::new(&ws, LaunchEnv::cleared_for(AgentKind::Codex));
        launch.executable = PathBuf::from(bin);
        let config = RunnerConfig {
            launch,
            thread: ThreadOptions {
                cwd: Some(ws.clone()),
                policy: CodexPolicy::new(ApprovalPolicy::Never, SandboxMode::ReadOnly),
                ..ThreadOptions::default()
            },
            resume: None,
            client_name: "openconductor-test".into(),
            client_version: "0.0.0".into(),
            timeouts: Timeouts::default(),
        };
        let (r, seen) = runner(config);
        let end = r
            .prompt("Reply with exactly the word: pong", TurnOptions::default())
            .recv_timeout(Duration::from_secs(180))
            .unwrap();
        eprintln!("live end: {end:?}");
        assert_eq!(end.outcome, Outcome::Completed, "{end:?}");
        let message = wait_for(&seen, "message", 0);
        assert!(
            message["text"]
                .as_str()
                .unwrap()
                .to_lowercase()
                .contains("pong"),
            "{message}"
        );
    }
}
