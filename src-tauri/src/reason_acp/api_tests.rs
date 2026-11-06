//! Routines' `reason call`s against `tools/reason-acp/fake_reason_acp.py`,
//! which answers the Loop operations in the shapes `reason tools describe`
//! documents. The envelope parsing itself is tested in `cloud_tests`.

use super::api::OPERATIONS;
use super::cli::LaunchConfig;
use serde_json::{json, Value};
use std::path::PathBuf;

const MAIN: &str = "11111111-1111-4111-8111-111111111111";

fn fake() -> PathBuf {
    let root = std::env::var("REASON_ACP_REPO_ROOT")
        .unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/..").into());
    PathBuf::from(root).join("tools/reason-acp/fake_reason_acp.py")
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("reason-acp-api-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn calls(dir: &std::path::Path) -> Vec<Value> {
    std::fs::read_to_string(dir.join("fake-reason-calls.log"))
        .unwrap_or_default()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

#[test]
fn only_listed_operations_run() {
    let dir = scratch("refuse");
    let cfg = LaunchConfig::new(fake()).unwrap();
    for op in [
        "deleteSession",
        "createSession",
        "inviteMember",
        "writeMemoryFile",
        "call",
    ] {
        assert!(!OPERATIONS.contains(&op));
        let e = cfg.api_call(&dir, op, &json!({})).unwrap_err();
        assert_eq!(e.code, "operation_not_allowed", "{op}");
    }
    assert!(
        calls(&dir).is_empty(),
        "a refused operation never runs reason"
    );
}

#[test]
fn loop_lifecycle_through_reason_call() {
    let dir = scratch("lifecycle");
    let cfg = LaunchConfig::new(fake())
        .unwrap()
        .workspace("ws-b")
        .unwrap();
    let reasons = cfg.api_call(&dir, "listReasons", &json!({})).unwrap();
    assert_eq!(reasons["items"][0]["id"], MAIN);
    assert_eq!(reasons["items"][0]["main"], true);

    let path = json!({ "reasonId": MAIN });
    let created = cfg
        .api_call(
            &dir,
            "createReasonLoop",
            &json!({ "path": path, "body": {
                "name": "Weekly report", "prompt": "Recap the week.", "timezone": "Europe/Oslo",
                "wake_on": [{ "schedule": "0 17 * * 5" }, { "webhook": {} }]
            }}),
        )
        .unwrap();
    let id = created["loop"]["id"].as_str().unwrap().to_string();
    assert_eq!(created["loop"]["schedule"]["timezone"], "Europe/Oslo");
    assert!(created["url"].as_str().unwrap().starts_with("https://"));
    assert!(
        created["key"].is_string(),
        "the webhook key comes back once, on create"
    );

    let loop_path = json!({ "reasonId": MAIN, "loopId": id });
    let paused = cfg
        .api_call(
            &dir,
            "updateReasonLoop",
            &json!({ "path": loop_path, "body": { "enabled": false } }),
        )
        .unwrap();
    assert_eq!(paused["loop"]["status"], "paused");
    let refused = cfg
        .api_call(&dir, "runReasonLoop", &json!({ "path": loop_path }))
        .unwrap_err();
    assert_eq!(refused.code, "routine_not_active");

    cfg.api_call(
        &dir,
        "updateReasonLoop",
        &json!({ "path": loop_path, "body": { "enabled": true } }),
    )
    .unwrap();
    let ran = cfg
        .api_call(&dir, "runReasonLoop", &json!({ "path": loop_path }))
        .unwrap();
    assert_eq!(ran["loop"]["run_count"], 1);

    cfg.api_call(&dir, "deleteReasonLoop", &json!({ "path": loop_path }))
        .unwrap();
    let gone = cfg
        .api_call(&dir, "getReasonLoop", &json!({ "path": loop_path }))
        .unwrap_err();
    assert_eq!(gone.code, "loop_not_found");

    // Every call ran in the pinned workspace, with its input on stdin.
    let log = calls(&dir);
    assert_eq!(log.len(), 8);
    assert!(log.iter().all(|c| c["workspace"] == "ws-b"));
    assert_eq!(log[1]["input"]["body"]["name"], "Weekly report");
}

#[test]
fn signed_out_call_reports_authentication_required() {
    let dir = scratch("signed-out");
    std::fs::write(dir.join("fake-reason-signed-out"), "").unwrap();
    let cfg = LaunchConfig::new(fake()).unwrap();
    let e = cfg.api_call(&dir, "listReasons", &json!({})).unwrap_err();
    assert_eq!(e.code, "authentication_required");
}

#[test]
fn organization_environment_and_mcp_through_reason_call() {
    let dir = scratch("org");
    let cfg = LaunchConfig::new(fake()).unwrap();
    let names = |scope: &str| -> Vec<String> {
        let out = cfg
            .api_call(&dir, "listSecrets", &json!({ "query": { "scope": scope } }))
            .unwrap();
        out["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["name"].as_str().unwrap().to_string())
            .collect()
    };
    assert_eq!(names("organization"), vec!["NPM_TOKEN"]);
    assert!(names("user").is_empty());

    cfg.api_call(
        &dir,
        "setSecret",
        &json!({ "body": { "name": "API_URL", "value": "https://api.example.test", "scope": "user" } }),
    )
    .unwrap();
    assert_eq!(names("user"), vec!["API_URL"]);
    let listed = cfg
        .api_call(
            &dir,
            "listSecrets",
            &json!({ "query": { "scope": "user" } }),
        )
        .unwrap();
    assert!(
        !listed.to_string().contains("api.example.test"),
        "a listed secret never carries its value"
    );
    cfg.api_call(
        &dir,
        "deleteSecret",
        &json!({ "path": { "secretId": "API_URL" }, "query": { "scope": "user" } }),
    )
    .unwrap();
    assert!(names("user").is_empty());

    let created = cfg
        .api_call(
            &dir,
            "createMcpServer",
            &json!({ "body": { "name": "Linear", "transport": "http", "url": "https://mcp.linear.app/mcp" } }),
        )
        .unwrap();
    let id = created["id"].as_str().unwrap().to_string();
    let list = cfg.api_call(&dir, "listMcpServers", &json!({})).unwrap();
    assert_eq!(list["items"][0]["name"], "Linear");
    cfg.api_call(&dir, "deleteMcpServer", &json!({ "path": { "id": id } }))
        .unwrap();
    let list = cfg.api_call(&dir, "listMcpServers", &json!({})).unwrap();
    assert_eq!(list["items"].as_array().unwrap().len(), 0);

    // The secret's value went in on stdin, never in the command line.
    let log = calls(&dir);
    let set = log.iter().find(|c| c["op"] == "setSecret").unwrap();
    assert_eq!(set["input"]["body"]["value"], "https://api.example.test");
}
