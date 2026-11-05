//! Environment variables added on Settings › Environment (user scope),
//! stored in `conductor.db`'s `env_vars` table as Conductor does: scope
//! `shared`, context `local` (`rGt` / `iGt` / `oO` in index-BGEQ8YjU.js,
//! evidence/settings/NOTES.md "Settings pages, row for row").
//!
//! [`stored_local`] feeds [`super::effective::local_env`], so terminals and
//! scripts get them, layered over the user's own env files but under any
//! repository settings file (`ResolvedEnv::vars_with_stored`).

use std::sync::OnceLock;

use openconductor_db::{env_vars, SqlitePool};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

const SCOPE: &str = "shared";
const CONTEXT: &str = "local";

static POOL: OnceLock<SqlitePool> = OnceLock::new();

/// Give [`stored_local`] the app database; called once at startup.
pub fn install(pool: SqlitePool) {
    let _ = POOL.set(pool);
}

/// Run a database future from synchronous code on a helper thread, so it also
/// works when the caller is inside the async runtime.
fn run_db<T: Send>(f: impl std::future::Future<Output = T> + Send) -> T {
    std::thread::scope(|s| {
        s.spawn(|| tauri::async_runtime::block_on(f))
            .join()
            .expect("env_vars thread panicked")
    })
}

/// The stored local variables, `(key, value)`; rows whose value lives in a
/// secret store (NULL) are left out, as Conductor drops them without one.
/// Errors read as none, so a database problem never blocks a terminal.
pub fn stored_local() -> Vec<(String, String)> {
    let Some(pool) = POOL.get() else {
        return Vec::new();
    };
    match run_db(env_vars::list(pool, SCOPE, CONTEXT)) {
        Ok(rows) => rows
            .into_iter()
            .filter_map(|r| r.value.map(|v| (r.key, v)))
            .collect(),
        Err(e) => {
            eprintln!("settings: stored environment variables not applied: {e}");
            Vec::new()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredVar {
    pub key: String,
    pub value: String,
}

/// Conductor's variable name rule (`^[A-Za-z_][A-Za-z0-9_]*$`).
pub fn valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

async fn list(pool: &SqlitePool) -> Result<Vec<StoredVar>, String> {
    Ok(env_vars::list(pool, SCOPE, CONTEXT)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter_map(|r| r.value.map(|value| StoredVar { key: r.key, value }))
        .collect())
}

/// JS: `invoke("env_vars_list")`.
#[tauri::command]
pub async fn env_vars_list(db: State<'_, Db>) -> Result<Vec<StoredVar>, String> {
    list(&db.0).await
}

/// JS: `invoke("env_vars_set", { entries })`: add or replace each variable;
/// nothing is written when any name is invalid.
#[tauri::command]
pub async fn env_vars_set(
    db: State<'_, Db>,
    entries: Vec<StoredVar>,
) -> Result<Vec<StoredVar>, String> {
    if let Some(bad) = entries.iter().find(|e| !valid_name(e.key.trim())) {
        return Err(format!(
            "{:?} is not a valid variable name: use letters, numbers and _, not starting with a number",
            bad.key
        ));
    }
    for e in &entries {
        env_vars::set(&db.0, e.key.trim(), SCOPE, CONTEXT, &e.value)
            .await
            .map_err(|e| e.to_string())?;
    }
    list(&db.0).await
}

/// JS: `invoke("env_vars_delete", { key })`.
#[tauri::command]
pub async fn env_vars_delete(db: State<'_, Db>, key: String) -> Result<Vec<StoredVar>, String> {
    env_vars::delete(&db.0, &key, SCOPE, CONTEXT)
        .await
        .map_err(|e| e.to_string())?;
    list(&db.0).await
}

/// JS: `invoke("env_files_loaded", { files })`: how many variables each of
/// the user's env files holds (Conductor's "N variables"), resolved as the
/// user layer does (against the settings folder, `~` is home); `None` for a
/// file that is missing or unreadable.
#[tauri::command]
pub async fn env_files_loaded(files: Vec<String>) -> Result<Vec<Option<usize>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = super::config_dir().map_err(|e| e.to_string())?;
        let home = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_default();
        Ok(files
            .iter()
            .map(|f| {
                let path = oc_scripts::config::resolve_env_file(f.trim(), &dir, &home, &home);
                std::fs::read_to_string(path)
                    .ok()
                    .map(|t| oc_scripts::config::parse_dotenv(&t).len())
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::valid_name;

    #[test]
    fn names_follow_conductors_rule() {
        for ok in ["A", "_x", "API_KEY_2"] {
            assert!(valid_name(ok), "{ok}");
        }
        for bad in ["", "2X", "A-B", "A B", "É"] {
            assert!(!valid_name(bad), "{bad}");
        }
    }
}
