//! OpenConductor app entry point.
//!
//! Module ownership (one owner per path, see evidence/README.md):
//! - `workspace/`  workspace lifecycle (worktrees, setup/run scripts)
//! - `checkpoint/` checkpoints and revert
//! - `agent/`      agent runner, providers and BYOK settings
//! - `settings/`   settings.toml and the Keychain-backed secret store
//!
//! Those modules are added here once their owners land them.

pub mod agent;
pub mod settings;
pub mod workspace;

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}

/// Basic identity of the running app, shown in the shell footer.
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "OpenConductor",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(workspace::service::WorkspaceService::new(data_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            workspace::commands::add_repository,
            workspace::commands::list_repositories,
            workspace::commands::list_branches,
            workspace::commands::branch_name_is_taken,
            workspace::commands::create_workspace,
            workspace::commands::list_workspaces,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenConductor");
}
