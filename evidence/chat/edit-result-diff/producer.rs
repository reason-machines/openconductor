use agent::claude_stream::ClaudeEvent;
use reason_acp::wire::event_json;
use serde_json::{json, Value};

fn main() {
    let path = std::env::args().nth(1).expect("fixture path");
    let fixture: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let cases: Vec<Value> = fixture["cases"].as_array().unwrap().iter().map(|case| {
        let mut mapper = mapper::TurnMapper::new("/repo", None);
        let input = case.get("input").unwrap_or(&fixture["default_input"]);
        let events = [
            json!({"type":"assistant","message":{"id":"message","content":[{
                "type":"tool_use","id":case["id"],"name":"Edit","input":input
            }]}}),
            json!({"type":"user","message":{"content":[{
                "type":"tool_result","tool_use_id":case["id"],"content":case["content"],
                "is_error":case["is_error"].as_bool().unwrap_or(false)
            }]}}),
        ];
        let payloads: Vec<Value> = events.iter().flat_map(|event| {
            mapper.map(&ClaudeEvent::parse(&event.to_string()).unwrap())
        }).map(|event| event_json("edit-result-chat", &event)).collect();
        json!({"id":case["id"],"payloads":payloads})
    }).collect();
    println!("{}", serde_json::to_string(&cases).unwrap());
}
