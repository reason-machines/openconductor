use super::provider::{ProviderEvent, TurnEnd};
use super::updates::{map_path, AgentEvent, ReasonError, ToolRow, ToolStatus};
use super::wire::event_json;
use serde_json::{json, Value};
use std::path::Path;

#[test]
fn every_payload_names_its_chat_and_type() {
    let started = ProviderEvent::SessionStarted {
        session_id: "s-1".into(),
    };
    assert_eq!(
        event_json("c", &started),
        json!({ "chatId": "c", "type": "sessionStarted", "sessionId": "s-1" })
    );
    let text = ProviderEvent::Agent(AgentEvent::Text("hi".into()));
    assert_eq!(
        event_json("c", &text),
        json!({ "chatId": "c", "type": "text", "text": "hi" })
    );
    let report = ProviderEvent::Agent(AgentEvent::Report("child done".into()));
    assert_eq!(event_json("c", &report)["type"], "report");
}

#[test]
fn turn_ends_carry_an_outcome_and_failures_a_message() {
    let ended = |end| event_json("c", &ProviderEvent::TurnEnded(end))["end"].clone();
    assert_eq!(ended(TurnEnd::Completed), json!({ "outcome": "completed" }));
    assert_eq!(
        ended(TurnEnd::Superseded),
        json!({ "outcome": "superseded" })
    );
    assert_eq!(
        ended(TurnEnd::Failed(
            "Reason request failed (404 device_not_found)".into()
        )),
        json!({ "outcome": "failed", "message": "Reason request failed (404 device_not_found)" })
    );
}

#[test]
fn errors_keep_code_and_status() {
    let err = ProviderEvent::Agent(AgentEvent::Error(ReasonError {
        code: Some("device_not_found".into()),
        status: Some(404),
        message: "Reason request failed (404 device_not_found)".into(),
    }));
    let v = event_json("c", &err);
    assert_eq!(v["type"], "error");
    assert_eq!(v["code"], "device_not_found");
    assert_eq!(v["status"], 404);
}

#[test]
fn tool_paths_say_local_or_cloud_with_the_same_relative_path() {
    let cwd = Path::new("/Users/sven/project");
    let cloud = "/home/runner/.reason/workspace/sessions/child-1/repo/src/a.rs";
    let row = ToolRow {
        id: "t1".into(),
        title: "Edit".into(),
        kind: "edit".into(),
        status: ToolStatus::Completed,
        output: None,
        diffs: Vec::new(),
        locations: vec![
            map_path("/Users/sven/project/src/a.rs", cwd),
            map_path(cloud, cwd),
        ],
        tool_name: None,
        raw_input: None,
    };
    let v = event_json("c", &ProviderEvent::Agent(AgentEvent::Tool(Box::new(row))));
    assert_eq!(v["status"], "completed");
    let locs = v["locations"].as_array().unwrap();
    assert_eq!(locs[0]["place"], "local");
    assert_eq!(locs[1]["place"], "cloud");
    assert_eq!(locs[1]["sessionId"], "child-1");
    assert_eq!(locs[0]["relative"], "src/a.rs");
    assert_eq!(locs[1]["relative"], "src/a.rs");
    assert_eq!(v["toolName"], Value::Null);
    assert_eq!(v["rawInput"], Value::Null);
}

#[test]
fn tool_rows_carry_the_provider_tool_name_and_raw_input() {
    let row = ToolRow {
        id: "t2".into(),
        title: "Grep: redirectTo".into(),
        kind: "search".into(),
        status: ToolStatus::Running,
        output: None,
        diffs: Vec::new(),
        locations: Vec::new(),
        tool_name: Some("Grep".into()),
        raw_input: Some(json!({ "pattern": "redirectTo", "path": "src" })),
    };
    let v = event_json("c", &ProviderEvent::Agent(AgentEvent::Tool(Box::new(row))));
    assert_eq!(v["toolName"], "Grep");
    assert_eq!(
        v["rawInput"],
        json!({ "pattern": "redirectTo", "path": "src" })
    );
}

#[test]
fn a_notice_is_its_own_payload() {
    let n = ProviderEvent::Notice("Reason does not offer model \"x\"".into());
    assert_eq!(
        event_json("c", &n),
        json!({ "chatId": "c", "type": "notice", "text": "Reason does not offer model \"x\"" })
    );
}

#[test]
fn prompt_blocks_put_attachments_after_the_text_as_file_resources() {
    use super::provider::{prompt_blocks, Attachment};
    let a = Attachment {
        name: "Review request.md".into(),
        text: "# Review".into(),
    };
    let v = prompt_blocks("Please review", &[a], Path::new("/Users/me/ws é"));
    assert_eq!(v[0], json!({ "type": "text", "text": "Please review" }));
    assert_eq!(
        v[1],
        json!({ "type": "resource", "resource": {
            "uri": "file:///Users/me/ws%20%C3%A9/Review%20request.md",
            "mimeType": "text/markdown", "text": "# Review" } })
    );
    assert_eq!(
        prompt_blocks("hi", &[], Path::new("/x"))
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn a_permission_request_carries_its_title_and_options() {
    use super::provider::permission_request;
    let params = json!({
        "sessionId": "s",
        "toolCall": { "toolCallId": "t1", "kind": "execute" },
        "options": [
            { "optionId": "a", "name": "Allow", "kind": "allow_once" },
            { "name": "no id is dropped" },
        ],
    });
    let ev = ProviderEvent::PermissionRequested(permission_request("permission-1".into(), &params));
    assert_eq!(
        event_json("c", &ev),
        json!({ "chatId": "c", "type": "permissionRequest", "requestId": "permission-1", "title": "execute",
            "options": [{ "optionId": "a", "name": "Allow", "kind": "allow_once" }] })
    );
    let done = ProviderEvent::PermissionResolved {
        request_id: "permission-1".into(),
    };
    assert_eq!(
        event_json("c", &done),
        json!({ "chatId": "c", "type": "permissionResolved", "requestId": "permission-1" })
    );
    let untitled = permission_request("p".into(), &json!({ "toolCall": {} }));
    assert_eq!(
        (untitled.title.as_str(), untitled.options.len()),
        ("Tool call", 0)
    );
}
