//! Requests an agent makes of the user mid-turn, and the user's answers.
//!
//! Conductor 0.87.6 (REA-read `index-BGEQ8YjU.js`, frontend RPC methods
//! `TOOL_APPROVAL`, `EXIT_PLAN_MODE` and `ASK_USER_QUESTION`) sets the
//! session's status to `needs_user_permission`, `needs_plan_response` or
//! `needs_user_input` while one waits, and back to `working` once it is
//! answered. The chat UI does the same from these events
//! (`src/features/chat/interactions.ts`).
//!
//! * Reason over ACP asks with `session/request_permission`
//!   ([`permission_from_acp`]); the answer is an option id or cancelled.
//! * Claude Code asks through its permission prompt (stream-json
//!   `can_use_tool`): `ExitPlanMode` is a plan, `AskUserQuestion` a set of
//!   questions, any other tool a permission (`crate::claude_chat::interact`).

use serde_json::{json, Value};

/// One request waiting for the user; `id` is unique within the app run.
#[derive(Debug, Clone, PartialEq)]
pub struct Interaction {
    pub id: String,
    pub request: Request,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Request {
    /// Run this tool call? Answered with one of `options`.
    Permission(Permission),
    /// The agent proposes a plan and waits for approval.
    Plan { plan: String },
    /// The agent asks one or more questions.
    Question { questions: Vec<Question> },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Permission {
    /// The tool's name (`Bash`, `Edit`, ...) or ACP tool kind (`execute`, `edit`, ...).
    pub tool: String,
    /// What the tool call does, as the agent titles it.
    pub title: String,
    /// The tool's input, shown to the user; `Null` when the agent sent none.
    pub input: Value,
    pub options: Vec<PermissionOption>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PermissionOption {
    pub id: String,
    pub label: String,
    /// ACP `PermissionOptionKind`: `allow_once`, `allow_always`, `reject_once`, `reject_always`.
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Question {
    pub header: String,
    pub question: String,
    pub options: Vec<QuestionOption>,
    pub multi_select: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

/// The user's answer, as the UI sends it (`{ kind, ... }`).
#[derive(Debug, Clone, PartialEq)]
pub enum Answer {
    /// A permission option by id.
    Option(String),
    /// Approve the plan, or keep planning with optional feedback.
    Plan {
        approved: bool,
        feedback: Option<String>,
    },
    /// One entry per question: the chosen labels and any typed answer.
    Answers(Vec<Vec<String>>),
    /// Dismissed without an answer (Stop, or the card's cancel).
    Cancel,
}

impl Answer {
    pub fn from_json(v: &Value) -> Result<Answer, String> {
        let str_list = |v: &Value| -> Vec<String> {
            match v {
                Value::String(s) => vec![s.clone()],
                Value::Array(a) => a
                    .iter()
                    .filter_map(|s| s.as_str().map(str::to_owned))
                    .collect(),
                _ => Vec::new(),
            }
        };
        match v["kind"].as_str() {
            Some("option") => v["optionId"]
                .as_str()
                .map(|id| Answer::Option(id.to_owned()))
                .ok_or_else(|| "an option answer needs optionId".to_owned()),
            Some("plan") => Ok(Answer::Plan {
                approved: v["approved"].as_bool().unwrap_or(false),
                feedback: v["feedback"]
                    .as_str()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned),
            }),
            Some("answers") => Ok(Answer::Answers(
                v["answers"]
                    .as_array()
                    .map(|a| a.iter().map(str_list).collect())
                    .unwrap_or_default(),
            )),
            Some("cancel") => Ok(Answer::Cancel),
            other => Err(format!("unknown answer kind {other:?}")),
        }
    }
}

/// A `session/request_permission` request's params as a [`Permission`].
/// Options without an id are dropped.
pub fn permission_from_acp(params: &Value) -> Permission {
    let call = &params["toolCall"];
    let options = params["options"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    Permission {
        tool: call["kind"].as_str().unwrap_or("other").to_owned(),
        title: call["title"].as_str().unwrap_or_default().to_owned(),
        input: call.get("rawInput").cloned().unwrap_or(Value::Null),
        options: options
            .iter()
            .filter_map(|o| {
                let id = o["optionId"].as_str()?;
                Some(PermissionOption {
                    id: id.to_owned(),
                    label: o["name"].as_str().unwrap_or(id).to_owned(),
                    kind: o["kind"].as_str().unwrap_or("allow_once").to_owned(),
                })
            })
            .collect(),
    }
}

/// The `session/request_permission` result for an answer: the chosen
/// option, or `cancelled` (ACP requires it for a cancelled prompt).
pub fn acp_outcome(answer: &Answer, options: &[String]) -> Result<Value, String> {
    match answer {
        Answer::Option(id) if options.iter().any(|o| o == id) => {
            Ok(json!({ "outcome": { "outcome": "selected", "optionId": id } }))
        }
        Answer::Option(id) => Err(format!("{id} is not one of the request's options")),
        Answer::Cancel => Ok(cancelled_outcome()),
        _ => Err("Reason asks only for permission; answer with an option".to_owned()),
    }
}

pub fn cancelled_outcome() -> Value {
    json!({ "outcome": { "outcome": "cancelled" } })
}

/// The interaction as the chat UI receives it (`request` of an `interaction` event).
pub fn request_json(r: &Request) -> Value {
    match r {
        Request::Permission(p) => json!({
            "kind": "permission",
            "tool": p.tool,
            "title": p.title,
            "input": p.input,
            "options": p.options.iter().map(|o| json!({ "id": o.id, "label": o.label, "kind": o.kind })).collect::<Vec<_>>(),
        }),
        Request::Plan { plan } => json!({ "kind": "plan", "plan": plan }),
        Request::Question { questions } => json!({
            "kind": "question",
            "questions": questions.iter().map(|q| json!({
                "header": q.header,
                "question": q.question,
                "multiSelect": q.multi_select,
                "options": q.options.iter().map(|o| json!({ "label": o.label, "description": o.description })).collect::<Vec<_>>(),
            })).collect::<Vec<_>>(),
        }),
    }
}
