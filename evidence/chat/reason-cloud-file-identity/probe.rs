#![allow(dead_code)]
use serde_json::{json, Value};
use std::{collections::HashMap, io::{self, Read}, path::PathBuf, sync::{Arc, Mutex}};
#[path="/home/runner/.reason/workspace/sessions/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b/repo/.ara-state/tmp/reason-cloud-file-identity/src-tauri/src/reason_acp/updates.rs"] mod updates;
mod wire {
use super::updates::{AgentEvent, Diff, MappedPath, Place, ToolRow, ToolStatus};
use serde_json::{json, Value};
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
    let mut v = json!({
        "type": "tool",
        "id": r.id,
        "title": r.title,
        "kind": r.kind,
        "status": status,
        "output": r.output,
        "diffs": r.diffs.iter().map(diff_json).collect::<Vec<_>>(),
        "locations": r.locations.iter().map(path_json).collect::<Vec<_>>(),
        "toolName": r.tool_name,
        "rawInput": r.raw_input,
    });
    if let Some(content) = &r.raw_result {
        v["rawResult"] = content.clone();
    }
    v
}

fn diff_json(d: &Diff) -> Value {
    json!({ "path": path_json(&d.path), "oldText": d.old_text, "newText": d.new_text })
}

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
pub fn fixture_event_json(chat: &str, event: &AgentEvent) -> Value {
    let mut v = agent_json(event);
    v["chatId"] = json!(chat);
    v
}
pub fn fixture_session_json(chat: &str, session_id: &str) -> Value {
    let mut v = json!({ "type": "sessionStarted", "sessionId": session_id });
    v["chatId"] = json!(chat);
    v
}
}
use updates::{computer_is_cloud, parse_update, AgentEvent, ReasonError, UpdateContext};
// Inert harness storage contains exactly the fields this production routing arm uses.
#[derive(Default)] struct FixtureTurn { in_text: bool, error: Option<ReasonError> }
struct FixtureChat { cwd: PathBuf, session_id: Option<String>, on_cloud: bool, turn: Option<FixtureTurn> }
#[derive(Default)] struct FixtureShared { by_session: HashMap<String, String>, chats: HashMap<String, FixtureChat> }
fn route_notification(shared: Arc<Mutex<FixtureShared>>, params: &Value) -> Option<(String, AgentEvent)> {
            let routed = {
                let mut s = shared.lock().unwrap();
                let sid = params["sessionId"].as_str().unwrap_or_default();
                let chat_id = s.by_session.get(sid).cloned();
                chat_id.and_then(|id| {
                    let c = s.chats.get_mut(&id)?;
                    if let Some(cloud) = computer_is_cloud(&params["update"]) {
                        c.on_cloud = cloud;
                    }
                    let ctx = UpdateContext {
                        cwd: &c.cwd,
                        turn_running: c.turn.is_some(),
                        in_text: c.turn.as_ref().is_some_and(|t| t.in_text),
                        cloud_session: c.session_id.as_deref().filter(|_| c.on_cloud),
                    };
                    let ev = parse_update(&params["update"], ctx)?;
                    if let Some(t) = &mut c.turn {
                        t.in_text = matches!(ev, AgentEvent::Text(_));
                        if let AgentEvent::Error(e) = &ev {
                            t.error = Some(e.clone());
                        }
                    }
                    Some((id, ev))
                })
            };
    routed
}
fn main() {
    let mut input = String::new(); io::stdin().read_to_string(&mut input).unwrap();
    let v: Value = serde_json::from_str(&input).unwrap();
    let chat = v["chatId"].as_str().unwrap(); let session = v["sessionId"].as_str().unwrap();
    let mut s = FixtureShared::default();
    s.by_session.insert(session.into(), chat.into());
    s.chats.insert(chat.into(), FixtureChat { cwd: v["cwd"].as_str().unwrap().into(), session_id: Some(session.into()), on_cloud: false, turn: Some(FixtureTurn::default()) });
    let shared = Arc::new(Mutex::new(s));
    let mut events = vec![wire::fixture_session_json(chat, session)];
    for c in v["cases"].as_array().unwrap() {
        for params in c["notifications"].as_array().unwrap() {
            if let Some((chat, event)) = route_notification(Arc::clone(&shared), params) {
                events.push(wire::fixture_event_json(&chat, &event));
            }
        }
    }
    // Unknown-session notification must not cross into the owned conversation.
    let unknown = json!({"sessionId":"unregistered-fixture-session","update":{"sessionUpdate":"tool_call","toolCallId":"must-not-route","title":"Read","kind":"read","status":"completed","locations":[{"path":"/fixture/no-route"}]}});
    if let Some((chat, event)) = route_notification(shared, &unknown) {
        events.push(wire::fixture_event_json(&chat, &event));
    }
    println!("{}", serde_json::to_string(&events).unwrap());
}
