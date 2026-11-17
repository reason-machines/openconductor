//! Session statuses (`sessions.status`) for the sidebar row icon and the
//! Home list (parity: sidebar.ws-status, home.status-overview).
//!
//! Conductor keeps every session's status in `conductor.db` and moves it as
//! the agent runs: a tool approval sets `needs_user_permission`, ExitPlanMode
//! `needs_plan_response`, AskUserQuestion and MCP elicitations
//! `needs_user_input`, and an idle turn with live background tasks `waiting`
//! (REA, index-BGEQ8YjU.js; evidence/parity/status/README.md). The rows read
//! them back folded per workspace. Here the frontend chat runtime reports
//! each chat's status with `session_set_status`; the backend stores it and
//! broadcasts it as [`EVENT`], so every view (and a restart) sees the same
//! value. `session_statuses` lists the visible sessions that are not idle.

use openconductor_db::sessions::{self, SessionStatus};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::Db;

/// Emitted with a [`SessionStatusDto`] whenever a status is written.
pub const EVENT: &str = "session-status";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusDto {
    /// The session (chat) id.
    pub chat_id: String,
    pub workspace_id: Option<String>,
    /// A `sessions.status` value, e.g. `needs_user_permission`.
    pub status: &'static str,
}

/// JS: `invoke("session_statuses", { includeHidden? })`; visible-only by default.
#[tauri::command]
pub async fn session_statuses(
    db: State<'_, Db>,
    include_hidden: Option<bool>,
) -> Result<Vec<SessionStatusDto>, String> {
    let rows = status_rows(&db.0, include_hidden)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| SessionStatusDto {
            chat_id: r.id,
            workspace_id: r.workspace_id,
            status: r.status.as_str(),
        })
        .collect())
}

async fn status_rows(
    pool: &openconductor_db::SqlitePool,
    include_hidden: Option<bool>,
) -> openconductor_db::Result<Vec<sessions::ActiveStatus>> {
    if include_hidden.unwrap_or(false) {
        sessions::all_active_statuses(pool).await
    } else {
        sessions::active_statuses(pool).await
    }
}

/// JS: `invoke("session_set_status", { chatId, workspaceId, status })`.
/// Refuses a value the reference decoder would not accept.
#[tauri::command]
pub async fn session_set_status(
    app: AppHandle,
    db: State<'_, Db>,
    chat_id: String,
    workspace_id: String,
    status: String,
) -> Result<(), String> {
    let parsed =
        SessionStatus::parse(&status).ok_or(format!("Unknown session status: {status}"))?;
    sessions::set_chat_status(&db.0, &chat_id, &workspace_id, parsed)
        .await
        .map_err(|e| e.to_string())?;
    let dto = SessionStatusDto {
        chat_id,
        workspace_id: Some(workspace_id),
        status: parsed.as_str(),
    };
    app.emit(EVENT, dto).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::status_rows;

    #[tokio::test]
    async fn omitted_and_false_visibility_options_preserve_the_default_query() {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        for (id, hidden) in [("visible", false), ("hidden", true)] {
            sqlx::query("INSERT INTO sessions (id, status, is_hidden) VALUES (?, 'working', ?)")
                .bind(id)
                .bind(hidden)
                .execute(&pool)
                .await
                .unwrap();
        }
        let legacy = openconductor_db::sessions::active_statuses(&pool)
            .await
            .unwrap();
        assert_eq!(legacy.len(), 1);
        assert_eq!(status_rows(&pool, None).await.unwrap(), legacy);
        assert_eq!(status_rows(&pool, Some(false)).await.unwrap(), legacy);
        let all: Vec<_> = status_rows(&pool, Some(true))
            .await
            .unwrap()
            .into_iter()
            .map(|row| row.id)
            .collect();
        assert_eq!(all, ["hidden", "visible"]);
        assert_eq!(status_rows(&pool, None).await.unwrap(), legacy);
    }
}
