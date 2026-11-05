//! Claude Code's permission prompts as chat interactions, and the user's
//! answers as permission decisions.
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
use crate::reason_acp::interaction::{
    Answer, Permission, PermissionOption, Question, QuestionOption, Request,
};

pub const ALLOW: &str = "allow";
pub const DENY: &str = "deny";

const PLAN_TOOL: &str = "ExitPlanMode";
const QUESTION_TOOL: &str = "AskUserQuestion";

/// What the prompt for `tool` asks the user.
pub fn request_of(tool: &str, input: &Value) -> Request {
    match tool {
        PLAN_TOOL => Request::Plan {
            plan: input["plan"].as_str().unwrap_or_default().to_owned(),
        },
        QUESTION_TOOL => Request::Question {
            questions: questions(input),
        },
        _ => Request::Permission(Permission {
            tool: tool.to_owned(),
            title: title(tool, input),
            input: input.clone(),
            options: vec![
                PermissionOption {
                    id: ALLOW.into(),
                    label: "Yes".into(),
                    kind: "allow_once".into(),
                },
                PermissionOption {
                    id: DENY.into(),
                    label: "No".into(),
                    kind: "reject_once".into(),
                },
            ],
        }),
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
