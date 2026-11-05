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
//!     workspace::commands::list_repositories,
//!     workspace::commands::list_branches,
//!     workspace::commands::branch_name_is_taken,
//!     workspace::commands::create_workspace,
//!     workspace::commands::list_workspaces,
//! ])
//! ```

use serde::Serialize;
use tauri::State;

use super::git::BranchRef;
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
pub async fn add_repository(service: State<'_, WorkspaceService>, path: String) -> Result<RepositoryDto, String> {
    service.add_repository(path.as_ref()).map(repo_dto).map_err(|e| e.to_string())
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

/// JS: `invoke("create_workspace", { repositoryId, branchName, directoryName, baseBranch })`.
/// `branchName`, `directoryName` and `baseBranch` may be null or empty.
#[tauri::command]
pub async fn create_workspace(
    service: State<'_, WorkspaceService>,
    repository_id: String,
    branch_name: Option<String>,
    directory_name: Option<String>,
    base_branch: Option<String>,
) -> Result<CreatedWorkspaceDto, String> {
    let req = CreateWorkspaceRequest { repository_id: repository_id.clone(), branch_name, directory_name, base_branch };
    service.create_workspace(&req).map(|c| created_dto(&repository_id, c)).map_err(|e| e.to_string())
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
