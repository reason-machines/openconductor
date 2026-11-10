use super::*;

fn claude(models: Value) -> Value {
    json!({"type":"control_response","response":{"subtype":"success","request_id":"oc-models","response":{"models":models}}})
}

fn codex(model: &str) -> Value {
    json!({"id":format!("row-{model}"),"model":model,"displayName":format!("Live {model}"),
        "supportedReasoningEfforts":[{"reasoningEffort":"low"},{"reasoningEffort":"high"}],"defaultReasoningEffort":"high"})
}

fn initialized() -> CodexCatalog {
    let mut catalog = CodexCatalog::default();
    assert_eq!(
        catalog.accept(&json!({"id":1,"result":{"userAgent":"codex-test"}})),
        None
    );
    let requests: Vec<Value> = catalog
        .take_requests()
        .iter()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect();
    assert_eq!(
        requests,
        vec![
            json!({"method":"initialized"}),
            json!({"id":2,"method":"model/list","params":{"limit":100,"cursor":null}})
        ]
    );
    catalog
}

#[test]
fn claude_uses_initialize_metadata_without_a_prompt() {
    let init: Value = serde_json::from_str(&claude_initialize()).unwrap();
    assert_eq!(
        init,
        json!({"type":"control_request","request_id":"oc-models","request":{"subtype":"initialize"}})
    );
    let models = claude_models(&claude(json!([
        {"value":"future-local-model","displayName":"Account model","supportsEffort":true,"supportedEffortLevels":["low","max","max"]},
        {"value":"small","displayName":"Small","supportsEffort":false}
    ]))).unwrap().unwrap();
    assert_eq!(models[0].id, "future-local-model");
    assert_eq!(models[0].efforts, Some(vec!["low".into(), "max".into()]));
    assert_eq!(models[0].default_effort, None);
    assert_eq!(models[1].efforts, None);
    assert_eq!(
        serde_json::to_value(&models[0]).unwrap(),
        json!({"agent":"claude","id":"future-local-model","name":"Account model","efforts":["low","max"]})
    );
}

#[test]
fn claude_does_not_invent_effort_options_for_older_cli_metadata() {
    let models = claude_models(&claude(
        json!([{"value":"sonnet","displayName":"Sonnet","supportsEffort":true}]),
    ))
    .unwrap()
    .unwrap();
    assert_eq!(models[0].efforts, None);
}

#[test]
fn claude_missing_empty_or_invalid_metadata_is_unavailable() {
    for response in [
        claude(json!([])),
        claude(json!([{"value":"x"}])),
        json!({"type":"control_response","response":{"subtype":"success","request_id":"oc-models","response":{"commands":[]}}}),
        json!({"type":"control_response","response":{"subtype":"error","request_id":"oc-models","error":"not signed in"}}),
    ] {
        assert!(claude_models(&response).unwrap().is_err());
    }
    assert!(
        claude_models(&json!({"type":"system","subtype":"init","model":"not-a-catalog"})).is_none()
    );
}

#[test]
fn codex_paginates_and_uses_wire_model_not_row_id() {
    let mut catalog = initialized();
    assert_eq!(
        catalog.accept(&json!({"id":2,"result":{"data":[codex("model-a")],"nextCursor":"page-2"}})),
        None
    );
    let requests = catalog.take_requests();
    assert_eq!(
        serde_json::from_str::<Value>(&requests[0]).unwrap(),
        json!({"id":3,"method":"model/list","params":{"limit":100,"cursor":"page-2"}})
    );
    let models = catalog.accept(&json!({"id":3,"result":{"data":[codex("model-a"),codex("model-b")],"nextCursor":null}})).unwrap().unwrap();
    assert_eq!(
        models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        ["model-a", "model-b"]
    );
    assert_eq!(models[0].efforts, Some(vec!["low".into(), "high".into()]));
    assert_eq!(models[0].default_effort.as_deref(), Some("high"));
    assert_eq!(serde_json::to_value(&models[0]).unwrap()["agent"], "codex");
    assert!(catalog.take_requests().is_empty());
}

#[test]
fn codex_ignores_notifications_and_hides_hidden_models() {
    let mut catalog = initialized();
    assert!(catalog
        .accept(&json!({"method":"account/updated","params":{}}))
        .is_none());
    assert!(catalog.accept(&json!({"id":99,"result":{}})).is_none());
    let models = catalog
        .accept(&json!({"id":2,"result":{"data":[{"hidden":true},codex("visible")]}}))
        .unwrap()
        .unwrap();
    assert_eq!(models.len(), 1);
    assert_eq!(models[0].id, "visible");
}

#[test]
fn codex_reports_rpc_invalid_and_empty_results_without_fallbacks() {
    for result in [
        json!({"error":{"message":"signed out"}}),
        json!({"result":{}}),
        json!({"result":{"data":[]}}),
        json!({"result":{"data":[{"model":"bad","displayName":"Bad"}]}}),
    ] {
        let mut catalog = initialized();
        let mut line = result;
        line["id"] = json!(2);
        assert!(catalog.accept(&line).unwrap().is_err());
    }
    assert!(CodexCatalog::default()
        .accept(&json!({"id":1,"error":{"message":"unsupported"}}))
        .unwrap()
        .is_err());
}

#[test]
fn codex_repeated_cursor_fails_instead_of_looping_or_returning_partial_models() {
    let mut catalog = initialized();
    assert!(catalog
        .accept(&json!({"id":2,"result":{"data":[codex("a")],"nextCursor":"same"}}))
        .is_none());
    assert!(catalog
        .accept(&json!({"id":3,"result":{"data":[codex("b")],"nextCursor":"same"}}))
        .unwrap()
        .is_err());
}

#[test]
fn codex_rejects_unadvertised_default_effort() {
    let mut catalog = initialized();
    let mut model = codex("test");
    model["defaultReasoningEffort"] = json!("invented");
    assert!(catalog
        .accept(&json!({"id":2,"result":{"data":[model]}}))
        .unwrap()
        .is_err());
}

#[test]
fn codex_handshake_contains_no_thread_or_turn_request() {
    let init: Value = serde_json::from_str(&CodexCatalog::initialize()).unwrap();
    assert_eq!(init["method"], "initialize");
    let _ = initialized();
}
