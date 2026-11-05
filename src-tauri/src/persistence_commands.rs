//! IPC layer for `persistence/` (repositories and workspaces in
//! `conductor.db`), its startup pass, and the hooks the workspace commands
//! call so every repository and workspace they create is recorded.

use tauri::State;

use crate::db::Db;
use crate::persistence::{self as store, KnownRepo, KnownWorkspace, RepoRow, WorkspaceRow};
use crate::workspace::service::{RepositoryInfo, WorkspaceService};
use crate::workspace::{Workspace, WorkspaceState};

/// At startup, before anything lists workspaces: delete workspaces left
/// `initializing` (`delete_if_initializing`), then import registry
/// repositories (and their worktrees) that predate the database.
pub fn startup(db: &Db, service: &WorkspaceService) -> Result<(), Box<dyn std::error::Error>> {
    let pool = &db.0;
    tauri::async_runtime::block_on(async {
        store::delete_incomplete(pool).await?;
        for repo in service.repositories() {
            if openconductor_db::repos::get(pool, &repo.id).await?.is_some() {
                continue;
            }
            let worktrees: Vec<_> = service
                .manager()
                .list(&repo.root)
                .unwrap_or_default()
                .into_iter()
                .filter(|w| w.state != WorkspaceState::Missing)
                .map(|w| known_workspace(&repo.id, &w))
                .collect();
            store::import_repository(pool, &known_repo(&repo), &worktrees).await?;
        }
        Ok(())
    })
}

/// JS: `invoke("db_list_repos")`, in sidebar order, hidden ones included.
#[tauri::command]
pub async fn db_list_repos(db: State<'_, Db>) -> Result<Vec<RepoRow>, String> {
    store::list_repos(&db.0).await.map_err(|e| e.to_string())
}

/// JS: `invoke("db_list_workspaces")`, oldest first, every state.
#[tauri::command]
pub async fn db_list_workspaces(db: State<'_, Db>) -> Result<Vec<WorkspaceRow>, String> {
    store::list_workspaces(&db.0).await.map_err(|e| e.to_string())
}

/// JS: `invoke("db_archive_workspace", { workspaceId })`: mark the row
/// archived so it stays out of the sidebar after a restart.
#[tauri::command]
pub async fn db_archive_workspace(db: State<'_, Db>, workspace_id: String) -> Result<(), String> {
    store::archive(&db.0, &workspace_id).await.map_err(|e| e.to_string())
}

pub fn known_repo(r: &RepositoryInfo) -> KnownRepo {
    KnownRepo {
        id: r.id.clone(),
        name: r.name.clone(),
        root: r.root.display().to_string(),
        default_branch: r.default_branch.clone(),
    }
}

/// `w` as a row of repository `repository_id` (id `<repositoryId>/<name>`,
/// as `WorkspaceDto.id`).
pub fn known_workspace(repository_id: &str, w: &Workspace) -> KnownWorkspace {
    KnownWorkspace {
        id: format!("{repository_id}/{}", w.name),
        repository_id: repository_id.to_string(),
        directory_name: w.name.clone(),
        branch: w.branch.clone(),
        path: w.path.display().to_string(),
        archived: w.state == WorkspaceState::Archived,
    }
}

/// `add_repository` succeeded.
pub async fn on_repository_added(db: &Db, repo: &RepositoryInfo) -> Result<(), String> {
    store::record_repository(&db.0, &known_repo(repo)).await.map_err(|e| e.to_string())
}

/// Before the worktree is created: record the repository and, when the
/// directory name is known, an `initializing` row. Returns that row's id.
pub async fn on_create_started(
    db: &Db,
    repo: &RepositoryInfo,
    directory_name: Option<&str>,
    branch_name: Option<&str>,
    parent_branch: &str,
) -> Option<String> {
    log_err("record repository", store::record_repository(&db.0, &known_repo(repo)).await);
    let dir = directory_name.map(str::trim).filter(|d| !d.is_empty())?;
    let pending = KnownWorkspace {
        id: format!("{}/{dir}", repo.id),
        repository_id: repo.id.clone(),
        directory_name: dir.to_string(),
        branch: branch_name.map(str::trim).filter(|b| !b.is_empty()).unwrap_or(dir).to_string(),
        path: String::new(),
        archived: false,
    };
    // A leftover row with this id (an archived workspace) blocks the insert;
    // `on_create_finished` replaces it.
    store::begin_workspace(&db.0, &pending, Some(parent_branch)).await.ok().map(|_| pending.id)
}

/// The worktree exists: its row becomes `ready`; returns its number. A
/// database error is logged, not returned: the worktree was created and the UI
/// must show it (without a number).
pub async fn on_create_finished(db: &Db, repository_id: &str, w: &Workspace, parent_branch: &str) -> Option<i64> {
    let row = known_workspace(repository_id, w);
    match store::finish_workspace(&db.0, &row, Some(parent_branch), None).await {
        Ok(number) => Some(number),
        Err(e) => {
            log_err("record workspace", Err(e));
            None
        }
    }
}

/// Creating the worktree failed: drop the `initializing` row.
pub async fn on_create_failed(db: &Db, pending: Option<String>) {
    if let Some(id) = pending {
        log_err("drop initializing workspace", store::abandon_workspace(&db.0, &id).await.map(drop));
    }
}

/// `rename_workspace_branch` succeeded.
pub async fn on_branch_renamed(db: &Db, workspace_id: &str, branch: &str) {
    log_err("record branch rename", store::record_rename(&db.0, workspace_id, branch).await);
}

fn log_err(what: &str, r: openconductor_db::Result<()>) {
    if let Err(e) = r {
        eprintln!("conductor.db: {what}: {e}");
    }
}
