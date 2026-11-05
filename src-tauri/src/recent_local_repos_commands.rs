//! IPC for the sidebar add-repository menu's "Recents" list. The scan is in
//! `recent_local_repos` (std only, tested on its own).

use std::path::PathBuf;

use crate::recent_local_repos::recent_local_repos;

/// JS: `invoke("recent_local_repositories")`: up to 8 absolute paths,
/// newest first. Runs off the async runtime; any failure gives an empty
/// list, as Conductor's runner (`FQo`) does on a non-zero exit.
#[tauri::command]
pub async fn recent_local_repositories() -> Vec<String> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    tauri::async_runtime::spawn_blocking(move || recent_local_repos(&home))
        .await
        .unwrap_or_default()
}
