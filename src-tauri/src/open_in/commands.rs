//! IPC for the Open button: which apps to offer, and opening a folder in one.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

use super::{available_apps, find, icon, IconType, Roots};

/// One menu row.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenInApp {
    pub id: &'static str,
    pub name: &'static str,
    pub icon_type: IconType,
    /// The app's own icon (`data:image/png;base64,...`); none draws the
    /// folder, code or terminal glyph for `icon_type`.
    pub icon: Option<String>,
}

pub fn list(roots: &Roots) -> Vec<OpenInApp> {
    available_apps(roots)
        .into_iter()
        .map(|a| OpenInApp {
            id: a.id,
            name: a.display_name,
            icon_type: a.icon_type,
            icon: roots.icon_bundle(a).and_then(|b| icon::data_url(&b)),
        })
        .collect()
}

/// JS: `invoke("open_in_apps")`: the apps this Mac has, in menu order.
#[tauri::command]
pub async fn open_in_apps() -> Result<Vec<OpenInApp>, String> {
    tauri::async_runtime::spawn_blocking(|| list(&Roots::current()))
        .await
        .map_err(|e| e.to_string())
}

/// Runs a program; a failure is its stderr, else stdout, else the exit code
/// (Conductor's `wBt`).
fn run(program: &str, args: &[String]) -> Result<(), String> {
    let out = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let text = |b: &[u8]| String::from_utf8_lossy(b).trim().to_string();
    let (err, std_out) = (text(&out.stderr), text(&out.stdout));
    Err(if !err.is_empty() {
        err
    } else if !std_out.is_empty() {
        std_out
    } else {
        format!("exit code {}", out.status.code().unwrap_or(-1))
    })
}

/// JS: `invoke("open_in_app", { appId, path })`: opens the workspace folder
/// `path` in the app, or one file in it (the All files tree).
#[tauri::command]
pub async fn open_in_app(app_id: String, path: String) -> Result<(), String> {
    let app = find(&app_id).ok_or_else(|| format!("Unknown app: {app_id}"))?;
    let target = Path::new(&path);
    if !target.is_absolute() || !(target.is_dir() || target.is_file()) {
        return Err(format!("Not a folder or file: {path}"));
    }
    let is_file = target.is_file();
    let dir = target.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        if cfg!(target_os = "macos") {
            let (program, args) = if is_file {
                super::macos_open_file_command(app, &dir)
            } else {
                super::macos_open_command(app, &dir)
            };
            // Xcode without its command line tools: open the folder in the app.
            run(&program, &args).or_else(|e| {
                if app.id == "xcode" {
                    run(
                        "open",
                        &[
                            "-a".into(),
                            "Xcode".into(),
                            dir.to_string_lossy().into_owned(),
                        ],
                    )
                } else {
                    Err(e)
                }
            })
        } else if app.id == "finder" {
            // Conductor's Linux branch hands the folder to the desktop's file manager.
            let folder = match dir.parent() {
                Some(parent) if is_file => parent,
                _ => dir.as_path(),
            };
            run("xdg-open", &[folder.to_string_lossy().into_owned()])
        } else {
            Err(format!(
                "Opening in {} is only supported on macOS",
                app.display_name
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
