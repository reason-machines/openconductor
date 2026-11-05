//! Tauri commands for Spotlight testing (see `spotlight::service`). Session
//! steps reach the UI as the `spotlight://event` event (`SpotlightEvent`,
//! tagged by `type`).

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use oc_scripts::config::SettingsPaths;
use oc_scripts::service::ScriptService;

use crate::db::Db;
use crate::spotlight::service::{SpotlightEvent, SpotlightService};
use crate::spotlight::setting::{self, SpotlightTesting, SpotlightTestingChange};

/// Event name the frontend listens on.
pub const EVENT: &str = "spotlight://event";

/// Managed state. Start and stop run git and wait for a sync in progress,
/// so the commands move them onto a blocking thread with a clone of this.
pub type Spotlight = Arc<SpotlightService>;

/// Build the service; events go to every window.
pub fn service(app: &AppHandle) -> Spotlight {
    let emitter = app.clone();
    Arc::new(SpotlightService::new(Arc::new(
        move |event: SpotlightEvent| {
            let _ = emitter.emit(EVENT, event);
        },
    )))
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightStatusDto {
    pub active: bool,
    pub workspace_id: Option<String>,
}

/// Start spotlighting a workspace into its repository root. Resolves to
/// `false` when that workspace was already running there. Rejects with a
/// message the UI can show (for example a rebase in progress in the root).
#[tauri::command]
pub async fn spotlight_start(
    spotlight: State<'_, Spotlight>,
    workspace_id: String,
    workspace_path: PathBuf,
    repo_root: PathBuf,
) -> Result<bool, String> {
    let spotlight = spotlight.inner().clone();
    blocking(move || spotlight.start(&workspace_id, &workspace_path, &repo_root)).await
}

/// Stop the session on `repo_root` and put the root back.
#[tauri::command]
pub async fn spotlight_stop(
    spotlight: State<'_, Spotlight>,
    repo_root: PathBuf,
) -> Result<bool, String> {
    let spotlight = spotlight.inner().clone();
    blocking(move || Ok(spotlight.stop(&repo_root))).await
}

/// Which workspace, if any, is spotlighted into `repo_root`. Async so a
/// start in progress (which holds the session table) never blocks the main
/// thread.
#[tauri::command]
pub async fn spotlight_status(
    spotlight: State<'_, Spotlight>,
    repo_root: PathBuf,
) -> Result<SpotlightStatusDto, String> {
    let spotlight = spotlight.inner().clone();
    blocking(move || {
        let workspace_id = spotlight.active_workspace(&repo_root);
        Ok(SpotlightStatusDto {
            active: workspace_id.is_some(),
            workspace_id,
        })
    })
    .await
}

async fn repo_target(db: &Db, repo_id: &str) -> Result<setting::RepoTarget, String> {
    let user_dir = SettingsPaths::default_user_dir().ok_or("cannot locate the home directory")?;
    setting::target(&db.0, repo_id, user_dir).await
}

/// The repository's effective `spotlight_testing` setting.
#[tauri::command]
pub async fn spotlight_testing_get(
    db: State<'_, Db>,
    repo_id: String,
) -> Result<SpotlightTesting, String> {
    let target = repo_target(&db, &repo_id).await?;
    blocking(move || setting::read(&target.paths)).await
}

/// Turn Spotlight testing on or off for a repository: write it to the
/// repository's local settings file, then stop every run process of its
/// workspaces and its Spotlight session, so the next Run starts in the new
/// mode (the reference's toggle does the same).
#[tauri::command]
pub async fn spotlight_testing_set(
    db: State<'_, Db>,
    scripts: State<'_, ScriptService>,
    spotlight: State<'_, Spotlight>,
    repo_id: String,
    enabled: bool,
) -> Result<SpotlightTestingChange, String> {
    let target = repo_target(&db, &repo_id).await?;
    let scripts = scripts.inner().clone();
    let spotlight = spotlight.inner().clone();
    blocking(move || {
        setting::apply(
            &target,
            enabled,
            |workspace_id| scripts.runs.stop(workspace_id, None),
            |root| spotlight.stop(root),
        )
    })
    .await
}
