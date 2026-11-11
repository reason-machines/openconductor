use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use openconductor_db::sessions::{self, PermissionMode};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use crate::db::Db;
use crate::settings::service::SettingsService;

#[derive(Default)]
pub struct LocalPlanModes {
    chats: Mutex<HashMap<String, Arc<AsyncMutex<()>>>>,
}

impl LocalPlanModes {
    pub fn gate(&self, chat_id: &str) -> Arc<AsyncMutex<()>> {
        self.chats.lock().unwrap().entry(chat_id.to_owned()).or_default().clone()
    }

    fn idle(&self, chat_id: &str) -> Result<OwnedMutexGuard<()>, String> {
        self.gate(chat_id).try_lock_owned().map_err(|_| "Wait for the current Claude Code turn to end before changing Plan mode.".into())
    }
}

pub fn claude_permission(mode: PermissionMode, approvals: bool) -> crate::agent::PermissionMode {
    match mode {
        PermissionMode::Plan => crate::agent::PermissionMode::Plan,
        PermissionMode::Default if approvals => crate::agent::PermissionMode::Default,
        PermissionMode::Default => crate::agent::PermissionMode::BypassPermissions,
    }
}

pub fn wire(mode: PermissionMode) -> &'static str {
    match mode { PermissionMode::Default => "default", PermissionMode::Plan => "plan" }
}

fn parse(mode: &str) -> Result<PermissionMode, String> {
    match mode { "default" => Ok(PermissionMode::Default), "plan" => Ok(PermissionMode::Plan), _ => Err("Invalid local Plan mode.".into()) }
}

pub fn logical_chat_id(run_id: &str) -> &str {
    run_id.strip_suffix(":claude").unwrap_or(run_id)
}

async fn validate(pool: &SqlitePool, workspace_id: &str, chat_id: &str) -> Result<(), String> {
    if chat_id.is_empty() || chat_id.ends_with(":claude") { return Err("Plan mode requires the logical chat ID.".into()); }
    let workspace: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE local_id = ? AND state = 'ready'")
        .bind(workspace_id).fetch_one(pool).await.map_err(|e| e.to_string())?;
    if workspace != 1 { return Err("The local workspace is not ready.".into()); }
    if chat_id != workspace_id {
        let session = sessions::get(pool, chat_id).await.map_err(|e| e.to_string())?.ok_or("The local chat no longer exists.")?;
        if session.workspace_id.as_deref() != Some(workspace_id) || session.is_hidden { return Err("The chat does not belong to this workspace.".into()); }
    }
    Ok(())
}

pub async fn load(pool: &SqlitePool, chat_id: &str, default_plan: bool) -> Result<PermissionMode, String> {
    sqlx::query("INSERT OR IGNORE INTO sessions (id, permission_mode) VALUES (?, ?)")
        .bind(chat_id).bind(if default_plan { PermissionMode::Plan } else { PermissionMode::Default })
        .execute(pool).await.map_err(|e| e.to_string())?;
    sessions::get(pool, chat_id).await.map_err(|e| e.to_string())?.map(|s| s.permission_mode).ok_or_else(|| "The local chat no longer exists.".into())
}

pub async fn save(pool: &SqlitePool, chat_id: &str, mode: PermissionMode) -> Result<(), String> {
    let result = sqlx::query("UPDATE sessions SET permission_mode = ? WHERE id = ? AND is_hidden IS NOT 1")
        .bind(mode).bind(chat_id).execute(pool).await.map_err(|e| e.to_string())?;
    if result.rows_affected() != 1 { return Err("The local chat no longer exists.".into()); }
    Ok(())
}

pub fn emit(app: &AppHandle, chat_id: &str, mode: PermissionMode) {
    let _ = app.emit("local-plan-mode-changed", json!({ "chatId": chat_id, "mode": wire(mode) }));
}

#[tauri::command]
pub async fn local_plan_mode_get(db: State<'_, Db>, settings: State<'_, SettingsService>, chat_id: String, workspace_id: String) -> Result<String, String> {
    validate(&db.0, &workspace_id, &chat_id).await?;
    let settings = settings.get().map_err(|e| e.to_string())?;
    load(&db.0, &chat_id, settings.models.default_plan_mode).await.map(|mode| wire(mode).to_owned())
}

#[tauri::command]
pub async fn local_plan_mode_set(app: AppHandle, db: State<'_, Db>, state: State<'_, LocalPlanModes>, settings: State<'_, SettingsService>, chat_id: String, workspace_id: String, mode: String) -> Result<String, String> {
    validate(&db.0, &workspace_id, &chat_id).await?;
    let mode = parse(&mode)?;
    let _idle = state.idle(&chat_id)?;
    if app.state::<crate::claude_chat::commands::ClaudeChats>().busy(&app, &chat_id) {
        return Err("Wait for the current Claude Code turn to end before changing Plan mode.".into());
    }
    let settings = settings.get().map_err(|e| e.to_string())?;
    load(&db.0, &chat_id, settings.models.default_plan_mode).await?;
    save(&db.0, &chat_id, mode).await?;
    emit(&app, &chat_id, mode);
    Ok(wire(mode).to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaving_plan_restores_the_existing_approvals_policy() {
        use crate::agent::PermissionMode as Cli;
        assert_eq!(claude_permission(PermissionMode::Plan, false), Cli::Plan);
        assert_eq!(claude_permission(PermissionMode::Plan, true), Cli::Plan);
        assert_eq!(claude_permission(PermissionMode::Default, true), Cli::Default);
        assert_eq!(claude_permission(PermissionMode::Default, false), Cli::BypassPermissions);
    }

    #[tokio::test]
    async fn session_modes_are_persisted_separately_and_defaults_only_seed_new_rows() {
        let db = openconductor_db::open_in_memory().await.unwrap();
        assert_eq!(load(&db, "w", true).await.unwrap(), PermissionMode::Plan);
        save(&db, "w", PermissionMode::Default).await.unwrap();
        assert_eq!(load(&db, "w", true).await.unwrap(), PermissionMode::Default);
        assert_eq!(load(&db, "w:chat:2", true).await.unwrap(), PermissionMode::Plan);
        assert_eq!(load(&db, "w", false).await.unwrap(), PermissionMode::Default);
        assert_eq!(logical_chat_id("w:chat:2:claude"), "w:chat:2");
        assert_eq!(logical_chat_id("w"), "w");
        assert!(parse("bypassPermissions").is_err());
        assert!(save(&db, "missing", PermissionMode::Plan).await.is_err());
    }

    #[tokio::test]
    async fn a_running_chat_excludes_mode_mutations_without_blocking_another_chat() {
        let modes = LocalPlanModes::default();
        let running = modes.gate("a").lock_owned().await;
        assert!(modes.idle("a").is_err());
        assert!(modes.idle("b").is_ok());
        drop(running);
        assert!(modes.idle("a").is_ok());
    }

    #[tokio::test]
    async fn mode_boundary_rejects_provider_aliases_and_other_workspace_chats() {
        let db = openconductor_db::open_in_memory().await.unwrap();
        sqlx::query("INSERT INTO repos (id, name, root_path) VALUES ('r', 'Test', '/synthetic/repo')").execute(&db).await.unwrap();
        sqlx::query("INSERT INTO workspaces (local_id, repository_id, directory_name, branch, state) VALUES ('w', 'r', 'Test', 'test', 'ready')").execute(&db).await.unwrap();
        assert!(validate(&db, "w", "w").await.is_ok());
        assert!(validate(&db, "w", "w:claude").await.is_err());
        assert!(validate(&db, "w", "other:chat:1").await.is_err());
        assert!(validate(&db, "missing", "missing").await.is_err());
    }
}
