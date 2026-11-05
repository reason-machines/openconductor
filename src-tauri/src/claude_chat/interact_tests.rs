use serde_json::{json, Value};

use super::interact::{decision, request_of, ALLOW, DENY};
use crate::agent::claude_stream::PermissionDecision;
use crate::reason_acp::interaction::{Answer, Request};

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
    let plan = request_of("ExitPlanMode", &json!({ "plan": "1. Add a table" }));
    assert_eq!(
        plan,
        Request::Plan {
            plan: "1. Add a table".into()
        }
    );
    let Request::Question { questions } = request_of("AskUserQuestion", &question_input()) else {
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
    let Request::Permission(p) = request_of("Bash", &json!({ "command": "rm -rf build\necho hi" }))
    else {
        panic!("expected a permission");
    };
    assert_eq!(p.tool, "Bash");
    assert_eq!(p.title, "rm -rf build");
    let ids: Vec<&str> = p.options.iter().map(|o| o.id.as_str()).collect();
    assert_eq!(ids, [ALLOW, DENY]);
    let Request::Permission(p) = request_of("mcp__x__y", &json!({})) else {
        panic!("expected a permission");
    };
    assert_eq!(p.title, "mcp__x__y");
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
