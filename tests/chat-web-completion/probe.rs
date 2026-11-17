#![allow(dead_code)]
// Qualification-only driver: parse synthetic app-server notifications through
// the complete, unchanged production Rust modules. Never starts a provider.
#[path = "agent/secret.rs"] mod secret;
#[path = "agent/env.rs"] mod env;
#[path = "agent/codex_cli.rs"] mod codex_cli;
#[path = "agent/codex_rpc.rs"] mod codex_rpc;
#[path = "agent/codex_consent.rs"] mod codex_consent;
#[path = "agent/codex_events.rs"] mod codex_events;
#[path = "agent/codex_wire.rs"] mod codex_wire;

use std::io::{self, Read};
use serde_json::{json, Value};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read fixture input");
    let fixture: Value = serde_json::from_str(&input).expect("parse fixture cases");
    let output: Vec<Value> = fixture["cases"].as_array().expect("cases array").iter().map(|case| {
        let notification = json!({
            "method": case["method"],
            "params": { "item": case["item"], "threadId": "fixture-thread", "turnId": "fixture-turn" }
        });
        let parsed = codex_events::ServerMessage::parse(&notification.to_string()).expect("actual server notification parser");
        json!({ "id": case["id"], "payloads": codex_wire::payloads(&parsed) })
    }).collect();
    println!("{}", serde_json::to_string(&output).expect("serialize actual payloads"));
}
