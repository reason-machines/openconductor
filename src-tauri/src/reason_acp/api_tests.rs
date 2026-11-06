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
