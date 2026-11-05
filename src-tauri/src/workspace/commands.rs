//! Tauri commands for the workspace lifecycle. Thin wrappers over
//! [`WorkspaceService`]: argument names are snake_case here and camelCase on
//! the JS side (Tauri's default conversion), errors are the `Display` text.
//!
//! Register in `lib.rs`:
//!
//! ```ignore
//! .setup(|app| {
//!     let dir = app.path().app_data_dir()?;
//!     app.manage(workspace::service::WorkspaceService::new(dir)?);
//!     Ok(())
//! })
//! .invoke_handler(tauri::generate_handler![
//!     workspace::commands::add_repository,
//!     workspace::commands::clone_repository,
//!     workspace::commands::default_clone_directory,
//!     workspace::commands::list_repositories,
//!     workspace::commands::list_branches,
//!     workspace::commands::branch_name_is_taken,
//!     workspace::commands::create_workspace,
//!     workspace::commands::list_workspaces,
//!     workspace::commands::rename_workspace_branch,
//! ])
//! ```

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use super::git::BranchRef;
use crate::db::Db;
use crate::persistence_commands as persistence;
use super::service::{CreateWorkspaceRequest, RepositoryInfo, WorkspaceService};
use super::{Created, Workspace, WorkspaceState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDto {
    pub id: String,
    pub name: String,
    pub root: String,
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchDto {
    /// `main`, `sven/x`, or `origin/main` for remote-tracking branches.
    pub name: String,
    pub remote: Option<String>,
    pub commit: String,
    pub is_head: bool,
    /// Unix seconds.
    pub committed_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    /// `<repositoryId>/<directoryName>`.
    pub id: String,
    pub repository_id: String,
    pub directory_name: String,
    pub path: String,
    pub branch_name: String,
    /// `"active" | "archived" | "missing"`.
    pub state: &'static str,
    pub head: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedWorkspaceDto {
    pub workspace: WorkspaceDto,
    /// Ref the branch was created from, e.g. `origin/main`.
    pub base_ref: String,
    pub base_commit: String,
    pub fetched: bool,
    pub copied_files: Vec<String>,
}

#[tauri::command]
pub async fn add_repository(
    service: State<'_, WorkspaceService>,
    db: State<'_, Db>,
    path: String,
) -> Result<RepositoryDto, String> {
    let repo = service.add_repository(path.as_ref()).map_err(|e| e.to_string())?;
    persistence::on_repository_added(&db, &repo).await?;
    Ok(repo_dto(repo))
}

/// JS: `invoke("clone_repository", { url, parentDir, onProgress })` where
/// `onProgress` is a `Channel<string>` that receives each progress line.
/// Clones into `<parentDir>/<name>` (made unique), runs off the async
/// runtime, then registers like `add_repository`. Errors: "Target directory
/// does not exist: <path>", or "Git clone failed with code <n>" plus output.
#[tauri::command]
pub async fn clone_repository(
    app: AppHandle,
    url: String,
    parent_dir: String,
    on_progress: Channel<String>,
) -> Result<RepositoryDto, String> {
    let cloner = app.clone();
    let repo = tauri::async_runtime::spawn_blocking(move || {
        let service = cloner.state::<WorkspaceService>();
        let mut send = |line: &str| {
            let _ = on_progress.send(line.to_string());
        };
        service.clone_repository(&url, parent_dir.as_ref(), &mut send).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    persistence::on_repository_added(&app.state::<Db>(), &repo).await?;
    Ok(repo_dto(repo))
}

/// JS: `invoke("default_clone_directory")`: the folder the clone dialog
/// falls back to when no saved location exists (created on first clone).
#[tauri::command]
pub fn default_clone_directory(service: State<'_, WorkspaceService>) -> String {
    service.default_clone_dir().display().to_string()
}

#[tauri::command]
pub async fn list_repositories(service: State<'_, WorkspaceService>) -> Result<Vec<RepositoryDto>, String> {
    Ok(service.repositories().into_iter().map(repo_dto).collect())
}

/// JS: `invoke("list_branches", { repoId })`.
#[tauri::command]
pub async fn list_branches(service: State<'_, WorkspaceService>, repo_id: String) -> Result<Vec<BranchDto>, String> {
    service
        .list_branches(&repo_id)
        .map(|b| b.into_iter().map(branch_dto).collect())
        .map_err(|e| e.to_string())
}

/// JS: `invoke("branch_name_is_taken", { repositoryId, branchName })`: true
/// when a local or remote-tracking branch has the name (or blocks it).
#[tauri::command]
pub async fn branch_name_is_taken(
    service: State<'_, WorkspaceService>,
    repository_id: String,
    branch_name: String,
) -> Result<bool, String> {
    service.branch_name_is_taken(&repository_id, &branch_name).map_err(|e| e.to_string())
}

/// JS: `invoke("create_workspace", { repositoryId, branchName, directoryName, baseBranch, existingBranch, prNumber })`.
/// `branchName`, `directoryName` and `baseBranch` may be null or empty.
/// `existingBranch: true` checks out `branchName` (the local branch, or a new
/// one tracking `origin/<branchName>`) instead of creating it from the base.
/// `prNumber` (optional) adds a last resort for PRs from forks: when the
/// branch is neither local nor on origin, `pull/<prNumber>/head` is fetched
/// into a local `branchName` (no upstream) and checked out.
// One parameter per JS argument key, plus managed state.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_workspace(
    service: State<'_, WorkspaceService>,
    db: State<'_, Db>,
    repository_id: String,
    branch_name: Option<String>,
    directory_name: Option<String>,
    base_branch: Option<String>,
    existing_branch: Option<bool>,
    pr_number: Option<u64>,
) -> Result<CreatedWorkspaceDto, String> {
    let repo = service
        .repositories()
        .into_iter()
        .find(|r| r.id == repository_id)
        .ok_or_else(|| format!("unknown repository: {repository_id}"))?;
    let parent = base_branch.clone().filter(|b| !b.trim().is_empty()).unwrap_or_else(|| repo.default_branch.clone());
    let pending =
        persistence::on_create_started(&db, &repo, directory_name.as_deref(), branch_name.as_deref(), &parent).await;
    let req = CreateWorkspaceRequest {
        repository_id: repository_id.clone(),
        branch_name,
        directory_name,
        base_branch,
        existing_branch: existing_branch.unwrap_or(false),
        pr_number,
    };
    match service.create_workspace(&req) {
        Ok(created) => {
            persistence::on_create_finished(&db, &repository_id, &created.workspace, &parent).await;
            Ok(created_dto(&repository_id, created))
        }
        Err(e) => {
            persistence::on_create_failed(&db, pending).await;
            Err(e.to_string())
        }
    }
}

/// JS: `invoke("list_workspaces", { repositoryId })`.
#[tauri::command]
pub async fn list_workspaces(
    service: State<'_, WorkspaceService>,
    repository_id: String,
) -> Result<Vec<WorkspaceDto>, String> {
    let root = service.repository_root(&repository_id).map_err(|e| e.to_string())?;
    service
        .manager()
        .list(&root)
        .map(|ws| ws.into_iter().map(|w| workspace_dto(&repository_id, w)).collect())
        .map_err(|e| e.to_string())
}

/// JS: `invoke("rename_workspace_branch", { workspaceId, branchName })`, where
/// `workspaceId` is `WorkspaceDto.id`. Fails if the branch is taken or the
/// workspace is still initializing; the directory name is unchanged.
#[tauri::command]
pub async fn rename_workspace_branch(
    service: State<'_, WorkspaceService>,
    db: State<'_, Db>,
    workspace_id: String,
    branch_name: String,
) -> Result<WorkspaceDto, String> {
    let (repository_id, _) = workspace_id.rsplit_once('/').unwrap_or(("", ""));
    let repository_id = repository_id.to_string();
    let w = service.rename_workspace_branch(&workspace_id, &branch_name).map_err(|e| e.to_string())?;
    persistence::on_branch_renamed(&db, &workspace_id, &w.branch).await;
    Ok(workspace_dto(&repository_id, w))
}

fn repo_dto(r: RepositoryInfo) -> RepositoryDto {
    RepositoryDto { id: r.id, name: r.name, root: r.root.display().to_string(), default_branch: r.default_branch }
}

fn branch_dto(b: BranchRef) -> BranchDto {
    BranchDto { name: b.name, remote: b.remote, commit: b.commit, is_head: b.is_head, committed_at: b.committed_at }
}

fn workspace_dto(repository_id: &str, w: Workspace) -> WorkspaceDto {
    WorkspaceDto {
        id: format!("{repository_id}/{}", w.name),
        repository_id: repository_id.to_string(),
        directory_name: w.name,
        path: w.path.display().to_string(),
        branch_name: w.branch,
        state: match w.state {
            WorkspaceState::Active => "active",
            WorkspaceState::Archived => "archived",
            WorkspaceState::Missing => "missing",
        },
        head: w.head,
    }
}

fn created_dto(repository_id: &str, c: Created) -> CreatedWorkspaceDto {
    CreatedWorkspaceDto {
        workspace: workspace_dto(repository_id, c.workspace),
        base_ref: c.base_ref,
        base_commit: c.base_commit,
        fetched: c.fetched,
        copied_files: c.copied_files.into_iter().map(|p| p.display().to_string()).collect(),
    }
}
