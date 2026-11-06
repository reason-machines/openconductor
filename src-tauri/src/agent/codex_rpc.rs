//! The JSON-RPC lines exchanged with `codex app-server --listen stdio://`.
//!
//! One JSON object per line, JSON-RPC 2.0 without the `"jsonrpc"` field.
//! The app opens with `initialize` and the `initialized` notification, then
//! `thread/start` (or `thread/resume`) and one `turn/start` per user turn;
//! `turn/interrupt` stops a turn. This module builds what the app sends;
//! [`super::codex_events`] parses what the server sends back, including its
//! approval requests. Method and field names are from
//! the app-server schema of Codex 0.156.1 (the version the reference app
//! downloads) and 0.166.0, and a live 0.166.0 session; see
//! `evidence/providers/codex-app-server.md`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::codex_cli::CodexPolicy;

/// A request id. Ours are integers; the server's may be either.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RequestId {
    Int(i64),
    Str(String),
}

/// Settings for `thread/start` and `thread/resume`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ThreadOptions {
    pub cwd: Option<PathBuf>,
    pub model: Option<String>,
    pub policy: CodexPolicy,
    /// Extra instructions for the thread (`developerInstructions`).
    pub developer_instructions: Option<String>,
}

/// A request from the app to the server.
#[derive(Debug, Clone, PartialEq)]
pub enum ClientRequest {
    Initialize {
        name: String,
        title: Option<String>,
        version: String,
    },
    ThreadStart(ThreadOptions),
    ThreadResume {
        thread_id: String,
        options: ThreadOptions,
    },
    TurnStart {
        thread_id: String,
        text: String,
        model: Option<String>,
        /// Reasoning effort the model advertises (e.g. `low`, `high`).
        effort: Option<String>,
    },
    TurnInterrupt {
        thread_id: String,
        turn_id: String,
    },
}

/// The answer to an approval request. Decline lets the turn continue;
/// cancel also interrupts it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalDecision {
    Accept,
    /// Accept, and stop asking about the same thing in this session.
    AcceptForSession,
    Decline,
    Cancel,
}

fn put(params: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        params.insert(key.to_owned(), value);
    }
}

impl ThreadOptions {
    fn params(&self) -> Map<String, Value> {
        let mut p = Map::new();
        put(
            &mut p,
            "cwd",
            self.cwd.as_ref().map(|c| json!(c.display().to_string())),
        );
        put(&mut p, "model", self.model.as_ref().map(|m| json!(m)));
        put(
            &mut p,
            "approvalPolicy",
            self.policy.approval_policy.map(|a| json!(a)),
        );
        put(&mut p, "sandbox", self.policy.sandbox.map(|s| json!(s)));
        put(
            &mut p,
            "developerInstructions",
            self.developer_instructions.as_ref().map(|d| json!(d)),
        );
        p
    }
}

impl ClientRequest {
    pub fn method(&self) -> &'static str {
        match self {
            ClientRequest::Initialize { .. } => "initialize",
            ClientRequest::ThreadStart(_) => "thread/start",
            ClientRequest::ThreadResume { .. } => "thread/resume",
            ClientRequest::TurnStart { .. } => "turn/start",
            ClientRequest::TurnInterrupt { .. } => "turn/interrupt",
        }
    }

    pub fn params(&self) -> Value {
        match self {
            ClientRequest::Initialize {
                name,
                title,
                version,
            } => {
                let mut info = Map::new();
                info.insert("name".into(), json!(name));
                put(&mut info, "title", title.as_ref().map(|t| json!(t)));
                info.insert("version".into(), json!(version));
                json!({ "clientInfo": info })
            }
            ClientRequest::ThreadStart(options) => Value::Object(options.params()),
            ClientRequest::ThreadResume { thread_id, options } => {
                let mut p = options.params();
                p.insert("threadId".into(), json!(thread_id));
                Value::Object(p)
            }
            ClientRequest::TurnStart {
                thread_id,
                text,
                model,
                effort,
            } => {
                let mut p = Map::new();
                p.insert("threadId".into(), json!(thread_id));
                let (text, skills) = skill_links(text);
                let mut input = vec![json!({ "type": "text", "text": text })];
                input.extend(
                    skills
                        .into_iter()
                        .map(|(name, path)| json!({ "type": "skill", "name": name, "path": path })),
                );
                p.insert("input".into(), Value::Array(input));
                put(&mut p, "model", model.as_ref().map(|m| json!(m)));
                put(&mut p, "effort", effort.as_ref().map(|e| json!(e)));
                Value::Object(p)
            }
            ClientRequest::TurnInterrupt { thread_id, turn_id } => {
                json!({ "threadId": thread_id, "turnId": turn_id })
            }
        }
    }

    /// The request as one line, newline included.
    pub fn to_line(&self, id: i64) -> String {
        line(json!({ "id": id, "method": self.method(), "params": self.params() }))
    }
}

/// The `initialized` notification, sent once after `initialize` returns.
/// A skill picked in the composer's "/" menu reaches the prompt as
/// `[$name](path/SKILL.md)`. Codex gets `$name` in the text plus a
/// `{type: "skill", name, path}` input item for each, as its own composer
/// sends a picked skill (`UserInput::Skill`, Codex 0.166.0).
pub fn skill_links(text: &str) -> (String, Vec<(String, String)>) {
    let mut out = String::with_capacity(text.len());
    let mut skills: Vec<(String, String)> = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find("[$") {
        out.push_str(&rest[..i]);
        let tail = &rest[i + 2..];
        let link = tail.find("](").and_then(|n| {
            let name = &tail[..n];
            let after = &tail[n + 2..];
            let close = after.find(')')?;
            let path = &after[..close];
            let ok = !name.is_empty()
                && !name.contains(char::is_whitespace)
                && path.ends_with("SKILL.md")
                && !path.contains(char::is_whitespace);
            ok.then(|| (name, path, n + 2 + close + 1))
        });
        match link {
            Some((name, path, len)) => {
                out.push('$');
                out.push_str(name);
                if !skills.iter().any(|(_, p)| p == path) {
                    skills.push((name.to_owned(), path.to_owned()));
                }
                rest = &tail[len..];
            }
            None => {
                out.push_str("[$");
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    (out, skills)
}

pub fn initialized_line() -> String {
    line(json!({ "method": "initialized" }))
}

/// The response to a server approval request.
pub fn approval_line(id: &RequestId, decision: ApprovalDecision) -> String {
    line(json!({ "id": id, "result": { "decision": decision } }))
}

/// A JSON-RPC result for a server request.
pub fn result_line(id: &RequestId, result: Value) -> String {
    line(json!({ "id": id, "result": result }))
}

/// A JSON-RPC error answer to a server request the app does not handle.
pub fn error_line(id: &RequestId, code: i64, message: &str) -> String {
    line(json!({ "id": id, "error": { "code": code, "message": message } }))
}

fn line(v: Value) -> String {
    let mut s = v.to_string();
    s.push('\n');
    s
}

#[cfg(test)]
mod tests {
    use super::super::codex_cli::{ApprovalPolicy, SandboxMode};
    use super::*;

    fn sent(line: &str) -> Value {
        assert!(line.ends_with('\n') && !line[..line.len() - 1].contains('\n'));
        serde_json::from_str(line).unwrap()
    }

    #[test]
    fn handshake_lines_match_the_recorded_session() {
        let init = ClientRequest::Initialize {
            name: "openconductor".into(),
            title: None,
            version: "0.1.0".into(),
        };
        assert_eq!(
            sent(&init.to_line(1)),
            json!({"id": 1, "method": "initialize",
                   "params": {"clientInfo": {"name": "openconductor", "version": "0.1.0"}}})
        );
        assert_eq!(sent(&initialized_line()), json!({"method": "initialized"}));
    }

    #[test]
    fn thread_and_turn_requests_carry_only_what_is_set() {
        let options = ThreadOptions {
            cwd: Some("/work/ws".into()),
            policy: CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::WorkspaceWrite),
            ..ThreadOptions::default()
        };
        assert_eq!(
            sent(&ClientRequest::ThreadStart(options.clone()).to_line(2))["params"],
            json!({"cwd": "/work/ws", "approvalPolicy": "on-request", "sandbox": "workspace-write"})
        );
        // Inherit sends neither field, so Codex uses the user's config.
        let resume = ClientRequest::ThreadResume {
            thread_id: "t1".into(),
            options: ThreadOptions::default(),
        };
        assert_eq!(resume.method(), "thread/resume");
        assert_eq!(resume.params(), json!({"threadId": "t1"}));
        let turn = ClientRequest::TurnStart {
            thread_id: "t1".into(),
            text: "say hi".into(),
            model: None,
            effort: Some("high".into()),
        };
        assert_eq!(
            turn.params(),
            json!({"threadId": "t1", "input": [{"type": "text", "text": "say hi"}], "effort": "high"})
        );
        // A skill picked in the "/" menu: `$name` in the text and a skill item.
        let skill = ClientRequest::TurnStart {
            thread_id: "t1".into(),
            text: "[$deploy](/u/.codex/skills/deploy/SKILL.md) to staging [$x](not-a-skill) [$"
                .into(),
            model: None,
            effort: None,
        };
        assert_eq!(
            skill.params()["input"],
            json!([
                {"type": "text", "text": "$deploy to staging [$x](not-a-skill) [$"},
                {"type": "skill", "name": "deploy", "path": "/u/.codex/skills/deploy/SKILL.md"}
            ])
        );
        let stop = ClientRequest::TurnInterrupt {
            thread_id: "t1".into(),
            turn_id: "u1".into(),
        };
        assert_eq!(stop.method(), "turn/interrupt");
        assert_eq!(stop.params(), json!({"threadId": "t1", "turnId": "u1"}));
    }
}
