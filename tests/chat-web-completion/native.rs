//! The same frozen native-event cases as the cross-language mounted witness.
//! Imported only by codex_wire's test build; never launches a provider.
use super::super::codex_events::ServerMessage;
use super::{payloads, Payload};
use serde_json::{json, Value};

fn check(id: &str) {
    let fixture: Value = serde_json::from_str(include_str!("cases.json")).unwrap();
    let case = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == id)
        .unwrap();
    let notification = json!({
        "method": case["method"],
        "params": { "item": case["item"], "threadId": "fixture-thread", "turnId": "fixture-turn" }
    });
    let message = ServerMessage::parse(&notification.to_string()).unwrap();
    let rows = payloads(&message);
    let [Payload::Tool(row)] = rows.as_slice() else {
        panic!("one native tool payload expected")
    };
    let actual = serde_json::to_value(row).unwrap();
    assert_eq!(
        actual["output"], case["expectedOutput"],
        "CODEX_WEBSEARCH_COMPLETION_RESULT_MISSING: {id}"
    );
    assert_eq!(actual["input"], json!({ "query": case["item"]["query"] }));
    assert_eq!(
        actual["title"],
        format!(
            "Search the web: {}",
            case["item"]["query"].as_str().unwrap()
        )
    );
    assert_eq!(
        actual["status"],
        if case["method"] == "item/started" {
            "running"
        } else {
            "completed"
        }
    );
    assert_eq!(actual["exitCode"], Value::Null);
}

#[test]
fn running_query_has_no_result() {
    check("running-query");
}
#[test]
fn completed_query_has_result() {
    check("completed-query");
}
#[test]
fn completed_empty_query_has_result() {
    check("completed-empty-query");
}
#[test]
fn completed_whitespace_query_preserves_text() {
    check("completed-whitespace-query");
}
#[test]
fn completed_markup_query_is_literal() {
    check("completed-markup-query");
}
#[test]
fn running_empty_query_has_no_result() {
    check("running-empty-query");
}
