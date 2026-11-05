//! The root directory (Conductor's "Conductor root directory", Settings ›
//! Advanced): where repositories are cloned (`<root>/repos`) and workspaces
//! live (`<root>/workspaces/<repo>`). Stored in the `conductor_root_path`
//! setting, read once at startup ([`root_from_settings`]).
//!
//! Reference (renderApp chunk): `conductor_root_path`, default
//! `<home>/conductor`, and the `changeRootPath` mutation, which forgets every
//! repository, workspace and chat (files on disk stay), saves the setting,
//! deletes `last_clone_directory` and runs `mkdir -p "<new>/repos"
//! "<new>/workspaces" "<new>/archived-contexts"`, then reloads and goes to
//! `/`. Ours differs on purpose in two places: the default root is the app
//! data directory, so we never share `~/conductor` with an installed
//! Conductor, and the app restarts after a change instead of reloading in
//! place, because the workspace service reads the root at startup.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};

use crate::db::Db;
use crate::workspace::service::WorkspaceService;

/// Setting key, as the reference's.
pub const ROOT_PATH_KEY: &str = "conductor_root_path";
/// Cleared on a root change, as the reference does.
const LAST_CLONE_DIRECTORY_KEY: &str = "last_clone_directory";

/// The saved root, if any. Read at startup before the workspace service.
pub fn root_from_settings(db: &Db) -> Option<PathBuf> {
    let saved = tauri::async_runtime::block_on(openconductor_db::app_settings::get(&db.0, ROOT_PATH_KEY));
    match saved {
        Ok(Some(path)) if !path.trim().is_empty() => Some(PathBuf::from(path)),
        Ok(_) => None,
        Err(e) => {
            eprintln!("{ROOT_PATH_KEY}: using the app data directory: {e}");
            None
        }
    }
}

/// Why a new root is refused before anything changes.
pub fn check_new_root(current: &Path, new: &str) -> Result<PathBuf, String> {
    let new = new.trim();
    if new.is_empty() {
        return Err("Choose a directory for the root path.".into());
    }
    let path = PathBuf::from(new);
    if !path.is_absolute() {
        return Err(format!("The root path must be an absolute path: {new}"));
    }
    if path == current {
        return Err("That is already the root path.".into());
    }
    Ok(path)
}

/// JS: `invoke("get_conductor_root")`: the root in use.
#[tauri::command]
pub fn get_conductor_root(service: State<'_, WorkspaceService>) -> String {
    service.manager().root().display().to_string()
}

/// JS: `invoke("repo_workspaces_path", { repoId })`: the repository's
/// workspaces directory ("Workspaces path" in its settings).
#[tauri::command]
pub fn repo_workspaces_path(service: State<'_, WorkspaceService>, repo_id: String) -> Result<String, String> {
    let root = service.repository_root(&repo_id).map_err(|e| e.to_string())?;
    Ok(service.manager().workspaces_dir(&root).display().to_string())
}

/// JS: `invoke("change_conductor_root", { newPath })`: forget every
/// repository, workspace and chat, save the new root, create its
/// directories, then restart the app on it.
#[tauri::command]
pub async fn change_conductor_root(
    app: AppHandle,
    db: State<'_, Db>,
    service: State<'_, WorkspaceService>,
    new_path: String,
) -> Result<String, String> {
    let new = check_new_root(service.manager().root(), &new_path)?;
    // Directories first (the reference creates them last), so a root we
    // cannot write to leaves everything as it was.
    for dir in ["repos", "workspaces", "archived-contexts"] {
        std::fs::create_dir_all(new.join(dir)).map_err(|e| format!("Could not create {}: {e}", new.join(dir).display()))?;
    }
    openconductor_db::maintenance::forget_repositories(&db.0).await.map_err(|e| e.to_string())?;
    service.forget_repositories().map_err(|e| e.to_string())?;
    let saved = new.display().to_string();
    openconductor_db::app_settings::set(&db.0, ROOT_PATH_KEY, &saved).await.map_err(|e| e.to_string())?;
    openconductor_db::app_settings::delete(&db.0, LAST_CLONE_DIRECTORY_KEY).await.map_err(|e| e.to_string())?;
    app.request_restart();
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_empty_relative_and_unchanged_roots() {
        let cur = Path::new("/data/oc");
        assert!(check_new_root(cur, "  ").is_err());
        assert!(check_new_root(cur, "conductor").unwrap_err().contains("absolute"));
        assert!(check_new_root(cur, "/data/oc").unwrap_err().contains("already"));
        assert_eq!(check_new_root(cur, " /Users/me/oc ").unwrap(), PathBuf::from("/Users/me/oc"));
    }
}
