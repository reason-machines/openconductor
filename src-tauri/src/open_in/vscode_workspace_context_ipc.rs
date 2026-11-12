use serde_json::{json, Value};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::process::Command;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::WebviewWindowBuilder;

const CASES: &str = include_str!("../../../evidence/open-in/vscode-workspace-context/cases.json");

fn run_case(id: &str) {
    let fixture: Value = serde_json::from_str(CASES).unwrap();
    let case = fixture["cases"].as_array().unwrap().iter().find(|case| case["id"] == id).unwrap();
    let root = std::env::temp_dir().join(format!("oc-vscode-{}", uuid::Uuid::new_v4()));
    let workspace = root.join("workspace space");
    let bin = root.join("bin");
    fs::create_dir_all(workspace.join("src")).unwrap();
    fs::create_dir_all(&bin).unwrap();
    let target = workspace.join(case["relative"].as_str().unwrap());
    match case["exists"].as_str().unwrap() {
        "file" => fs::write(&target, "fixture").unwrap(),
        "directory" => fs::create_dir_all(&target).unwrap(),
        "missing" => {}
        value => panic!("Unknown fixture target kind: {value}"),
    }
    for (name, exit_var) in [("code", "OC_CODE_EXIT"), ("open", "OC_OPEN_EXIT")] {
        let executable = bin.join(name);
        let script = format!("#!/bin/sh\nprintf '%s\\000' '{name}' \"$@\" >> \"$OC_CALLS\"\nprintf '%s\\000' 'END' >> \"$OC_CALLS\"\nif [ \"{name}\" = open ] && [ \"$OC_OPEN_EXIT\" != 0 ]; then printf '%s' 'open fixture failure' >&2; fi\nexit \"${exit_var}\"\n");
        fs::write(&executable, script).unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let context = case["context"].as_bool().unwrap();
    let mut body = json!({
        "appId": case["appId"],
        "path": if case["relativeInput"] == true { case["relative"].as_str().unwrap().to_string() } else { target.to_string_lossy().into_owned() },
    });
    if context {
        body["fileContext"] = json!({"workspacePath": workspace});
    }
    let capture = root.join("calls");
    let response_path = root.join("response.json");
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "open_in::vscode_workspace_context_ipc::ipc_child", "--nocapture"])
        .env("PATH", &bin)
        .env("HOME", root.join("home"))
        .env("OC_CALLS", &capture)
        .env("OC_CODE_EXIT", case["codeExit"].to_string())
        .env("OC_OPEN_EXIT", case["openExit"].to_string())
        .env("OC_VSCODE_BODY", body.to_string())
        .env("OC_VSCODE_RESPONSE", &response_path)
        .output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: Value = serde_json::from_slice(&fs::read(response_path).unwrap()).unwrap();
    let bytes = fs::read(capture).unwrap_or_default();
    let tokens: Vec<String> = if bytes.is_empty() {
        Vec::new()
    } else {
        assert_eq!(bytes.last(), Some(&0), "unterminated capture for {id}");
        bytes[..bytes.len() - 1].split(|byte| *byte == 0)
            .map(|token| {
                let token = String::from_utf8(token.to_vec()).unwrap();
                match token.strip_prefix(workspace.to_str().unwrap()) {
                    Some(suffix) => format!("{}{suffix}", fixture["workspace"].as_str().unwrap()),
                    None => token,
                }
            })
            .collect()
    };
    let mut calls = Vec::new();
    let mut call = Vec::new();
    for token in tokens {
        if token == "END" {
            calls.push(std::mem::take(&mut call));
        } else {
            call.push(token);
        }
    }
    fs::remove_dir_all(root).unwrap();
    assert!(call.is_empty(), "unterminated child command for {id}");
    assert_eq!(json!(calls), case["calls"], "child argv for {id}; IPC response {response}");
    assert_eq!(response["ok"], case["ok"], "IPC response for {id}: {response}");
    if let Some(error) = case.get("error") {
        assert_eq!(response["error"], *error, "fallback failure for {id}");
    }
}

#[test]
fn ipc_child() {
    let Ok(body) = std::env::var("OC_VSCODE_BODY") else { return; };
    let app = mock_builder().invoke_handler(tauri::generate_handler![super::commands::open_in_app])
        .build(mock_context(noop_assets())).unwrap();
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
    let response = get_ipc_response(&webview, InvokeRequest {
        cmd: "open_in_app".into(), callback: CallbackFn(0), error: CallbackFn(1),
        url: webview.url().unwrap(), body: InvokeBody::Json(serde_json::from_str(&body).unwrap()),
        headers: Default::default(), invoke_key: INVOKE_KEY.to_string(),
    });
    let result = match response {
        Ok(value) => json!({"ok": true, "value": value.deserialize::<Value>().unwrap()}),
        Err(error) => json!({"ok": false, "error": error}),
    };
    fs::write(std::env::var_os("OC_VSCODE_RESPONSE").unwrap(), result.to_string()).unwrap();
}

#[test] fn workspace_file() { run_case("workspace_file"); }
#[test] fn literal_path() { run_case("literal_path"); }
#[test] fn completed_nonzero_fallback() { run_case("completed_nonzero_fallback"); }
#[test] fn fallback_error() { run_case("fallback_error"); }
#[test] fn no_context() { run_case("no_context"); }
#[test] fn unrelated_app() { run_case("unrelated_app"); }
#[test] fn directory() { run_case("directory"); }
#[test] fn missing_target() { run_case("missing_target"); }
#[test] fn relative_target() { run_case("relative_target"); }
#[test] fn unknown_app() { run_case("unknown_app"); }
