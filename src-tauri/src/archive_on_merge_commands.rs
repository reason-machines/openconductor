//! IPC for archive on merge: the repository override of
//! `git.archive_on_merge` (see `archive_on_merge`).

use oc_scripts::config::{load_layers, SettingsPaths};
use tauri::State;

use crate::archive_on_merge::repo_override;
use crate::db::Db;
use crate::spotlight::setting;

/// JS: `invoke("repo_archive_on_merge", { repoId })`: what the repository's
/// settings files set for `git.archive_on_merge`, or null when they leave it
/// to the user setting.
#[tauri::command]
pub async fn repo_archive_on_merge(
    db: State<'_, Db>,
    repo_id: String,
) -> Result<Option<bool>, String> {
    let user_dir = SettingsPaths::default_user_dir().ok_or("cannot locate the home directory")?;
    let target = setting::target(&db.0, &repo_id, user_dir).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let (layers, _warnings) = load_layers(&target.paths).map_err(|e| e.to_string())?;
        Ok(repo_override(&layers))
    })
    .await
    .map_err(|e| e.to_string())?
}
