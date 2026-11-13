//! JSON-RPC 2.0 over newline-delimited JSON: ACP's transport on an agent's
//! stdin and stdout.
//!
//! One reader thread reads stdout in order. A notification or an
//! agent-to-client request goes to the [`Handler`]; a response wakes the
//! [`RpcConnection::call`] waiting on its id. Both happen on that thread in
//! wire order, so every `session/update` the agent sent before a
//! `session/prompt` response has been handled when `call` returns.
//! Responses may come back in any order (reason acp answers concurrent
//! requests as each finishes), so calls are matched by id only.
//!
//! The handler runs on the reader thread and must not call `call`.

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fmt;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// JSON-RPC codes this provider looks at.
pub mod codes {
    pub const METHOD_NOT_FOUND: i64 = -32601;
    /// ACP `auth_required`: reason acp sends "Authentication required: …".
    pub const AUTH_REQUIRED: i64 = -32000;
    /// ACP `resource_not_found`: a session this process has not opened.
    pub const RESOURCE_NOT_FOUND: i64 = -32002;
}

/// A JSON-RPC error object.
#[derive(Debug, Clone, PartialEq)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
}

/// Why a call did not return a result.
#[derive(Debug, Clone, PartialEq)]
pub enum CallError {
    /// The agent answered with an error object.
    Rpc(RpcError),
    /// No answer in time. The request may still be running.
    Timeout,
    /// The agent's stdout closed before it answered.
    Closed(String),
    /// Writing the request failed.
    Io(String),
}

impl fmt::Display for CallError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CallError::Rpc(e) => write!(f, "{} ({})", e.message, e.code),
            CallError::Timeout => f.write_str("Reason did not answer in time"),
            CallError::Closed(why) => write!(f, "Reason exited: {why}"),
            CallError::Io(why) => write!(f, "could not write to Reason: {why}"),
        }
    }
}

impl std::error::Error for CallError {}

/// Something the agent sent that is not a response.
#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    Notification {
        method: String,
        params: Value,
    },
    /// Answer it with [`Responder::respond`].
    Request {
        id: Value,
        method: String,
        params: Value,
    },
    /// Stdout ended. Sent once, last.
    Closed {
        reason: String,
    },
}

pub type Handler = Box<dyn FnMut(Incoming, &Responder) + Send>;
type Writer = Arc<Mutex<Box<dyn Write + Send>>>;
type Waiter = Sender<Result<Value, CallError>>;

/// Answers agent-to-client requests.
#[derive(Clone)]
pub struct Responder {
    writer: Writer,
}

impl Responder {
    pub fn respond(&self, id: &Value, result: Result<Value, RpcError>) -> io::Result<()> {
        let msg = match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(e) => json!({ "jsonrpc": "2.0", "id": id,
                "error": { "code": e.code, "message": e.message } }),
        };
        write_line(&self.writer, &msg)
    }
}

#[derive(Default)]
struct Pending {
    waiters: HashMap<u64, Waiter>,
    /// Set once stdout has ended; later calls fail at once.
    closed: Option<String>,
}

/// A JSON-RPC connection to one agent process.
pub struct RpcConnection {
    writer: Writer,
    pending: Arc<Mutex<Pending>>,
    next_id: AtomicU64,
}

impl RpcConnection {
    /// Reads `stdout` on a new thread and writes requests to `stdin`.
    pub fn start(
        stdout: impl Read + Send + 'static,
        stdin: impl Write + Send + 'static,
        handler: Handler,
    ) -> Self {
        let writer: Writer = Arc::new(Mutex::new(Box::new(stdin)));
        let pending = Arc::new(Mutex::new(Pending::default()));
        let responder = Responder {
            writer: writer.clone(),
        };
        let reader_pending = pending.clone();
        thread::Builder::new()
            .name("reason-acp-reader".into())
            .spawn(move || read_loop(stdout, reader_pending, responder, handler))
            .expect("spawn reason-acp reader thread");
        RpcConnection {
            writer,
            pending,
            next_id: AtomicU64::new(1),
        }
    }

    /// Sends a request and waits for its response. `timeout: None` waits
    /// until the agent answers or exits (a `session/prompt` lasts a turn).
    pub fn call(
        &self,
        method: &str,
        params: Value,
        timeout: Option<Duration>,
    ) -> Result<Value, CallError> {
        self.call_with_handoff(method, params, timeout, None)
    }

    pub fn call_with_handoff(
        &self,
        method: &str,
        params: Value,
        timeout: Option<Duration>,
        on_handoff: Option<Box<dyn FnOnce() + Send>>,
    ) -> Result<Value, CallError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        {
            let mut pending = self.pending.lock().unwrap();
            if let Some(why) = &pending.closed {
                return Err(CallError::Closed(why.clone()));
            }
            pending.waiters.insert(id, tx);
        }
        let msg = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        if let Err(e) = write_line(&self.writer, &msg) {
            self.pending.lock().unwrap().waiters.remove(&id);
            return Err(CallError::Io(e.to_string()));
        }
        if let Some(on_handoff) = on_handoff {
            on_handoff();
        }
        let answer = match timeout {
            None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
            Some(t) => rx.recv_timeout(t),
        };
        answer.unwrap_or_else(|e| {
            let mut pending = self.pending.lock().unwrap();
            pending.waiters.remove(&id);
            match e {
                RecvTimeoutError::Timeout => Err(CallError::Timeout),
                RecvTimeoutError::Disconnected => Err(CallError::Closed(
                    pending.closed.clone().unwrap_or_default(),
                )),
            }
        })
    }

    /// Sends a notification, e.g. `session/cancel`.
    pub fn notify(&self, method: &str, params: Value) -> io::Result<()> {
        let msg = json!({ "jsonrpc": "2.0", "method": method, "params": params });
        write_line(&self.writer, &msg)
    }

    /// Whether the agent's stdout has ended.
    pub fn is_closed(&self) -> bool {
        self.pending.lock().unwrap().closed.is_some()
    }
}

fn write_line(writer: &Writer, msg: &Value) -> io::Result<()> {
    let mut line = serde_json::to_vec(msg).map_err(io::Error::other)?;
    line.push(b'\n');
    let mut w = writer.lock().unwrap();
    w.write_all(&line)?;
    w.flush()
}

fn read_loop(stdout: impl Read, pending: Arc<Mutex<Pending>>, out: Responder, mut h: Handler) {
    let mut reader = BufReader::new(stdout);
    let mut line = Vec::new();
    let reason = loop {
        line.clear();
        match reader.read_until(b'\n', &mut line) {
            Ok(0) => break "stdout closed".to_string(),
            Ok(_) => {}
            Err(e) => break format!("read failed: {e}"),
        }
        // Agents log to stderr; skip anything on stdout that is not JSON.
        if let Ok(Value::Object(msg)) = serde_json::from_slice::<Value>(&line) {
            dispatch(msg, &pending, &out, &mut h);
        }
    };
    let waiters: Vec<Waiter> = {
        let mut p = pending.lock().unwrap();
        p.closed = Some(reason.clone());
        p.waiters.drain().map(|(_, w)| w).collect()
    };
    h(
        Incoming::Closed {
            reason: reason.clone(),
        },
        &out,
    );
    for w in waiters {
        let _ = w.send(Err(CallError::Closed(reason.clone())));
    }
}

fn dispatch(
    mut msg: Map<String, Value>,
    pending: &Mutex<Pending>,
    out: &Responder,
    h: &mut Handler,
) {
    let params = msg.remove("params").unwrap_or(Value::Null);
    if let Some(Value::String(method)) = msg.remove("method") {
        match msg.remove("id") {
            Some(id) if !id.is_null() => h(Incoming::Request { id, method, params }, out),
            _ => h(Incoming::Notification { method, params }, out),
        }
        return;
    }
    // A response; our ids are integers. A late or unknown id is dropped.
    let id = msg.get("id").and_then(Value::as_u64);
    let Some(waiter) = id.and_then(|id| pending.lock().unwrap().waiters.remove(&id)) else {
        return;
    };
    let result = match msg.remove("error") {
        Some(err) => Err(CallError::Rpc(RpcError {
            code: err.get("code").and_then(Value::as_i64).unwrap_or(0),
            message: err["message"].as_str().unwrap_or_default().to_string(),
        })),
        None => Ok(msg.remove("result").unwrap_or(Value::Null)),
    };
    let _ = waiter.send(result);
}
