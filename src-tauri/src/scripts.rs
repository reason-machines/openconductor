//! Tauri commands for workspace setup and run scripts. Thin wrappers over
//! `oc_scripts::service::ScriptService` (crates/scripts); behavior and
//! evidence live there. Output and setup completion reach the UI as the
//! `scripts://event` event (`ScriptEvent`, tagged by `type`).

use oc_scripts::config::{Layer, ResolvedScripts, RunMode, RunScript};
use oc_scripts::runner::RunStatus;
use oc_scripts::service::{ScriptEvent, ScriptService, WorkspaceRef};
use oc_scripts::setup::{SetupOutcome, SetupState};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Event name the frontend listens on.
pub const EVENT: &str = "scripts://event";

/// Build the service; events go to every window.
pub fn service(app: &AppHandle) -> ScriptService {
    let home = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_default();
    let emitter = app.clone();
    // Persist setup_log_path (evidence/run-scripts/NOTES.md "Execution":
    // `workspaces.setup_log_path` holds the transcript path after setup ends).
    let pool = app.state::<crate::db::Db>().0.clone();
    let service = ScriptService::new(
        home.join(".conductor"),
        std::env::temp_dir(),
        std::sync::Arc::new(move |event: ScriptEvent| {
            if let ScriptEvent::SetupFinished(ref outcome) = event {
                let pool = pool.clone();
                let workspace_id = outcome.workspace_id.clone();
                let log_path = outcome.log_path.to_string_lossy().into_owned();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = openconductor_db::workspaces::set_setup_log_path(
                        &pool,
                        &workspace_id,
                        &log_path,
                    )
                    .await
                    {
                        eprintln!(
                            "scripts: could not persist setup_log_path for {workspace_id}: {e}"
                        );
                    }
                });
            }
            let _ = emitter.emit(EVENT, event);
        }),
    );
    // Scripts get the workspace's settings environment, with this app's
    // user settings file as the user layer.
    service.set_settings_env(crate::settings::effective::script_env_hook());
    service
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptsConfigDto {
    pub setup: Option<String>,
    pub setup_layer: Option<Layer>,
    pub archive: Option<String>,
    pub archive_layer: Option<Layer>,
    pub run_mode: RunMode,
    pub auto_run_after_setup: bool,
    pub run: Vec<RunScript>,
    pub managed_keys: Vec<String>,
    pub warnings: Vec<String>,
}

impl From<ResolvedScripts> for ScriptsConfigDto {
    fn from(r: ResolvedScripts) -> Self {
        Self {
            setup_layer: r.setup.as_ref().map(|s| s.layer),
            setup: r.setup.map(|s| s.value),
            archive_layer: r.archive.as_ref().map(|s| s.layer),
            archive: r.archive.map(|s| s.value),
            run_mode: r.run_mode,
            auto_run_after_setup: r.auto_run_after_setup,
            run: r.run,
            managed_keys: r.managed_keys.into_iter().collect(),
            warnings: r.warnings,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatusDto {
    pub state: SetupState,
    pub log: Option<String>,
    pub last: Option<SetupOutcome>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatusDto {
    pub runs: Vec<RunStatus>,
    pub history: Vec<String>,
}

#[tauri::command]
pub fn scripts_config(
    scripts: State<'_, ScriptService>,
    workspace: WorkspaceRef,
) -> Result<ScriptsConfigDto, String> {
    scripts.config(&workspace).map(Into::into)
}

#[tauri::command]
pub fn setup_script_start(
    scripts: State<'_, ScriptService>,
    workspace: WorkspaceRef,
) -> Result<bool, String> {
    scripts.start_setup(&workspace)
}

#[tauri::command]
pub fn setup_script_cancel(scripts: State<'_, ScriptService>, workspace_id: String) {
    scripts.setup.cancel(&workspace_id);
}

#[tauri::command]
pub fn setup_script_status(
    scripts: State<'_, ScriptService>,
    workspace_id: String,
) -> SetupStatusDto {
    SetupStatusDto {
        state: scripts.setup.state(&workspace_id),
        log: scripts.setup.log(&workspace_id),
        last: scripts.setup.outcome(&workspace_id),
    }
}

#[tauri::command]
pub fn run_script_start(
    scripts: State<'_, ScriptService>,
    workspace: WorkspaceRef,
    script_id: Option<String>,
) -> Result<String, String> {
    scripts.start_run(&workspace, script_id.as_deref())
}

#[tauri::command]
pub fn run_script_stop(
    scripts: State<'_, ScriptService>,
    workspace_id: String,
    script_id: Option<String>,
) -> bool {
    scripts.runs.stop(&workspace_id, script_id.as_deref())
}

#[tauri::command]
pub async fn run_script_write(
    scripts: State<'_, ScriptService>,
    workspace_id: String,
    script_id: String,
    run_id: String,
    data: String,
) -> Result<bool, String> {
    let runs = scripts.runs.clone();
    tauri::async_runtime::spawn_blocking(move || {
        runs.write(&workspace_id, &script_id, &run_id, data.as_bytes())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_script_resize(
    scripts: State<'_, ScriptService>,
    workspace_id: String,
    script_id: String,
    run_id: String,
    cols: u16,
    rows: u16,
) -> Result<bool, String> {
    let runs = scripts.runs.clone();
    tauri::async_runtime::spawn_blocking(move || {
        runs.resize(&workspace_id, &script_id, &run_id, cols, rows)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_script_status(scripts: State<'_, ScriptService>, workspace_id: String) -> RunStatusDto {
    RunStatusDto {
        runs: scripts.runs.statuses(&workspace_id),
        history: scripts.runs.history(&workspace_id),
    }
}

/// Settings › Experimental "Auto-run after setup": the user-scope value.
#[tauri::command]
pub fn auto_run_after_setup_get(scripts: State<'_, ScriptService>) -> Result<bool, String> {
    scripts.auto_run_after_setup()
}

/// Write the user-scope "Auto-run after setup" toggle; returns the value
/// read back. New workspaces whose setup completes then start their default
/// run script (`ScriptService::start_setup`).
#[tauri::command]
pub fn auto_run_after_setup_set(
    scripts: State<'_, ScriptService>,
    enabled: bool,
) -> Result<bool, String> {
    scripts.set_auto_run_after_setup(enabled)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveResultDto {
    pub exit_code: Option<i32>,
    pub output: String,
}

/// Run the repository's archive script (if any) to completion; call before
/// the worktree is removed. `None` when no archive script is configured.
#[tauri::command]
pub async fn archive_script_run(
    scripts: State<'_, ScriptService>,
    workspace: WorkspaceRef,
) -> Result<Option<ArchiveResultDto>, String> {
    let service = scripts.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || service.run_archive(&workspace))
        .await
        .map_err(|e| e.to_string())??;
    Ok(result.map(|(exit_code, output)| ArchiveResultDto { exit_code, output }))
}

/// Variables for the Run tab's Open URL templates (`preview_urls`), as
/// ordered `[name, value]` pairs.
#[tauri::command]
pub fn run_script_preview_env(
    scripts: State<'_, ScriptService>,
    workspace: WorkspaceRef,
) -> Result<Vec<(String, String)>, String> {
    scripts.preview_env(&workspace)
}

#[tauri::command]
pub fn run_script_output(
    scripts: State<'_, ScriptService>,
    workspace_id: String,
    script_id: String,
) -> Option<String> {
    scripts.runs.output(&workspace_id, &script_id)
}
