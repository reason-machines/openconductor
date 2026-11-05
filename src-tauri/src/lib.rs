//! OpenConductor app entry point.
//!
//! Module ownership (one owner per path, see evidence/README.md):
//! - `workspace/`  workspace lifecycle (worktrees, setup/run scripts)
//! - `checkpoint/` checkpoints and revert
//! - `agent/`      agent runner, providers and BYOK settings
//! - `diff/`       diff viewer: git changes, unified diff parser
//! - `quick_open/` quick open file index and fuzzy matching (Spotlight)
//! - `settings/`   settings.toml and the Keychain-backed secret store
//! - `terminal/`   PTY terminals (`terminal_commands.rs` is its IPC layer)
//!
//! Those modules are added here once their owners land them.

pub mod agent;
pub mod diff;
pub mod project;
pub mod quick_open;
pub mod settings;
pub mod terminal;
mod terminal_commands;
pub mod workspace;

use serde::Serialize;
use tauri::Manager;
use terminal_commands::Terminals;

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

/// Folder checks for Home "Open project" (see `project`).
#[tauri::command]
fn inspect_project_folder(path: String) -> project::FolderInspection {
    project::inspect_folder(std::path::Path::new(&path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(workspace::service::WorkspaceService::new(data_dir)?);
            app.manage(quick_open::commands::FileCache::default());
            app.manage(Terminals::new(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            inspect_project_folder,
            workspace::commands::add_repository,
            workspace::commands::list_repositories,
            workspace::commands::list_branches,
            workspace::commands::branch_name_is_taken,
            workspace::commands::create_workspace,
            workspace::commands::list_workspaces,
            diff::commands::diff_workspace,
            quick_open::commands::fuzzy_filter_files,
            quick_open::commands::fuzzy_match_files,
            terminal_commands::pty_spawn,
            terminal_commands::pty_write,
            terminal_commands::pty_resize,
            terminal_commands::pty_kill,
            terminal_commands::pty_ack_bytes,
            terminal_commands::pty_read_history,
            terminal_commands::pty_clear_history,
            terminal_commands::pty_list,
        ])
        .build(tauri::generate_context!())
        .expect("error while building OpenConductor")
        .run(|app, event| {
            // Shells and their children must not outlive the app.
            if let tauri::RunEvent::Exit = event {
                if let Some(terminals) = app.try_state::<Terminals>() {
                    terminals.0.kill_all();
                }
            }
        });
}
