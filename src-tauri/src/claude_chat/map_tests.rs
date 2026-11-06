use serde_json::{json, Value};

use super::map::{tool_kind, TurnMapper};
use crate::agent::claude_stream::ClaudeEvent;
use crate::reason_acp::provider::{ProviderEvent, TurnEnd};
use crate::reason_acp::updates::{AgentEvent, Place, ToolStatus};

const CWD: &str = "/Users/sven/oc-e2e/testrepo";

fn ev(v: Value) -> ClaudeEvent {
    ClaudeEvent::parse(&v.to_string()).unwrap()
}

fn result(is_error: bool, text: &str) -> ClaudeEvent {
    ev(
        json!({"type": "result", "subtype": "success", "is_error": is_error,
              "result": text, "session_id": "s1"}),
    )
}

fn texts(out: &[ProviderEvent]) -> Vec<String> {
    out.iter()
        .filter_map(|e| match e {
            ProviderEvent::Agent(AgentEvent::Text(t)) => Some(t.clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn init_announces_the_session_once() {
    let mut m = TurnMapper::new(CWD, None);
    let init = ev(json!({"type": "system", "subtype": "init", "session_id": "s1"}));
    assert_eq!(
        m.map(&init),
        vec![ProviderEvent::SessionStarted {
            session_id: "s1".into()
        }]
    );
    assert!(m.map(&init).is_empty());
    assert_eq!(m.session_id(), Some("s1"));

    // A resumed session is already known.
    let mut resumed = TurnMapper::new(CWD, Some("s1".into()));
    assert!(resumed.map(&init).is_empty());
}

#[test]
fn a_turn_with_a_bash_tool_and_text() {
    let mut m = TurnMapper::new(CWD, None);
    m.turn_started();
    let tool = ev(
        json!({"type": "assistant", "session_id": "s1", "message": {"id": "m1", "role": "assistant",
        "content": [{"type": "tool_use", "id": "toolu_1", "name": "Bash",
                     "input": {"command": "pwd", "description": "Print working directory"}}]}}),
    );
    let out = m.map(&tool);
    let [ProviderEvent::Agent(AgentEvent::Tool(row))] = out.as_slice() else {
        panic!("{out:?}")
    };
    assert_eq!(row.id, "toolu_1");
    assert_eq!(row.title, "Bash: pwd");
    assert_eq!(row.kind, "execute");
    assert_eq!(row.status, ToolStatus::Running);

    let done = ev(
        json!({"type": "user", "session_id": "s1", "message": {"role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": CWD, "is_error": false}]}}),
    );
    let out = m.map(&done);
    let [ProviderEvent::Agent(AgentEvent::Tool(row))] = out.as_slice() else {
        panic!("{out:?}")
    };
    assert_eq!(row.status, ToolStatus::Completed);
    assert_eq!(row.output.as_deref(), Some(CWD));
    assert_eq!(row.title, "Bash: pwd", "the result keeps the row's title");

    let reply = ev(
        json!({"type": "assistant", "session_id": "s1", "message": {"id": "m2",
        "content": [{"type": "text", "text": CWD}]}}),
    );
    assert_eq!(texts(&m.map(&reply)), [CWD]);
    assert_eq!(
        m.map(&result(false, CWD)),
        vec![ProviderEvent::TurnEnded(TurnEnd::Completed)]
    );
}

#[test]
fn text_from_a_second_message_starts_a_paragraph() {
    let mut m = TurnMapper::new(CWD, None);
    let a = ev(
        json!({"type": "assistant", "message": {"id": "m1", "content": [{"type": "text", "text": "One."}]}}),
    );
    let a2 = ev(
        json!({"type": "assistant", "message": {"id": "m1", "content": [{"type": "text", "text": " More."}]}}),
    );
    let b = ev(
        json!({"type": "assistant", "message": {"id": "m2", "content": [{"type": "text", "text": "Two."}]}}),
    );
    assert_eq!(texts(&m.map(&a)), ["One."]);
    assert_eq!(texts(&m.map(&a2)), [" More."]);
    assert_eq!(texts(&m.map(&b)), ["\n\nTwo."]);
}

#[test]
fn file_tools_carry_workspace_paths_and_diffs() {
    let mut m = TurnMapper::new(CWD, None);
    let write = ev(
        json!({"type": "assistant", "message": {"id": "m1", "content": [
        {"type": "tool_use", "id": "t1", "name": "Write",
         "input": {"file_path": format!("{CWD}/note.txt"), "content": "hello\n"}},
        {"type": "tool_use", "id": "t2", "name": "Edit",
         "input": {"file_path": "src/a.rs", "old_string": "a", "new_string": "b"}},
        {"type": "tool_use", "id": "t3", "name": "Read", "input": {"file_path": "/etc/hosts"}}]}}),
    );
    let rows: Vec<_> = m
        .map(&write)
        .into_iter()
        .map(|e| match e {
            ProviderEvent::Agent(AgentEvent::Tool(r)) => r,
            other => panic!("{other:?}"),
        })
        .collect();
    assert_eq!(rows[0].title, "Write: note.txt");
    assert_eq!(rows[0].kind, "edit");
    assert_eq!(rows[0].locations[0].place, Place::Local);
    assert_eq!(rows[0].locations[0].relative.as_deref(), Some("note.txt"));
    assert_eq!(rows[0].diffs[0].old_text, None);
    assert_eq!(rows[0].diffs[0].new_text, "hello\n");
    assert_eq!(
        rows[1].title, "Edit: src/a.rs",
        "relative paths resolve against the workspace"
    );
    assert_eq!(rows[1].diffs[0].old_text.as_deref(), Some("a"));
    assert_eq!(rows[2].title, "Read: /etc/hosts");
    assert_eq!(rows[2].locations[0].place, Place::Other);
}

#[test]
fn failed_tool_results_and_block_content() {
    let mut m = TurnMapper::new(CWD, None);
    m.map(&ev(json!({"type": "assistant", "message": {"id": "m1", "content": [
        {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "false\necho two"}}]}})));
    let out = m.map(&ev(json!({"type": "user", "message": {"content": [
        {"type": "tool_result", "tool_use_id": "t1", "is_error": true,
         "content": [{"type": "text", "text": "Exit code 1"}]},
        {"type": "tool_result", "tool_use_id": "unknown", "content": "x"}]}})));
    let [ProviderEvent::Agent(AgentEvent::Tool(row))] = out.as_slice() else {
        panic!("{out:?}")
    };
    assert_eq!(
        row.title, "Bash: false",
        "multi-line commands show their first line"
    );
    assert_eq!(row.status, ToolStatus::Failed);
    assert_eq!(row.output.as_deref(), Some("Exit code 1"));
}

/// The exact lines the signed-in CLI printed on sven m5 max when the
/// subscription's weekly limit was reached (evidence/claude-code/).
#[test]
fn a_usage_limit_fails_the_turn_instead_of_replying() {
    let mut m = TurnMapper::new(CWD, None);
    let limit = "You've hit your weekly limit \u{b7} resets Nov 11 at 1am (America/Los_Angeles)";
    let out = m.map(&ev(
        json!({"type": "assistant", "message": {"id": "8c3f", "model": "<synthetic>",
        "role": "assistant", "content": [{"type": "text", "text": limit}]},
        "session_id": "7439", "error": "rate_limit", "is_api_error_message": true,
        "api_error_status": 429, "api_error": "usage_limit_reached"}),
    ));
    let [ProviderEvent::Agent(AgentEvent::Error(e))] = out.as_slice() else {
        panic!("{out:?}")
    };
    assert_eq!(e.code.as_deref(), Some("usage_limit_reached"));
    assert_eq!(e.status, Some(429));
    assert_eq!(e.message, limit);
    assert!(texts(&out).is_empty());
    assert_eq!(
        m.map(&result(true, limit)),
        vec![ProviderEvent::TurnEnded(TurnEnd::Failed(limit.into()))]
    );
}

#[test]
fn a_stopped_turn_ends_cancelled_and_the_next_one_is_normal() {
    let mut m = TurnMapper::new(CWD, None);
    m.stop_requested();
    let interrupted = ev(
        json!({"type": "result", "subtype": "error_during_execution",
                                "is_error": true, "session_id": "s1"}),
    );
    assert_eq!(
        m.map(&interrupted),
        vec![ProviderEvent::TurnEnded(TurnEnd::Cancelled)]
    );
    assert_eq!(
        m.map(&interrupted),
        vec![ProviderEvent::TurnEnded(TurnEnd::Failed(
            "Claude Code ended the turn: error_during_execution".into()
        ))]
    );
}

#[test]
fn tool_kinds() {
    for (name, kind) in [
        ("Bash", "execute"),
        ("Read", "read"),
        ("MultiEdit", "edit"),
        ("Glob", "search"),
        ("WebFetch", "fetch"),
        ("Task", "think"),
        ("mcp__x__y", "other"),
    ] {
        assert_eq!(tool_kind(name), kind, "{name}");
    }
}

#[test]
fn tool_rows_carry_the_tool_name_and_raw_input() {
    let mut m = TurnMapper::new(CWD, None);
    m.turn_started();
    let input = json!({"pattern": "redirectTo", "path": "src"});
    let tool = ev(
        json!({"type": "assistant", "session_id": "s1", "message": {"id": "m1", "role": "assistant",
        "content": [{"type": "tool_use", "id": "toolu_g", "name": "Grep", "input": input}]}}),
    );
    let out = m.map(&tool);
    let [ProviderEvent::Agent(AgentEvent::Tool(row))] = out.as_slice() else {
        panic!("{out:?}")
    };
    assert_eq!(row.tool_name.as_deref(), Some("Grep"));
    assert_eq!(row.raw_input.as_ref(), Some(&input));

    let done = ev(
        json!({"type": "user", "session_id": "s1", "message": {"role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "toolu_g", "content": "src/lib/auth.ts:42", "is_error": false}]}}),
    );
    let out = m.map(&done);
    let [ProviderEvent::Agent(AgentEvent::Tool(row))] = out.as_slice() else {
        panic!("{out:?}")
    };
    assert_eq!(row.status, ToolStatus::Completed);
    assert_eq!(
        row.tool_name.as_deref(),
        Some("Grep"),
        "the result keeps the tool name"
    );
    assert_eq!(
        row.raw_input.as_ref(),
        Some(&input),
        "the result keeps the raw input"
    );
}
