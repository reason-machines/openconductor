//! `session/update` parsing, error notices and local/cloud path mapping.

use super::updates::{
    classify_notice, computer_is_cloud, map_path, parse_update, AgentEvent, Place, ToolStatus,
    UpdateContext,
};
use serde_json::{json, Value};
use std::path::Path;

const CWD: &str = "/Users/sven/conductor/workspaces/app/lisbon";
const CLOUD: &str = "/home/runner/.reason/workspace/sessions/0f9c-child/repo";

fn ctx(turn_running: bool, in_text: bool) -> UpdateContext<'static> {
    UpdateContext {
        cwd: Path::new(CWD),
        turn_running,
        in_text,
        cloud_session: None,
    }
}

fn chunk(kind: &str, text: &str) -> Value {
    json!({"sessionUpdate": kind, "content": {"type": "text", "text": text}})
}

#[test]
fn device_not_found_reply_is_an_error_not_text() {
    let ev = parse_update(
        &chunk(
            "agent_message_chunk",
            "Reason request failed (404 device_not_found)",
        ),
        ctx(true, false),
    );
    let Some(AgentEvent::Error(err)) = ev else {
        panic!("expected an error, got {ev:?}");
    };
    assert_eq!(err.code.as_deref(), Some("device_not_found"));
    assert_eq!(err.status, Some(404));

    // With a detail message, after earlier reply text (newline-prefixed).
    let text = "\nThis computer isn't connected to this workspace. (local_device_not_found)";
    let Some(AgentEvent::Error(err)) =
        parse_update(&chunk("agent_message_chunk", text), ctx(true, true))
    else {
        panic!("expected an error");
    };
    assert_eq!(err.code.as_deref(), Some("local_device_not_found"));
    assert_eq!(
        err.message,
        "This computer isn't connected to this workspace."
    );
}

#[test]
fn ordinary_text_stays_text_even_when_it_looks_like_a_code() {
    for t in ["Hel", "lo wor", "Fixed (see notes)", "a (b)", "x\n(y_z)"] {
        assert_eq!(classify_notice(t), None, "{t:?}");
    }
    // Mid-stream text ending like a notice is still reply text.
    let ev = parse_update(
        &chunk("agent_message_chunk", "the flag (dry_run)"),
        ctx(true, true),
    );
    assert_eq!(ev, Some(AgentEvent::Text("the flag (dry_run)".into())));
}

#[test]
fn user_chunks_mid_turn_are_reports_and_otherwise_replays() {
    let c = chunk("user_message_chunk", "Child finished: pwd is /repo");
    assert!(matches!(
        parse_update(&c, ctx(true, false)),
        Some(AgentEvent::Report(_))
    ));
    assert!(matches!(
        parse_update(&c, ctx(false, false)),
        Some(AgentEvent::UserReplay(_))
    ));
    let thought = parse_update(&chunk("agent_thought_chunk", "hm"), ctx(true, false));
    assert_eq!(thought, Some(AgentEvent::Thought("hm".into())));
    let title = json!({"sessionUpdate": "session_info_update", "title": "Run pwd"});
    assert_eq!(
        parse_update(&title, ctx(true, false)),
        Some(AgentEvent::Title("Run pwd".into()))
    );
    let plan = json!({"sessionUpdate": "usage_update", "used": 1, "size": 2});
    assert_eq!(parse_update(&plan, ctx(true, false)), None);
}

#[test]
fn tool_rows_carry_status_output_and_mapped_diffs() {
    let update = json!({
        "sessionUpdate": "tool_call_update", "toolCallId": "tool:3", "title": "bash: pwd",
        "kind": "execute", "status": "completed",
        "content": [
            {"type": "content", "content": {"type": "text", "text": "```\n/home/runner\n```"}},
            {"type": "diff", "path": format!("{CLOUD}/src/main.rs"), "oldText": null, "newText": "fn main() {}"}
        ],
        "locations": [{"path": format!("{CWD}/README.md")}]
    });
    let Some(AgentEvent::Tool(row)) = parse_update(&update, ctx(true, true)) else {
        panic!("expected a tool row");
    };
    assert_eq!((row.id.as_str(), row.kind.as_str()), ("tool:3", "execute"));
    assert_eq!(row.status, ToolStatus::Completed);
    assert!(row.output.unwrap().contains("/home/runner"));
    let diff = &row.diffs[0];
    assert_eq!(diff.old_text, None);
    assert_eq!(diff.path.relative.as_deref(), Some("src/main.rs"));
    assert_eq!(
        diff.path.place,
        Place::Cloud {
            session_id: "0f9c-child".into()
        }
    );
    assert_eq!(row.locations[0].place, Place::Local);
    assert_eq!(row.locations[0].relative.as_deref(), Some("README.md"));
}

#[test]
fn paths_map_to_the_workspace_or_stay_other() {
    let cwd = Path::new(CWD);
    assert_eq!(map_path(CWD, cwd).relative.as_deref(), Some(""));
    assert_eq!(map_path(CLOUD, cwd).relative.as_deref(), Some(""));
    // A sibling folder sharing the prefix is not inside the workspace.
    assert_eq!(map_path(&format!("{CWD}-2/a.rs"), cwd).place, Place::Other);
    // Outside a Session's /repo checkout is not the repository.
    let scratch = "/home/runner/.reason/workspace/sessions/abc/tmp/x";
    assert_eq!(map_path(scratch, cwd).place, Place::Other);
    assert_eq!(map_path("/etc/hosts", cwd).relative, None);
}

/// Recorded from `reason acp` 0.2.683 in a signed-in run on a Mac: after the
/// Session moved to Reason cloud, a write it made in its cloud checkout
/// (`/home/runner/.reason/workspace/sessions/<id>/repo/acp-check.txt`) came
/// back with the chat folder's path. Only the computer metadata tells them apart.
#[test]
fn cloud_write_reported_under_the_chat_folder_is_cloud() {
    let moved = json!({"sessionUpdate": "session_info_update",
        "_meta": {"com.reasonmachines/computer": {"kind": "cloud", "name": "Reason cloud"}}});
    let mac = json!({"sessionUpdate": "session_info_update",
        "_meta": {"com.reasonmachines/computer": {"kind": "headless", "name": "sven m5 max"}}});
    assert_eq!(computer_is_cloud(&moved), Some(true));
    assert_eq!(computer_is_cloud(&mac), Some(false));
    assert_eq!(
        computer_is_cloud(&json!({"sessionUpdate": "session_info_update", "title": "t"})),
        None
    );
    // A computer-only update shows nothing in the chat.
    assert!(parse_update(&moved, ctx(true, false)).is_none());

    let write = json!({
        "sessionUpdate": "tool_call_update", "toolCallId": "tool:w", "title": "write: acp-check.txt",
        "kind": "edit", "status": "completed",
        "content": [{"type": "diff", "path": format!("{CWD}/acp-check.txt"), "oldText": null, "newText": "cloud\n"}],
        "locations": [{"path": format!("{CWD}/acp-check.txt")}]
    });
    let on_cloud = UpdateContext {
        cloud_session: Some("8f9460ff"),
        ..ctx(true, false)
    };
    let Some(AgentEvent::Tool(row)) = parse_update(&write, on_cloud) else {
        panic!("expected a tool row")
    };
    let cloud = Place::Cloud {
        session_id: "8f9460ff".into(),
    };
    assert_eq!(row.diffs[0].path.place, cloud);
    assert_eq!(row.diffs[0].path.relative.as_deref(), Some("acp-check.txt"));
    assert_eq!(row.locations[0].place, cloud);

    // The same row before the move is local, and paths outside the folder
    // keep their own mapping on cloud.
    let Some(AgentEvent::Tool(row)) = parse_update(&write, ctx(true, false)) else {
        panic!()
    };
    assert_eq!(row.locations[0].place, Place::Local);
    let other = json!({"sessionUpdate": "tool_call", "toolCallId": "tool:x", "title": "read",
        "locations": [{"path": "/etc/hosts"}]});
    let Some(AgentEvent::Tool(row)) = parse_update(&other, on_cloud) else {
        panic!()
    };
    assert_eq!(row.locations[0].place, Place::Other);
}

#[test]
fn tool_rows_keep_the_raw_input_and_the_claude_code_tool_name() {
    let update = json!({
        "sessionUpdate": "tool_call", "toolCallId": "toolu_9", "title": "Grep: redirectTo",
        "kind": "search", "status": "pending",
        "rawInput": {"pattern": "redirectTo", "path": "src"},
        "_meta": {"claudeCode": {"toolName": "Grep"}}
    });
    let Some(AgentEvent::Tool(row)) = parse_update(&update, ctx(true, false)) else {
        panic!("expected a tool row");
    };
    assert_eq!(row.tool_name.as_deref(), Some("Grep"));
    assert_eq!(
        row.raw_input,
        Some(json!({"pattern": "redirectTo", "path": "src"}))
    );

    let plain =
        json!({"sessionUpdate": "tool_call", "toolCallId": "t", "_meta": {"toolName": "bash"}});
    let Some(AgentEvent::Tool(row)) = parse_update(&plain, ctx(true, false)) else {
        panic!("expected a tool row");
    };
    assert_eq!(row.tool_name.as_deref(), Some("bash"));
    assert_eq!(row.raw_input, None, "a missing rawInput stays None");
}
