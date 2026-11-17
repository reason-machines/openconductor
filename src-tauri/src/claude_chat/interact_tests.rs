use serde_json::{json, Value};

use super::interact::{decision, decision_with_plan_mode, request_of, Answer, ALLOW, DENY};
use crate::agent::claude_stream::PermissionDecision;
use crate::reason_acp::provider::Ask;

#[test]
fn approved_plan_restores_only_a_configured_execution_mode() {
    use crate::agent::{PermissionMode, claude_stream::ClientMessage};
    let answer = Answer::Plan { approved: true, feedback: None };
    let input = json!({"plan": "p", "planFilePath": "/synthetic/plan.md"});
    for mode in [PermissionMode::Default, PermissionMode::Auto, PermissionMode::BypassPermissions] {
        let decision = decision_with_plan_mode("ExitPlanMode", &input, &answer, Some(mode)).unwrap();
        let response = ClientMessage::PermissionReply { request_id: "r".into(), decision }.to_json();
        assert_eq!(response["response"]["response"]["updatedPermissions"], json!([
            {"type": "setMode", "mode": mode.as_str(), "destination": "session"}
        ]));
        let updated = &response["response"]["response"]["updatedInput"];
        assert_eq!(updated["_targetMode"], mode.as_str());
        assert_eq!(updated["planFilePath"], input["planFilePath"]);
    }
    for mode in [PermissionMode::Plan, PermissionMode::AcceptEdits, PermissionMode::DontAsk] {
        assert!(decision_with_plan_mode("ExitPlanMode", &input, &answer, Some(mode)).is_err());
    }
    assert!(decision_with_plan_mode("ExitPlanMode", &Value::Null, &answer, Some(PermissionMode::Auto)).is_err());
}

#[test]
fn a_mode_target_cannot_approve_a_tool_or_a_rejected_plan() {
    use crate::agent::PermissionMode;
    let plan = json!({"plan": "p"});
    for answer in [Answer::Cancel, Answer::Plan { approved: false, feedback: None }] {
        assert_eq!(decision_with_plan_mode("ExitPlanMode", &plan, &answer, Some(PermissionMode::Auto)), decision("ExitPlanMode", &plan, &answer));
    }
    let input = json!({"command": "synthetic command"});
    for answer in [Answer::Option(ALLOW.into()), Answer::Option(DENY.into())] {
        assert_eq!(decision_with_plan_mode("Bash", &input, &answer, Some(PermissionMode::Auto)), decision("Bash", &input, &answer));
    }
}

fn question_input() -> Value {
    json!({ "questions": [
        { "question": "Which database?", "header": "Database", "multiSelect": false,
          "options": [{ "label": "SQLite", "description": "One file" }, { "label": "Postgres" }] },
        { "question": "Which extras?", "header": "Extras", "multiSelect": true,
          "options": [{ "label": "Auth" }, { "label": "Search" }] },
        { "header": "no question text is dropped" },
    ] })
}

#[test]
fn exit_plan_mode_is_a_plan_and_ask_user_question_its_questions() {
    let plan = request_of(
        "r1".into(),
        "ExitPlanMode",
        &json!({ "plan": "1. Add a table" }),
    );
    assert_eq!(plan.request_id, "r1");
    assert_eq!(
        plan.ask,
        Ask::Plan {
            plan: "1. Add a table".into()
        }
    );
    assert!(plan.options.is_empty());
    let Ask::Questions(questions) =
        request_of("r2".into(), "AskUserQuestion", &question_input()).ask
    else {
        panic!("expected questions");
    };
    assert_eq!(questions.len(), 2);
    assert_eq!(questions[0].header, "Database");
    assert_eq!(
        questions[0].options[0].description.as_deref(),
        Some("One file")
    );
    assert_eq!(questions[0].options[1].description, None);
    assert!(questions[1].multi_select);
}

#[test]
fn any_other_tool_is_a_yes_or_no_permission_titled_by_its_input() {
    let input = json!({ "command": "rm -rf build\necho hi" });
    let p = request_of("r1".into(), "Bash", &input);
    assert_eq!(
        p.ask,
        Ask::Tool {
            tool: "Bash".into(),
            input
        }
    );
    assert_eq!(p.title, "rm -rf build");
    let ids: Vec<&str> = p.options.iter().map(|o| o.option_id.as_str()).collect();
    assert_eq!(ids, [ALLOW, DENY]);
    assert_eq!(
        request_of("r2".into(), "mcp__x__y", &json!({})).title,
        "mcp__x__y"
    );
}

#[test]
fn answers_become_allow_or_deny_decisions() {
    let input = json!({ "command": "ls" });
    assert_eq!(
        decision("Bash", &input, &Answer::Option(ALLOW.into())),
        Ok(PermissionDecision::Allow {
            input: input.clone()
        })
    );
    assert!(matches!(
        decision("Bash", &input, &Answer::Option(DENY.into())),
        Ok(PermissionDecision::Deny {
            interrupt: false,
            ..
        })
    ));
    assert!(decision("Bash", &input, &Answer::Option("maybe".into())).is_err());
    assert!(matches!(
        decision("Bash", &input, &Answer::Cancel),
        Ok(PermissionDecision::Deny { .. })
    ));

    let plan = json!({ "plan": "p" });
    let approve = Answer::Plan {
        approved: true,
        feedback: None,
    };
    assert_eq!(
        decision("ExitPlanMode", &plan, &approve),
        Ok(PermissionDecision::Allow {
            input: plan.clone()
        })
    );
    let keep = Answer::Plan {
        approved: false,
        feedback: Some("use sqlite".into()),
    };
    match decision("ExitPlanMode", &plan, &keep) {
        Ok(PermissionDecision::Deny { message, .. }) => assert!(message.contains("use sqlite")),
        other => panic!("{other:?}"),
    }
    assert!(decision("ExitPlanMode", &plan, &Answer::Option(ALLOW.into())).is_err());
}

#[test]
fn question_answers_go_back_in_the_input_by_question_text() {
    let answers = Answer::Answers(vec![
        vec!["SQLite".into()],
        vec!["Auth".into(), " ".into(), "Search".into()],
    ]);
    let Ok(PermissionDecision::Allow { input }) =
        decision("AskUserQuestion", &question_input(), &answers)
    else {
        panic!("expected allow");
    };
    assert_eq!(
        input["answers"],
        json!({ "Which database?": "SQLite", "Which extras?": "Auth, Search" })
    );
    assert_eq!(input["questions"], question_input()["questions"]);
}

#[test]
fn answers_parse_from_the_ui_json() {
    assert_eq!(
        Answer::from_json(&json!({ "kind": "option", "optionId": "allow" })),
        Ok(Answer::Option("allow".into()))
    );
    assert_eq!(
        Answer::from_json(&json!({ "kind": "plan", "approved": false, "feedback": "  " })),
        Ok(Answer::Plan {
            approved: false,
            feedback: None
        })
    );
    assert_eq!(
        Answer::from_json(&json!({ "kind": "answers", "answers": [["a", "b"], "c"] })),
        Ok(Answer::Answers(vec![
            vec!["a".into(), "b".into()],
            vec!["c".into()]
        ]))
    );
    assert_eq!(
        Answer::from_json(&json!({ "kind": "cancel" })),
        Ok(Answer::Cancel)
    );
    assert!(Answer::from_json(&json!({ "kind": "option" })).is_err());
    assert!(Answer::from_json(&json!({})).is_err());
}
