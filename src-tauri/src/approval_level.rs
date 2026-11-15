//! The approval level one Claude Code chat runs at: the chat's own choice
//! (the composer's "Claude Code approvals" picker), else its repository's
//! (repository Settings › Git), else Account › "Claude Code tool approvals"
//! ([`Settings::approval_level`]).
//!
//! The two overrides are rows of conductor.db's `settings` table
//! (`claude_approval_level:repo:<repo id>` and
//! `claude_approval_level:chat:<chat id>`), which only the app writes. They
//! are deliberately not keys of a repository's `.conductor/settings*.toml`:
//! those files can come with a clone, and a repository must not be able to
//! turn its own approvals off.

use openconductor_db::app_settings;
use serde::Serialize;
use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::Db;
use crate::local_plan_mode::{self, LocalPlanModes};
use crate::settings::service::SettingsService;
use crate::settings::ApprovalLevel;

/// Emitted when a chat's or a repository's override changes:
/// `{ chatId }` or `{ repoId }`.
pub const CHANGED: &str = "approval-level-changed";

const WHAT: &str = "Claude Code approvals";

fn repo_key(repo_id: &str) -> String {
    format!("claude_approval_level:repo:{repo_id}")
}

fn chat_key(chat_id: &str) -> String {
    format!("claude_approval_level:chat:{chat_id}")
}

/// Where a chat's level comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Chat,
    Repo,
    Global,
}

/// A chat's level and what it would be without the chat's own choice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Resolved {
    /// The level the chat's next turn runs at.
    pub level: ApprovalLevel,
    pub source: Source,
    /// The repository's level, else the account's: what the chat follows
    /// when it has no choice of its own.
    pub inherited: ApprovalLevel,
}

async fn stored(pool: &SqlitePool, key: &str) -> Result<Option<ApprovalLevel>, String> {
    let value = app_settings::get(pool, key)
        .await
        .map_err(|e| e.to_string())?;
    // A value this build does not know is no override.
    Ok(value.as_deref().and_then(ApprovalLevel::parse))
}

async fn store(pool: &SqlitePool, key: &str, level: Option<ApprovalLevel>) -> Result<(), String> {
    match level {
        Some(level) => app_settings::set(pool, key, level.as_str()).await,
        None => app_settings::delete(pool, key).await,
    }
    .map_err(|e| e.to_string())
}

/// The repository of the workspace `chat_id` belongs to. The first chat of
/// a workspace has the workspace's id; the others have a session row
/// naming it.
async fn repo_of_chat(pool: &SqlitePool, chat_id: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar::<_, Option<String>>(
        "SELECT repository_id FROM workspaces \
         WHERE local_id = COALESCE((SELECT workspace_id FROM sessions WHERE id = ?1), ?1)",
    )
    .bind(chat_id)
    .fetch_optional(pool)
    .await
    .map(Option::flatten)
    .map_err(|e| e.to_string())
}

/// The level of the logical chat `chat_id` (no `:claude` suffix), with
/// `global` the account's level.
pub async fn resolve(
    pool: &SqlitePool,
    global: ApprovalLevel,
    chat_id: &str,
) -> Result<Resolved, String> {
    let repo = match repo_of_chat(pool, chat_id).await? {
        Some(repo_id) => stored(pool, &repo_key(&repo_id)).await?,
        None => None,
    };
    let inherited = repo.unwrap_or(global);
    let chat = stored(pool, &chat_key(chat_id)).await?;
    Ok(Resolved {
        level: chat.unwrap_or(inherited),
        source: match (chat, repo) {
            (Some(_), _) => Source::Chat,
            (None, Some(_)) => Source::Repo,
            (None, None) => Source::Global,
        },
        inherited,
    })
}

fn parse(level: Option<&str>) -> Result<Option<ApprovalLevel>, String> {
    level
        .map(|text| ApprovalLevel::parse(text).ok_or("Invalid Claude Code approval level."))
        .transpose()
        .map_err(Into::into)
}

fn global(settings: &SettingsService) -> Result<ApprovalLevel, String> {
    settings
        .get()
        .map(|s| s.approval_level())
        .map_err(|e| e.to_string())
}

/// The level a chat's next turn runs at, for the composer's picker.
#[tauri::command]
pub async fn approval_level_get(
    db: State<'_, Db>,
    settings: State<'_, SettingsService>,
    chat_id: String,
    workspace_id: String,
) -> Result<Resolved, String> {
    local_plan_mode::validate(&db.0, &workspace_id, &chat_id).await?;
    resolve(&db.0, global(&settings)?, &chat_id).await
}

/// Sets the chat's own level, or with `level` null (or the level it would
/// inherit) goes back to following its repository and the account. Refused
/// while a turn runs, like Plan mode: the level belongs to a whole turn.
#[tauri::command]
pub async fn approval_level_set_chat(
    app: AppHandle,
    db: State<'_, Db>,
    modes: State<'_, LocalPlanModes>,
    settings: State<'_, SettingsService>,
    chat_id: String,
    workspace_id: String,
    level: Option<String>,
) -> Result<Resolved, String> {
    local_plan_mode::validate(&db.0, &workspace_id, &chat_id).await?;
    let level = parse(level.as_deref())?;
    let _idle = modes.idle_for(&chat_id, WHAT)?;
    if app
        .state::<crate::claude_chat::commands::ClaudeChats>()
        .busy(&app, &chat_id)
    {
        return Err(format!(
            "Wait for the current Claude Code turn to end before changing {WHAT}."
        ));
    }
    let global = global(&settings)?;
    let key = chat_key(&chat_id);
    store(&db.0, &key, None).await?;
    let inherited = resolve(&db.0, global, &chat_id).await?.inherited;
    store(&db.0, &key, level.filter(|l| *l != inherited)).await?;
    let _ = app.emit(CHANGED, json!({ "chatId": chat_id }));
    resolve(&db.0, global, &chat_id).await
}

/// The repository's override, or null when it follows the account.
#[tauri::command]
pub async fn repo_approval_level_get(
    db: State<'_, Db>,
    repo_id: String,
) -> Result<Option<ApprovalLevel>, String> {
    stored(&db.0, &repo_key(&repo_id)).await
}

/// Sets the repository's override; null clears it. Chats of the repository
/// without a choice of their own follow it from their next turn.
#[tauri::command]
pub async fn repo_approval_level_set(
    app: AppHandle,
    db: State<'_, Db>,
    repo_id: String,
    level: Option<String>,
) -> Result<Option<ApprovalLevel>, String> {
    let level = parse(level.as_deref())?;
    openconductor_db::repos::get(&db.0, &repo_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("The repository no longer exists.")?;
    store(&db.0, &repo_key(&repo_id), level).await?;
    let _ = app.emit(CHANGED, json!({ "repoId": repo_id }));
    stored(&db.0, &repo_key(&repo_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use ApprovalLevel::{ApproveAll, ApprovePrs, Auto};

    async fn db() -> SqlitePool {
        let db = openconductor_db::open_in_memory().await.unwrap();
        for repo in ["r", "other"] {
            sqlx::query("INSERT INTO repos (id, name, root_path) VALUES (?, 'Test', '/synthetic/repo')")
                .bind(repo)
                .execute(&db)
                .await
                .unwrap();
        }
        for (workspace, repo) in [("w", "r"), ("x", "other")] {
            sqlx::query("INSERT INTO workspaces (local_id, repository_id, directory_name, branch, state) VALUES (?, ?, 'Test', 'test', 'ready')")
                .bind(workspace)
                .bind(repo)
                .execute(&db)
                .await
                .unwrap();
        }
        // A second chat of workspace `w`, and the row Plan mode makes for a
        // workspace's first chat (no workspace id).
        sqlx::query("INSERT INTO sessions (id, workspace_id) VALUES ('w:chat:2', 'w'), ('w', NULL)")
            .execute(&db)
            .await
            .unwrap();
        db
    }

    #[tokio::test]
    async fn a_chat_follows_the_account_until_its_repository_or_it_says_otherwise() {
        let db = db().await;
        for global in ApprovalLevel::ALL {
            let r = resolve(&db, global, "w").await.unwrap();
            assert_eq!((r.level, r.source, r.inherited), (global, Source::Global, global));
        }

        store(&db, &repo_key("r"), Some(ApprovePrs)).await.unwrap();
        for chat in ["w", "w:chat:2"] {
            let r = resolve(&db, Auto, chat).await.unwrap();
            assert_eq!((r.level, r.source, r.inherited), (ApprovePrs, Source::Repo, ApprovePrs), "{chat}");
        }
        // Another repository's workspace still follows the account.
        assert_eq!(resolve(&db, Auto, "x").await.unwrap().source, Source::Global);

        store(&db, &chat_key("w:chat:2"), Some(ApproveAll)).await.unwrap();
        let r = resolve(&db, Auto, "w:chat:2").await.unwrap();
        assert_eq!((r.level, r.source, r.inherited), (ApproveAll, Source::Chat, ApprovePrs));
        // Only that chat.
        assert_eq!(resolve(&db, Auto, "w").await.unwrap().level, ApprovePrs);

        // A chat may also be looser than its repository.
        store(&db, &chat_key("w:chat:2"), Some(Auto)).await.unwrap();
        assert_eq!(resolve(&db, ApproveAll, "w:chat:2").await.unwrap().level, Auto);

        store(&db, &chat_key("w:chat:2"), None).await.unwrap();
        store(&db, &repo_key("r"), None).await.unwrap();
        let r = resolve(&db, ApproveAll, "w:chat:2").await.unwrap();
        assert_eq!((r.level, r.source), (ApproveAll, Source::Global));
    }

    #[tokio::test]
    async fn an_unknown_chat_or_stored_value_falls_back_to_the_account() {
        let db = db().await;
        let r = resolve(&db, ApprovePrs, "no-such-chat").await.unwrap();
        assert_eq!((r.level, r.source), (ApprovePrs, Source::Global));

        app_settings::set(&db, &repo_key("r"), "yolo").await.unwrap();
        app_settings::set(&db, &chat_key("w"), "").await.unwrap();
        let r = resolve(&db, ApproveAll, "w").await.unwrap();
        assert_eq!((r.level, r.source), (ApproveAll, Source::Global));
    }

    #[test]
    fn levels_cross_the_ipc_by_their_setting_names() {
        assert_eq!(parse(None), Ok(None));
        assert_eq!(parse(Some("approve_prs")), Ok(Some(ApprovePrs)));
        assert!(parse(Some("bypassPermissions")).is_err());
        let r = Resolved { level: ApprovePrs, source: Source::Repo, inherited: ApprovePrs };
        assert_eq!(
            serde_json::to_value(r).unwrap(),
            json!({ "level": "approve_prs", "source": "repo", "inherited": "approve_prs" })
        );
        assert!(Auto < ApprovePrs && ApprovePrs < ApproveAll);
    }
}
