//! OpenConductor app entry point.
//!
//! Module ownership (one owner per path, see evidence/README.md):
//! - `workspace/`  workspace lifecycle (worktrees, setup/run scripts)
//! - `checkpoint/` checkpoints and revert; `turn_checkpoint.rs` takes them
//!   around each chat turn (`turn_checkpoint_commands.rs` is the IPC layer)
//! - `agent/`      agent runner, providers and BYOK settings
//! - `diff/`       diff viewer: git changes, unified diff parser
//! - `quick_open/` quick open file index and fuzzy matching
//! - `reason_acp/` the Reason agent over ACP; its commands are `reason_chat`
//! - `spotlight/`  Spotlight testing: sync a workspace into the repo root
//!   (`spotlight_commands.rs` is its IPC layer)
//! - `settings/`   settings.toml and the Keychain-backed secret store
//! - `terminal/`   PTY terminals (`terminal_commands.rs` is its IPC layer)
//! - `terminal_output.rs` reads Spotlight, run-script or terminal output
//!   back for agents (`terminal_output_commands.rs` is its IPC layer)
//!
//! Those modules are added here once their owners land them.

pub mod agent;
pub mod bundled_bin;
pub mod checkpoint;
mod checkpoint_commands;
mod chat_store_commands;
pub mod create_project;
pub mod db;
pub mod persistence;
mod persistence_commands;
mod sidebar_repo_commands;
mod sidebar_workspace_commands;
pub mod diff;
pub mod draft_attachments;
pub mod github_repo;
pub mod menu;
pub mod pr;
mod local_storage_commands;
pub mod project;
pub mod quick_open;
pub mod reason_acp;
pub mod reason_chat;
pub mod scripts;
pub mod settings;
pub mod sidecar_stores;
pub mod spotlight;
mod spotlight_commands;
pub mod terminal;
mod terminal_commands;
pub mod terminal_history;
pub mod terminal_output;
mod terminal_output_commands;
#[cfg(all(test, unix))]
mod test_exe;
pub mod tool_cli;
pub mod turn_checkpoint;
mod turn_checkpoint_commands;
pub mod workspace;

use serde::Serialize;

/// Once per launch, apply "Set upstream on plain git push" to existing
/// workspaces in the background, as Conductor does after its first workspace
/// load. Failures are only logged.
fn spawn_push_upstream_backfill(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let settings = app.state::<settings::service::SettingsService>();
        match settings.get() {
            Ok(s) if !s.git.worktree_push_auto_setup_remote => return,
            Ok(_) => {}
            Err(e) => eprintln!("Failed to read settings for Git push upstream backfill: {e}"),
        }
        let workspaces = app.state::<workspace::service::WorkspaceService>();
        for (id, warning) in workspaces.configure_push_upstream_for_existing() {
            eprintln!("Failed to configure Git push upstream settings for workspace {id}: {warning}");
        }
    });
}
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

/// Home "Create project": scaffold from a template and publish a private
/// GitHub repo (see `create_project`). JS: `invoke("create_new_project",
/// { request, onProgress })`, `onProgress` a `Channel` of `{kind, text}`.
#[tauri::command]
async fn create_new_project(
    request: create_project::Request,
    on_progress: tauri::ipc::Channel<create_project::Progress>,
) -> Result<create_project::Created, String> {
    blocking(move || {
        create_project::Creator::default().create(&request, &mut |p| {
            let _ = on_progress.send(p);
        })
    })
    .await
}

/// Save a repository's setup and run scripts to its local settings layer.
#[tauri::command]
fn save_repo_scripts(
    repo_root: String,
    scripts: create_project::RepoScripts,
) -> Result<(), String> {
    create_project::save_local_scripts(std::path::Path::new(&repo_root), &scripts)
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
    let github_username = std::process::Command::new(bundled_bin::gh_path())
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            // Conductor runs its bundled tools from $APPDATA/bin (bundled_bin.rs).
            bundled_bin::install_at_startup(&app.path().resource_dir()?, &data_dir);
            // Conductor sweeps draft-attachments/ dirs older than 30 days at start.
            draft_attachments::sweep_at_startup(&data_dir);
            // Claude sessions load the bundled agent skill (Resources/conductor-skill).
            agent::claude_cli::set_bundled_plugin_dir(&app.path().resource_dir()?);
            let db = db::open(&data_dir)?;
            app.manage(db::open_cache(&data_dir));
            spotlight_commands::migrate_legacy_setting(&db);
            app.manage(terminal_commands::history_state(&data_dir));
            // Conductor's sidecar opens its session event outbox at start and
            // carries on without it if that fails (sidecar_stores/).
            match sidecar_stores::outbox::SessionEventOutbox::open(&sidecar_stores::outbox_root(&data_dir)) {
                Ok(outbox) => {
                    app.manage(outbox);
                }
                Err(e) => eprintln!(
                    "Session event outbox is unavailable; continuing without durable backup delivery: {e}"
                ),
            }
            app.manage(sidecar_stores::completions::SlashCommandSnapshotStore::new(
                &sidecar_stores::completions_dir(&data_dir),
            ));
            app.manage(local_storage_commands::state(&data_dir));
            let workspaces = workspace::service::WorkspaceService::new(data_dir)?;
            // Deletes workspaces left initializing, imports pre-database repositories.
            persistence_commands::startup(&db, &workspaces)?;
            app.manage(db);
            app.manage(workspaces);
            app.manage(quick_open::commands::FileCache::default());
            app.manage(reason_chat::ReasonChats::default());
            app.manage(Terminals::new(app.handle().clone()));
            app.manage(ShellCommands::default());
            app.manage(settings::service::SettingsService::new(
                settings::config_dir()?.join(settings::FILE_NAME),
                agent::keychain::default_store(),
            ));
            let scripts = scripts::service(app.handle());
            let spotlight = spotlight_commands::service(app.handle());
            scripts.set_auto_run_spotlight(spotlight::auto_run::hook(spotlight.clone()));
            app.manage(scripts);
            app.manage(spotlight);
            spawn_push_upstream_backfill(app.handle().clone());
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
            create_new_project,
            save_repo_scripts,
            workspace::commands::add_repository,
            workspace::commands::clone_repository,
            workspace::commands::default_clone_directory,
            workspace::commands::list_repositories,
            workspace::commands::list_branches,
            workspace::commands::branch_name_is_taken,
            workspace::commands::create_workspace,
            workspace::commands::list_workspaces,
            workspace::commands::rename_workspace_branch,
            persistence_commands::db_list_repos,
            persistence_commands::db_list_workspaces,
            persistence_commands::db_archive_workspace,
            persistence_commands::db_repo_prompt,
            sidebar_repo_commands::db_set_repo_hidden,
            sidebar_repo_commands::db_reorder_repos,
            sidebar_workspace_commands::db_set_workspace_pinned,
            sidebar_workspace_commands::db_set_workspace_unread,
            sidebar_workspace_commands::db_set_workspace_manual_status,
            sidebar_workspace_commands::sidebar_workspace_changes,
            diff::commands::diff_workspace,
            diff::commands::diff_discard_file,
            checkpoint_commands::checkpoint_save,
            checkpoint_commands::checkpoint_exists,
            checkpoint_commands::checkpoint_restore,
            checkpoint_commands::checkpoint_changed_count,
            diff::comment_commands::diff_comments_list,
            diff::comment_commands::diff_comment_add,
            diff::comment_commands::diff_comment_edit,
            diff::comment_commands::diff_comment_delete,
            diff::comment_commands::diff_comment_resolve,
            diff::comment_commands::diff_comments_mark_sent,
            turn_checkpoint_commands::checkpoint_turn_changes,
            diff::comment_commands::diff_comments_sync_github,
            diff::comment_commands::diff_comment_resolve_github,
            quick_open::commands::fuzzy_filter_files,
            quick_open::commands::fuzzy_match_files,
            reason_chat::reason_cli_path,
            reason_chat::reason_open_chat,
            chat_store_commands::chat_messages_save,
            chat_store_commands::chat_messages_load,
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
            terminal_commands::pty_persist_terminal_history,
            terminal_commands::pty_load_terminal_history,
            terminal_commands::pty_delete_terminal_history,
            terminal_commands::pty_delete_workspace_terminal_history,
            local_storage_commands::local_storage_get_entry,
            local_storage_commands::local_storage_set_entry,
            local_storage_commands::local_storage_remove_entry,
            local_storage_commands::local_storage_list_entries,
            local_storage_commands::local_storage_remove_subsystem,
            terminal_commands::execute_shell_command,
            terminal_commands::execute_shell_command_cancellable,
            terminal_commands::cancel_shell_command,
            settings::commands::get_settings,
            settings::commands::update_settings,
            settings::commands::provider_status,
            settings::commands::connect_provider,
            settings::commands::disconnect_provider,
            pr::commands::pr_lookup,
            pr::commands::pr_list_open,
            pr::commands::gh_issue_list_open,
            pr::commands::pr_git_state,
            pr::commands::pr_header_state,
            pr::commands::pr_create_prompt,
            pr::commands::pr_merge,
            pr::commands::pr_merge_method,
            pr::commands::pr_set_auto_merge,
            pr::checks_commands::pr_check_log,
            pr::checks_commands::pr_rerun_failed_checks,
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
            scripts::auto_run_after_setup_get,
            scripts::auto_run_after_setup_set,
            spotlight_commands::spotlight_start,
            spotlight_commands::spotlight_stop,
            spotlight_commands::spotlight_status,
            spotlight_commands::spotlight_testing_get,
            spotlight_commands::spotlight_testing_set,
            terminal_output_commands::get_terminal_output,
            draft_attachments::commands::draft_attachment_write,
            draft_attachments::commands::draft_attachment_resolve,
            draft_attachments::commands::draft_attachment_remove,
            draft_attachments::commands::draft_attachment_upload,
            draft_attachments::commands::draft_attachments_materialize,
            draft_attachments::commands::materialize_local_path_attachment,
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
