//! A running Claude Code process: spawns a [`ClaudeLaunch`], writes
//! [`ClientMessage`]s to its stdin and delivers what it prints as
//! [`SessionEvent`]s on one channel.
//!
//! Stdout and stderr are read on their own threads, so a slow consumer never
//! blocks the CLI. Dropping a session kills a process that is still running,
//! so the app never leaks agent processes.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ExitStatus};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use serde_json::Value;

use super::claude_cli::{ClaudeLaunch, PermissionMode};
use super::claude_stream::{
    ClaudeEvent, ClientMessage, ControlRequest, PermissionDecision, RequestIds,
};

/// Something the process printed, in the order each stream produced it.
#[derive(Debug, Clone, PartialEq)]
pub enum SessionEvent {
    /// A stdout line that parsed as stream-json.
    Event(ClaudeEvent),
    /// A stdout line that did not parse; kept so it can be shown or logged.
    BadLine { line: String, error: String },
    /// One stderr line (warnings, crash output).
    Stderr(String),
    /// Stdout closed: the process exited or is about to. Sent once; stderr
    /// lines may still follow it.
    Closed,
}

/// One `claude` process for one workspace session.
pub struct ClaudeSession {
    child: Child,
    stdin: Option<ChildStdin>,
    events: Receiver<SessionEvent>,
    ids: RequestIds,
}

impl ClaudeSession {
    /// Starts the process. A missing executable errors with its path.
    pub fn spawn(launch: &ClaudeLaunch) -> io::Result<Self> {
        let mut child = launch.command().spawn().map_err(|e| {
            io::Error::new(
                e.kind(),
                format!("cannot start {}: {e}", launch.executable.display()),
            )
        })?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or_else(|| missing("stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| missing("stderr"))?;
        let (tx, events) = mpsc::channel();
        read_lines(stdout, tx.clone(), parse_stdout, Some(SessionEvent::Closed));
        read_lines(stderr, tx, SessionEvent::Stderr, None);
        Ok(Self {
            child,
            stdin,
            events,
            ids: RequestIds::default(),
        })
    }

    /// The OS process id.
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// Writes one message line and flushes it.
    pub fn send(&mut self, message: &ClientMessage) -> io::Result<()> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "stdin already closed"))?;
        stdin.write_all(message.to_line().as_bytes())?;
        stdin.flush()
    }

    /// Sends a user turn.
    pub fn send_user(&mut self, text: impl Into<String>) -> io::Result<()> {
        self.send(&ClientMessage::User { text: text.into() })
    }

    /// Sends a control request and returns its id; the CLI answers with a
    /// [`ClaudeEvent::ControlResponse`] carrying the same id.
    pub fn control(&mut self, request: ControlRequest) -> io::Result<String> {
        let request_id = self.ids.next_id();
        self.send(&ClientMessage::Control {
            request_id: request_id.clone(),
            request,
        })?;
        Ok(request_id)
    }

    /// Stops the running turn.
    pub fn interrupt(&mut self) -> io::Result<String> {
        self.control(ControlRequest::Interrupt)
    }

    pub fn set_permission_mode(&mut self, mode: PermissionMode) -> io::Result<String> {
        self.control(ControlRequest::SetPermissionMode(mode))
    }

    pub fn set_model(&mut self, model: Option<String>) -> io::Result<String> {
        self.control(ControlRequest::SetModel(model))
    }

    /// Answers a [`ClaudeEvent::PermissionPrompt`].
    pub fn answer_permission(
        &mut self,
        request_id: impl Into<String>,
        decision: PermissionDecision,
    ) -> io::Result<()> {
        self.send(&ClientMessage::PermissionReply {
            request_id: request_id.into(),
            decision,
        })
    }

    /// Allows a prompted tool with its input unchanged.
    pub fn allow(&mut self, request_id: impl Into<String>, input: Value) -> io::Result<()> {
        self.answer_permission(request_id, PermissionDecision::Allow { input })
    }

    /// Waits up to `timeout` for the next event; `None` on timeout or once
    /// both output streams are done.
    pub fn next_event(&self, timeout: Duration) -> Option<SessionEvent> {
        self.events.recv_timeout(timeout).ok()
    }

    /// Events already received, without waiting.
    pub fn pending_events(&self) -> Vec<SessionEvent> {
        self.events.try_iter().collect()
    }

    /// Hands the event stream to the caller (a reader thread), so writes
    /// never wait on a reader. Afterwards [`Self::next_event`] and
    /// [`Self::pending_events`] return nothing.
    pub fn take_events(&mut self) -> Receiver<SessionEvent> {
        let (_closed, empty) = mpsc::channel();
        std::mem::replace(&mut self.events, empty)
    }

    /// Closes stdin: the CLI finishes its current turn and exits.
    pub fn close_stdin(&mut self) {
        self.stdin = None;
    }

    /// Kills the process (no-op if it already exited).
    pub fn kill(&mut self) -> io::Result<()> {
        match self.child.try_wait()? {
            Some(_) => Ok(()),
            None => self.child.kill(),
        }
    }

    /// Closes stdin and waits for the process to exit.
    pub fn wait(&mut self) -> io::Result<ExitStatus> {
        self.close_stdin();
        self.child.wait()
    }
}

impl Drop for ClaudeSession {
    fn drop(&mut self) {
        let _ = self.kill();
        let _ = self.child.wait();
    }
}

fn missing(stream: &str) -> io::Error {
    io::Error::other(format!("child {stream} was not piped"))
}

fn parse_stdout(line: String) -> SessionEvent {
    match ClaudeEvent::parse(&line) {
        Ok(event) => SessionEvent::Event(event),
        Err(e) => SessionEvent::BadLine {
            line,
            error: e.to_string(),
        },
    }
}

/// Forwards each non-empty line of `stream` as `to_event(line)`, then `last`.
fn read_lines<R: Read + Send + 'static>(
    stream: R,
    tx: Sender<SessionEvent>,
    to_event: fn(String) -> SessionEvent,
    last: Option<SessionEvent>,
) {
    thread::spawn(move || {
        for line in BufReader::new(stream).lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            if tx.send(to_event(line)).is_err() {
                return;
            }
        }
        if let Some(event) = last {
            let _ = tx.send(event);
        }
    });
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::super::test_exe::write_executable;
    use super::super::LaunchEnv;
    use super::*;

    const WAIT: Duration = Duration::from_secs(10);

    /// A stand-in `claude`: prints init and a bad line, logs every stdin line
    /// to `<script>.stdin` and answers each with a result, then exits 3.
    const FAKE_CLAUDE: &str = r#"#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"s1","permissionMode":"default"}'
echo 'not json'
echo 'warning from cli' >&2
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$0.stdin"
  echo '{"type":"result","subtype":"success","session_id":"s1","result":"done","total_cost_usd":0.01}'
done
exit 3
"#;

    fn fake_claude() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-claude-session-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("claude");
        write_executable(&path, FAKE_CLAUDE, 0o755);
        path
    }

    fn launch(executable: PathBuf) -> ClaudeLaunch {
        let mut launch = ClaudeLaunch::new(executable.parent().unwrap(), LaunchEnv::new());
        launch.executable = executable;
        launch
    }

    /// Next stdout-side event; stderr lines are collected into `stderr`.
    fn next(session: &ClaudeSession, stderr: &mut Vec<String>) -> SessionEvent {
        loop {
            match session.next_event(WAIT).expect("event before timeout") {
                SessionEvent::Stderr(line) => stderr.push(line),
                event => return event,
            }
        }
    }

    #[test]
    fn round_trip_with_a_running_process() {
        let exe = fake_claude();
        let mut session = ClaudeSession::spawn(&launch(exe.clone())).unwrap();
        assert!(session.pid() > 0);
        let mut stderr = Vec::new();

        match next(&session, &mut stderr) {
            SessionEvent::Event(ClaudeEvent::Init { session_id, .. }) => {
                assert_eq!(session_id, "s1")
            }
            other => panic!("expected init, got {other:?}"),
        }
        match next(&session, &mut stderr) {
            SessionEvent::BadLine { line, .. } => assert_eq!(line, "not json"),
            other => panic!("expected bad line, got {other:?}"),
        }

        session.send_user("hello").unwrap();
        match next(&session, &mut stderr) {
            SessionEvent::Event(ClaudeEvent::Result(r)) => {
                assert_eq!(r.text.as_deref(), Some("done"));
                assert_eq!(r.total_cost_usd, Some(0.01));
            }
            other => panic!("expected result, got {other:?}"),
        }
        session
            .allow("req_9", serde_json::json!({"command": "ls"}))
            .unwrap();
        assert_eq!(session.interrupt().unwrap(), "req_1");
        assert_eq!(
            session.set_permission_mode(PermissionMode::Plan).unwrap(),
            "req_2"
        );

        let status = session.wait().unwrap();
        assert_eq!(status.code(), Some(3));
        let mut rest: Vec<SessionEvent> = Vec::new();
        while let Some(event) = session.next_event(WAIT) {
            rest.push(event);
        }
        // Stdout and stderr are separate threads: stderr may follow Closed.
        let closed = rest.iter().filter(|e| **e == SessionEvent::Closed).count();
        assert_eq!(closed, 1, "{rest:?}");
        stderr.extend(rest.iter().filter_map(|e| match e {
            SessionEvent::Stderr(line) => Some(line.clone()),
            _ => None,
        }));
        assert_eq!(stderr, ["warning from cli"]);

        let log = fs::read_to_string(exe.with_extension("stdin")).unwrap();
        let sent: Vec<Value> = log
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        let kinds: Vec<&str> = sent.iter().map(|v| v["type"].as_str().unwrap()).collect();
        assert_eq!(
            kinds,
            [
                "user",
                "control_response",
                "control_request",
                "control_request"
            ]
        );
        assert_eq!(sent[1]["response"]["request_id"], "req_9");
        assert_eq!(sent[1]["response"]["response"]["behavior"], "allow");
        assert_eq!(sent[2]["request"]["subtype"], "interrupt");
        assert_eq!(sent[3]["request"]["mode"], "plan");
        assert!(session.send_user("late").is_err());
    }

    #[test]
    fn missing_executable_names_the_path() {
        let err = ClaudeSession::spawn(&launch(PathBuf::from("/nonexistent/claude")))
            .err()
            .expect("spawn fails");
        assert_eq!(err.kind(), io::ErrorKind::NotFound);
        assert!(err.to_string().contains("/nonexistent/claude"), "{err}");
    }

    #[test]
    fn drop_kills_a_running_process() {
        let exe = fake_claude();
        let session = ClaudeSession::spawn(&launch(exe)).unwrap();
        let pid = session.pid();
        drop(session);
        let alive = std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .unwrap()
            .success();
        assert!(!alive, "process {pid} still running after drop");
    }
}
