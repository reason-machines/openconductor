//! Asking an agent CLI for its commands and skills over its own JSON-lines
//! protocol, and reading the answers. The parsers are pure; [`converse`]
//! runs one short exchange with a child process and kills it afterwards.
//!
//! * Claude Code: the Agent SDK's `initialize` control request (what
//!   Conductor's `supportedCommands()` reads). The response lists every
//!   command and skill Claude Code offers in that folder: built-ins, user and
//!   project skills, plugin skills, custom commands.
//! * Codex: `codex app-server` `skills/list { cwds: [cwd] }`, the enabled
//!   skills for the folder (Conductor's `getSkills`, `qD5`).
//! * Reason: `reason skills list`, the Workspace's skills.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::sidecar_stores::completions::{SlashCommand, Skill};

/// The `initialize` control request, as the Agent SDK writes it.
pub fn claude_initialize_line() -> String {
    format!("{}\n", json!({ "type": "control_request", "request_id": "oc-commands", "request": { "subtype": "initialize" } }))
}

/// The commands in Claude Code's `initialize` control response, or `None`
/// for any other line.
pub fn claude_commands(line: &Value) -> Option<Result<Vec<SlashCommand>, String>> {
    if line.get("type")?.as_str()? != "control_response" {
        return None;
    }
    let response = line.get("response")?;
    if response.get("request_id").and_then(Value::as_str) != Some("oc-commands") {
        return None;
    }
    if response.get("subtype").and_then(Value::as_str) != Some("success") {
        let error = response.get("error").and_then(Value::as_str).unwrap_or("initialize failed");
        return Some(Err(error.to_owned()));
    }
    let commands = response.pointer("/response/commands").and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default();
    Some(Ok(commands.iter().filter_map(command_of).collect()))
}

fn command_of(v: &Value) -> Option<SlashCommand> {
    let name = v.get("name")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    // A string in Claude Code 2.x; older builds sent a list of words.
    let argument_hint = match v.get("argumentHint").or_else(|| v.get("argument_hint")) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "),
        _ => String::new(),
    };
    Some(SlashCommand { name: name.to_owned(), description: v.get("description").and_then(Value::as_str).unwrap_or_default().to_owned(), argument_hint })
}

/// Codex app-server requests: `initialize`, `initialized`, `skills/list`.
pub fn codex_lines(cwd: &str) -> [String; 3] {
    [
        format!("{}\n", json!({ "id": 1, "method": "initialize", "params": { "clientInfo": { "name": "openconductor", "title": "OpenConductor", "version": env!("CARGO_PKG_VERSION") } } })),
        format!("{}\n", json!({ "method": "initialized" })),
        format!("{}\n", json!({ "id": 2, "method": "skills/list", "params": { "cwds": [cwd] } })),
    ]
}

/// The enabled skills `skills/list` returned for `cwd` (Conductor's `qD5`).
/// Codex reports the folder it resolved; when that differs from `cwd` only
/// by a symlink, the only entry is taken.
pub fn codex_skills(line: &Value, cwd: &str) -> Option<Result<Vec<Skill>, String>> {
    if line.get("id").and_then(Value::as_i64) != Some(2) {
        return None;
    }
    if let Some(e) = line.get("error") {
        return Some(Err(e.get("message").and_then(Value::as_str).unwrap_or("skills/list failed").to_owned()));
    }
    let data = line.pointer("/result/data").and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default();
    let entry = data.iter().find(|d| d.get("cwd").and_then(Value::as_str) == Some(cwd)).or(if data.len() == 1 { data.first() } else { None });
    let skills = entry.and_then(|e| e.get("skills")).and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default();
    Some(Ok(skills
        .iter()
        .filter(|s| s.get("enabled").and_then(Value::as_bool).unwrap_or(true))
        .filter_map(|s| {
            Some(Skill {
                name: s.get("name")?.as_str()?.to_owned(),
                description: s.get("description").and_then(Value::as_str).unwrap_or_default().to_owned(),
                path: s.get("path")?.as_str()?.to_owned(),
                display_name: s.pointer("/interface/displayName").and_then(Value::as_str).map(str::to_owned),
            })
        })
        .collect()))
}

/// The prefix of a Reason skill's `path`: Reason skills live in the
/// Workspace, not on disk, so the path names the skill id.
pub const REASON_SKILL_PATH: &str = "reason-skill:";

/// The enabled skills in `reason skills list` output.
pub fn reason_skills(out: &Value) -> Result<Vec<Skill>, String> {
    if out.get("ok").and_then(Value::as_bool) == Some(false) {
        let msg = out.pointer("/error/message").or_else(|| out.get("error")).and_then(Value::as_str).unwrap_or("reason skills list failed");
        return Err(msg.to_owned());
    }
    let items = out.pointer("/data/items").and_then(Value::as_array).ok_or("reason skills list returned no items")?;
    Ok(items
        .iter()
        .filter(|s| s.get("is_enabled").and_then(Value::as_bool).unwrap_or(true))
        .filter_map(|s| {
            Some(Skill {
                name: s.get("name")?.as_str()?.to_owned(),
                description: s.get("description").and_then(Value::as_str).unwrap_or_default().to_owned(),
                path: format!("{REASON_SKILL_PATH}{}", s.get("skill_id").and_then(Value::as_str).unwrap_or_default()),
                display_name: None,
            })
        })
        .collect())
}

/// Writes `input` to the child's stdin, then reads stdout lines until
/// `answer` returns `Some` or `timeout` passes. `on_line` may write more
/// requests (it gets each parsed line and the stdin to answer on). The child
/// is killed when this returns.
pub fn converse<T>(
    mut cmd: Command,
    input: &[String],
    timeout: Duration,
    mut on_line: impl FnMut(&Value, &mut dyn Write),
    answer: impl Fn(&Value) -> Option<Result<T, String>>,
) -> Result<T, String> {
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("could not start {:?}: {e}", cmd.get_program()))?;
    let result = (|| {
        let mut stdin = child.stdin.take().ok_or("no stdin")?;
        for line in input {
            stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        }
        stdin.flush().map_err(|e| e.to_string())?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let (tx, rx) = mpsc::channel::<Value>();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if let Ok(v) = serde_json::from_str::<Value>(&line) {
                    if tx.send(v).is_err() {
                        break;
                    }
                }
            }
        });
        let end = Instant::now() + timeout;
        loop {
            let left = end.saturating_duration_since(Instant::now());
            match rx.recv_timeout(left) {
                Ok(v) => {
                    if let Some(r) = answer(&v) {
                        return r;
                    }
                    on_line(&v, &mut stdin);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => return Err(format!("no answer within {} s", timeout.as_secs())),
                Err(mpsc::RecvTimeoutError::Disconnected) => return Err("the agent exited without answering".into()),
            }
        }
    })();
    kill(&mut child);
    result
}

/// Runs a command with `input` on stdin and returns its stdout as JSON.
pub fn run_json(mut cmd: Command, input: &str, timeout: Duration) -> Result<Value, String> {
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("could not start {:?}: {e}", cmd.get_program()))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut s = String::new();
        let _ = std::io::Read::read_to_string(&mut BufReader::new(stdout), &mut s);
        let _ = tx.send(s);
    });
    let out = rx.recv_timeout(timeout);
    kill(&mut child);
    let out = out.map_err(|_| format!("no answer within {} s", timeout.as_secs()))?;
    serde_json::from_str(out.trim()).map_err(|e| format!("unreadable output: {e}"))
}

fn kill(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}
