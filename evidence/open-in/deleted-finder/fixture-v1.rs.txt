use serde_json::{json, Value};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::process::Command;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::WebviewWindowBuilder;

struct Observation {
    response: Value,
    args: Vec<String>,
}

fn observe(case: &str, app_id: &str, relative: &str, existing: &str, exit: u8) -> Observation {
    let root = std::env::temp_dir().join(format!("oc-finder-{}", uuid::Uuid::new_v4()));
    let workspace = root.join("workspace");
    let bin = root.join("bin");
    fs::create_dir_all(workspace.join("src")).unwrap();
    fs::create_dir_all(&bin).unwrap();
    let target = workspace.join(relative);
    if existing == "file" {
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, "fixture").unwrap();
    } else if existing == "directory" {
        fs::create_dir_all(&target).unwrap();
    }
    let capture = root.join("argv");
    let response_path = root.join("response.json");
    for launcher in ["open", "xdg-open"] {
        let executable = bin.join(launcher);
        fs::write(&executable, "#!/bin/sh\nprintf '%s\\000' \"$@\" > \"$OC_FINDER_CAPTURE\"\nexit \"$OC_FINDER_EXIT\"\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let body = json!({
        "appId": app_id,
        "path": if case == "relative" { relative.into() } else { target.to_string_lossy().into_owned() },
        "fileContext": if existing == "directory" { Value::Null } else { json!({ "workspacePath": workspace }) },
    });
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "open_in::deleted_finder_ipc::ipc_child", "--nocapture"])
        .env("PATH", &bin)
        .env("OC_FINDER_CAPTURE", &capture)
        .env("OC_FINDER_EXIT", exit.to_string())
        .env("OC_FINDER_BODY", body.to_string())
        .env("OC_FINDER_RESPONSE", &response_path)
        .output()
        .unwrap();
    assert!(child.status.success(), "{}", String::from_utf8_lossy(&child.stderr));
    let response = serde_json::from_slice(&fs::read(response_path).unwrap()).unwrap();
    let args = fs::read(capture).unwrap_or_default()
        .split(|byte| *byte == 0)
        .filter(|value| !value.is_empty())
        .map(|value| String::from_utf8(value.to_vec()).unwrap().replace(workspace.to_str().unwrap(), "$WORKSPACE"))
        .collect();
    fs::remove_dir_all(root).unwrap();
    Observation { response, args }
}

#[test]
fn ipc_child() {
    let Ok(body) = std::env::var("OC_FINDER_BODY") else { return; };
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![super::commands::open_in_app])
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
    let response = get_ipc_response(&webview, InvokeRequest {
        cmd: "open_in_app".into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: webview.url().unwrap(),
        body: InvokeBody::Json(serde_json::from_str(&body).unwrap()),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    });
    let result = match response {
        Ok(value) => json!({ "ok": true, "value": value.deserialize::<Value>().unwrap() }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    fs::write(std::env::var_os("OC_FINDER_RESPONSE").unwrap(), result.to_string()).unwrap();
}

#[test]
fn existing_file_keeps_reveal_target() {
    let observed = observe("existing", "finder", "src/renamed.ts", "file", 0);
    assert_eq!(observed.response["ok"], true);
    let expected = if cfg!(target_os = "macos") {
        vec!["-R", "$WORKSPACE/src/renamed.ts"]
    } else {
        vec!["$WORKSPACE/src"]
    };
    assert_eq!(observed.args, expected);
}

#[test]
fn existing_directory_keeps_exact_target() {
    let observed = observe("directory", "finder", "src", "directory", 0);
    assert_eq!(observed.response["ok"], true);
    assert_eq!(observed.args, ["$WORKSPACE/src"]);
}

#[test]
fn deleted_file_opens_immediate_parent() {
    let observed = observe("deleted", "finder", "src/gone.ts", "missing", 0);
    assert_eq!(observed.response["ok"], true, "{}", observed.response);
    assert_eq!(observed.args, ["$WORKSPACE/src"]);
}

#[test]
fn extensionless_deleted_file_uses_explicit_file_context() {
    let observed = observe("extensionless", "finder", "src/NOTICE", "missing", 0);
    assert_eq!(observed.response["ok"], true, "{}", observed.response);
    assert_eq!(observed.args, ["$WORKSPACE/src"]);
}

#[test]
fn deleted_workspace_root_file_opens_workspace() {
    let observed = observe("root", "finder", "gone.ts", "missing", 0);
    assert_eq!(observed.response["ok"], true, "{}", observed.response);
    assert_eq!(observed.args, ["$WORKSPACE"]);
}

#[test]
fn missing_parent_is_attempted_without_ancestor_search() {
    let observed = observe("missing-parent", "finder", "gone-dir/gone.ts", "missing", 1);
    assert_eq!(observed.response["ok"], false);
    assert_eq!(observed.args, ["$WORKSPACE/gone-dir"]);
}

#[test]
fn missing_editor_target_stays_rejected() {
    let observed = observe("editor", "vscode", "src/gone.ts", "missing", 0);
    assert_eq!(observed.response["ok"], false);
    assert!(observed.args.is_empty());
}

#[test]
fn relative_target_stays_rejected() {
    let observed = observe("relative", "finder", "src/gone.ts", "missing", 0);
    assert_eq!(observed.response["ok"], false);
    assert!(observed.args.is_empty());
}

#[test]
fn unknown_app_stays_rejected() {
    let observed = observe("unknown", "not-an-app", "src/present.ts", "file", 0);
    assert_eq!(observed.response["ok"], false);
    assert!(observed.args.is_empty());
}

#[test]
fn deleted_path_outside_context_stays_rejected() {
    let observed = observe("outside", "finder", "../outside/gone.ts", "missing", 0);
    assert_eq!(observed.response["ok"], false);
    assert!(observed.args.is_empty());
}
