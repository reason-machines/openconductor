//! OpenConductor app entry point.
//!
//! Module ownership (one owner per path, see evidence/README.md):
//! - `workspace/`  workspace lifecycle (worktrees, setup/run scripts)
//! - `checkpoint/` checkpoints and revert
//! - `agent/`      agent runner, providers and BYOK settings
//! - `diff/`       diff viewer: git changes, unified diff parser
//! - `quick_open/` quick open file index and fuzzy matching
//! - `reason_acp/` the Reason agent over ACP; its commands are `reason_chat`
//! - `spotlight/`  Spotlight testing: sync a workspace into the repo root
//!   (`spotlight_commands.rs` is its IPC layer)
//! - `settings/`   settings.toml and the Keychain-backed secret store
//! - `terminal/`   PTY terminals (`terminal_commands.rs` is its IPC layer)
//!
//! Those modules are added here once their owners land them.

pub mod agent;
pub mod checkpoint;
pub mod db;
pub mod diff;
pub mod github_repo;
pub mod menu;
pub mod pr;
pub mod project;
pub mod quick_open;
pub mod reason_acp;
pub mod reason_chat;
pub mod scripts;
pub mod settings;
pub mod spotlight;
mod spotlight_commands;
pub mod terminal;
mod terminal_commands;
pub mod workspace;

use serde::Serialize;
use tauri::Manager;
use terminal_commands::{ShellCommands, Terminals};

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

/// Runs a blocking `gh`/`git` call off the async runtime's worker threads.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Owners for the "Create a private GitHub repo?" dialog (see `github_repo`).
#[tauri::command]
async fn github_repo_owners() -> Result<github_repo::Owners, String> {
    blocking(|| github_repo::GitHub::default().owners()).await
}

/// Whether `owner/repo_name` is free on GitHub (see `github_repo`).
#[tauri::command]
async fn github_repo_availability(
    owner: String,
    repo_name: String,
) -> Result<github_repo::Availability, String> {
    blocking(move || github_repo::GitHub::default().availability(&owner, &repo_name)).await
}

/// "Recent repos" for the clone dialog (see `github_repo::RECENT_REPOS_PATH`).
#[tauri::command]
async fn github_recent_repos() -> Result<Vec<github_repo::RecentRepo>, String> {
    blocking(|| github_repo::GitHub::default().recent_repos()).await
}

/// `ssh` or `https`, from `gh config get git_protocol`.
#[tauri::command]
async fn github_git_protocol() -> Result<String, String> {
    blocking(|| Ok(github_repo::GitHub::default().git_protocol().to_string())).await
}

/// Publish a local folder as a new private GitHub repo (see `github_repo`).
#[tauri::command]
async fn github_repo_create(
    request: github_repo::CreateRequest,
) -> Result<github_repo::Created, String> {
    blocking(move || github_repo::GitHub::default().create(&request)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchPrefixInfo {
    branch_prefix_type: settings::BranchPrefixType,
    branch_prefix_custom: Option<String>,
    github_username: Option<String>,
}

/// `[git]` branch prefix settings plus the GitHub username for the
/// `github_username` prefix type, for the Create-workspace dialog. A missing or
/// unreadable settings file falls back to defaults; the username comes from the
/// local `gh` config (no network) and is null when `gh` has none.
#[tauri::command]
async fn branch_prefix_settings() -> BranchPrefixInfo {
    let git = settings::config_dir()
        .and_then(|dir| settings::load(&dir.join(settings::FILE_NAME)))
        .map(|s| s.git)
        .unwrap_or_default();
    let github_username = std::process::Command::new("gh")
        .args(["config", "get", "-h", "github.com", "user"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|login| !login.is_empty());
    BranchPrefixInfo {
        branch_prefix_type: git.branch_prefix_type,
        branch_prefix_custom: git.branch_prefix_custom,
        github_username,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Conductor is macOS-only; elsewhere keep Tauri's no-menu default.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build);
    builder
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
        // Same plugin set as Conductor 0.87.6 (see Cargo.toml). Capabilities grant only the
        // commands its frontend calls (capabilities/default.json).
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(db::open(&data_dir)?);
            app.manage(workspace::service::WorkspaceService::new(data_dir)?);
            app.manage(quick_open::commands::FileCache::default());
            app.manage(reason_chat::ReasonChats::default());
            app.manage(Terminals::new(app.handle().clone()));
            app.manage(ShellCommands::default());
            app.manage(settings::service::SettingsService::new(
                settings::config_dir()?.join(settings::FILE_NAME),
                agent::keychain::default_store(),
            ));
            app.manage(scripts::service(app.handle()));
            app.manage(spotlight_commands::service(app.handle()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            inspect_project_folder,
            branch_prefix_settings,
            github_repo_owners,
            github_repo_availability,
            github_repo_create,
            github_recent_repos,
            github_git_protocol,
            workspace::commands::add_repository,
            workspace::commands::clone_repository,
            workspace::commands::default_clone_directory,
            workspace::commands::list_repositories,
            workspace::commands::list_branches,
            workspace::commands::branch_name_is_taken,
            workspace::commands::create_workspace,
            workspace::commands::list_workspaces,
            workspace::commands::rename_workspace_branch,
            diff::commands::diff_workspace,
            diff::comment_commands::diff_comments_list,
            diff::comment_commands::diff_comment_add,
            diff::comment_commands::diff_comment_edit,
            diff::comment_commands::diff_comment_delete,
            diff::comment_commands::diff_comment_resolve,
            diff::comment_commands::diff_comments_mark_sent,
            quick_open::commands::fuzzy_filter_files,
            quick_open::commands::fuzzy_match_files,
            reason_chat::reason_cli_path,
            reason_chat::reason_open_chat,
            reason_chat::reason_prompt,
            reason_chat::reason_cancel,
            reason_chat::reason_list_sessions,
            terminal_commands::pty_spawn,
            terminal_commands::pty_write,
            terminal_commands::pty_resize,
            terminal_commands::pty_kill,
            terminal_commands::pty_ack_bytes,
            terminal_commands::pty_read_history,
            terminal_commands::pty_clear_history,
            terminal_commands::pty_list,
            terminal_commands::pty_screen_text,
            terminal_commands::pty_screen_snapshot,
            terminal_commands::pty_create_mirror,
            terminal_commands::pty_write_mirror,
            terminal_commands::pty_resize_mirror,
            terminal_commands::pty_delete_mirror,
            terminal_commands::execute_shell_command,
            terminal_commands::execute_shell_command_cancellable,
            terminal_commands::cancel_shell_command,
            settings::commands::get_settings,
            settings::commands::update_settings,
            settings::commands::provider_status,
            settings::commands::connect_provider,
            settings::commands::disconnect_provider,
            pr::commands::pr_lookup,
            pr::commands::pr_header_state,
            pr::commands::pr_create_prompt,
            pr::commands::pr_merge,
            pr::commands::pr_set_auto_merge,
            pr::commands::pr_mark_ready,
            pr::commands::pr_edit,
            pr::commands::pr_retarget,
            pr::commands::pr_approve,
            scripts::scripts_config,
            scripts::setup_script_start,
            scripts::setup_script_cancel,
            scripts::setup_script_status,
            scripts::run_script_start,
            scripts::run_script_stop,
            scripts::run_script_status,
            scripts::run_script_output,
            scripts::archive_script_run,
            spotlight_commands::spotlight_start,
            spotlight_commands::spotlight_stop,
            spotlight_commands::spotlight_status,
            spotlight_commands::spotlight_testing_get,
            spotlight_commands::spotlight_testing_set,
        ])
        .build(tauri::generate_context!())
        .expect("error while building OpenConductor")
        .run(|app, event| {
            // Shells and their children must not outlive the app.
            if let tauri::RunEvent::Exit = event {
                if let Some(terminals) = app.try_state::<Terminals>() {
                    terminals.0.kill_all();
                }
                // Run scripts lead their own process groups; do not orphan them.
                if let Some(scripts) = app.try_state::<oc_scripts::service::ScriptService>() {
                    scripts.runs.stop_all();
                }
                if let Some(shell) = app.try_state::<ShellCommands>() {
                    shell.0.cancel_all();
                }
                // Put every spotlighted root back as it was.
                if let Some(spotlight) = app.try_state::<spotlight_commands::Spotlight>() {
                    spotlight.stop_all();
                }
            }
        });
}
