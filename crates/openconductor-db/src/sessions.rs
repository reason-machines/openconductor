//! Chat sessions (`sessions`): one agent conversation inside a workspace.
//!
//! Every statement is a SQL string literal from the reference app's decoded
//! frontend bundle (Conductor 0.87.6, `assets/index-BGEQ8YjU.js`), where the
//! sessions service runs its SQL through `tauri-plugin-sql`. Value sets
//! (statuses, permission modes, agent types) come from the same bundle's row
//! decoders, which throw on any other value; decoding here fails the same way.
//!
//! The reference has no `ORDER BY` when it loads a workspace's sessions; it
//! sorts in JS: visible sessions oldest first (`created_at`, then
//! `updated_at`, then id), hidden ones most recently updated first
//! (`updated_at` desc, `created_at` desc, then id). [`list_for_workspace`]
//! does the same sort in SQL with `julianday`, because `created_at` is written
//! as an ISO-8601 string by the app while the `update_sessions_updated_at`
//! trigger writes `datetime('now')` (`YYYY-MM-DD HH:MM:SS`).
//!
//! `updated_at` is maintained by that trigger on every update.

use sqlx::SqlitePool;

use crate::{exec, exec_one, Result};

/// `sessions.status`. The reference decoder accepts exactly these values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum SessionStatus {
    Idle,
    Working,
    Error,
    NeedsPlanResponse,
    NeedsUserInput,
    NeedsUserPermission,
    Cancelling,
    Waiting,
}

impl SessionStatus {
    pub const ALL: [SessionStatus; 8] = [
        Self::Idle,
        Self::Working,
        Self::Error,
        Self::NeedsPlanResponse,
        Self::NeedsUserInput,
        Self::NeedsUserPermission,
        Self::Cancelling,
        Self::Waiting,
    ];

    /// The column value, e.g. `needs_user_permission`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Working => "working",
            Self::Error => "error",
            Self::NeedsPlanResponse => "needs_plan_response",
            Self::NeedsUserInput => "needs_user_input",
            Self::NeedsUserPermission => "needs_user_permission",
            Self::Cancelling => "cancelling",
            Self::Waiting => "waiting",
        }
    }

    /// The status a column value names; `None` for any other text, as the
    /// reference decoder (`JZe`) throws on it.
    pub fn parse(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|v| v.as_str() == s)
    }
}

/// `sessions.permission_mode`; NULL reads as [`PermissionMode::Default`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum PermissionMode {
    #[default]
    Default,
    Plan,
}

/// `sessions.agent_type` (an untyped column in the reference schema).
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum AgentType {
    Claude,
    Codex,
    Cursor,
    Acp,
}

impl AgentType {
    /// The column holding this agent's thinking level: Claude uses
    /// `claude_effort_level`, Codex and Cursor share `codex_thinking_level`,
    /// ACP agents have none (reference `k_`).
    pub fn thinking_level_column(self) -> Option<&'static str> {
        match self {
            AgentType::Claude => Some("claude_effort_level"),
            AgentType::Codex | AgentType::Cursor => Some("codex_thinking_level"),
            AgentType::Acp => None,
        }
    }
}

/// Title of a session that has not been named (reference constant `V0`).
pub const UNTITLED: &str = "Untitled";

/// One row of `sessions`, decoded the way the reference's `pB` does:
/// `unread_count`, `freshly_compacted`, `is_hidden` and `fast_mode` are true
/// only when exactly 1; NULL title reads as [`UNTITLED`], NULL
/// `feed_offset` as -1, NULL `context_token_count` as 0. `DEPRECATED_*`
/// columns are not read.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub workspace_id: Option<String>,
    pub status: SessionStatus,
    pub agent_type: Option<AgentType>,
    pub model: Option<String>,
    pub acp_config: Option<String>,
    pub permission_mode: PermissionMode,
    pub claude_effort_level: Option<String>,
    pub codex_thinking_level: Option<String>,
    pub agent_personality: Option<String>,
    pub fast_mode: bool,
    /// The agent's own session id (Claude Code or Codex thread id).
    pub claude_session_id: Option<String>,
    pub unread: bool,
    pub freshly_compacted: bool,
    pub is_compacting: bool,
    pub context_token_count: i64,
    pub context_used_percent: Option<f64>,
    pub last_user_message_at: Option<String>,
    pub resume_session_at: Option<String>,
    pub is_hidden: bool,
    pub title: String,
    pub feed_offset: i64,
    pub queue_paused_at: Option<String>,
    pub remote_archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const COLUMNS: &str = "id, workspace_id, status, agent_type, model, acp_config, \
    COALESCE(permission_mode, 'default') AS permission_mode, claude_effort_level, \
    codex_thinking_level, agent_personality, fast_mode IS 1 AS fast_mode, claude_session_id, \
    unread_count IS 1 AS unread, freshly_compacted IS 1 AS freshly_compacted, \
    is_compacting IS 1 AS is_compacting, COALESCE(context_token_count, 0) AS context_token_count, \
    context_used_percent, last_user_message_at, resume_session_at, is_hidden IS 1 AS is_hidden, \
    COALESCE(title, 'Untitled') AS title, COALESCE(feed_offset, -1) AS feed_offset, \
    queue_paused_at, remote_archived_at, created_at, updated_at";

/// Fields of a new local session (reference `createSession`).
#[derive(Debug, Clone)]
pub struct NewSession {
    pub id: String,
    pub workspace_id: String,
    pub agent_type: Option<AgentType>,
    pub model: Option<String>,
    pub acp_config: Option<String>,
    pub permission_mode: PermissionMode,
    pub codex_thinking_level: Option<String>,
    pub agent_personality: Option<String>,
    pub fast_mode: bool,
    pub claude_effort_level: Option<String>,
    /// ISO-8601 time stored as both `created_at` and `updated_at`.
    pub now: String,
}

/// Create an idle session with no agent session id and `feed_offset` -1.
pub async fn create(pool: &SqlitePool, s: &NewSession) -> Result<Session> {
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, status, claude_session_id, last_user_message_at, \
         agent_type, model, acp_config, permission_mode, codex_thinking_level, agent_personality, \
         fast_mode, claude_effort_level, feed_offset, created_at, updated_at) \
         VALUES (?, ?, 'idle', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, -1, ?, ?)",
    )
    .bind(&s.id)
    .bind(&s.workspace_id)
    .bind(s.agent_type)
    .bind(&s.model)
    .bind(&s.acp_config)
    .bind(s.permission_mode)
    .bind(&s.codex_thinking_level)
    .bind(&s.agent_personality)
    .bind(s.fast_mode)
    .bind(&s.claude_effort_level)
    .bind(&s.now)
    .bind(&s.now)
    .execute(pool)
    .await?;
    get(pool, &s.id).await?.ok_or(crate::Error::NotFound)
}

/// Fields of a session mirrored from a remote (cloud) workspace.
#[derive(Debug, Clone)]
pub struct RemoteSession {
    pub id: String,
    pub workspace_id: String,
    pub agent_type: Option<AgentType>,
    pub model: Option<String>,
    pub permission_mode: PermissionMode,
    pub codex_thinking_level: Option<String>,
    pub agent_personality: Option<String>,
    pub fast_mode: bool,
    pub claude_effort_level: Option<String>,
    pub remote_archived_at: Option<String>,
    pub is_hidden: bool,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Insert a remote session unless one with this id exists (reference
/// `ensureRemoteSession`, `INSERT OR IGNORE`). True when a row was inserted.
pub async fn insert_remote_if_missing(pool: &SqlitePool, s: &RemoteSession) -> Result<bool> {
    let q = sqlx::query(
        "INSERT OR IGNORE INTO sessions (id, workspace_id, status, claude_session_id, \
         last_user_message_at, agent_type, model, permission_mode, codex_thinking_level, \
         agent_personality, fast_mode, claude_effort_level, remote_archived_at, is_hidden, title, \
         feed_offset, created_at, updated_at) \
         VALUES (?, ?, 'idle', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, -1, ?, ?)",
    )
    .bind(&s.id)
    .bind(&s.workspace_id)
    .bind(s.agent_type)
    .bind(&s.model)
    .bind(s.permission_mode)
    .bind(&s.codex_thinking_level)
    .bind(&s.agent_personality)
    .bind(s.fast_mode)
    .bind(&s.claude_effort_level)
    .bind(&s.remote_archived_at)
    .bind(s.is_hidden)
    .bind(&s.title)
    .bind(&s.created_at)
    .bind(&s.updated_at);
    Ok(exec(q, pool).await? > 0)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Session>> {
    let sql = format!("SELECT {COLUMNS} FROM sessions WHERE id = ?");
    Ok(sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?)
}

/// Every session, most recently updated first.
pub async fn list(pool: &SqlitePool) -> Result<Vec<Session>> {
    let sql = format!("SELECT {COLUMNS} FROM sessions ORDER BY updated_at DESC");
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

/// A workspace's visible (`hidden = false`) or hidden sessions, in the
/// order the reference's session list shows them (see the module docs).
pub async fn list_for_workspace(
    pool: &SqlitePool,
    workspace_id: &str,
    hidden: bool,
) -> Result<Vec<Session>> {
    let order = if hidden {
        "julianday(updated_at) DESC, julianday(created_at) DESC, id ASC"
    } else {
        "julianday(created_at) ASC, julianday(updated_at) ASC, id ASC"
    };
    let sql = format!(
        "SELECT {COLUMNS} FROM sessions WHERE workspace_id = ? AND (is_hidden IS 1) = ? \
         ORDER BY {order}"
    );
    Ok(sqlx::query_as(&sql)
        .bind(workspace_id)
        .bind(hidden)
        .fetch_all(pool)
        .await?)
}

/// The workspace a session belongs to.
pub async fn workspace_id(pool: &SqlitePool, id: &str) -> Result<Option<String>> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT workspace_id FROM sessions WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.and_then(|(w,)| w))
}

/// Ids of every session in the given workspaces (reference archive and
/// `deleteSessionsForWorkspaceIds`).
pub async fn ids_for_workspaces(
    pool: &SqlitePool,
    workspace_ids: &[String],
) -> Result<Vec<String>> {
    if workspace_ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT id FROM sessions WHERE workspace_id IN ({})",
        placeholders(workspace_ids.len())
    );
    let mut q = sqlx::query_as::<_, (String,)>(&sql);
    for w in workspace_ids {
        q = q.bind(w);
    }
    Ok(q.fetch_all(pool)
        .await?
        .into_iter()
        .map(|(id,)| id)
        .collect())
}

pub async fn set_status(pool: &SqlitePool, id: &str, status: SessionStatus) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET status = ? WHERE id = ?")
            .bind(status)
            .bind(id),
        pool,
    )
    .await
}

/// Compare-and-set the status. False when the session was not in `from`.
pub async fn set_status_if(
    pool: &SqlitePool,
    id: &str,
    from: SessionStatus,
    to: SessionStatus,
) -> Result<bool> {
    let q = sqlx::query("UPDATE sessions SET status = ? WHERE id = ? AND status = ?")
        .bind(to)
        .bind(id)
        .bind(from);
    Ok(exec(q, pool).await? > 0)
}

/// Record the agent's own session id (`claude_session_id`).
pub async fn set_claude_session_id(
    pool: &SqlitePool,
    id: &str,
    claude_session_id: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET claude_session_id = ? WHERE id = ?")
            .bind(claude_session_id)
            .bind(id),
        pool,
    )
    .await
}

/// Agent-reported session state. Each `Some` field is written; `None`
/// leaves the column alone. `latest_user_message_at` only moves
/// `last_user_message_at` forward.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SessionMutation {
    pub status: Option<SessionStatus>,
    pub claude_session_id: Option<String>,
    pub permission_mode: Option<PermissionMode>,
    pub latest_user_message_at: Option<String>,
    pub context_token_count: Option<i64>,
    pub context_used_percent: Option<f64>,
}

/// Apply a [`SessionMutation`] in one statement (reference `xoe`); does
/// nothing when every field is `None`.
pub async fn apply_mutation(pool: &SqlitePool, id: &str, m: &SessionMutation) -> Result<()> {
    if *m == SessionMutation::default() {
        return Ok(());
    }
    let q = sqlx::query(
        "UPDATE sessions SET \
         status = CASE WHEN ? THEN ? ELSE status END, \
         claude_session_id = CASE WHEN ? THEN ? ELSE claude_session_id END, \
         permission_mode = CASE WHEN ? THEN ? ELSE permission_mode END, \
         last_user_message_at = CASE WHEN ? IS NOT NULL AND ( \
             last_user_message_at IS NULL OR last_user_message_at < ? \
         ) THEN ? ELSE last_user_message_at END, \
         context_token_count = CASE WHEN ? THEN ? ELSE context_token_count END, \
         context_used_percent = CASE WHEN ? THEN ? ELSE context_used_percent END \
         WHERE id = ?",
    )
    .bind(m.status.is_some())
    .bind(m.status)
    .bind(m.claude_session_id.is_some())
    .bind(&m.claude_session_id)
    .bind(m.permission_mode.is_some())
    .bind(m.permission_mode)
    .bind(&m.latest_user_message_at)
    .bind(&m.latest_user_message_at)
    .bind(&m.latest_user_message_at)
    .bind(m.context_token_count.is_some())
    .bind(m.context_token_count)
    .bind(m.context_used_percent.is_some())
    .bind(m.context_used_percent)
    .bind(id);
    exec_one(q, pool).await
}

/// Switch the agent and model (reference `updateSessionModel` without a
/// thinking level).
pub async fn set_agent_and_model(
    pool: &SqlitePool,
    id: &str,
    agent_type: AgentType,
    model: Option<&str>,
    fast_mode: bool,
) -> Result<()> {
    let q =
        sqlx::query("UPDATE sessions SET agent_type = ?, model = ?, fast_mode = ? WHERE id = ?")
            .bind(agent_type)
            .bind(model)
            .bind(fast_mode)
            .bind(id);
    exec_one(q, pool).await
}

/// Store a thinking level in the agent's column. False (nothing written)
/// for ACP agents, which have no thinking-level column.
pub async fn set_thinking_level(
    pool: &SqlitePool,
    id: &str,
    agent_type: AgentType,
    level: &str,
) -> Result<bool> {
    let Some(column) = agent_type.thinking_level_column() else {
        return Ok(false);
    };
    let sql = format!("UPDATE sessions SET {column} = ? WHERE id = ?");
    exec_one(sqlx::query(&sql).bind(level).bind(id), pool).await?;
    Ok(true)
}

pub async fn set_fast_mode(pool: &SqlitePool, id: &str, fast_mode: bool) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET fast_mode = ? WHERE id = ?")
            .bind(fast_mode)
            .bind(id),
        pool,
    )
    .await
}

pub async fn set_agent_personality(
    pool: &SqlitePool,
    id: &str,
    personality: Option<&str>,
) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET agent_personality = ? WHERE id = ?")
            .bind(personality)
            .bind(id),
        pool,
    )
    .await
}

pub async fn set_title(pool: &SqlitePool, id: &str, title: &str) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET title = ? WHERE id = ?")
            .bind(title)
            .bind(id),
        pool,
    )
    .await
}

/// Set or clear the unread flag (`unread_count` 1 or 0).
pub async fn set_unread(pool: &SqlitePool, id: &str, unread: bool) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET unread_count = ? WHERE id = ?")
            .bind(unread)
            .bind(id),
        pool,
    )
    .await
}

/// Set a chat's unread flag, creating its row when the chat has none yet
/// (Codex chats, or a chat that has stored no message). A row created by
/// `chat_messages::save` has no `workspace_id`; this fills it, so
/// [`mark_workspace_read`] and [`unread_chats`] see the chat. An existing
/// `workspace_id` is kept.
///
/// The reference has no such upsert: its `setUnread` (`ret`) updates a row
/// that `createSession` made with the workspace id. Here chats are created
/// by the frontend, so the row may not exist.
pub async fn upsert_unread(
    pool: &SqlitePool,
    id: &str,
    workspace_id: &str,
    unread: bool,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, unread_count) VALUES (?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET unread_count = excluded.unread_count, \
         workspace_id = COALESCE(sessions.workspace_id, excluded.workspace_id)",
    )
    .bind(id)
    .bind(workspace_id)
    .bind(unread)
    .execute(pool)
    .await?;
    Ok(())
}

/// An unread, non-hidden chat (one row of [`unread_chats`]).
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct UnreadChat {
    pub workspace_id: String,
    pub id: String,
    /// `sessions.updated_at` as stored (ISO-8601 or `datetime('now')`).
    pub updated_at: String,
}

/// Every unread chat that is not hidden and belongs to a workspace, by
/// workspace then id. A workspace is unread when it has one (reference
/// `zJo`: `sessions.filter(s => !s.isHidden).some(s => s.unread)`).
pub async fn unread_chats(pool: &SqlitePool) -> Result<Vec<UnreadChat>> {
    Ok(sqlx::query_as(
        "SELECT workspace_id, id, updated_at FROM sessions \
         WHERE unread_count = 1 AND is_hidden IS NOT 1 AND workspace_id IS NOT NULL \
         ORDER BY workspace_id, id",
    )
    .fetch_all(pool)
    .await?)
}

/// Open a chat tab (a review, a fork or a "+" chat): the chat's row in its
/// workspace, visible, with `title`. A row `chat_messages::save` made with no
/// workspace gets one; an existing workspace is kept. Opening a closed tab
/// again shows it again and keeps its place. `now` (ISO-8601) is its
/// `created_at`, which orders the tabs.
///
/// The reference's Review button creates the review chat with
/// `createSession` (index-BGEQ8YjU.js `GNt` at 1949:3602), a `sessions` row in
/// the workspace (`Xet` at 708:7705, `INSERT INTO sessions`); closing a tab sets
/// `is_hidden = 1` (`nie` at 710:2534) and reopening it clears it (`Oet`).
pub async fn open_tab(
    pool: &SqlitePool,
    id: &str,
    workspace_id: &str,
    title: &str,
    now: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, title, is_hidden, created_at, updated_at) \
         VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET is_hidden = 0, title = excluded.title, \
         workspace_id = COALESCE(sessions.workspace_id, excluded.workspace_id)",
    )
    .bind(id)
    .bind(workspace_id)
    .bind(title)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

/// A chat tab that is open (one row of [`open_tabs`]).
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct OpenTab {
    pub workspace_id: String,
    pub id: String,
    pub title: String,
}

/// Every open chat tab besides the workspaces' main chats, by workspace, then
/// oldest first: the tabs a restart shows again. The reference's tab strip is
/// the workspace's non-hidden sessions as stored (`ylt` at 1226:63776 over
/// `doGetSessionsForWorkspace` at 1226:36669), so a review chat and its unread
/// survive a restart. Only our own tab ids count: `<workspace id>:review:<n>`
/// and `<workspace id>:chat:<n>`, not a Claude Code chat (`<chat id>:claude`).
pub async fn open_tabs(pool: &SqlitePool) -> Result<Vec<OpenTab>> {
    Ok(sqlx::query_as(
        "SELECT workspace_id, id, COALESCE(title, 'Untitled') AS title FROM sessions \
         WHERE is_hidden IS NOT 1 AND workspace_id IS NOT NULL AND id NOT LIKE '%:claude' \
         AND (substr(id, 1, length(workspace_id) + 8) = workspace_id || ':review:' \
           OR substr(id, 1, length(workspace_id) + 6) = workspace_id || ':chat:') \
         ORDER BY workspace_id, julianday(created_at), julianday(updated_at), id",
    )
    .fetch_all(pool)
    .await?)
}

/// Mark every unread session in a workspace read; returns their ids.
pub async fn mark_workspace_read(pool: &SqlitePool, workspace_id: &str) -> Result<Vec<String>> {
    let ids: Vec<(String,)> =
        sqlx::query_as("SELECT id from sessions WHERE workspace_id = ? AND unread_count = 1")
            .bind(workspace_id)
            .fetch_all(pool)
            .await?;
    exec(
        sqlx::query(
            "UPDATE sessions SET unread_count = 0 WHERE workspace_id = ? AND unread_count = 1",
        )
        .bind(workspace_id),
        pool,
    )
    .await?;
    Ok(ids.into_iter().map(|(id,)| id).collect())
}

pub async fn set_freshly_compacted(pool: &SqlitePool, id: &str, value: bool) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET freshly_compacted = ? WHERE id = ?")
            .bind(value)
            .bind(id),
        pool,
    )
    .await
}

pub async fn set_resume_session_at(pool: &SqlitePool, id: &str, at: Option<&str>) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET resume_session_at = ? WHERE id = ?")
            .bind(at)
            .bind(id),
        pool,
    )
    .await
}

/// Update context usage; a `None` keeps the stored value.
pub async fn set_context_usage(
    pool: &SqlitePool,
    id: &str,
    percent_used: Option<f64>,
    current_tokens: Option<i64>,
) -> Result<()> {
    if percent_used.is_none() && current_tokens.is_none() {
        return Ok(());
    }
    let q = sqlx::query(
        "UPDATE sessions SET context_used_percent = COALESCE(?, context_used_percent), \
         context_token_count = COALESCE(?, context_token_count) WHERE id = ?",
    )
    .bind(percent_used)
    .bind(current_tokens)
    .bind(id);
    exec_one(q, pool).await
}

/// Set `last_user_message_at` unconditionally.
pub async fn set_last_user_message_at(pool: &SqlitePool, id: &str, at: &str) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET last_user_message_at = ? WHERE id = ?")
            .bind(at)
            .bind(id),
        pool,
    )
    .await
}

/// Move `last_user_message_at` forward to `at` (never backwards).
pub async fn bump_last_user_message_at(pool: &SqlitePool, id: &str, at: &str) -> Result<()> {
    let q = sqlx::query(
        "UPDATE sessions SET last_user_message_at = \
         MAX(COALESCE(last_user_message_at, ?), ?) WHERE id = ?",
    )
    .bind(at)
    .bind(at)
    .bind(id);
    exec_one(q, pool).await
}

/// Store how far the agent feed has been applied (`None` stores -1).
pub async fn set_feed_offset(pool: &SqlitePool, id: &str, offset: Option<i64>) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET feed_offset = ? WHERE id = ?")
            .bind(offset.unwrap_or(-1))
            .bind(id),
        pool,
    )
    .await
}

pub async fn hide(pool: &SqlitePool, id: &str) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET is_hidden = 1 WHERE id = ?").bind(id),
        pool,
    )
    .await
}

pub async fn unhide(pool: &SqlitePool, id: &str) -> Result<()> {
    exec_one(
        sqlx::query("UPDATE sessions SET is_hidden = 0 WHERE id = ?").bind(id),
        pool,
    )
    .await
}

/// Whether a session is hidden; `None` when it does not exist.
pub async fn is_hidden(pool: &SqlitePool, id: &str) -> Result<Option<bool>> {
    let row: Option<(Option<i64>,)> = sqlx::query_as("SELECT is_hidden FROM sessions WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(h,)| h == Some(1)))
}

/// Statuses a crashed or restarted app can leave behind for one workspace
/// (reference `Cet`).
const BUSY_IN_WORKSPACE: &str = "status = 'working' OR status = 'needs_plan_response' \
    OR status = 'cancelling' OR status = 'needs_user_input' \
    OR status = 'needs_user_permission' OR status = 'waiting'";

/// Statuses reset at app startup; `needs_user_input` survives (reference `Ret`).
const BUSY_AT_STARTUP: &str = "status = 'working' OR status = 'needs_plan_response' \
    OR status = 'cancelling' OR status = 'needs_user_permission' OR status = 'waiting'";

/// Reset a workspace's busy sessions to `idle`; returns their ids.
pub async fn reset_busy_to_idle_in_workspace(
    pool: &SqlitePool,
    workspace_id: &str,
) -> Result<Vec<String>> {
    let filter = format!("WHERE workspace_id = ? AND ({BUSY_IN_WORKSPACE})");
    let ids: Vec<(String,)> = sqlx::query_as(&format!("SELECT id FROM sessions {filter}"))
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;
    exec(
        sqlx::query(&format!("UPDATE sessions SET status = 'idle' {filter}")).bind(workspace_id),
        pool,
    )
    .await?;
    Ok(ids.into_iter().map(|(id,)| id).collect())
}

/// At startup, reset busy sessions of local workspaces (no
/// `hosting_server_url`) to `idle`; returns their ids.
pub async fn reset_busy_to_idle_at_startup(pool: &SqlitePool) -> Result<Vec<String>> {
    let select = format!(
        "SELECT id FROM sessions WHERE ({BUSY_AT_STARTUP}) AND EXISTS ( \
         SELECT 1 FROM workspaces WHERE workspaces.local_id = sessions.workspace_id AND ( \
         workspaces.hosting_server_url IS NULL OR workspaces.hosting_server_url = '' \
         OR workspaces.hosting_server_url = '/'))"
    );
    let ids: Vec<(String,)> = sqlx::query_as(&select).fetch_all(pool).await?;
    exec(
        sqlx::query(&format!(
            "UPDATE sessions SET status = 'idle' WHERE id IN ({select})"
        )),
        pool,
    )
    .await?;
    Ok(ids.into_iter().map(|(id,)| id).collect())
}

/// A chat's status (OpenConductor). A chat's `sessions` row is made by
/// `chat_messages::save` with only its id; this creates it when missing and
/// fills in `workspace_id` if it has none, so the startup reset (reference
/// `xet`, [`reset_busy_to_idle_at_startup`]) covers chats as it covers the
/// reference's sessions.
pub async fn set_chat_status(
    pool: &SqlitePool,
    id: &str,
    workspace_id: &str,
    status: SessionStatus,
) -> Result<()> {
    exec(
        sqlx::query("INSERT OR IGNORE INTO sessions (id, workspace_id) VALUES (?, ?)")
            .bind(id)
            .bind(workspace_id),
        pool,
    )
    .await?;
    exec(
        sqlx::query(
            "UPDATE sessions SET status = ?, workspace_id = COALESCE(workspace_id, ?) WHERE id = ?",
        )
        .bind(status)
        .bind(workspace_id)
        .bind(id),
        pool,
    )
    .await?;
    Ok(())
}

/// One visible session that is not idle.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct ActiveStatus {
    pub id: String,
    pub workspace_id: Option<String>,
    pub status: SessionStatus,
}

/// Every visible (not hidden) session whose status is not `idle`, by id.
/// The sidebar and Home fold these per workspace (reference `nTr` over a
/// workspace's sessions with `hidden: false`).
pub async fn active_statuses(pool: &SqlitePool) -> Result<Vec<ActiveStatus>> {
    Ok(sqlx::query_as(
        "SELECT id, workspace_id, status FROM sessions \
         WHERE status IS NOT NULL AND status != 'idle' AND COALESCE(is_hidden, 0) = 0 ORDER BY id",
    )
    .fetch_all(pool)
    .await?)
}

/// Delete one session row. Its messages and attachments are not deleted
/// (the reference's `deleteSession` issues only this statement).
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<bool> {
    Ok(exec(
        sqlx::query("DELETE FROM sessions WHERE id = ?").bind(id),
        pool,
    )
    .await?
        > 0)
}

/// Delete every session in the given workspaces; returns the deleted ids.
pub async fn delete_for_workspaces(
    pool: &SqlitePool,
    workspace_ids: &[String],
) -> Result<Vec<String>> {
    let ids = ids_for_workspaces(pool, workspace_ids).await?;
    if ids.is_empty() {
        return Ok(ids);
    }
    let sql = format!(
        "DELETE FROM sessions WHERE id IN ({})",
        placeholders(ids.len())
    );
    let mut q = sqlx::query(&sql);
    for id in &ids {
        q = q.bind(id);
    }
    exec(q, pool).await?;
    Ok(ids)
}

pub(crate) fn placeholders(n: usize) -> String {
    vec!["?"; n].join(", ")
}
