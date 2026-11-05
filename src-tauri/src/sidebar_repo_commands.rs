//! IPC for the sidebar's repository actions: hide / unhide a repository and
//! the manual repository order. Conductor v0.87.6 writes both straight to
//! `repos.hidden` and `repos.display_order` from its repo list
//! (renderApp-D_fmY7hW.js @10042864); the queries are tested in
//! `crates/openconductor-db` (`repos::set_hidden`, `repos::reorder`).

use tauri::State;

use crate::db::Db;

/// JS: `invoke("db_set_repo_hidden", { repoId, hidden })`.
#[tauri::command]
pub async fn db_set_repo_hidden(
    db: State<'_, Db>,
    repo_id: String,
    hidden: bool,
) -> Result<(), String> {
    openconductor_db::repos::set_hidden(&db.0, &repo_id, hidden)
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_reorder_repos", { ids })`: every repository id, in the
/// new sidebar order (hidden ones included).
#[tauri::command]
pub async fn db_reorder_repos(db: State<'_, Db>, ids: Vec<String>) -> Result<(), String> {
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    openconductor_db::repos::reorder(&db.0, &ids)
        .await
        .map_err(|e| e.to_string())
}
