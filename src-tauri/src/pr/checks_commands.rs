//! Tauri commands behind the Checks tab: a failing check's job log and
//! re-running failed jobs. Thin wrappers over [`super::runs`]; `gh` runs on
//! a blocking thread from `repo_path` (any checkout of the repository).

use tauri::async_runtime::spawn_blocking;

use super::api::gh_in;
use super::runs::{fetch_check_log, rerun_failed, CheckLog, CheckLogRequest};

/// JS: `invoke("pr_check_log", { repoPath, check: { name, conclusion, detailsUrl } })`.
#[tauri::command]
pub async fn pr_check_log(repo_path: String, check: CheckLogRequest) -> Result<CheckLog, String> {
    spawn_blocking(move || fetch_check_log(&gh_in(&repo_path), &check).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// JS: `invoke("pr_rerun_failed_checks", { repoPath, detailsUrls })`; resolves
/// to the Actions run ids re-run.
#[tauri::command]
pub async fn pr_rerun_failed_checks(
    repo_path: String,
    details_urls: Vec<String>,
) -> Result<Vec<u64>, String> {
    spawn_blocking(move || rerun_failed(&gh_in(&repo_path), &details_urls))
        .await
        .map_err(|e| e.to_string())?
}
