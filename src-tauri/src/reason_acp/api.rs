//! The public Reason API through the `reason` CLI: `reason [--workspace
//! SLUG] call OPERATION --input-file -`, for Routines (Reason Loops) and the
//! organization pages (the Reason Workspace).
//!
//! The CLI signs the request with its own login or `REASON_API_KEY` and pins
//! the Workspace, so OpenConductor never holds a Reason credential. Input goes
//! on stdin, never in argv. `reason call` prints one envelope (`reason guide`,
//! 0.2.673):
//!
//! ```text
//! {"schema_version":1,"ok":true,"data":…}
//! {"schema_version":1,"ok":false,"error":{"code":"authentication_required","message":"Sign in with reason login …"}}
//! ```
//!
//! and exits non-zero on failure (1 for a refused call, 2 for bad input).
//!
//! Only the operations in [`OPERATIONS`] run: the page can read and change
//! Loops and read the Workspace's members, nothing else the API offers.

use std::io::Write;
use std::path::Path;
use std::process::Stdio;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::cli::LaunchConfig;

/// How long one call may take.
const CALL_TIMEOUT: Duration = Duration::from_secs(30);

/// The operations the app may call, by `reason tools` id.
pub const OPERATIONS: &[&str] = &[
    // Who is signed in (`user_id` decides "Me" and who may change a routine).
    "getSelf",
    // The Reasons a routine can be filed under, and their Loops.
    "listReasons",
    "listReasonLoops",
    "getReasonLoop",
    "createReasonLoop",
    "updateReasonLoop",
    "deleteReasonLoop",
    "runReasonLoop",
    // Authors' names in the routines table.
    "listMembers",
];

/// Why a call failed, as the page shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ApiError {
    /// The API's or the CLI's error code (`authentication_required`,
    /// `loop_not_found`, …), or one of ours: `operation_not_allowed`,
    /// `no_answer`, `bad_output`.
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        ApiError {
            code: code.into(),
            message: message.into(),
        }
    }
}

/// Reads `reason call`'s envelope: its `data`, or its `error`.
pub fn parse_envelope(stdout: &str, stderr: &str) -> Result<Value, ApiError> {
    let v: Value = match serde_json::from_str(stdout.trim()) {
        Ok(v) => v,
        Err(_) => {
            let said = if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                stderr.trim()
            };
            return Err(ApiError::new(
                "bad_output",
                if said.is_empty() {
                    "`reason call` printed nothing".to_string()
                } else {
                    said.chars().take(500).collect()
                },
            ));
        }
    };
    if v["ok"] == true {
        return Ok(v.get("data").cloned().unwrap_or(Value::Null));
    }
    let err = &v["error"];
    let code = err["code"]
        .as_str()
        .or_else(|| err["type"].as_str())
        .or_else(|| err.as_str())
        .unwrap_or("error");
    let message = err["message"]
        .as_str()
        .or_else(|| v["message"].as_str())
        .unwrap_or(code);
    Err(ApiError::new(code, message))
}

impl LaunchConfig {
    /// `reason [--workspace SLUG] call OPERATION --input-file -` with `input`
    /// on stdin. Refuses operations outside [`OPERATIONS`] without running.
    pub fn call(&self, dir: &Path, operation: &str, input: &Value) -> Result<Value, ApiError> {
        if !OPERATIONS.contains(&operation) {
            return Err(ApiError::new(
                "operation_not_allowed",
                format!("OpenConductor does not call {operation}"),
            ));
        }
        let body =
            serde_json::to_vec(input).map_err(|e| ApiError::new("bad_input", e.to_string()))?;
        let mut cmd = self.command_for(dir);
        cmd.args(["call", operation, "--input-file", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let mut run = || -> std::io::Result<std::process::Output> {
                let mut child = cmd.spawn()?;
                if let Some(mut stdin) = child.stdin.take() {
                    stdin.write_all(&body)?;
                }
                child.wait_with_output()
            };
            let _ = tx.send(run());
        });
        let out = match rx.recv_timeout(CALL_TIMEOUT) {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => {
                return Err(ApiError::new(
                    "no_answer",
                    format!("could not run reason: {e}"),
                ))
            }
            Err(_) => {
                return Err(ApiError::new(
                    "no_answer",
                    format!("`reason call {operation}` did not answer within 30 seconds"),
                ))
            }
        };
        parse_envelope(
            &String::from_utf8_lossy(&out.stdout),
            &String::from_utf8_lossy(&out.stderr),
        )
    }
}
