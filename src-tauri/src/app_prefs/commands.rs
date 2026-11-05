//! IPC for app preferences in `conductor.db`'s `settings` table. Each
//! command reads or writes typed values only (see [`AppPrefUpdate`]); there
//! is no raw key/value passthrough.

use openconductor_db::app_settings::{self, keys};
use openconductor_db::SqlitePool;
use tauri::State;

use super::{record_open_in as open_in_writes, AppPrefUpdate, AppPrefs, Write};
use crate::db::Db;

async fn rows(pool: &SqlitePool) -> Result<std::collections::HashMap<String, String>, String> {
    Ok(app_settings::active(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .collect())
}

pub async fn load(pool: &SqlitePool) -> Result<AppPrefs, String> {
    Ok(AppPrefs::from_rows(&rows(pool).await?))
}

async fn apply(pool: &SqlitePool, write: Write) -> Result<(), String> {
    match write {
        Write::Set(key, value) => app_settings::set(pool, key, &value).await,
        Write::Delete(key) => app_settings::delete(pool, key).await,
    }
    .map_err(|e| e.to_string())
}

/// JS: `invoke("get_app_prefs")`.
#[tauri::command]
pub async fn get_app_prefs(db: State<'_, Db>) -> Result<AppPrefs, String> {
    load(&db.0).await
}

/// JS: `invoke("set_app_pref", { update: { key, value } })`; returns every
/// preference after the write.
#[tauri::command]
pub async fn set_app_pref(db: State<'_, Db>, update: AppPrefUpdate) -> Result<AppPrefs, String> {
    apply(&db.0, update.encode()?).await?;
    load(&db.0).await
}

/// JS: `invoke("record_open_in", { appId, isRemote })` after opening a
/// workspace in an app.
#[tauri::command]
pub async fn record_open_in(
    db: State<'_, Db>,
    app_id: String,
    is_remote: Option<bool>,
) -> Result<AppPrefs, String> {
    if app_id.trim().is_empty() {
        return Err("app id is empty".into());
    }
    for write in open_in_writes(&rows(&db.0).await?, &app_id, is_remote) {
        apply(&db.0, write).await?;
    }
    load(&db.0).await
}

/// This install's id, generated (random UUID v4) and stored the first time
/// it is asked for, as the reference's `uue()` does.
pub async fn client_instance_id_for(pool: &SqlitePool) -> Result<String, String> {
    let fresh = uuid::Uuid::new_v4().to_string();
    app_settings::get_or_insert(pool, keys::CLIENT_INSTANCE_ID, &fresh)
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("client_instance_id")`.
#[tauri::command]
pub async fn client_instance_id(db: State<'_, Db>) -> Result<String, String> {
    client_instance_id_for(&db.0).await
}

/// Whether `gt` (the Graphite CLI) is on `path`, for the "Graphite stack
/// support" row: Conductor disables it with "Install gt to enable." when
/// `gt` is missing.
pub fn graphite_cli_on(path: Option<&std::ffi::OsStr>) -> bool {
    path.into_iter()
        .flat_map(std::env::split_paths)
        .chain(["/opt/homebrew/bin", "/usr/local/bin"].map(Into::into))
        .any(|dir| dir.join("gt").is_file())
}

/// JS: `invoke("graphite_cli_installed")`.
#[tauri::command]
pub fn graphite_cli_installed() -> bool {
    graphite_cli_on(std::env::var_os("PATH").as_deref())
}
