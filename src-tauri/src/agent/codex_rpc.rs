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
        input: TurnInput,
        model: Option<String>,
        /// Reasoning effort the model advertises (e.g. `low`, `high`).
        effort: Option<String>,
    },
    TurnInterrupt {
        thread_id: String,
        turn_id: String,
    },
    /// The skills Codex finds for each folder (`skills/list`).
    SkillsList {
        cwds: Vec<String>,
    },
}

/// A skill the user picked, sent with the turn as a `skill` input item
/// (`UserInput { type: "skill", name, path }` in the app-server protocol).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillRef {
    pub name: String,
    pub path: String,
}

/// What a turn sends: the prompt text, then any picked skills.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TurnInput {
    pub text: String,
    pub skills: Vec<SkillRef>,
}

impl TurnInput {
    pub fn new(text: impl Into<String>, skills: Vec<SkillRef>) -> Self {
        Self {
            text: text.into(),
            skills,
        }
    }

    fn items(&self) -> Value {
        let mut items = vec![json!({ "type": "text", "text": self.text })];
        items.extend(
            self.skills
                .iter()
                .map(|s| json!({ "type": "skill", "name": s.name, "path": s.path })),
        );
        Value::Array(items)
    }
}

impl From<&str> for TurnInput {
    fn from(text: &str) -> Self {
        Self::new(text, Vec::new())
    }
}

impl From<String> for TurnInput {
    fn from(text: String) -> Self {
        Self::new(text, Vec::new())
    }
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
            ClientRequest::SkillsList { .. } => "skills/list",
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
                input,
                model,
                effort,
            } => {
                let mut p = Map::new();
                p.insert("threadId".into(), json!(thread_id));
                p.insert("input".into(), input.items());
                put(&mut p, "model", model.as_ref().map(|m| json!(m)));
                put(&mut p, "effort", effort.as_ref().map(|e| json!(e)));
                Value::Object(p)
            }
            ClientRequest::TurnInterrupt { thread_id, turn_id } => {
                json!({ "threadId": thread_id, "turnId": turn_id })
            }
            ClientRequest::SkillsList { cwds } => json!({ "cwds": cwds }),
        }
    }

    /// The request as one line, newline included.
    pub fn to_line(&self, id: i64) -> String {
        line(json!({ "id": id, "method": self.method(), "params": self.params() }))
    }
}

/// The `initialized` notification, sent once after `initialize` returns.
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
    fn picked_skills_follow_the_text_and_skills_list_asks_for_folders() {
        let turn = ClientRequest::TurnStart {
            thread_id: "t1".into(),
            input: TurnInput::new(
                "$oc-fixture hi",
                vec![SkillRef {
                    name: "oc-fixture".into(),
                    path: "/h/.codex/skills/oc-fixture/SKILL.md".into(),
                }],
            ),
            model: None,
            effort: None,
        };
        assert_eq!(
            turn.params(),
            json!({"threadId": "t1", "input": [
                {"type": "text", "text": "$oc-fixture hi"},
                {"type": "skill", "name": "oc-fixture", "path": "/h/.codex/skills/oc-fixture/SKILL.md"}
            ]})
        );
        let list = ClientRequest::SkillsList {
            cwds: vec!["/w".into()],
        };
        assert_eq!(list.method(), "skills/list");
        assert_eq!(list.params(), json!({"cwds": ["/w"]}));
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
            input: "say hi".into(),
            model: None,
            effort: Some("high".into()),
        };
        assert_eq!(
            turn.params(),
            json!({"threadId": "t1", "input": [{"type": "text", "text": "say hi"}], "effort": "high"})
        );
        let stop = ClientRequest::TurnInterrupt {
            thread_id: "t1".into(),
            turn_id: "u1".into(),
        };
        assert_eq!(stop.method(), "turn/interrupt");
        assert_eq!(stop.params(), json!({"threadId": "t1", "turnId": "u1"}));
    }
}
