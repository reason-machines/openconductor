//! A running `codex app-server`: spawns a [`CodexLaunch`], makes JSON-RPC
//! calls on its stdin and delivers everything else it prints as
//! [`CodexEvent`]s on one channel.
//!
//! A call ([`CodexSession::call`]) waits for the response with its id;
//! notifications and approval requests that arrive meanwhile are kept, in
//! order, for [`CodexSession::next_event`]. Stdout and stderr are read on
//! their own threads. Dropping a session kills a process that is still
//! running.

use std::collections::VecDeque;
use std::fmt;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ExitStatus};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use super::codex_cli::CodexLaunch;
use super::codex_events::{thread_id, Notification, ServerMessage, Turn};
use super::codex_rpc::{
    approval_line, error_line, initialized_line, result_line, ApprovalDecision, ClientRequest,
    RequestId, ThreadOptions, TurnInput,
};

/// Something the process printed, in the order each stream produced it.
#[derive(Debug, Clone, PartialEq)]
pub enum CodexEvent {
    /// A stdout line that parsed (responses to calls are not delivered here).
    Message(ServerMessage),
    /// A stdout line that did not parse; kept so it can be shown or logged.
    BadLine { line: String, error: String },
    /// One stderr line (Codex logs here).
    Stderr(String),
    /// Stdout closed: the process exited or is about to. Sent once.
    Closed,
}

/// Why a call did not return a result.
#[derive(Debug)]
pub enum CallError {
    Io(io::Error),
    /// The server answered with a JSON-RPC error.
    Rpc {
        code: i64,
        message: String,
    },
    /// No response within the timeout.
    Timeout {
        method: &'static str,
    },
    /// The process closed stdout before answering.
    Closed {
        method: &'static str,
    },
    /// A response without what the call needs (e.g. no thread id).
    BadResult {
        method: &'static str,
    },
    /// [`CodexSession::interrupt`] with no running turn.
    NoActiveTurn,
}

impl fmt::Display for CallError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CallError::Io(e) => write!(f, "app-server i/o: {e}"),
            CallError::Rpc { code, message } => write!(f, "app-server error {code}: {message}"),
            CallError::Timeout { method } => write!(f, "{method}: no response before timeout"),
            CallError::Closed { method } => write!(f, "{method}: app-server exited"),
            CallError::BadResult { method } => write!(f, "{method}: unexpected result"),
            CallError::NoActiveTurn => f.write_str("no turn is running"),
        }
    }
}

impl std::error::Error for CallError {}

impl From<io::Error> for CallError {
    fn from(e: io::Error) -> Self {
        CallError::Io(e)
    }
}

enum Line {
    Message(ServerMessage),
    Bad { line: String, error: String },
    Stderr(String),
    Closed,
}

/// One `codex app-server` process for one workspace session.
pub struct CodexSession {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<Line>,
    pending: VecDeque<CodexEvent>,
    next_id: i64,
    thread: Option<String>,
    turn: Option<String>,
    /// The last turn the server announced with `turn/started`.
    started: Option<String>,
}

impl CodexSession {
    /// Starts the process. A missing executable errors with its path.
    pub fn spawn(launch: &CodexLaunch) -> io::Result<Self> {
        let mut child = launch.command().spawn().map_err(|e| {
            io::Error::new(
                e.kind(),
                format!("cannot start {}: {e}", launch.executable.display()),
            )
        })?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or_else(|| missing("stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| missing("stderr"))?;
        let (tx, lines) = mpsc::channel();
        read_lines(stdout, tx.clone(), parse_stdout, Some(Line::Closed));
        read_lines(stderr, tx, Line::Stderr, None);
        Ok(Self {
            child,
            stdin,
            lines,
            pending: VecDeque::new(),
            next_id: 0,
            thread: None,
            turn: None,
            started: None,
        })
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// The thread started or resumed on this session.
    pub fn thread_id(&self) -> Option<&str> {
        self.thread.as_deref()
    }

    /// The turn that is running, if any.
    pub fn active_turn(&self) -> Option<&str> {
        self.turn.as_deref()
    }

    fn write(&mut self, line: &str) -> io::Result<()> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "stdin already closed"))?;
        stdin.write_all(line.as_bytes())?;
        stdin.flush()
    }

    /// Sends `request` and waits up to `timeout` for its result.
    pub fn call(&mut self, request: &ClientRequest, timeout: Duration) -> Result<Value, CallError> {
        self.next_id += 1;
        let id = self.next_id;
        let method = request.method();
        self.write(&request.to_line(id))?;
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let line = match self.lines.recv_timeout(left) {
                Ok(line) => line,
                Err(RecvTimeoutError::Timeout) => return Err(CallError::Timeout { method }),
                Err(RecvTimeoutError::Disconnected) => return Err(CallError::Closed { method }),
            };
            match line {
                Line::Message(ServerMessage::Response { id: got, result })
                    if got == RequestId::Int(id) =>
                {
                    return Ok(result)
                }
                Line::Message(ServerMessage::ErrorResponse {
                    id: Some(got),
                    code,
                    message,
                }) if got == RequestId::Int(id) => return Err(CallError::Rpc { code, message }),
                Line::Closed => {
                    self.pending.push_back(CodexEvent::Closed);
                    return Err(CallError::Closed { method });
                }
                other => {
                    let event = self.track(other);
                    self.pending.push_back(event);
                }
            }
        }
    }

    /// `initialize` then `initialized`; returns the server's info.
    pub fn initialize(
        &mut self,
        name: &str,
        version: &str,
        timeout: Duration,
    ) -> Result<Value, CallError> {
        let info = self.call(
            &ClientRequest::Initialize {
                name: name.into(),
                title: None,
                version: version.into(),
            },
            timeout,
        )?;
        self.write(&initialized_line())?;
        Ok(info)
    }

    /// Starts a new thread, or resumes `resume`; returns its id.
    pub fn open_thread(
        &mut self,
        resume: Option<String>,
        options: ThreadOptions,
        timeout: Duration,
    ) -> Result<String, CallError> {
        let request = match resume {
            Some(thread_id) => ClientRequest::ThreadResume { thread_id, options },
            None => ClientRequest::ThreadStart(options),
        };
        let method = request.method();
        let result = self.call(&request, timeout)?;
        let id = thread_id(&result).ok_or(CallError::BadResult { method })?;
        self.thread = Some(id.to_owned());
        Ok(id.to_owned())
    }

    /// Starts a turn on the open thread; returns the turn id.
    pub fn start_turn(
        &mut self,
        input: impl Into<TurnInput>,
        model: Option<String>,
        effort: Option<String>,
        timeout: Duration,
    ) -> Result<String, CallError> {
        let thread_id = self.thread.clone().ok_or(CallError::BadResult {
            method: "turn/start",
        })?;
        let result = self.call(
            &ClientRequest::TurnStart {
                thread_id,
                input: input.into(),
                model,
                effort,
            },
            timeout,
        )?;
        let turn = result
            .get("turn")
            .and_then(|t| Turn::from_json(t).ok())
            .ok_or(CallError::BadResult {
                method: "turn/start",
            })?;
        self.turn = Some(turn.id.clone());
        Ok(turn.id)
    }

    /// Stops the running turn; Codex then sends `turn/completed`.
    ///
    /// Codex can answer `turn/start` before the turn is running, and rejects
    /// an interrupt in that gap ("no active turn to interrupt"), so this
    /// first waits for the turn's `turn/started`.
    pub fn interrupt(&mut self, timeout: Duration) -> Result<(), CallError> {
        let deadline = Instant::now() + timeout;
        while self.turn.is_some() && self.started != self.turn {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.lines.recv_timeout(left) {
                Ok(line) => {
                    let event = self.track(line);
                    self.pending.push_back(event);
                }
                Err(RecvTimeoutError::Timeout) => {
                    return Err(CallError::Timeout {
                        method: "turn/interrupt",
                    })
                }
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(CallError::Closed {
                        method: "turn/interrupt",
                    })
                }
            }
        }
        let (Some(thread_id), Some(turn_id)) = (self.thread.clone(), self.turn.clone()) else {
            return Err(CallError::NoActiveTurn);
        };
        let timeout = deadline.saturating_duration_since(Instant::now());
        self.call(
            &ClientRequest::TurnInterrupt { thread_id, turn_id },
            timeout,
        )
        .map(drop)
    }

    /// Answers a command or file-change approval request.
    pub fn answer(&mut self, id: &RequestId, decision: ApprovalDecision) -> io::Result<()> {
        self.write(&approval_line(id, decision))
    }

    /// Answers a server request with `result`.
    pub fn respond(&mut self, id: &RequestId, result: Value) -> io::Result<()> {
        self.write(&result_line(id, result))
    }

    /// Answers a server request the app does not handle with an error, so
    /// the turn does not wait on it forever.
    pub fn reject(&mut self, id: &RequestId, code: i64, message: &str) -> io::Result<()> {
        self.write(&error_line(id, code, message))
    }

    /// Waits up to `timeout` for the next event; `None` on timeout or once
    /// both output streams are done.
    pub fn next_event(&mut self, timeout: Duration) -> Option<CodexEvent> {
        if let Some(event) = self.pending.pop_front() {
            return Some(event);
        }
        let line = self.lines.recv_timeout(timeout).ok()?;
        Some(self.track(line))
    }

    /// Follows which turn is running.
    fn track(&mut self, line: Line) -> CodexEvent {
        match line {
            Line::Message(message) => {
                match &message {
                    ServerMessage::Notification(Notification::TurnStarted { turn, .. }) => {
                        self.turn = Some(turn.id.clone());
                        self.started = Some(turn.id.clone());
                    }
                    ServerMessage::Notification(Notification::TurnCompleted { turn, .. })
                        if self.turn.as_deref() == Some(turn.id.as_str()) =>
                    {
                        self.turn = None;
                        self.started = None;
                    }
                    _ => {}
                }
                CodexEvent::Message(message)
            }
            Line::Bad { line, error } => CodexEvent::BadLine { line, error },
            Line::Stderr(line) => CodexEvent::Stderr(line),
            Line::Closed => CodexEvent::Closed,
        }
    }

    /// Kills the process (no-op if it already exited).
    pub fn kill(&mut self) -> io::Result<()> {
        match self.child.try_wait()? {
            Some(_) => Ok(()),
            None => self.child.kill(),
        }
    }

    /// Closes stdin, which ends the app-server, and waits for it to exit.
    pub fn wait(&mut self) -> io::Result<ExitStatus> {
        self.stdin = None;
        self.child.wait()
    }
}

impl Drop for CodexSession {
    fn drop(&mut self) {
        let _ = self.kill();
        let _ = self.child.wait();
    }
}

fn missing(stream: &str) -> io::Error {
    io::Error::other(format!("child {stream} was not piped"))
}

fn parse_stdout(line: String) -> Line {
    match ServerMessage::parse(&line) {
        Ok(message) => Line::Message(message),
        Err(e) => Line::Bad {
            line,
            error: e.to_string(),
        },
    }
}

/// Forwards each non-empty line of `stream` as `to_line(line)`, then `last`.
fn read_lines<R: Read + Send + 'static>(
    stream: R,
    tx: Sender<Line>,
    to_line: fn(String) -> Line,
    last: Option<Line>,
) {
    thread::spawn(move || {
        for line in BufReader::new(stream).lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            if tx.send(to_line(line)).is_err() {
                return;
            }
        }
        if let Some(last) = last {
            let _ = tx.send(last);
        }
    });
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::super::codex_cli::{ApprovalPolicy, CodexPolicy, SandboxMode};
    use super::super::codex_events::{ServerRequest, TurnStatus};
    use super::super::test_exe::write_executable;
    use super::super::{AgentKind, LaunchEnv};
    use super::*;

    const WAIT: Duration = Duration::from_secs(10);

    /// A stand-in app-server: logs every stdin line to `<script>.stdin` and
    /// answers the way Codex 0.166.0 did in the recorded session. Like the
    /// real server, it announces a turn shortly after answering `turn/start`
    /// and rejects an interrupt that arrives before that.
    const FAKE_APP_SERVER: &str = r#"#!/bin/sh
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$0.stdin"
  id=$(printf '%s' "$line" | sed -n 's/^{"id":\([0-9]*\),.*/\1/p')
  case "$line" in
    *'"method":"initialize"'*) echo "{\"id\":$id,\"result\":{\"userAgent\":\"fake/0\"}}" ;;
    *'"method":"initialized"'*) echo 'starting' >&2 ;;
    *'"method":"thread/start"'*)
      echo '{"method":"thread/started","params":{"thread":{"id":"t1"}}}'
      echo "{\"id\":$id,\"result\":{\"thread\":{\"id\":\"t1\"}}}" ;;
    *'"method":"turn/start"'*)
      echo "{\"id\":$id,\"result\":{\"turn\":{\"id\":\"u1\",\"items\":[],\"status\":\"inProgress\"}}}"
      echo 'not json'
      echo '{"id":"srv-1","method":"item/commandExecution/requestApproval","params":{"threadId":"t1","turnId":"u1","itemId":"i1","startedAtMs":1,"command":"ls"}}'
      ( sleep 0.3; touch "$0.started"
        echo '{"method":"turn/started","params":{"threadId":"t1","turn":{"id":"u1","items":[],"status":"inProgress"}}}' ) & ;;
    *'"decision"'*)
      echo '{"method":"item/agentMessage/delta","params":{"threadId":"t1","turnId":"u1","itemId":"i2","delta":"hi"}}' ;;
    *'"method":"turn/interrupt"'*)
      if [ ! -e "$0.started" ]; then
        echo "{\"error\":{\"code\":-32600,\"message\":\"no active turn to interrupt\"},\"id\":$id}"
        continue
      fi
      echo "{\"id\":$id,\"result\":{}}"
      echo '{"method":"turn/completed","params":{"threadId":"t1","turn":{"id":"u1","items":[],"status":"interrupted"}}}' ;;
    *'"method":"thread/resume"'*) echo "{\"error\":{\"code\":-32600,\"message\":\"no rollout found\"},\"id\":$id}" ;;
  esac
done
"#;

    fn script(body: &str) -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-codex-session-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        // PIDs repeat across sandboxes: start from an empty folder.
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("codex");
        write_executable(&path, body, 0o755);
        path
    }

    fn launch(executable: PathBuf) -> CodexLaunch {
        let mut launch = CodexLaunch::new(executable.parent().unwrap(), LaunchEnv::new());
        launch.executable = executable;
        launch
    }

    /// Next stdout-side event, skipping stderr lines.
    fn next(session: &mut CodexSession) -> CodexEvent {
        loop {
            match session.next_event(WAIT).expect("event before timeout") {
                CodexEvent::Stderr(_) => {}
                event => return event,
            }
        }
    }

    fn notification(event: CodexEvent) -> Notification {
        match event {
            CodexEvent::Message(ServerMessage::Notification(n)) => n,
            other => panic!("expected a notification, got {other:?}"),
        }
    }

    #[test]
    fn handshake_turn_approval_and_interrupt() {
        let exe = script(FAKE_APP_SERVER);
        let mut s = CodexSession::spawn(&launch(exe.clone())).unwrap();
        let info = s.initialize("openconductor", "0.1.0", WAIT).unwrap();
        assert_eq!(info["userAgent"], "fake/0");

        let options = ThreadOptions {
            policy: CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::WorkspaceWrite),
            ..ThreadOptions::default()
        };
        assert_eq!(s.open_thread(None, options, WAIT).unwrap(), "t1");
        assert_eq!(s.start_turn("hi", None, None, WAIT).unwrap(), "u1");
        assert_eq!(s.active_turn(), Some("u1"));
        // Interrupt before the server has announced the turn: waits for
        // turn/started instead of being rejected.
        s.interrupt(WAIT).unwrap();

        // Printed while calls waited, so kept for next_event in order.
        assert!(matches!(
            notification(next(&mut s)),
            Notification::Other { method, .. } if method == "thread/started"
        ));
        assert!(matches!(next(&mut s), CodexEvent::BadLine { line, .. } if line == "not json"));
        let CodexEvent::Message(ServerMessage::Request(ServerRequest::CommandApproval {
            id,
            command,
            ..
        })) = next(&mut s)
        else {
            panic!("expected a command approval")
        };
        assert_eq!(command.as_deref(), Some("ls"));
        assert!(matches!(
            notification(next(&mut s)),
            Notification::TurnStarted { turn, .. } if turn.id == "u1"
        ));
        assert!(matches!(
            notification(next(&mut s)),
            Notification::TurnCompleted { turn, .. } if turn.status == TurnStatus::Interrupted
        ));
        s.answer(&id, ApprovalDecision::Accept).unwrap();
        assert!(matches!(
            notification(next(&mut s)),
            Notification::AgentMessageDelta { delta, .. } if delta == "hi"
        ));
        assert_eq!(s.active_turn(), None);
        assert!(matches!(s.interrupt(WAIT), Err(CallError::NoActiveTurn)));

        let err = s
            .open_thread(Some("t9".into()), ThreadOptions::default(), WAIT)
            .unwrap_err();
        assert!(
            matches!(&err, CallError::Rpc { code: -32600, message } if message == "no rollout found"),
            "{err}"
        );
        assert_eq!(s.thread_id(), Some("t1"));

        assert!(s.wait().unwrap().success());
        let log = fs::read_to_string(exe.with_extension("stdin")).unwrap();
        let sent: Vec<Value> = log
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        let methods: Vec<&str> = sent
            .iter()
            .map(|v| v["method"].as_str().unwrap_or("(response)"))
            .collect();
        assert_eq!(
            methods,
            [
                "initialize",
                "initialized",
                "thread/start",
                "turn/start",
                "turn/interrupt",
                "(response)",
                "thread/resume"
            ]
        );
        assert_eq!(sent[2]["params"]["approvalPolicy"], "on-request");
        assert_eq!(
            sent[5],
            serde_json::json!({"id": "srv-1", "result": {"decision": "accept"}})
        );
        assert_eq!(
            sent[4]["params"],
            serde_json::json!({"threadId": "t1", "turnId": "u1"})
        );
        let ids: Vec<i64> = sent.iter().filter_map(|v| v["id"].as_i64()).collect();
        assert_eq!(ids, [1, 2, 3, 4, 5]);
    }

    #[test]
    fn calls_time_out_or_report_an_exited_server() {
        let mut silent = CodexSession::spawn(&launch(script(
            "#!/bin/sh\nwhile IFS= read -r line; do :; done\n",
        )))
        .unwrap();
        let err = silent
            .initialize("oc", "0", Duration::from_millis(200))
            .unwrap_err();
        assert!(
            matches!(
                err,
                CallError::Timeout {
                    method: "initialize"
                }
            ),
            "{err}"
        );

        let mut quits =
            CodexSession::spawn(&launch(script("#!/bin/sh\nread line\nexit 0\n"))).unwrap();
        let err = quits.initialize("oc", "0", WAIT).unwrap_err();
        assert!(
            matches!(
                err,
                CallError::Closed {
                    method: "initialize"
                }
            ),
            "{err}"
        );
        assert_eq!(quits.next_event(WAIT), Some(CodexEvent::Closed));
    }

    #[test]
    fn missing_executable_names_the_path_and_drop_kills() {
        let err = CodexSession::spawn(&launch(PathBuf::from("/nonexistent/codex")))
            .err()
            .expect("spawn fails");
        assert_eq!(err.kind(), io::ErrorKind::NotFound);
        assert!(err.to_string().contains("/nonexistent/codex"), "{err}");

        let session = CodexSession::spawn(&launch(script(FAKE_APP_SERVER))).unwrap();
        let pid = session.pid();
        drop(session);
        let alive = std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .unwrap()
            .success();
        assert!(!alive, "process {pid} still running after drop");
    }

    /// Runs against a real `codex` when `OPENCONDUCTOR_CODEX_BIN` names one.
    /// Needs no credentials: without them the turn completes as failed.
    #[test]
    fn live_codex_app_server_runs_a_turn_to_completion() {
        let Some(bin) = std::env::var_os("OPENCONDUCTOR_CODEX_BIN") else {
            eprintln!("OPENCONDUCTOR_CODEX_BIN unset; live Codex test skipped");
            return;
        };
        let ws = script("#!/bin/sh\n").parent().unwrap().to_path_buf();
        let mut env = LaunchEnv::cleared_for(AgentKind::Codex);
        env.set("CODEX_HOME", ws.join("codex-home").display().to_string());
        fs::create_dir_all(ws.join("codex-home")).unwrap();
        let mut launch = CodexLaunch::new(&ws, env);
        launch.executable = PathBuf::from(bin);
        let mut s = CodexSession::spawn(&launch).unwrap();
        s.initialize("openconductor-test", "0.0.0", WAIT).unwrap();
        let options = ThreadOptions {
            cwd: Some(ws.clone()),
            policy: CodexPolicy::new(ApprovalPolicy::Never, SandboxMode::ReadOnly),
            ..ThreadOptions::default()
        };
        s.open_thread(None, options, WAIT).unwrap();
        let first = s.start_turn("say hi", None, None, WAIT).unwrap();
        let turn = completed(&mut s);
        assert_eq!(turn.id, first);
        assert_ne!(turn.status, TurnStatus::InProgress);
        eprintln!("live turn ended {:?}: {:?}", turn.status, turn.error);
        // A second turn, stopped right away.
        let second = s.start_turn("say hi again", None, None, WAIT).unwrap();
        s.interrupt(WAIT).unwrap();
        let turn = completed(&mut s);
        assert_eq!((turn.id, turn.status), (second, TurnStatus::Interrupted));
        assert_eq!(s.active_turn(), None);
    }

    fn completed(s: &mut CodexSession) -> Turn {
        let deadline = Instant::now() + Duration::from_secs(120);
        while Instant::now() < deadline {
            if let Some(CodexEvent::Message(ServerMessage::Notification(
                Notification::TurnCompleted { turn, .. },
            ))) = s.next_event(Duration::from_secs(1))
            {
                assert_eq!(s.active_turn(), None);
                return turn;
            }
        }
        panic!("no turn/completed within 120s");
    }
}
