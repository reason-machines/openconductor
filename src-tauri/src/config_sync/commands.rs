use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::config_sync::{self, Diff, Selection, SyncResult};

static APPLY_LOCK: Mutex<()> = Mutex::new(());

#[tauri::command]
pub async fn config_sync_diff(app: AppHandle) -> Result<Diff, String> {
    let home = app.path().home_dir().map_err(|_| "Cannot resolve the local home directory.")?;
    tauri::async_runtime::spawn_blocking(move || config_sync::diff(&home))
        .await
        .map_err(|_| "Cannot load the local config diff.".into())
}

#[tauri::command]
pub async fn config_sync_apply(
    app: AppHandle,
    selections: Vec<Selection>,
) -> Result<SyncResult, String> {
    let home = app.path().home_dir().map_err(|_| "Cannot resolve the local home directory.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = APPLY_LOCK.lock().map_err(|_| "Local config sync is unavailable.".to_owned())?;
        Ok(config_sync::sync(&home, &selections))
    })
    .await
    .map_err(|_| "Cannot apply local config sync.".to_owned())?
}
