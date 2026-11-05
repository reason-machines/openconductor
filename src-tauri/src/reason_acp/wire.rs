//! Provider events as the JSON the chat UI receives.
//!
//! The Tauri layer emits one `reason-chat-event` per [`ProviderEvent`] with
//! [`event_json`] as its payload. Every payload has `chatId` and a `type`;
//! field names are camelCase like the rest of the app's commands.

use super::provider::{ProviderEvent, SessionInfo, TurnEnd};
use super::updates::{AgentEvent, Diff, MappedPath, Place, ToolRow, ToolStatus};
use serde_json::{json, Value};

/// Name of the Tauri event the provider's events are emitted as.
pub const EVENT: &str = "reason-chat-event";

pub fn event_json(chat: &str, ev: &ProviderEvent) -> Value {
    let mut v = match ev {
        ProviderEvent::SessionStarted { session_id } => {
            json!({ "type": "sessionStarted", "sessionId": session_id })
        }
        ProviderEvent::TurnEnded(end) => json!({ "type": "turnEnded", "end": turn_end_json(end) }),
        ProviderEvent::Agent(a) => agent_json(a),
        ProviderEvent::Notice(t) => json!({ "type": "notice", "text": t }),
    };
    v["chatId"] = json!(chat);
    v
}

pub fn turn_end_json(end: &TurnEnd) -> Value {
    match end {
        TurnEnd::Completed => json!({ "outcome": "completed" }),
        TurnEnd::Cancelled => json!({ "outcome": "cancelled" }),
        TurnEnd::Superseded => json!({ "outcome": "superseded" }),
        TurnEnd::Failed(message) => json!({ "outcome": "failed", "message": message }),
    }
}

pub fn session_json(s: &SessionInfo) -> Value {
    json!({ "sessionId": s.session_id, "title": s.title, "updatedAt": s.updated_at })
}

fn agent_json(a: &AgentEvent) -> Value {
    match a {
        AgentEvent::Text(t) => json!({ "type": "text", "text": t }),
        AgentEvent::Thought(t) => json!({ "type": "thought", "text": t }),
        AgentEvent::Title(t) => json!({ "type": "title", "title": t }),
        AgentEvent::Report(t) => json!({ "type": "report", "text": t }),
        AgentEvent::UserReplay(t) => json!({ "type": "userReplay", "text": t }),
        AgentEvent::Error(e) => json!({
            "type": "error", "code": e.code, "status": e.status, "message": e.message,
        }),
        AgentEvent::Tool(row) => tool_json(row),
    }
}

fn tool_json(r: &ToolRow) -> Value {
    let status = match r.status {
        ToolStatus::Pending => "pending",
        ToolStatus::Running => "running",
        ToolStatus::Completed => "completed",
        ToolStatus::Failed => "failed",
    };
    json!({
        "type": "tool",
        "id": r.id,
        "title": r.title,
        "kind": r.kind,
        "status": status,
        "output": r.output,
        "diffs": r.diffs.iter().map(diff_json).collect::<Vec<_>>(),
        "locations": r.locations.iter().map(path_json).collect::<Vec<_>>(),
    })
}

fn diff_json(d: &Diff) -> Value {
    json!({ "path": path_json(&d.path), "oldText": d.old_text, "newText": d.new_text })
}

/// `place` is `local`, `cloud` (with the cloud `sessionId`) or `other`.
pub fn path_json(p: &MappedPath) -> Value {
    let mut v = json!({ "raw": p.raw, "relative": p.relative });
    match &p.place {
        Place::Local => v["place"] = json!("local"),
        Place::Cloud { session_id } => {
            v["place"] = json!("cloud");
            v["sessionId"] = json!(session_id);
        }
        Place::Other => v["place"] = json!("other"),
    }
    v
}
