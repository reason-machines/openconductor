//! App-facing workspace service: a repository registry plus the operations
//! behind the Tauri commands in `commands.rs`. Std-only so it is tested with
//! the rest of the module.
//!
//! Repositories are registered once (by path) and addressed by a stable id
//! afterwards. The registry is a tab-separated file,
//! `<data_dir>/repositories.tsv`, one `id<TAB>root` per line.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::git::{self, BranchRef};
use super::naming;
use super::{CreateOptions, Created, Workspace, WorkspaceError, WorkspaceManager};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryInfo {
    pub id: String,
    /// Folder name of the repository root.
    pub name: String,
    pub root: PathBuf,
    pub default_branch: String,
}

/// Arguments of `create_workspace`, as sent by the new-workspace form.
#[derive(Debug, Clone, Default)]
pub struct CreateWorkspaceRequest {
    pub repository_id: String,
    /// Exact branch to create; `None` derives it from the directory name.
    pub branch_name: Option<String>,
    /// Worktree folder name; `None` derives it from the branch or generates one.
    pub directory_name: Option<String>,
    /// Base branch; `None` uses the repository's default branch.
    pub base_branch: Option<String>,
    /// Check out `branch_name` (local, or tracking `origin/<branch_name>`)
    /// instead of creating it; see [`CreateOptions::existing_branch`].
    pub existing_branch: bool,
}

#[derive(Debug)]
pub struct WorkspaceService {
    manager: WorkspaceManager,
    registry_file: PathBuf,
    repos: Mutex<BTreeMap<String, PathBuf>>,
}

impl WorkspaceService {
    /// Open the service rooted at the app data directory, loading the registry.
    pub fn new(data_dir: impl Into<PathBuf>) -> Result<Self, WorkspaceError> {
        let data_dir = data_dir.into();
        let registry_file = data_dir.join("repositories.tsv");
        let mut repos = BTreeMap::new();
        match std::fs::read_to_string(&registry_file) {
            Ok(text) => {
                for line in text.lines() {
                    if let Some((id, root)) = line.split_once('\t') {
                        repos.insert(id.to_string(), PathBuf::from(root));
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        Ok(Self { manager: WorkspaceManager::new(data_dir), registry_file, repos: Mutex::new(repos) })
    }

    pub fn manager(&self) -> &WorkspaceManager {
        &self.manager
    }

    /// Register the repository containing `path` (any worktree maps to its
    /// root). Registering the same root again returns the existing entry.
    pub fn add_repository(&self, path: &Path) -> Result<RepositoryInfo, WorkspaceError> {
        let root = git::toplevel(path)?;
        let mut repos = self.repos.lock().expect("registry lock");
        if let Some((id, _)) = repos.iter().find(|(_, r)| **r == root) {
            return Ok(info(id, &root));
        }
        let id = naming::uniquify(&WorkspaceManager::repo_slug(&root), |c| repos.contains_key(c));
        repos.insert(id.clone(), root.clone());
        self.save(&repos)?;
        Ok(info(&id, &root))
    }

    /// Clone `url` into `<parent_dir>/<name>` (name from
    /// [`naming::repo_name_from_url`]) and register it like
    /// [`Self::add_repository`]. Fails, without renaming, if the destination
    /// exists; a failed clone returns git's stderr.
    pub fn clone_repository(&self, url: &str, parent_dir: &Path) -> Result<RepositoryInfo, WorkspaceError> {
        let url = url.trim();
        let name = naming::repo_name_from_url(url).ok_or_else(|| WorkspaceError::InvalidCloneUrl(url.to_string()))?;
        let dest = parent_dir.join(name);
        if dest.symlink_metadata().is_ok() {
            return Err(WorkspaceError::DestinationExists(dest));
        }
        git::clone(url, &dest)?;
        self.add_repository(&dest)
    }

    pub fn repositories(&self) -> Vec<RepositoryInfo> {
        let repos = self.repos.lock().expect("registry lock");
        repos.iter().map(|(id, root)| info(id, root)).collect()
    }

    pub fn repository_root(&self, id: &str) -> Result<PathBuf, WorkspaceError> {
        let repos = self.repos.lock().expect("registry lock");
        repos.get(id).cloned().ok_or_else(|| WorkspaceError::UnknownRepository(id.to_string()))
    }

    /// Create a workspace from the new-workspace form. Fetches `origin` first
    /// so the branch starts from the latest remote base (local base offline).
    pub fn create_workspace(&self, req: &CreateWorkspaceRequest) -> Result<Created, WorkspaceError> {
        let root = self.repository_root(&req.repository_id)?;
        let opts = CreateOptions {
            name: non_empty(&req.directory_name),
            branch_name: non_empty(&req.branch_name),
            base_branch: non_empty(&req.base_branch),
            existing_branch: req.existing_branch,
            fetch: true,
            ..Default::default()
        };
        self.manager.create(&root, &opts)
    }

    /// Local, then remote-tracking branches, newest first.
    pub fn list_branches(&self, repository_id: &str) -> Result<Vec<BranchRef>, WorkspaceError> {
        git::list_branches(&self.repository_root(repository_id)?)
    }

    /// See [`git::branch_name_is_taken`].
    pub fn branch_name_is_taken(&self, repository_id: &str, branch: &str) -> Result<bool, WorkspaceError> {
        git::branch_name_is_taken(&self.repository_root(repository_id)?, branch)
    }

    /// Rename the branch of workspace `<repositoryId>/<directoryName>`; see
    /// [`WorkspaceManager::rename_branch`].
    pub fn rename_workspace_branch(&self, workspace_id: &str, branch: &str) -> Result<Workspace, WorkspaceError> {
        let (repository_id, name) =
            workspace_id.rsplit_once('/').ok_or_else(|| WorkspaceError::NotFound(workspace_id.to_string()))?;
        self.manager.rename_branch(&self.repository_root(repository_id)?, name, branch)
    }

    fn save(&self, repos: &BTreeMap<String, PathBuf>) -> Result<(), WorkspaceError> {
        if let Some(dir) = self.registry_file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text: String = repos.iter().map(|(id, r)| format!("{id}\t{}\n", r.display())).collect();
        let tmp = self.registry_file.with_extension("tsv.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(tmp, &self.registry_file)?;
        Ok(())
    }
}

fn non_empty(s: &Option<String>) -> Option<String> {
    s.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

fn info(id: &str, root: &Path) -> RepositoryInfo {
    RepositoryInfo {
        id: id.to_string(),
        name: root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        root: root.to_path_buf(),
        default_branch: git::default_branch(root),
    }
}
