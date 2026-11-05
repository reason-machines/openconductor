use super::*;
use serde_json::json;

fn msg(id: &str, role: Role, blocks: Vec<Block>) -> ChatMessage {
    ChatMessage {
        id: id.into(),
        session_id: "s1".into(),
        turn_id: "t1".into(),
        role,
        created_at: "2026-11-05T10:00:00.000Z".into(),
        model: None,
        cancelled_at: None,
        sender_session_id: None,
        sender_api_key_name: None,
        blocks,
    }
}

fn delta(message_id: &str, block_index: usize, text: &str) -> ChatEvent {
    ChatEvent::TextDelta {
        session_id: "s1".into(),
        message_id: message_id.into(),
        block_index,
        delta: text.into(),
    }
}

fn status(turn: &str, status: TurnStatus) -> ChatEvent {
    ChatEvent::TurnStatus {
        session_id: "s1".into(),
        turn_id: turn.into(),
        status,
        error: None,
    }
}

// ---- wire format (the contract with src/features/chat/types.ts) ----

#[test]
fn message_serializes_camel_case_and_omits_absent_optionals() {
    let m = msg(
        "m1",
        Role::Assistant,
        vec![
            Block::text("hi"),
            Block::Thinking { text: "hmm".into() },
            Block::ToolUse {
                id: "tu1".into(),
                name: "Read".into(),
                input: json!({"file_path": "a.rs"}),
            },
            Block::ToolResult {
                tool_use_id: "tu1".into(),
                content: "fn main() {}".into(),
                is_error: false,
            },
        ],
    );
    assert_eq!(
        serde_json::to_value(&m).unwrap(),
        json!({
            "id": "m1",
            "sessionId": "s1",
            "turnId": "t1",
            "role": "assistant",
            "createdAt": "2026-11-05T10:00:00.000Z",
            "blocks": [
                {"type": "text", "text": "hi"},
                {"type": "thinking", "text": "hmm"},
                {"type": "tool_use", "id": "tu1", "name": "Read", "input": {"file_path": "a.rs"}},
                {"type": "tool_result", "toolUseId": "tu1", "content": "fn main() {}", "isError": false}
            ]
        })
    );
}

#[test]
fn message_with_model_and_cancel_round_trips() {
    let mut m = msg("m1", Role::User, vec![Block::text("x")]);
    m.model = Some("opus".into());
    m.cancelled_at = Some("2026-11-05T10:00:01.000Z".into());
    let v = serde_json::to_value(&m).unwrap();
    assert_eq!(v["model"], "opus");
    assert_eq!(v["cancelledAt"], "2026-11-05T10:00:01.000Z");
    let back: ChatMessage = serde_json::from_value(v).unwrap();
    assert_eq!(back, m);
}

#[test]
fn tool_result_is_error_defaults_to_false() {
    let b: Block =
        serde_json::from_value(json!({"type": "tool_result", "toolUseId": "a", "content": ""}))
            .unwrap();
    assert_eq!(
        b,
        Block::ToolResult {
            tool_use_id: "a".into(),
            content: String::new(),
            is_error: false
        }
    );
}

#[test]
fn events_serialize_with_snake_case_tags() {
    assert_eq!(
        serde_json::to_value(delta("m1", 0, "a")).unwrap(),
        json!({"type": "text_delta", "sessionId": "s1", "messageId": "m1", "blockIndex": 0, "delta": "a"})
    );
    assert_eq!(
        serde_json::to_value(status("t1", TurnStatus::Running)).unwrap(),
        json!({"type": "turn_status", "sessionId": "s1", "turnId": "t1", "status": "running"})
    );
    let failed = ChatEvent::TurnStatus {
        session_id: "s1".into(),
        turn_id: "t1".into(),
        status: TurnStatus::Failed,
        error: Some("boom".into()),
    };
    assert_eq!(serde_json::to_value(&failed).unwrap()["error"], "boom");
    let upsert = ChatEvent::Upsert {
        message: msg("m1", Role::User, vec![]),
    };
    let v = serde_json::to_value(&upsert).unwrap();
    assert_eq!(v["type"], "upsert");
    assert_eq!(v["message"]["id"], "m1");
    assert_eq!(serde_json::from_value::<ChatEvent>(v).unwrap(), upsert);
}

#[test]
fn rfc3339_formatting() {
    assert_eq!(format_rfc3339_millis(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(
        format_rfc3339_millis(1_762_337_700_123),
        "2025-11-05T10:15:00.123Z"
    );
    // Leap day.
    assert_eq!(
        format_rfc3339_millis(1_709_164_800_000),
        "2024-02-29T00:00:00.000Z"
    );
    let now = now_rfc3339();
    assert_eq!(now.len(), 24, "{now}");
    assert!(now.ends_with('Z'));
}

#[test]
fn plain_text_joins_text_blocks_only() {
    let m = msg(
        "m1",
        Role::Assistant,
        vec![
            Block::text("one"),
            Block::Thinking {
                text: "skip".into(),
            },
            Block::ToolUse {
                id: "t".into(),
                name: "Bash".into(),
                input: json!({}),
            },
            Block::text("two"),
        ],
    );
    assert_eq!(m.plain_text(), "one\n\ntwo");
}

// ---- transcript reducer ----

#[test]
fn upsert_appends_then_replaces_in_place() {
    let mut t = Transcript::new("s1");
    t.apply(&ChatEvent::Upsert {
        message: msg("a", Role::User, vec![Block::text("1")]),
    })
    .unwrap();
    t.apply(&ChatEvent::Upsert {
        message: msg("b", Role::Assistant, vec![]),
    })
    .unwrap();
    t.apply(&ChatEvent::Upsert {
        message: msg("a", Role::User, vec![Block::text("edited")]),
    })
    .unwrap();
    let ids: Vec<_> = t.messages().iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["a", "b"]);
    assert_eq!(t.get("a").unwrap().plain_text(), "edited");
}

#[test]
fn text_delta_starts_and_grows_blocks() {
    let mut t = Transcript::new("s1");
    t.apply(&ChatEvent::Upsert {
        message: msg("a", Role::Assistant, vec![]),
    })
    .unwrap();
    t.apply(&delta("a", 0, "Hel")).unwrap();
    t.apply(&delta("a", 0, "lo")).unwrap();
    t.apply(&delta("a", 1, "second")).unwrap();
    assert_eq!(
        t.get("a").unwrap().blocks,
        vec![Block::text("Hello"), Block::text("second")]
    );
}

#[test]
fn text_delta_grows_thinking_blocks() {
    let mut t = Transcript::new("s1");
    t.apply(&ChatEvent::Upsert {
        message: msg(
            "a",
            Role::Assistant,
            vec![Block::Thinking {
                text: String::new(),
            }],
        ),
    })
    .unwrap();
    t.apply(&delta("a", 0, "pondering")).unwrap();
    assert_eq!(
        t.get("a").unwrap().blocks,
        vec![Block::Thinking {
            text: "pondering".into()
        }]
    );
}

#[test]
fn bad_deltas_are_rejected_without_changes() {
    let mut t = Transcript::new("s1");
    assert_eq!(
        t.apply(&delta("nope", 0, "x")),
        Err(ApplyError::UnknownMessage("nope".into()))
    );
    t.apply(&ChatEvent::Upsert {
        message: msg(
            "a",
            Role::Assistant,
            vec![Block::ToolUse {
                id: "t".into(),
                name: "Bash".into(),
                input: json!({}),
            }],
        ),
    })
    .unwrap();
    assert_eq!(
        t.apply(&delta("a", 3, "x")),
        Err(ApplyError::BlockIndexOutOfRange {
            message_id: "a".into(),
            index: 3,
            len: 1
        })
    );
    assert_eq!(
        t.apply(&delta("a", 0, "x")),
        Err(ApplyError::NotATextBlock {
            message_id: "a".into(),
            index: 0
        })
    );
    assert_eq!(t.get("a").unwrap().blocks.len(), 1);
}

#[test]
fn events_for_another_session_are_rejected() {
    let mut t = Transcript::new("other");
    let err = t.apply(&status("t1", TurnStatus::Running)).unwrap_err();
    assert!(matches!(err, ApplyError::WrongSession { .. }));
    assert!(err.to_string().contains("other"));
}

#[test]
fn turn_status_tracks_the_active_turn() {
    let mut t = Transcript::new("s1");
    assert_eq!(t.active_turn(), None);
    t.apply(&status("t1", TurnStatus::Running)).unwrap();
    assert_eq!(t.active_turn(), Some("t1"));
    // A late terminal status for an older turn does not clear the newer one.
    t.apply(&status("t2", TurnStatus::Running)).unwrap();
    t.apply(&status("t1", TurnStatus::Completed)).unwrap();
    assert_eq!(t.active_turn(), Some("t2"));
    t.apply(&status("t2", TurnStatus::Cancelled)).unwrap();
    assert_eq!(t.active_turn(), None);
    assert_eq!(t.turn_status("t1"), Some(TurnStatus::Completed));
    assert_eq!(t.turn_status("t2"), Some(TurnStatus::Cancelled));
    assert!(TurnStatus::Failed.is_terminal());
    assert!(!TurnStatus::Running.is_terminal());
}

// ---- sender attribution (session_messages.sender_session_id / sender_api_key_name) ----

#[test]
fn sender_fields_use_camel_case_and_are_omitted_when_absent() {
    let plain = serde_json::to_value(msg("m1", Role::User, vec![])).unwrap();
    assert!(plain.get("senderSessionId").is_none());
    assert!(plain.get("senderApiKeyName").is_none());

    let mut m = msg("m2", Role::User, vec![Block::text("done: PR #7 merged")]);
    m.sender_session_id = Some("child-1".into());
    m.sender_api_key_name = Some("ci".into());
    let v = serde_json::to_value(&m).unwrap();
    assert_eq!(v["senderSessionId"], "child-1");
    assert_eq!(v["senderApiKeyName"], "ci");
    assert_eq!(serde_json::from_value::<ChatMessage>(v).unwrap(), m);
}

#[test]
fn origin_tells_user_input_from_session_and_api_reports() {
    let mut m = msg("m1", Role::User, vec![]);
    assert_eq!(m.origin(), MessageOrigin::User);
    m.sender_api_key_name = Some("ci".into());
    assert_eq!(m.origin(), MessageOrigin::ApiKey("ci"));
    m.sender_session_id = Some("child-1".into());
    assert_eq!(m.origin(), MessageOrigin::Session("child-1"));
    assert_eq!(
        msg("a", Role::Assistant, vec![]).origin(),
        MessageOrigin::Assistant
    );
    assert_eq!(
        msg("s", Role::System, vec![]).origin(),
        MessageOrigin::System
    );
}

#[test]
fn a_session_report_mid_turn_does_not_touch_the_active_turn() {
    let mut t = Transcript::new("s1");
    t.apply(&status("t1", TurnStatus::Running)).unwrap();
    let mut report = msg("r1", Role::User, vec![Block::text("child finished")]);
    report.sender_session_id = Some("child-1".into());
    t.apply(&ChatEvent::Upsert { message: report }).unwrap();
    assert_eq!(t.active_turn(), Some("t1"));
    assert_eq!(t.turn_status("t1"), Some(TurnStatus::Running));
}
