use super::interaction::{
    acp_outcome, permission_from_acp, request_json, Answer, Permission, PermissionOption, Question,
    QuestionOption, Request,
};
use serde_json::{json, Value};

fn acp_params() -> Value {
    json!({
        "sessionId": "s-1",
        "toolCall": { "toolCallId": "t1", "title": "bash: rm -rf build", "kind": "execute",
                      "rawInput": { "command": "rm -rf build" } },
        "options": [
            { "optionId": "a1", "name": "Allow", "kind": "allow_once" },
            { "optionId": "a2", "name": "Always allow", "kind": "allow_always" },
            { "name": "no id" },
            { "optionId": "r1", "name": "Reject", "kind": "reject_once" },
        ],
    })
}

#[test]
fn an_acp_permission_request_keeps_its_tool_call_and_options() {
    let p = permission_from_acp(&acp_params());
    assert_eq!(p.tool, "execute");
    assert_eq!(p.title, "bash: rm -rf build");
    assert_eq!(p.input, json!({ "command": "rm -rf build" }));
    let ids: Vec<&str> = p.options.iter().map(|o| o.id.as_str()).collect();
    assert_eq!(ids, ["a1", "a2", "r1"]);
    assert_eq!(p.options[1].label, "Always allow");
    assert_eq!(p.options[1].kind, "allow_always");
}

#[test]
fn a_request_without_a_tool_call_still_parses() {
    let p = permission_from_acp(&json!({ "sessionId": "s", "options": [] }));
    assert_eq!(p.tool, "other");
    assert_eq!(p.title, "");
    assert_eq!(p.input, Value::Null);
    assert!(p.options.is_empty());
}

#[test]
fn the_acp_outcome_is_the_chosen_option_or_cancelled() {
    let options = ["a1".to_string(), "r1".to_string()];
    assert_eq!(
        acp_outcome(&Answer::Option("r1".into()), &options).unwrap(),
        json!({ "outcome": { "outcome": "selected", "optionId": "r1" } })
    );
    assert_eq!(
        acp_outcome(&Answer::Cancel, &options).unwrap(),
        json!({ "outcome": { "outcome": "cancelled" } })
    );
    assert!(acp_outcome(&Answer::Option("zz".into()), &options).is_err());
    let plan = Answer::Plan {
        approved: true,
        feedback: None,
    };
    assert!(acp_outcome(&plan, &options).is_err());
}

#[test]
fn answers_parse_from_the_ui_json() {
    let parse = |v: Value| Answer::from_json(&v);
    assert_eq!(
        parse(json!({ "kind": "option", "optionId": "a1" })),
        Ok(Answer::Option("a1".into()))
    );
    assert_eq!(
        parse(json!({ "kind": "plan", "approved": false, "feedback": "  use sqlite  " })),
        Ok(Answer::Plan {
            approved: false,
            feedback: Some("use sqlite".into())
        })
    );
    assert_eq!(
        parse(json!({ "kind": "plan", "approved": true, "feedback": " " })),
        Ok(Answer::Plan {
            approved: true,
            feedback: None
        })
    );
    assert_eq!(
        parse(json!({ "kind": "answers", "answers": [["Red", "Blue"], "Other text", []] })),
        Ok(Answer::Answers(vec![
            vec!["Red".into(), "Blue".into()],
            vec!["Other text".into()],
            vec![],
        ]))
    );
    assert_eq!(parse(json!({ "kind": "cancel" })), Ok(Answer::Cancel));
    assert!(parse(json!({ "kind": "option" })).is_err());
    assert!(parse(json!({ "kind": "nope" })).is_err());
}

#[test]
fn requests_serialize_for_the_chat_ui() {
    let permission = Request::Permission(Permission {
        tool: "Bash".into(),
        title: "ls".into(),
        input: json!({ "command": "ls" }),
        options: vec![PermissionOption {
            id: "allow".into(),
            label: "Yes".into(),
            kind: "allow_once".into(),
        }],
    });
    assert_eq!(
        request_json(&permission),
        json!({ "kind": "permission", "tool": "Bash", "title": "ls", "input": { "command": "ls" },
                "options": [{ "id": "allow", "label": "Yes", "kind": "allow_once" }] })
    );
    assert_eq!(
        request_json(&Request::Plan {
            plan: "1. a".into()
        }),
        json!({ "kind": "plan", "plan": "1. a" })
    );
    let question = Request::Question {
        questions: vec![Question {
            header: "Color".into(),
            question: "Which?".into(),
            multi_select: true,
            options: vec![QuestionOption {
                label: "Red".into(),
                description: None,
            }],
        }],
    };
    assert_eq!(
        request_json(&question),
        json!({ "kind": "question", "questions": [{ "header": "Color", "question": "Which?",
                "multiSelect": true, "options": [{ "label": "Red", "description": null }] }] })
    );
}
