//! What `codex app-server` writes: responses to our requests, its own
//! requests (approvals) and notifications. One JSON object per line, as in
//! [`super::codex_rpc`]. Methods the app does not model yet are kept whole
//! rather than failing the session. Shapes are from the Codex 0.156.1 and
//! 0.166.0 app-server schema and a live session; see
//! `evidence/providers/codex-app-server.md`.

use std::fmt;

use serde_json::Value;

use super::codex_rpc::{ApprovalDecision, RequestId};

/// Where a turn stands.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnStatus {
    InProgress,
    Completed,
    Interrupted,
    Failed,
    /// A status a newer server adds.
    Other(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Turn {
    pub id: String,
    pub status: TurnStatus,
    /// `error.message` of a failed turn.
    pub error: Option<String>,
}

/// A request the server sends the app.
#[derive(Debug, Clone, PartialEq)]
pub enum ServerRequest {
    /// May this shell command run?
    CommandApproval {
        id: RequestId,
        thread_id: String,
        turn_id: String,
        item_id: String,
        command: Option<String>,
        cwd: Option<String>,
        reason: Option<String>,
        /// `availableDecisions` the server offers (the strings we can send;
        /// object-valued choices are skipped). Empty when it lists none.
        decisions: Vec<ApprovalDecision>,
    },
    /// May this patch be applied?
    FileChangeApproval {
        id: RequestId,
        thread_id: String,
        turn_id: String,
        item_id: String,
        reason: Option<String>,
        decisions: Vec<ApprovalDecision>,
    },
    /// Anything else (user input, MCP elicitation, auth refresh, ...).
    Other {
        id: RequestId,
        method: String,
        params: Value,
    },
}

/// A notification from the server.
#[derive(Debug, Clone, PartialEq)]
pub enum Notification {
    TurnStarted {
        thread_id: String,
        turn: Turn,
    },
    TurnCompleted {
        thread_id: String,
        turn: Turn,
    },
    /// A chunk of the assistant's reply text.
    AgentMessageDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ItemStarted {
        thread_id: String,
        turn_id: String,
        item: Value,
    },
    ItemCompleted {
        thread_id: String,
        turn_id: String,
        item: Value,
    },
    /// A turn error; `will_retry` while Codex is still reconnecting.
    Error {
        thread_id: String,
        turn_id: String,
        message: String,
        will_retry: bool,
    },
    /// Any other method, kept whole.
    Other {
        method: String,
        params: Value,
    },
}

/// A line the server wrote.
#[derive(Debug, Clone, PartialEq)]
pub enum ServerMessage {
    /// The result of one of our requests.
    Response {
        id: RequestId,
        result: Value,
    },
    /// One of our requests failed (`id` is absent for unparseable input).
    ErrorResponse {
        id: Option<RequestId>,
        code: i64,
        message: String,
    },
    Request(ServerRequest),
    Notification(Notification),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError(pub String);

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "bad app-server line: {}", self.0)
    }
}

impl std::error::Error for ParseError {}

fn text(v: &Value, key: &str) -> Result<String, ParseError> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| ParseError(format!("missing string {key:?}")))
}

fn opt_text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

impl Turn {
    /// Reads a `Turn` object (`turn/start` results, turn notifications).
    pub fn from_json(v: &Value) -> Result<Self, ParseError> {
        let status = match text(v, "status")?.as_str() {
            "inProgress" => TurnStatus::InProgress,
            "completed" => TurnStatus::Completed,
            "interrupted" => TurnStatus::Interrupted,
            "failed" => TurnStatus::Failed,
            other => TurnStatus::Other(other.to_owned()),
        };
        Ok(Turn {
            id: text(v, "id")?,
            status,
            error: v.get("error").and_then(|e| opt_text(e, "message")),
        })
    }
}

/// `result.thread.id` of a `thread/start` or `thread/resume` response.
pub fn thread_id(result: &Value) -> Option<&str> {
    result.get("thread")?.get("id")?.as_str()
}

impl ServerMessage {
    pub fn parse(line: &str) -> Result<Self, ParseError> {
        let v: Value = serde_json::from_str(line).map_err(|e| ParseError(e.to_string()))?;
        let id = match v.get("id") {
            None | Some(Value::Null) => None,
            Some(id) => Some(
                serde_json::from_value::<RequestId>(id.clone())
                    .map_err(|_| ParseError(format!("bad id {id}")))?,
            ),
        };
        if let Some(method) = v.get("method").and_then(Value::as_str) {
            let params = v.get("params").cloned().unwrap_or(Value::Null);
            return Ok(match id {
                Some(id) => ServerMessage::Request(server_request(id, method, params)?),
                None => ServerMessage::Notification(notification(method, params)?),
            });
        }
        if let Some(err) = v.get("error") {
            return Ok(ServerMessage::ErrorResponse {
                id,
                code: err.get("code").and_then(Value::as_i64).unwrap_or(0),
                message: opt_text(err, "message").unwrap_or_default(),
            });
        }
        match (id, v.get("result")) {
            (Some(id), Some(result)) => Ok(ServerMessage::Response {
                id,
                result: result.clone(),
            }),
            _ => Err(ParseError("neither method, result nor error".into())),
        }
    }
}

/// The string entries of `availableDecisions`. Codex 0.166.0 sends this
/// list (e.g. `["accept", {"acceptWithExecpolicyAmendment": ...}, "cancel"]`)
/// although its generated schema does not declare it.
fn decisions(p: &Value) -> Vec<ApprovalDecision> {
    p.get("availableDecisions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|d| serde_json::from_value(d.clone()).ok())
        .collect()
}

fn server_request(id: RequestId, method: &str, p: Value) -> Result<ServerRequest, ParseError> {
    Ok(match method {
        "item/commandExecution/requestApproval" => ServerRequest::CommandApproval {
            thread_id: text(&p, "threadId")?,
            turn_id: text(&p, "turnId")?,
            item_id: text(&p, "itemId")?,
            command: opt_text(&p, "command"),
            cwd: opt_text(&p, "cwd"),
            reason: opt_text(&p, "reason"),
            decisions: decisions(&p),
            id,
        },
        "item/fileChange/requestApproval" => ServerRequest::FileChangeApproval {
            thread_id: text(&p, "threadId")?,
            turn_id: text(&p, "turnId")?,
            item_id: text(&p, "itemId")?,
            reason: opt_text(&p, "reason"),
            decisions: decisions(&p),
            id,
        },
        _ => ServerRequest::Other {
            id,
            method: method.to_owned(),
            params: p,
        },
    })
}

fn turn_of(p: &Value) -> Result<Turn, ParseError> {
    Turn::from_json(
        p.get("turn")
            .ok_or_else(|| ParseError("missing turn".into()))?,
    )
}

fn notification(method: &str, p: Value) -> Result<Notification, ParseError> {
    Ok(match method {
        "turn/started" => Notification::TurnStarted {
            thread_id: text(&p, "threadId")?,
            turn: turn_of(&p)?,
        },
        "turn/completed" => Notification::TurnCompleted {
            thread_id: text(&p, "threadId")?,
            turn: turn_of(&p)?,
        },
        "item/agentMessage/delta" => Notification::AgentMessageDelta {
            thread_id: text(&p, "threadId")?,
            turn_id: text(&p, "turnId")?,
            item_id: text(&p, "itemId")?,
            delta: text(&p, "delta")?,
        },
        "item/started" | "item/completed" => {
            let (thread_id, turn_id) = (text(&p, "threadId")?, text(&p, "turnId")?);
            let item = p.get("item").cloned().unwrap_or(Value::Null);
            if method == "item/started" {
                Notification::ItemStarted {
                    thread_id,
                    turn_id,
                    item,
                }
            } else {
                Notification::ItemCompleted {
                    thread_id,
                    turn_id,
                    item,
                }
            }
        }
        "error" => Notification::Error {
            thread_id: text(&p, "threadId")?,
            turn_id: text(&p, "turnId")?,
            message: p
                .get("error")
                .and_then(|e| opt_text(e, "message"))
                .unwrap_or_default(),
            will_retry: p.get("willRetry").and_then(Value::as_bool).unwrap_or(false),
        },
        _ => Notification::Other {
            method: method.to_owned(),
            params: p,
        },
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::codex_rpc::{approval_line, ApprovalDecision};
    use super::*;

    fn sent(line: &str) -> Value {
        serde_json::from_str(line).unwrap()
    }

    #[test]
    fn parses_recorded_responses_and_errors() {
        let start =
            r#"{"id":2,"result":{"thread":{"id":"01a1ab8a-57f7","preview":"","ephemeral":false}}}"#;
        let ServerMessage::Response { id, result } = ServerMessage::parse(start).unwrap() else {
            panic!("not a response")
        };
        assert_eq!(id, RequestId::Int(2));
        assert_eq!(thread_id(&result), Some("01a1ab8a-57f7"));

        let turn = r#"{"id":3,"result":{"turn":{"id":"u1","items":[],"itemsView":"notLoaded","status":"inProgress","error":null}}}"#;
        let ServerMessage::Response { result, .. } = ServerMessage::parse(turn).unwrap() else {
            panic!("not a response")
        };
        let turn = Turn::from_json(&result["turn"]).unwrap();
        assert_eq!(
            (turn.id.as_str(), &turn.status, &turn.error),
            ("u1", &TurnStatus::InProgress, &None)
        );

        let stale = r#"{"error":{"code":-32600,"message":"expected active turn id x but found u1"},"id":4}"#;
        assert_eq!(
            ServerMessage::parse(stale).unwrap(),
            ServerMessage::ErrorResponse {
                id: Some(RequestId::Int(4)),
                code: -32600,
                message: "expected active turn id x but found u1".into()
            }
        );
    }

    #[test]
    fn parses_recorded_turn_notifications() {
        let failed = r#"{"method":"turn/completed","params":{"threadId":"t1","turn":{"id":"u1","items":[],"status":"failed","error":{"message":"unexpected status 401 Unauthorized","codexErrorInfo":null}}},"emittedAtMs":1}"#;
        assert_eq!(
            ServerMessage::parse(failed).unwrap(),
            ServerMessage::Notification(Notification::TurnCompleted {
                thread_id: "t1".into(),
                turn: Turn {
                    id: "u1".into(),
                    status: TurnStatus::Failed,
                    error: Some("unexpected status 401 Unauthorized".into())
                }
            })
        );
        let retry = r#"{"method":"error","params":{"error":{"message":"Reconnecting... 2/5"},"threadId":"t1","turnId":"u1","willRetry":true}}"#;
        assert!(matches!(
            ServerMessage::parse(retry).unwrap(),
            ServerMessage::Notification(Notification::Error { will_retry: true, ref message, .. })
                if message == "Reconnecting... 2/5"
        ));
        let delta = r#"{"method":"item/agentMessage/delta","params":{"threadId":"t1","turnId":"u1","itemId":"i1","delta":"Hi"}}"#;
        assert!(matches!(
            ServerMessage::parse(delta).unwrap(),
            ServerMessage::Notification(Notification::AgentMessageDelta { ref delta, .. }) if delta == "Hi"
        ));
        let item = r#"{"method":"item/started","params":{"item":{"type":"userMessage","id":"i0"},"threadId":"t1","turnId":"u1","startedAtMs":1}}"#;
        assert!(matches!(
            ServerMessage::parse(item).unwrap(),
            ServerMessage::Notification(Notification::ItemStarted { ref item, .. }) if item["type"] == "userMessage"
        ));
        // Methods we do not model yet are kept whole.
        let other = r#"{"method":"thread/status/changed","params":{"threadId":"t1","status":{"type":"active"}}}"#;
        assert!(matches!(
            ServerMessage::parse(other).unwrap(),
            ServerMessage::Notification(Notification::Other { ref method, .. }) if method == "thread/status/changed"
        ));
    }

    #[test]
    fn rejects_lines_that_are_not_messages() {
        assert!(ServerMessage::parse("not json").is_err());
        assert!(ServerMessage::parse(r#"{"id":1}"#).is_err());
        assert!(
            ServerMessage::parse(r#"{"method":"turn/completed","params":{"threadId":"t1"}}"#)
                .is_err()
        );
    }

    #[test]
    fn approval_requests_parse_and_replies_use_schema_decisions() {
        let cmd = r#"{"id":"srv-7","method":"item/commandExecution/requestApproval","params":{"threadId":"t1","turnId":"u1","itemId":"i2","startedAtMs":1,"command":"rm -rf build","cwd":"/work/ws","reason":null}}"#;
        let ServerMessage::Request(ServerRequest::CommandApproval {
            id,
            command,
            reason,
            ..
        }) = ServerMessage::parse(cmd).unwrap()
        else {
            panic!("not a command approval")
        };
        assert_eq!(id, RequestId::Str("srv-7".into()));
        assert_eq!((command.as_deref(), reason), (Some("rm -rf build"), None));
        assert_eq!(
            sent(&approval_line(&id, ApprovalDecision::AcceptForSession)),
            json!({"id": "srv-7", "result": {"decision": "acceptForSession"}})
        );
        let live = r#"{"id":0,"method":"item/commandExecution/requestApproval","params":{"kind":"command","threadId":"t1","turnId":"u1","itemId":"exec-1","startedAtMs":1,"command":"/bin/zsh -lc 'cat hello.txt'","cwd":"/ws","availableDecisions":["accept",{"acceptWithExecpolicyAmendment":{"execpolicy_amendment":["cat","hello.txt"]}},"cancel"]}}"#;
        let ServerMessage::Request(ServerRequest::CommandApproval { id, decisions, .. }) =
            ServerMessage::parse(live).unwrap()
        else {
            panic!("not a command approval")
        };
        assert_eq!(id, RequestId::Int(0));
        assert_eq!(
            decisions,
            [ApprovalDecision::Accept, ApprovalDecision::Cancel]
        );
        let patch = r#"{"id":9,"method":"item/fileChange/requestApproval","params":{"threadId":"t1","turnId":"u1","itemId":"i3","startedAtMs":1}}"#;
        let ServerMessage::Request(ServerRequest::FileChangeApproval { id, .. }) =
            ServerMessage::parse(patch).unwrap()
        else {
            panic!("not a file change approval")
        };
        assert_eq!(
            sent(&approval_line(&id, ApprovalDecision::Decline))["result"],
            json!({"decision": "decline"})
        );
        let input = r#"{"id":10,"method":"item/tool/requestUserInput","params":{}}"#;
        assert!(matches!(
            ServerMessage::parse(input).unwrap(),
            ServerMessage::Request(ServerRequest::Other { ref method, .. }) if method == "item/tool/requestUserInput"
        ));
    }
}
