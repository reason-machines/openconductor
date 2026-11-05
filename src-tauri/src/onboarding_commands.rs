//! IPC for the first-run onboarding (`src/onboarding/`). Conductor v0.87.6
//! keeps the gate in `settings.first_time_onboarding_step` of conductor.db;
//! the queries are tested in `crates/openconductor-db`
//! (`onboarding::first_run_step`, `onboarding::finish_first_run`).

use tauri::State;

use crate::db::Db;

/// JS: `invoke("db_first_run_onboarding_step")`: the stored step as text,
/// null when it was never written.
#[tauri::command]
pub async fn db_first_run_onboarding_step(db: State<'_, Db>) -> Result<Option<String>, String> {
    openconductor_db::onboarding::first_run_step(&db.0)
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_finish_first_run_onboarding")`: the "Continue" of the
/// onboarding screen.
#[tauri::command]
pub async fn db_finish_first_run_onboarding(db: State<'_, Db>) -> Result<(), String> {
    openconductor_db::onboarding::finish_first_run(&db.0)
        .await
        .map_err(|e| e.to_string())
}
