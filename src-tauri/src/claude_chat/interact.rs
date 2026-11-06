//! Claude Code's permission prompts (stream-json `can_use_tool`) as the
//! app's permission requests, and the user's answers as permission
//! decisions.
//!
//! Conductor 0.87.6 (REA-read `index-BGEQ8YjU.js`, frontend RPC methods)
//! treats two tools apart from ordinary tool approvals: `ExitPlanMode`
//! raises `needs_plan_response` with the plan, `AskUserQuestion` raises
//! `needs_user_input` with its questions; any other tool raises
//! `needs_user_permission`. The answers follow the Claude Agent SDK's
//! `canUseTool` contract: allow (with the input, plus `answers` for a
//! question) or deny with a message the agent reads.

use serde_json::{json, Map, Value};

use crate::agent::claude_stream::PermissionDecision;
use crate::reason_acp::provider::{
    Ask, PermissionOption, PermissionRequest, Question, QuestionOption,
};

pub const ALLOW: &str = "allow";
pub const DENY: &str = "deny";

const PLAN_TOOL: &str = "ExitPlanMode";
const QUESTION_TOOL: &str = "AskUserQuestion";

/// The user's answer, as the UI sends it to `claude_respond` (`{ kind, ... }`).
#[derive(Debug, Clone, PartialEq)]
pub enum Answer {
    /// A permission option by id ([`ALLOW`] or [`DENY`]).
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

/// The request the prompt `request_id` for `tool` puts to the user.
pub fn request_of(request_id: String, tool: &str, input: &Value) -> PermissionRequest {
    let (title, options, ask) = match tool {
        PLAN_TOOL => (
            String::new(),
            Vec::new(),
            Ask::Plan {
                plan: input["plan"].as_str().unwrap_or_default().to_owned(),
            },
        ),
        QUESTION_TOOL => (String::new(), Vec::new(), Ask::Questions(questions(input))),
        _ => (
            title(tool, input),
            vec![
                PermissionOption {
                    option_id: ALLOW.into(),
                    name: "Yes".into(),
                    kind: "allow_once".into(),
                },
                PermissionOption {
                    option_id: DENY.into(),
                    name: "No".into(),
                    kind: "reject_once".into(),
                },
            ],
            Ask::Tool {
                tool: tool.to_owned(),
                input: input.clone(),
            },
        ),
    };
    PermissionRequest {
        request_id,
        title,
        options,
        ask,
    }
}

/// The decision sent back for `answer` to the prompt for `tool`.
pub fn decision(tool: &str, input: &Value, answer: &Answer) -> Result<PermissionDecision, String> {
    let deny = |message: &str| PermissionDecision::Deny {
        message: message.to_owned(),
        interrupt: false,
    };
    let allow = || PermissionDecision::Allow {
        input: input.clone(),
    };
    Ok(match (tool, answer) {
        (_, Answer::Cancel) => deny("The user dismissed this request."),
        (PLAN_TOOL, Answer::Plan { approved: true, .. }) => allow(),
        (PLAN_TOOL, Answer::Plan { feedback, .. }) => match feedback {
            Some(f) => deny(&format!("The user wants changes to the plan: {f}")),
            None => deny("The user wants to keep planning."),
        },
        (QUESTION_TOOL, Answer::Answers(answers)) => PermissionDecision::Allow {
            input: with_answers(input, answers),
        },
        (PLAN_TOOL | QUESTION_TOOL, _) => return Err(format!("{tool} needs a different answer")),
        (_, Answer::Option(id)) if id == ALLOW => allow(),
        (_, Answer::Option(id)) if id == DENY => deny("The user denied this tool call."),
        (_, other) => return Err(format!("{other:?} does not answer a permission")),
    })
}

fn questions(input: &Value) -> Vec<Question> {
    let list = input["questions"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    list.iter()
        .filter_map(|q| {
            let question = q["question"].as_str()?.to_owned();
            let options = q["options"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default();
            Some(Question {
                header: q["header"].as_str().unwrap_or_default().to_owned(),
                question,
                multi_select: q["multiSelect"].as_bool().unwrap_or(false),
                options: options
                    .iter()
                    .filter_map(|o| {
                        Some(QuestionOption {
                            label: o["label"].as_str()?.to_owned(),
                            description: o["description"].as_str().map(str::to_owned),
                        })
                    })
                    .collect(),
            })
        })
        .collect()
}

/// The question tool's input with `answers`: question text to the chosen
/// labels joined with ", " (the SDK's shape for a multi-select).
fn with_answers(input: &Value, answers: &[Vec<String>]) -> Value {
    let mut by_question = Map::new();
    for (q, a) in questions(input).iter().zip(answers) {
        let chosen: Vec<&str> = a
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if !chosen.is_empty() {
            by_question.insert(q.question.clone(), json!(chosen.join(", ")));
        }
    }
    let mut out = input.clone();
    if let Value::Object(o) = &mut out {
        o.insert("answers".into(), Value::Object(by_question));
    }
    out
}

/// One line saying what the tool call does: its command, file, URL or
/// query when it has one.
fn title(tool: &str, input: &Value) -> String {
    [
        "command",
        "file_path",
        "notebook_path",
        "url",
        "query",
        "pattern",
        "description",
    ]
    .iter()
    .find_map(|k| input[*k].as_str())
    .map(|s| s.lines().next().unwrap_or_default().to_owned())
    .unwrap_or_else(|| tool.to_owned())
}
