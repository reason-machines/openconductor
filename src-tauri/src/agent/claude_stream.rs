//! The stream-json protocol spoken with a `claude` process launched by
//! [`super::claude_cli::ClaudeLaunch`]: one JSON object per line each way.
//!
//! The app writes [`ClientMessage`]s (user turns, control requests such as
//! interrupt, and answers to permission prompts) and reads [`ClaudeEvent`]s
//! (session init, assistant and tool-result messages, the turn result, and
//! `can_use_tool` permission prompts). Unknown event types parse as
//! [`ClaudeEvent::Unknown`] so a newer CLI never breaks a session.

use std::fmt;

use serde_json::{json, Value};

use super::claude_cli::PermissionMode;

/// A line the app writes to the CLI's stdin.
#[derive(Debug, Clone, PartialEq)]
pub enum ClientMessage {
    /// A user turn.
    User { text: String },
    /// A control request; the CLI answers with a matching
    /// [`ClaudeEvent::ControlResponse`].
    Control {
        request_id: String,
        request: ControlRequest,
    },
    /// The answer to a [`ClaudeEvent::PermissionPrompt`].
    PermissionReply {
        request_id: String,
        decision: PermissionDecision,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum ControlRequest {
    Initialize,
    /// Stop the running turn.
    Interrupt,
    SetPermissionMode(PermissionMode),
    /// `None` returns to the CLI's default model.
    SetModel(Option<String>),
}

/// How the app answers a tool permission prompt.
#[derive(Debug, Clone, PartialEq)]
pub enum PermissionDecision {
    /// Run the tool with this input (the prompt's input, possibly edited).
    Allow { input: Value },
    /// Refuse; `interrupt` also stops the turn.
    Deny { message: String, interrupt: bool },
}

impl ClientMessage {
    pub fn to_json(&self) -> Value {
        match self {
            ClientMessage::User { text } => json!({
                "type": "user",
                "message": {"role": "user", "content": [{"type": "text", "text": text}]},
                "parent_tool_use_id": null,
            }),
            ClientMessage::Control {
                request_id,
                request,
            } => {
                let body = match request {
                    ControlRequest::Initialize => json!({"subtype": "initialize"}),
                    ControlRequest::Interrupt => json!({"subtype": "interrupt"}),
                    ControlRequest::SetPermissionMode(mode) => {
                        json!({"subtype": "set_permission_mode", "mode": mode.as_str()})
                    }
                    ControlRequest::SetModel(model) => {
                        json!({"subtype": "set_model", "model": model})
                    }
                };
                json!({"type": "control_request", "request_id": request_id, "request": body})
            }
            ClientMessage::PermissionReply {
                request_id,
                decision,
            } => {
                let answer = match decision {
                    PermissionDecision::Allow { input } => {
                        json!({"behavior": "allow", "updatedInput": input})
                    }
                    PermissionDecision::Deny { message, interrupt } => {
                        json!({"behavior": "deny", "message": message, "interrupt": interrupt})
                    }
                };
                json!({
                    "type": "control_response",
                    "response": {"subtype": "success", "request_id": request_id, "response": answer},
                })
            }
        }
    }

    /// The JSON line to write, newline included.
    pub fn to_line(&self) -> String {
        let mut line = self.to_json().to_string();
        line.push('\n');
        line
    }
}

/// A line the CLI wrote to stdout.
#[derive(Debug, Clone, PartialEq)]
pub enum ClaudeEvent {
    /// First event of a session: its id, model and permission mode.
    Init {
        session_id: String,
        model: Option<String>,
        permission_mode: Option<PermissionMode>,
    },
    /// An assistant message (text, thinking and tool-use blocks).
    /// `api_error` is set when the CLI sent an API failure (usage limit,
    /// authentication) as this message; its text is then the error.
    Assistant {
        message: Value,
        api_error: Option<ApiError>,
    },
    /// A user-role message from the CLI, usually tool results.
    ToolResults { message: Value },
    /// The turn finished.
    Result(TurnResult),
    /// The CLI asks whether a tool may run (the SDK's `canUseTool`).
    PermissionPrompt {
        request_id: String,
        tool_name: String,
        input: Value,
    },
    /// The CLI's answer to one of our [`ControlRequest`]s.
    ControlResponse {
        request_id: String,
        error: Option<String>,
    },
    /// Anything else, kept whole: other system subtypes, stream events,
    /// types a newer CLI adds.
    Unknown(Value),
}

/// An API failure the CLI reported on an assistant message
/// (`is_api_error_message: true`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    /// e.g. `usage_limit_reached` (`api_error`), else the `error` field.
    pub code: Option<String>,
    /// HTTP status (`api_error_status`).
    pub status: Option<u16>,
}

impl ApiError {
    fn parse(v: &Value) -> Option<Self> {
        if v.get("is_api_error_message").and_then(Value::as_bool) != Some(true) {
            return None;
        }
        Some(ApiError {
            code: str_field(v, "api_error").or_else(|| str_field(v, "error")),
            status: v
                .get("api_error_status")
                .and_then(Value::as_u64)
                .and_then(|s| u16::try_from(s).ok()),
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TurnResult {
    pub session_id: String,
    pub is_error: bool,
    /// `success`, or why the turn ended otherwise (e.g. `error_max_turns`).
    pub subtype: String,
    pub text: Option<String>,
    pub total_cost_usd: Option<f64>,
    pub num_turns: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError(pub String);

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "bad stream-json line: {}", self.0)
    }
}

impl std::error::Error for ParseError {}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn required(v: &Value, key: &str) -> Result<String, ParseError> {
    str_field(v, key).ok_or_else(|| ParseError(format!("missing string field {key:?}")))
}

impl ClaudeEvent {
    /// Parses one stdout line. Errors only for lines that are not JSON
    /// objects or that drop a field a known event needs.
    pub fn parse(line: &str) -> Result<Self, ParseError> {
        let v: Value = serde_json::from_str(line).map_err(|e| ParseError(e.to_string()))?;
        if !v.is_object() {
            return Err(ParseError("not a JSON object".into()));
        }
        let kind = v.get("type").and_then(Value::as_str).unwrap_or_default();
        let subtype = v.get("subtype").and_then(Value::as_str);
        Ok(match (kind, subtype) {
            ("system", Some("init")) => ClaudeEvent::Init {
                session_id: required(&v, "session_id")?,
                model: str_field(&v, "model"),
                permission_mode: str_field(&v, "permissionMode").and_then(|m| m.parse().ok()),
            },
            ("assistant", _) => ClaudeEvent::Assistant {
                message: v.get("message").cloned().unwrap_or(Value::Null),
                api_error: ApiError::parse(&v),
            },
            ("user", _) => ClaudeEvent::ToolResults {
                message: v.get("message").cloned().unwrap_or(Value::Null),
            },
            ("result", _) => ClaudeEvent::Result(TurnResult {
                session_id: required(&v, "session_id")?,
                is_error: v.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                subtype: subtype.unwrap_or("success").to_owned(),
                text: str_field(&v, "result"),
                total_cost_usd: v.get("total_cost_usd").and_then(Value::as_f64),
                num_turns: v.get("num_turns").and_then(Value::as_u64),
            }),
            ("control_request", _) => {
                let request = v.get("request").cloned().unwrap_or(Value::Null);
                if request.get("subtype").and_then(Value::as_str) != Some("can_use_tool") {
                    return Ok(ClaudeEvent::Unknown(v));
                }
                ClaudeEvent::PermissionPrompt {
                    request_id: required(&v, "request_id")?,
                    tool_name: required(&request, "tool_name")?,
                    input: request.get("input").cloned().unwrap_or_else(|| json!({})),
                }
            }
            ("control_response", _) => {
                let response = v.get("response").cloned().unwrap_or(Value::Null);
                ClaudeEvent::ControlResponse {
                    request_id: required(&response, "request_id")?,
                    error: match response.get("subtype").and_then(Value::as_str) {
                        Some("error") => Some(str_field(&response, "error").unwrap_or_default()),
                        _ => None,
                    },
                }
            }
            _ => ClaudeEvent::Unknown(v),
        })
    }
}

/// Hands out `req_1`, `req_2`, ... for control requests of one process.
#[derive(Debug, Default)]
pub struct RequestIds(u64);

impl RequestIds {
    pub fn next_id(&mut self) -> String {
        self.0 += 1;
        format!("req_{}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(v: Value) -> ClaudeEvent {
        ClaudeEvent::parse(&v.to_string()).unwrap()
    }

    #[test]
    fn user_turn_is_one_json_line() {
        let line = ClientMessage::User {
            text: "hi\nthere".into(),
        }
        .to_line();
        assert!(line.ends_with('\n'));
        assert_eq!(
            line.matches('\n').count(),
            1,
            "embedded newlines are escaped"
        );
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["type"], "user");
        assert_eq!(v["message"]["role"], "user");
        assert_eq!(v["message"]["content"][0]["text"], "hi\nthere");
    }

    #[test]
    fn control_requests_carry_their_id_and_subtype() {
        let mut ids = RequestIds::default();
        let cases = [
            (ControlRequest::Initialize, json!({"subtype": "initialize"})),
            (ControlRequest::Interrupt, json!({"subtype": "interrupt"})),
            (
                ControlRequest::SetPermissionMode(PermissionMode::AcceptEdits),
                json!({"subtype": "set_permission_mode", "mode": "acceptEdits"}),
            ),
            (
                ControlRequest::SetModel(None),
                json!({"subtype": "set_model", "model": null}),
            ),
        ];
        for (n, (request, body)) in cases.into_iter().enumerate() {
            let request_id = ids.next_id();
            assert_eq!(request_id, format!("req_{}", n + 1));
            let v = ClientMessage::Control {
                request_id: request_id.clone(),
                request,
            }
            .to_json();
            assert_eq!(
                v,
                json!({"type": "control_request", "request_id": request_id, "request": body})
            );
        }
    }

    #[test]
    fn permission_replies_allow_with_input_or_deny_with_reason() {
        let allow = ClientMessage::PermissionReply {
            request_id: "r1".into(),
            decision: PermissionDecision::Allow {
                input: json!({"command": "ls"}),
            },
        }
        .to_json();
        assert_eq!(allow["type"], "control_response");
        assert_eq!(allow["response"]["request_id"], "r1");
        assert_eq!(
            allow["response"]["response"],
            json!({"behavior": "allow", "updatedInput": {"command": "ls"}})
        );
        let deny = ClientMessage::PermissionReply {
            request_id: "r2".into(),
            decision: PermissionDecision::Deny {
                message: "no".into(),
                interrupt: true,
            },
        }
        .to_json();
        assert_eq!(
            deny["response"]["response"],
            json!({"behavior": "deny", "message": "no", "interrupt": true})
        );
    }

    #[test]
    fn parses_a_session_from_init_to_result() {
        assert_eq!(
            parse(
                json!({"type": "system", "subtype": "init", "session_id": "s1",
                         "model": "claude-opus", "permissionMode": "plan", "tools": []})
            ),
            ClaudeEvent::Init {
                session_id: "s1".into(),
                model: Some("claude-opus".into()),
                permission_mode: Some(PermissionMode::Plan),
            }
        );
        let msg = json!({"role": "assistant", "content": [{"type": "text", "text": "ok"}]});
        assert_eq!(
            parse(json!({"type": "assistant", "message": msg, "session_id": "s1"})),
            ClaudeEvent::Assistant {
                message: msg.clone(),
                api_error: None
            }
        );
        // The usage-limit form the signed-in CLI prints (evidence/claude-code/).
        assert_eq!(
            parse(
                json!({"type": "assistant", "message": msg, "session_id": "s1",
                         "error": "rate_limit", "is_api_error_message": true,
                         "api_error_status": 429, "api_error": "usage_limit_reached"})
            ),
            ClaudeEvent::Assistant {
                message: msg,
                api_error: Some(ApiError {
                    code: Some("usage_limit_reached".into()),
                    status: Some(429)
                })
            }
        );
        assert!(matches!(
            parse(json!({"type": "user", "message": {"role": "user"}, "session_id": "s1"})),
            ClaudeEvent::ToolResults { .. }
        ));
        assert_eq!(
            parse(
                json!({"type": "result", "subtype": "success", "is_error": false,
                         "result": "done", "session_id": "s1", "total_cost_usd": 0.25,
                         "num_turns": 3, "duration_ms": 10})
            ),
            ClaudeEvent::Result(TurnResult {
                session_id: "s1".into(),
                is_error: false,
                subtype: "success".into(),
                text: Some("done".into()),
                total_cost_usd: Some(0.25),
                num_turns: Some(3),
            })
        );
    }

    #[test]
    fn parses_permission_prompts_and_control_responses() {
        assert_eq!(
            parse(json!({"type": "control_request", "request_id": "c7",
                         "request": {"subtype": "can_use_tool", "tool_name": "Bash",
                                     "input": {"command": "rm -rf build"}}})),
            ClaudeEvent::PermissionPrompt {
                request_id: "c7".into(),
                tool_name: "Bash".into(),
                input: json!({"command": "rm -rf build"}),
            }
        );
        assert_eq!(
            parse(json!({"type": "control_response",
                         "response": {"subtype": "success", "request_id": "req_1"}})),
            ClaudeEvent::ControlResponse {
                request_id: "req_1".into(),
                error: None
            }
        );
        assert_eq!(
            parse(json!({"type": "control_response",
                         "response": {"subtype": "error", "request_id": "req_2", "error": "busy"}})),
            ClaudeEvent::ControlResponse {
                request_id: "req_2".into(),
                error: Some("busy".into())
            }
        );
    }

    #[test]
    fn unknown_events_are_kept_and_broken_lines_rejected() {
        for v in [
            json!({"type": "stream_event", "event": {"type": "content_block_delta"}}),
            json!({"type": "system", "subtype": "compact_boundary"}),
            json!({"type": "control_request", "request_id": "x", "request": {"subtype": "hook_callback"}}),
        ] {
            assert_eq!(parse(v.clone()), ClaudeEvent::Unknown(v));
        }
        assert!(ClaudeEvent::parse("not json").is_err());
        assert!(ClaudeEvent::parse("[1]").is_err());
        assert!(ClaudeEvent::parse(r#"{"type":"result"}"#).is_err());
    }
}
