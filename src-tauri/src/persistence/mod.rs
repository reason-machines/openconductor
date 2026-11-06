//! Repositories and workspaces in `conductor.db` (opened by `db.rs`): the
//! source of truth the sidebar and Home list, kept in step with the workspace
//! service by the workspace commands.
//!
//! Tauri-free so it is tested on its own (`evidence/persistence/run-tests.sh`);
//! the IPC layer and the hooks the workspace commands call are in
//! `persistence_commands.rs`.
//!
//! Ids are the workspace service's: a repository id is its registry slug and
//! a workspace `local_id` is `<repositoryId>/<directoryName>`, the id the
//! other workspace commands (`rename_workspace_branch`, ...) take.

use openconductor_db::workspaces::{NewWorkspace, WorkspaceState};
use openconductor_db::{repos, sessions, workspaces, Result, SqlitePool};
use serde::Serialize;

/// Delete every workspace still `initializing` (its worktree was never
/// finished). Run at startup, before anything lists workspaces.
pub async fn delete_incomplete(pool: &SqlitePool) -> Result<usize> {
    let mut deleted = 0;
    for w in workspaces::list(pool).await? {
        let w = w.workspace;
        if w.state == WorkspaceState::Initializing
            && workspaces::delete_if_initializing(pool, &w.local_id).await?
        {
            deleted += 1;
        }
    }
    Ok(deleted)
}

/// A repository as the workspace service registered it.
#[derive(Debug, Clone)]
pub struct KnownRepo {
    pub id: String,
    pub name: String,
    pub root: String,
    pub default_branch: String,
}

/// A worktree the workspace service created.
#[derive(Debug, Clone)]
pub struct KnownWorkspace {
    pub id: String,
    pub repository_id: String,
    pub directory_name: String,
    pub branch: String,
    pub path: String,
    pub archived: bool,
}

/// Record a registered repository. Adding a hidden one again unhides it.
pub async fn record_repository(pool: &SqlitePool, repo: &KnownRepo) -> Result<()> {
    match repos::get(pool, &repo.id).await? {
        Some(existing) if existing.hidden => repos::set_hidden(pool, &repo.id, false).await,
        Some(_) => Ok(()),
        None => {
            let new = repos::NewRepo {
                id: repo.id.clone(),
                name: repo.name.clone(),
                root_path: repo.root.clone(),
                default_branch: Some(repo.default_branch.clone()),
                ..Default::default()
            };
            repos::insert(pool, &new).await.map(drop)
        }
    }
}

/// One-time import of state from before the database: a registry repository
/// the database lacks is added with its worktrees. Known repositories are left
/// alone, so a workspace deleted at startup is not brought back.
pub async fn import_repository(
    pool: &SqlitePool,
    repo: &KnownRepo,
    worktrees: &[KnownWorkspace],
) -> Result<bool> {
    if repos::get(pool, &repo.id).await?.is_some() {
        return Ok(false);
    }
    record_repository(pool, repo).await?;
    for w in worktrees {
        let state = if w.archived {
            WorkspaceState::Archived
        } else {
            WorkspaceState::Ready
        };
        insert_workspace(pool, w, state, None, None).await?;
    }
    Ok(true)
}

/// Row for a workspace whose worktree is being created (`initializing`).
pub async fn begin_workspace(
    pool: &SqlitePool,
    w: &KnownWorkspace,
    parent_branch: Option<&str>,
) -> Result<()> {
    insert_workspace(pool, w, WorkspaceState::Initializing, parent_branch, None).await?;
    // Numbered on creation, as Conductor does once its server answers.
    workspaces::set_number(pool, &w.id, workspaces::next_number(pool).await?).await
}

/// The worktree exists: replace any row with this id by a `ready` one.
/// Returns the workspace's number: the one `begin_workspace` gave it, or a new
/// one when the replaced row was a leftover (an archived workspace) or absent.
pub async fn finish_workspace(
    pool: &SqlitePool,
    w: &KnownWorkspace,
    parent_branch: Option<&str>,
    placeholder_branch_name: Option<&str>,
) -> Result<i64> {
    let kept = workspaces::get(pool, &w.id)
        .await?
        .map(|r| r.workspace)
        .filter(|r| r.state == WorkspaceState::Initializing)
        .and_then(|r| r.number);
    workspaces::delete(pool, &w.id).await?;
    insert_workspace(
        pool,
        w,
        WorkspaceState::Ready,
        parent_branch,
        placeholder_branch_name,
    )
    .await?;
    let number = match kept {
        Some(n) => n,
        None => workspaces::next_number(pool).await?,
    };
    workspaces::set_number(pool, &w.id, number).await?;
    Ok(number)
}

/// The worktree exists (Conductor's `qYe`): store the `git worktree add` log
/// and the tracked-file count as the row passes through `setting_up`.
/// Conductor keeps the row there until setup ends; ours tracks setup in the
/// scripts backend (`setup_script_status`), so the row goes on to `ready`.
pub async fn record_initialization(
    pool: &SqlitePool,
    local_id: &str,
    init_log: Option<&str>,
    files_copied: i64,
) -> Result<()> {
    workspaces::begin_setup(pool, local_id, init_log, files_copied).await?;
    workspaces::finish_setup(pool, local_id).await.map(drop)
}

/// Creating the worktree failed: drop its `initializing` row.
pub async fn abandon_workspace(pool: &SqlitePool, local_id: &str) -> Result<bool> {
    workspaces::delete_if_initializing(pool, local_id).await
}

/// The branch was renamed (after the first message); the placeholder is gone.
pub async fn record_rename(pool: &SqlitePool, local_id: &str, branch: &str) -> Result<()> {
    workspaces::rename_branch(pool, local_id, branch, None).await
}

/// Save the branch a workspace merges into (`intended_target_branch`).
pub async fn set_target_branch(pool: &SqlitePool, local_id: &str, branch: &str) -> Result<()> {
    workspaces::set_target_branch(pool, local_id, Some(branch)).await
}

async fn insert_workspace(
    pool: &SqlitePool,
    w: &KnownWorkspace,
    state: WorkspaceState,
    parent_branch: Option<&str>,
    placeholder_branch_name: Option<&str>,
) -> Result<()> {
    let new = NewWorkspace {
        local_id: w.id.clone(),
        repository_id: w.repository_id.clone(),
        directory_name: w.directory_name.clone(),
        workspace_name: None,
        branch: w.branch.clone(),
        placeholder_branch_name: placeholder_branch_name.map(str::to_string),
        state,
        initialization_parent_branch: parent_branch.map(str::to_string),
        intended_target_branch: parent_branch.map(str::to_string),
        workspace_path: (!w.path.is_empty()).then(|| w.path.clone()),
    };
    workspaces::insert(pool, &new).await.map(drop)
}

/// `db_list_repos` row, in sidebar order (`display_order`, `created_at`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRow {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub remote_url: Option<String>,
    pub default_branch: String,
    pub display_order: i64,
    pub hidden: bool,
    pub icon: Option<String>,
    pub created_at: String,
}

/// An unread chat of a [`WorkspaceRow`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreadChatRow {
    pub id: String,
    /// `sessions.updated_at`: "Go to next unread" sorts chats by it (Conductor's `Qre`).
    pub updated_at: String,
}

/// An open chat tab of a [`WorkspaceRow`] besides its main chat: a review, a
/// fork or a "+" chat (`sessions::open_tabs`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTabRow {
    pub id: String,
    pub title: String,
}

/// `db_list_workspaces` row. `state` is the snake_case schema value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub id: String,
    pub repository_id: String,
    pub directory_name: String,
    pub workspace_name: Option<String>,
    /// `workspaces.user_set_workspace_name`: show `workspace_name` as is.
    pub user_set_workspace_name: bool,
    pub branch: String,
    pub placeholder_branch_name: Option<String>,
    pub state: &'static str,
    pub derived_status: Option<String>,
    pub manual_status: Option<String>,
    pub workspace_path: Option<String>,
    /// `intended_target_branch`: the branch the work merges into; "All changes" diffs against it.
    pub intended_target_branch: Option<String>,
    pub pinned_at: Option<String>,
    /// `workspaces.unread`, the legacy flag: Conductor keeps unread per chat
    /// (`unread_chats`); the frontend folds this into the workspace's main chat.
    pub unread: bool,
    /// The workspace's unread, non-hidden chats (`sessions.unread_count`).
    pub unread_chats: Vec<UnreadChatRow>,
    /// The workspace's open chat tabs besides its main chat, oldest first:
    /// they come back after a restart with their unread, as Conductor's do.
    pub chat_tabs: Vec<ChatTabRow>,
    /// The main chat's own title once the user renamed it (`sessions::main_chat_titles`);
    /// absent, its tab shows the workspace name.
    pub chat_title: Option<String>,
    /// The PR's title and body as last stored (`pr_title`, `pr_description`):
    /// the sidebar label and Create PR's title / description.
    pub pr_title: Option<String>,
    pub pr_description: Option<String>,
    /// `workspaces.number`, shown as `W-<n>`; null for workspaces from before numbering.
    pub number: Option<i64>,
    /// Log of the `git worktree add` script and `git ls-files | wc -l` at
    /// creation (`initialization_log_path`, `initialization_files_copied`).
    pub initialization_log_path: Option<String>,
    pub initialization_files_copied: Option<i64>,
    pub created_at: String,
    /// `workspaces.updated_at`: last activity, the sidebar's and next-unread's sort key.
    pub updated_at: String,
}

pub async fn list_repos(pool: &SqlitePool) -> Result<Vec<RepoRow>> {
    Ok(repos::list(pool)
        .await?
        .into_iter()
        .map(|r| RepoRow {
            name: r.name.unwrap_or_default(),
            root_path: r.root_path.unwrap_or_default(),
            remote_url: r.remote_url,
            default_branch: r.default_branch.unwrap_or_else(|| "main".into()),
            display_order: r.display_order,
            hidden: r.hidden,
            icon: r.icon,
            created_at: r.created_at,
            id: r.id,
        })
        .collect())
}

/// Every workspace, oldest first.
pub async fn list_workspaces(pool: &SqlitePool) -> Result<Vec<WorkspaceRow>> {
    let mut unread: std::collections::HashMap<String, Vec<UnreadChatRow>> =
        std::collections::HashMap::new();
    for c in sessions::unread_chats(pool).await? {
        unread
            .entry(c.workspace_id)
            .or_default()
            .push(UnreadChatRow {
                id: c.id,
                updated_at: c.updated_at,
            });
    }
    let mut tabs: std::collections::HashMap<String, Vec<ChatTabRow>> =
        std::collections::HashMap::new();
    for t in sessions::open_tabs(pool).await? {
        tabs.entry(t.workspace_id).or_default().push(ChatTabRow {
            id: t.id,
            title: t.title,
        });
    }
    let mut titles: std::collections::HashMap<String, String> = sessions::main_chat_titles(pool)
        .await?
        .into_iter()
        .collect();
    Ok(workspaces::list(pool)
        .await?
        .into_iter()
        .map(|w| {
            let w = w.workspace;
            WorkspaceRow {
                directory_name: w.directory_name.unwrap_or_default(),
                workspace_name: w.workspace_name,
                user_set_workspace_name: w.user_set_workspace_name,
                branch: w.branch.unwrap_or_default(),
                placeholder_branch_name: w.placeholder_branch_name,
                state: state_name(w.state),
                derived_status: w.derived_status,
                manual_status: w.manual_status,
                workspace_path: w.workspace_path,
                intended_target_branch: w.intended_target_branch,
                pinned_at: w.pinned_at,
                unread: w.unread,
                unread_chats: unread.remove(&w.local_id).unwrap_or_default(),
                chat_tabs: tabs.remove(&w.local_id).unwrap_or_default(),
                chat_title: titles.remove(&w.local_id),
                pr_title: w.pr_title,
                pr_description: w.pr_description,
                number: w.number,
                initialization_log_path: w.initialization_log_path,
                initialization_files_copied: w.initialization_files_copied,
                created_at: w.created_at,
                updated_at: w.updated_at,
                repository_id: w.repository_id,
                id: w.local_id,
            }
        })
        .collect())
}

fn state_name(s: WorkspaceState) -> &'static str {
    match s {
        WorkspaceState::Unstarted => "unstarted",
        WorkspaceState::Initializing => "initializing",
        WorkspaceState::SettingUp => "setting_up",
        WorkspaceState::Ready => "ready",
        WorkspaceState::Archiving => "archiving",
        WorkspaceState::Archived => "archived",
        WorkspaceState::Failed => "failed",
        WorkspaceState::Deleted => "deleted",
    }
}

#[cfg(test)]
mod tests;
