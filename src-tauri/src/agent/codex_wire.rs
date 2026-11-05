//! What a Codex chat window receives: the app-server messages parsed in
//! [`super::codex_events`], reduced to the few [`Payload`]s the chat
//! renders (reply text, reasoning, tool rows, approval prompts, notices).
//!
//! The runner ([`super::codex_runner`]) adds the payloads only it knows:
//! [`Payload::ThreadStarted`] and [`Payload::TurnEnded`], one per prompt.
//! Item shapes are from the Codex 0.166.0 app-server schema and live turns
//! recorded on macOS; see `evidence/providers/codex-app-server.md`.

use serde::Serialize;
use serde_json::{json, Value};

use super::codex_events::{Notification, ServerMessage, ServerRequest, TurnStatus};
use super::codex_rpc::{ApprovalDecision, RequestId};

/// One step of a tool row's life.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolStatus {
    Running,
    Completed,
    Failed,
    /// The user (or policy) declined it.
    Declined,
}

/// A tool row: a command, a patch, an MCP call, a web search, ...
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub id: String,
    /// The Codex item type (`commandExecution`, `fileChange`, ...).
    pub kind: String,
    pub title: String,
    pub status: ToolStatus,
    /// What the row was asked to do (command and cwd, changed paths, ...).
    pub input: Value,
    pub output: Option<String>,
    pub exit_code: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalKind {
    Command,
    FileChange,
}

/// Codex asks before running a command or applying a patch.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Approval {
    pub request_id: RequestId,
    pub kind: ApprovalKind,
    /// The tool row this approval is for.
    pub item_id: String,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub reason: Option<String>,
    /// The answers to offer, in the server's order.
    pub decisions: Vec<ApprovalDecision>,
}

/// How a prompt ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnEnd {
    pub outcome: Outcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl TurnEnd {
    pub fn completed() -> Self {
        TurnEnd {
            outcome: Outcome::Completed,
            message: None,
        }
    }

    pub fn cancelled() -> Self {
        TurnEnd {
            outcome: Outcome::Cancelled,
            message: None,
        }
    }

    pub fn failed(message: impl Into<String>) -> Self {
        TurnEnd {
            outcome: Outcome::Failed,
            message: Some(message.into()),
        }
    }

    /// The end of a turn Codex reported with `turn/completed`.
    pub fn from_status(status: &TurnStatus, error: Option<&str>) -> Self {
        match status {
            TurnStatus::Completed => TurnEnd::completed(),
            TurnStatus::Interrupted => TurnEnd::cancelled(),
            TurnStatus::Failed => TurnEnd::failed(error.unwrap_or("Codex reported an error.")),
            TurnStatus::InProgress | TurnStatus::Other(_) => match error {
                Some(e) => TurnEnd::failed(e),
                None => TurnEnd::completed(),
            },
        }
    }
}

/// What the chat window receives, as `{"type": ..., ...}` with camelCase
/// fields.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Payload {
    /// The thread this chat runs on; save it to resume after a restart.
    ThreadStarted {
        thread_id: String,
        resumed: bool,
    },
    TurnStarted {
        turn_id: String,
    },
    /// A chunk of the reply message `item_id`.
    Text {
        item_id: String,
        delta: String,
    },
    /// The whole reply message `item_id` (replaces its chunks).
    /// `phase` is Codex's `commentary` or `final_answer`.
    Message {
        item_id: String,
        text: String,
        phase: Option<String>,
    },
    /// A chunk of the reasoning summary `item_id`.
    Thought {
        item_id: String,
        delta: String,
    },
    /// The whole reasoning summary `item_id` (replaces its chunks).
    ThoughtDone {
        item_id: String,
        text: String,
    },
    Tool(Tool),
    /// Live output of a running command.
    ToolOutput {
        id: String,
        delta: String,
    },
    Approval(Approval),
    /// The approval is answered (here or by Codex itself).
    ApprovalResolved {
        request_id: RequestId,
    },
    /// Something to show in the chat that is not reply text: a retry, a
    /// warning, a request the app declined.
    Notice {
        message: String,
        will_retry: bool,
    },
    /// The prompt is over. Exactly one per prompt.
    TurnEnded {
        #[serde(flatten)]
        end: TurnEnd,
    },
}

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn status_of(item: &Value, started: bool) -> ToolStatus {
    match item.get("status").and_then(Value::as_str) {
        Some("failed") => ToolStatus::Failed,
        Some("declined") => ToolStatus::Declined,
        Some("completed") => ToolStatus::Completed,
        Some(_) => ToolStatus::Running,
        None if started => ToolStatus::Running,
        None => ToolStatus::Completed,
    }
}

/// The command Codex shows, without the login-shell wrapper it runs it in
/// (`/bin/zsh -lc '<cmd>'`): one parsed action carries the bare command.
fn command_title(item: &Value) -> String {
    let actions = item.get("commandActions").and_then(Value::as_array);
    if let Some([only]) = actions.map(Vec::as_slice) {
        if let Some(cmd) = text(only, "command") {
            return cmd;
        }
    }
    text(item, "command").unwrap_or_default()
}

fn joined(item: &Value, key: &str) -> String {
    item.get(key)
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default()
}

/// A tool row for `item`, or `None` for items that are not tools.
fn tool(item: &Value, started: bool) -> Option<Tool> {
    let kind = text(item, "type")?;
    let id = text(item, "id")?;
    let status = status_of(item, started);
    let (title, input, output, exit_code) = match kind.as_str() {
        "userMessage" | "hookPrompt" | "agentMessage" | "reasoning" | "contextCompaction" => {
            return None
        }
        "commandExecution" => (
            command_title(item),
            json!({ "command": item.get("command"), "cwd": item.get("cwd") }),
            text(item, "aggregatedOutput"),
            item.get("exitCode").and_then(Value::as_i64),
        ),
        "fileChange" => {
            let changes = item.get("changes").and_then(Value::as_array);
            let paths: Vec<String> = changes
                .into_iter()
                .flatten()
                .filter_map(|c| text(c, "path"))
                .collect();
            let diff: Vec<String> = changes
                .into_iter()
                .flatten()
                .filter_map(|c| text(c, "diff"))
                .collect();
            let kinds: Vec<Value> = changes
                .into_iter()
                .flatten()
                .map(|c| json!({ "path": c.get("path"), "kind": c.pointer("/kind/type") }))
                .collect();
            (
                format!("Edit {}", paths.join(", ")),
                json!({ "changes": kinds }),
                (!diff.is_empty()).then(|| diff.join("\n")),
                None,
            )
        }
        "mcpToolCall" => (
            format!(
                "{}.{}",
                text(item, "server").unwrap_or_default(),
                text(item, "tool").unwrap_or_default()
            ),
            item.get("arguments").cloned().unwrap_or(Value::Null),
            item.pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| {
                    item.get("result")
                        .filter(|r| !r.is_null())
                        .map(Value::to_string)
                }),
            None,
        ),
        "dynamicToolCall" => (
            text(item, "tool").unwrap_or_else(|| kind.clone()),
            item.get("arguments").cloned().unwrap_or(Value::Null),
            item.get("contentItems")
                .filter(|r| !r.is_null())
                .map(Value::to_string),
            None,
        ),
        "webSearch" => (
            format!(
                "Search the web: {}",
                text(item, "query").unwrap_or_default()
            ),
            json!({ "query": item.get("query") }),
            None,
            None,
        ),
        "plan" => ("Plan".to_owned(), Value::Null, text(item, "text"), None),
        _ => (kind.clone(), item.clone(), None, None),
    };
    Some(Tool {
        id,
        kind,
        title,
        status,
        input,
        output,
        exit_code,
    })
}

fn item_payloads(item: &Value, started: bool) -> Vec<Payload> {
    let kind = item.get("type").and_then(Value::as_str);
    let id = text(item, "id").unwrap_or_default();
    match kind {
        Some("agentMessage") if !started => vec![Payload::Message {
            item_id: id,
            text: text(item, "text").unwrap_or_default(),
            phase: text(item, "phase"),
        }],
        Some("reasoning") if !started => {
            let summary = joined(item, "summary");
            if summary.is_empty() {
                vec![]
            } else {
                vec![Payload::ThoughtDone {
                    item_id: id,
                    text: summary,
                }]
            }
        }
        _ => tool(item, started).map(Payload::Tool).into_iter().collect(),
    }
}

/// The payloads for one server message. Responses, `turn/completed` and
/// requests the app does not handle give none: the runner deals with them.
pub fn payloads(message: &ServerMessage) -> Vec<Payload> {
    match message {
        ServerMessage::Response { .. } | ServerMessage::ErrorResponse { .. } => vec![],
        ServerMessage::Request(ServerRequest::CommandApproval {
            id,
            item_id,
            command,
            cwd,
            reason,
            decisions,
            ..
        }) => vec![Payload::Approval(Approval {
            request_id: id.clone(),
            kind: ApprovalKind::Command,
            item_id: item_id.clone(),
            command: command.clone(),
            cwd: cwd.clone(),
            reason: reason.clone(),
            decisions: offered(decisions),
        })],
        ServerMessage::Request(ServerRequest::FileChangeApproval {
            id,
            item_id,
            reason,
            decisions,
            ..
        }) => vec![Payload::Approval(Approval {
            request_id: id.clone(),
            kind: ApprovalKind::FileChange,
            item_id: item_id.clone(),
            command: None,
            cwd: None,
            reason: reason.clone(),
            decisions: offered(decisions),
        })],
        ServerMessage::Request(ServerRequest::Other { .. }) => vec![],
        ServerMessage::Notification(n) => notification_payloads(n),
    }
}

/// Without a list from the server, offer every answer the schema allows.
fn offered(decisions: &[ApprovalDecision]) -> Vec<ApprovalDecision> {
    if decisions.is_empty() {
        vec![
            ApprovalDecision::Accept,
            ApprovalDecision::AcceptForSession,
            ApprovalDecision::Decline,
            ApprovalDecision::Cancel,
        ]
    } else {
        decisions.to_vec()
    }
}

fn notification_payloads(n: &Notification) -> Vec<Payload> {
    match n {
        Notification::TurnStarted { turn, .. } => vec![Payload::TurnStarted {
            turn_id: turn.id.clone(),
        }],
        Notification::TurnCompleted { .. } => vec![],
        Notification::AgentMessageDelta { item_id, delta, .. } => vec![Payload::Text {
            item_id: item_id.clone(),
            delta: delta.clone(),
        }],
        Notification::ItemStarted { item, .. } => item_payloads(item, true),
        Notification::ItemCompleted { item, .. } => item_payloads(item, false),
        Notification::Error {
            message,
            will_retry,
            ..
        } => vec![Payload::Notice {
            message: message.clone(),
            will_retry: *will_retry,
        }],
        Notification::Other { method, params } => match method.as_str() {
            "item/reasoning/summaryTextDelta" => {
                match (text(params, "itemId"), text(params, "delta")) {
                    (Some(item_id), Some(delta)) => vec![Payload::Thought { item_id, delta }],
                    _ => vec![],
                }
            }
            "item/commandExecution/outputDelta" => {
                match (text(params, "itemId"), text(params, "delta")) {
                    (Some(id), Some(delta)) => vec![Payload::ToolOutput { id, delta }],
                    _ => vec![],
                }
            }
            "serverRequest/resolved" => params
                .get("requestId")
                .and_then(|id| serde_json::from_value(id.clone()).ok())
                .map(|request_id| Payload::ApprovalResolved { request_id })
                .into_iter()
                .collect(),
            "warning" | "configWarning" | "deprecationNotice" => text(params, "message")
                .or_else(|| text(params, "summary"))
                .map(|message| Payload::Notice {
                    message,
                    will_retry: false,
                })
                .into_iter()
                .collect(),
            _ => vec![],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(line: &str) -> Vec<Payload> {
        payloads(&ServerMessage::parse(line).unwrap())
    }

    fn only(mut v: Vec<Payload>) -> Payload {
        assert_eq!(v.len(), 1, "{v:?}");
        v.remove(0)
    }

    fn json_of(p: &Payload) -> Value {
        serde_json::to_value(p).unwrap()
    }

    // Lines below are from a live turn with Codex 0.166.0 on macOS
    // (ids and timestamps shortened).

    #[test]
    fn reply_text_streams_then_settles_with_its_phase() {
        let delta = r#"{"method":"item/agentMessage/delta","params":{"threadId":"t1","turnId":"u1","itemId":"msg_1","delta":"hello"}}"#;
        assert_eq!(
            json_of(&one(delta)[0]),
            json!({"type": "text", "itemId": "msg_1", "delta": "hello"})
        );
        let done = r#"{"method":"item/completed","params":{"item":{"type":"agentMessage","id":"msg_1","text":"hello from codex","phase":"final_answer","memoryCitation":null,"delivery":null,"questions":null},"threadId":"t1","turnId":"u1","completedAtMs":2}}"#;
        assert_eq!(
            json_of(&one(done)[0]),
            json!({"type": "message", "itemId": "msg_1", "text": "hello from codex", "phase": "final_answer"})
        );
        // The started item carries no text yet.
        let started = r#"{"method":"item/started","params":{"item":{"type":"agentMessage","id":"msg_1","text":""},"threadId":"t1","turnId":"u1","startedAtMs":1}}"#;
        assert!(one(started).is_empty());
    }

    #[test]
    fn command_rows_drop_the_shell_wrapper_and_carry_output() {
        let started = r#"{"method":"item/started","params":{"item":{"type":"commandExecution","id":"exec-1","command":"/bin/zsh -lc 'cat hello.txt'","cwd":"/ws","processId":null,"source":"unifiedExecStartup","status":"inProgress","commandActions":[{"type":"read","command":"cat hello.txt","name":"hello.txt","path":"/ws/hello.txt"}],"aggregatedOutput":null,"exitCode":null,"durationMs":null},"threadId":"t1","turnId":"u1","startedAtMs":1}}"#;
        let Payload::Tool(t) = only(one(started)) else {
            panic!("one tool row")
        };
        assert_eq!(
            (t.title.as_str(), t.status, t.kind.as_str()),
            ("cat hello.txt", ToolStatus::Running, "commandExecution")
        );
        let done = r#"{"method":"item/completed","params":{"item":{"type":"commandExecution","id":"exec-1","command":"/bin/zsh -lc 'cat hello.txt'","cwd":"/ws","processId":"27422","source":"unifiedExecStartup","status":"completed","commandActions":[{"type":"read","command":"cat hello.txt","name":"hello.txt","path":"/ws/hello.txt"}],"aggregatedOutput":"hello from codex\n","exitCode":0,"durationMs":0},"threadId":"t1","turnId":"u1","completedAtMs":2}}"#;
        assert_eq!(
            json_of(&one(done)[0]),
            json!({
                "type": "tool", "id": "exec-1", "kind": "commandExecution",
                "title": "cat hello.txt", "status": "completed",
                "input": {"command": "/bin/zsh -lc 'cat hello.txt'", "cwd": "/ws"},
                "output": "hello from codex\n", "exitCode": 0
            })
        );
        let declined = r#"{"method":"item/completed","params":{"item":{"type":"commandExecution","id":"exec-2","command":"rm -rf /","cwd":"/ws","status":"declined","commandActions":[]},"threadId":"t1","turnId":"u1"}}"#;
        let Payload::Tool(t) = only(one(declined)) else {
            panic!("one tool row")
        };
        assert_eq!(
            (t.title.as_str(), t.status),
            ("rm -rf /", ToolStatus::Declined)
        );
    }

    #[test]
    fn approval_requests_offer_the_servers_decisions() {
        let live = r#"{"id":1,"method":"item/commandExecution/requestApproval","params":{"kind":"command","threadId":"t1","turnId":"u1","itemId":"exec-6","startedAtMs":1,"environmentId":"local","command":"/bin/zsh -lc \"printf '%s\\n' 'hello from codex' > hello.txt\"","cwd":"/ws","commandActions":[{"type":"unknown","command":"printf '%s\\n' 'hello from codex' > hello.txt"}],"availableDecisions":["accept",{"acceptWithExecpolicyAmendment":{"execpolicy_amendment":["/bin/zsh"]}},"cancel"]}}"#;
        assert_eq!(
            json_of(&one(live)[0]),
            json!({
                "type": "approval", "requestId": 1, "kind": "command", "itemId": "exec-6",
                "command": "/bin/zsh -lc \"printf '%s\\n' 'hello from codex' > hello.txt\"",
                "cwd": "/ws", "reason": null, "decisions": ["accept", "cancel"]
            })
        );
        let patch = r#"{"id":"p1","method":"item/fileChange/requestApproval","params":{"threadId":"t1","turnId":"u1","itemId":"fc-1","startedAtMs":1}}"#;
        let Payload::Approval(a) = only(one(patch)) else {
            panic!("one approval")
        };
        assert_eq!(a.kind, ApprovalKind::FileChange);
        assert_eq!(a.decisions.len(), 4, "no list: every schema decision");
        let resolved =
            r#"{"method":"serverRequest/resolved","params":{"threadId":"t1","requestId":1}}"#;
        assert_eq!(
            one(resolved),
            [Payload::ApprovalResolved {
                request_id: RequestId::Int(1)
            }]
        );
    }

    #[test]
    fn file_changes_reasoning_and_notices() {
        let patch = r#"{"method":"item/completed","params":{"item":{"type":"fileChange","id":"fc-1","status":"completed","changes":[{"path":"/ws/a.txt","kind":{"type":"add"},"diff":"+a\n"},{"path":"/ws/b.txt","kind":{"type":"update","move_path":null},"diff":"-b\n+c\n"}]},"threadId":"t1","turnId":"u1"}}"#;
        let Payload::Tool(t) = only(one(patch)) else {
            panic!("one tool row")
        };
        assert_eq!(t.title, "Edit /ws/a.txt, /ws/b.txt");
        assert_eq!(t.output.as_deref(), Some("+a\n\n-b\n+c\n"));
        assert_eq!(
            t.input,
            json!({"changes": [{"path": "/ws/a.txt", "kind": "add"}, {"path": "/ws/b.txt", "kind": "update"}]})
        );

        let delta = r#"{"method":"item/reasoning/summaryTextDelta","params":{"threadId":"t1","turnId":"u1","itemId":"rs_1","delta":"Thinking","summaryIndex":0}}"#;
        assert_eq!(
            one(delta),
            [Payload::Thought {
                item_id: "rs_1".into(),
                delta: "Thinking".into()
            }]
        );
        let reasoning = r#"{"method":"item/completed","params":{"item":{"type":"reasoning","id":"rs_1","summary":["One","Two"],"content":[]},"threadId":"t1","turnId":"u1"}}"#;
        assert_eq!(
            one(reasoning),
            [Payload::ThoughtDone {
                item_id: "rs_1".into(),
                text: "One\n\nTwo".into()
            }]
        );
        let empty = r#"{"method":"item/completed","params":{"item":{"type":"reasoning","id":"rs_2","summary":[],"content":[]},"threadId":"t1","turnId":"u1"}}"#;
        assert!(one(empty).is_empty());

        let retry = r#"{"method":"error","params":{"error":{"message":"Reconnecting... 2/5"},"threadId":"t1","turnId":"u1","willRetry":true}}"#;
        assert_eq!(
            json_of(&one(retry)[0]),
            json!({"type": "notice", "message": "Reconnecting... 2/5", "willRetry": true})
        );
        let user = r#"{"method":"item/started","params":{"item":{"type":"userMessage","id":"i0","content":[]},"threadId":"t1","turnId":"u1"}}"#;
        assert!(one(user).is_empty());
        let started = r#"{"method":"turn/started","params":{"threadId":"t1","turn":{"id":"u1","items":[],"status":"inProgress"}}}"#;
        assert_eq!(
            one(started),
            [Payload::TurnStarted {
                turn_id: "u1".into()
            }]
        );
        let completed = r#"{"method":"turn/completed","params":{"threadId":"t1","turn":{"id":"u1","items":[],"status":"completed"}}}"#;
        assert!(one(completed).is_empty(), "the runner ends turns");
    }

    #[test]
    fn turn_end_serializes_flat() {
        let p = Payload::TurnEnded {
            end: TurnEnd::from_status(&TurnStatus::Failed, Some("401 Unauthorized")),
        };
        assert_eq!(
            json_of(&p),
            json!({"type": "turnEnded", "outcome": "failed", "message": "401 Unauthorized"})
        );
        assert_eq!(
            json_of(&Payload::TurnEnded {
                end: TurnEnd::from_status(&TurnStatus::Interrupted, None)
            }),
            json!({"type": "turnEnded", "outcome": "cancelled"})
        );
        assert_eq!(
            json_of(&Payload::ThreadStarted {
                thread_id: "t1".into(),
                resumed: false
            }),
            json!({"type": "threadStarted", "threadId": "t1", "resumed": false})
        );
    }
}
