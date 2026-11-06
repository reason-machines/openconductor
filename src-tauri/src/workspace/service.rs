//! App-facing workspace service: a repository registry plus the operations
//! behind the Tauri commands in `commands.rs`. Std-only so it is tested with
//! the rest of the module.
//!
//! Repositories are registered by path and addressed by a stable id
//! afterwards. Like Conductor, adding a folder that is already registered adds
//! a second project for it (`<name>-v1`), so several ids can share a root.
//! The registry is a tab-separated file, `<data_dir>/repositories.tsv`, one
//! `id<TAB>root<TAB>name` per line (older files have no name column: the name
//! is then the root's folder name).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::git::{self, BranchRef};
use super::naming;
use super::{CreateOptions, Created, Workspace, WorkspaceError, WorkspaceManager, WorkspaceState};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryInfo {
    pub id: String,
    /// Project name: the root's folder name, bumped (`-v1`, `-v2`, ...) when
    /// another project already has it.
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
    /// PR whose head `branch_name` is; see [`CreateOptions::pr_number`].
    pub pr_number: Option<u64>,
    /// User setting `git.worktree_push_auto_setup_remote`.
    pub push_auto_setup_remote: bool,
    /// The repository's effective `file_include_globs` ("Files to copy").
    pub file_include_globs: Option<String>,
}

#[derive(Debug)]
pub struct WorkspaceService {
    manager: WorkspaceManager,
    registry_file: PathBuf,
    repos: Mutex<BTreeMap<String, Entry>>,
}

#[derive(Debug, Clone)]
struct Entry {
    root: PathBuf,
    name: String,
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
                    let mut cols = line.split('\t');
                    if let (Some(id), Some(root)) = (cols.next(), cols.next()) {
                        let root = PathBuf::from(root);
                        let name = cols
                            .next()
                            .filter(|n| !n.is_empty())
                            .map_or_else(|| folder_name(&root), str::to_string);
                        repos.insert(id.to_string(), Entry { root, name });
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        Ok(Self {
            manager: WorkspaceManager::new(data_dir),
            registry_file,
            repos: Mutex::new(repos),
        })
    }

    /// Keep workspaces, archive records and default clones under `root` (the
    /// `conductor_root_path` setting) instead of the app data directory.
    pub fn with_root(mut self, root: impl Into<PathBuf>) -> Self {
        self.manager = self.manager.with_root(root);
        self
    }

    pub fn manager(&self) -> &WorkspaceManager {
        &self.manager
    }

    /// Forget every registered repository (the registry file is emptied; no
    /// files under the repositories or workspaces are touched). Part of a
    /// root path change, with the database rows.
    pub fn forget_repositories(&self) -> Result<(), WorkspaceError> {
        let mut repos = self.repos.lock().expect("registry lock");
        repos.clear();
        self.save(&repos)
    }

    /// Register the repository containing `path` (any worktree maps to its
    /// root) as a new project. As in Conductor (`g2t` with
    /// `makeRepoNameUnique(<folder name>, null)`, evidence/screens/duplicate-repo.md),
    /// nothing refuses a root that is already registered: the name is the
    /// folder name bumped with [`naming::uniquify`] while another project has
    /// it or `<root>/workspaces/<name>` exists, and the id is a fresh slug of
    /// that name.
    pub fn add_repository(&self, path: &Path) -> Result<RepositoryInfo, WorkspaceError> {
        let root = git::toplevel(path)?;
        let mut repos = self.repos.lock().expect("registry lock");
        let name = naming::uniquify(&folder_name(&root), |c| self.name_taken(&repos, c));
        let slug = naming::slugify(&name);
        let id = naming::uniquify(if slug.is_empty() { "repo" } else { &slug }, |c| {
            repos.contains_key(c)
        });
        let entry = Entry { root, name };
        repos.insert(id.clone(), entry.clone());
        self.save(&repos)?;
        Ok(info(&id, &entry))
    }

    /// The project an existing caller means, registering only when there is
    /// none: the entry `id` names when it is registered, else the first project
    /// on the root containing `path`, else a new one ([`Self::add_repository`]).
    /// For lookups by a sidebar repo (branch lists, Create workspace), which
    /// must not add a `<name>-v1` project the way Open project does.
    pub fn ensure_repository(
        &self,
        id: Option<&str>,
        path: &Path,
    ) -> Result<RepositoryInfo, WorkspaceError> {
        {
            let repos = self.repos.lock().expect("registry lock");
            if let Some((id, e)) = id.and_then(|id| repos.get_key_value(id)) {
                return Ok(info(id, e));
            }
            let root = git::toplevel(path)?;
            if let Some((id, e)) = repos.iter().find(|(_, e)| e.root == root) {
                return Ok(info(id, e));
            }
        }
        self.add_repository(path)
    }

    /// Conductor's `makeRepoNameUnique` test: another project has the name, or
    /// `<root>/workspaces/<name>` exists.
    fn name_taken(&self, repos: &BTreeMap<String, Entry>, name: &str) -> bool {
        repos.values().any(|e| e.name == name)
            || self
                .manager
                .root()
                .join("workspaces")
                .join(name)
                .symlink_metadata()
                .is_ok()
    }

    /// Forget one registered repository (no files are touched).
    pub fn forget_repository(&self, id: &str) -> Result<(), WorkspaceError> {
        let mut repos = self.repos.lock().expect("registry lock");
        if repos.remove(id).is_some() {
            self.save(&repos)?;
        }
        Ok(())
    }

    /// Where clones go by default: `<root>/repos`, as Conductor's. Created on
    /// first clone, not here.
    pub fn default_clone_dir(&self) -> PathBuf {
        self.manager.root().join("repos")
    }

    /// Clone `url` into `<parent_dir>/<name>` (name from
    /// [`naming::repo_name_from_url`], bumped `-v1`, `-v2`, ... while the
    /// folder exists or another project has the name) and
    /// register it like [`Self::add_repository`]. A missing `parent_dir` is
    /// created only when it is [`Self::default_clone_dir`]. Status lines and
    /// git's own output go to `on_progress` in order.
    pub fn clone_repository(
        &self,
        url: &str,
        parent_dir: &Path,
        on_progress: &mut dyn FnMut(&str),
    ) -> Result<RepositoryInfo, WorkspaceError> {
        let url = url.trim();
        let name = naming::repo_name_from_url(url)
            .ok_or_else(|| WorkspaceError::InvalidCloneUrl(url.to_string()))?;
        on_progress("Creating directory structure...");
        if !parent_dir.is_dir() {
            if parent_dir != self.default_clone_dir() {
                return Err(WorkspaceError::TargetMissing(parent_dir.to_path_buf()));
            }
            on_progress(&format!(
                "Creating default directory: {}",
                parent_dir.display()
            ));
            std::fs::create_dir_all(parent_dir)?;
        }
        // Like `makeRepoNameUnique(name, clonePath)`: free in the clone folder
        // and as a project name, so the folder and the project share it.
        let name = {
            let repos = self.repos.lock().expect("registry lock");
            naming::uniquify(&name, |c| {
                parent_dir.join(c).symlink_metadata().is_ok() || self.name_taken(&repos, c)
            })
        };
        let dest = parent_dir.join(name);
        on_progress("Cloning repository...");
        git::clone(url, &dest, on_progress)?;
        on_progress("Detecting default branch...");
        on_progress("Saving repository information...");
        self.add_repository(&dest)
    }

    pub fn repositories(&self) -> Vec<RepositoryInfo> {
        let repos = self.repos.lock().expect("registry lock");
        repos.iter().map(|(id, e)| info(id, e)).collect()
    }

    pub fn repository_root(&self, id: &str) -> Result<PathBuf, WorkspaceError> {
        let repos = self.repos.lock().expect("registry lock");
        repos
            .get(id)
            .map(|e| e.root.clone())
            .ok_or_else(|| WorkspaceError::UnknownRepository(id.to_string()))
    }

    /// Create a workspace from the new-workspace form. Fetches `origin` first
    /// so the branch starts from the latest remote base (local base offline).
    pub fn create_workspace(
        &self,
        req: &CreateWorkspaceRequest,
    ) -> Result<Created, WorkspaceError> {
        let root = self.repository_root(&req.repository_id)?;
        let opts = CreateOptions {
            name: non_empty(&req.directory_name),
            branch_name: non_empty(&req.branch_name),
            base_branch: non_empty(&req.base_branch),
            existing_branch: req.existing_branch,
            pr_number: req.pr_number,
            fetch: true,
            push_auto_setup_remote: req.push_auto_setup_remote,
            file_include_globs: req.file_include_globs.clone(),
            ..Default::default()
        };
        self.manager.create(&root, &opts)
    }

    /// Conductor's startup backfill (`zYe`): apply "Set upstream on plain git
    /// push" ([`git::configure_push_upstream`]) to every existing active
    /// workspace of every registered repository. A worktree that already has a
    /// `push.autoSetupRemote` value is left alone. Returns `(workspace id,
    /// warning)` for each workspace it could not configure; a repository that
    /// can no longer be listed is skipped. `enabled(repo_root, workspace)` is
    /// the workspace's effective `git.worktree_push_auto_setup_remote`;
    /// workspaces where it is off are skipped.
    pub fn configure_push_upstream_for_existing(
        &self,
        enabled: impl Fn(&std::path::Path, &std::path::Path) -> bool,
    ) -> Vec<(String, &'static str)> {
        // Several projects can share a root; each root's workspaces once.
        let roots: std::collections::BTreeSet<PathBuf> = self
            .repos
            .lock()
            .expect("registry lock")
            .values()
            .map(|e| e.root.clone())
            .collect();
        let mut failed = Vec::new();
        for root in roots {
            let Ok(list) = self.manager.list(&root) else {
                continue;
            };
            for ws in list
                .into_iter()
                .filter(|w| w.state == WorkspaceState::Active && enabled(&w.repo_root, &w.path))
            {
                if let Some(warning) = git::configure_push_upstream(&ws.repo_root, &ws.path) {
                    failed.push((ws.id, warning));
                }
            }
        }
        failed
    }

    /// Local, then remote-tracking branches, newest first.
    pub fn list_branches(&self, repository_id: &str) -> Result<Vec<BranchRef>, WorkspaceError> {
        git::list_branches(&self.repository_root(repository_id)?)
    }

    /// See [`git::branch_name_is_taken`].
    pub fn branch_name_is_taken(
        &self,
        repository_id: &str,
        branch: &str,
    ) -> Result<bool, WorkspaceError> {
        git::branch_name_is_taken(&self.repository_root(repository_id)?, branch)
    }

    /// Rename the branch of workspace `<repositoryId>/<directoryName>`; see
    /// [`WorkspaceManager::rename_branch`].
    pub fn rename_workspace_branch(
        &self,
        workspace_id: &str,
        branch: &str,
    ) -> Result<Workspace, WorkspaceError> {
        let (repository_id, name) = workspace_id
            .rsplit_once('/')
            .ok_or_else(|| WorkspaceError::NotFound(workspace_id.to_string()))?;
        self.manager
            .rename_branch(&self.repository_root(repository_id)?, name, branch)
    }

    fn save(&self, repos: &BTreeMap<String, Entry>) -> Result<(), WorkspaceError> {
        if let Some(dir) = self.registry_file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text: String = repos
            .iter()
            .map(|(id, e)| format!("{id}\t{}\t{}\n", e.root.display(), e.name))
            .collect();
        let tmp = self.registry_file.with_extension("tsv.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(tmp, &self.registry_file)?;
        Ok(())
    }
}

fn non_empty(s: &Option<String>) -> Option<String> {
    s.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn folder_name(root: &Path) -> String {
    root.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn info(id: &str, e: &Entry) -> RepositoryInfo {
    RepositoryInfo {
        id: id.to_string(),
        name: e.name.clone(),
        root: e.root.clone(),
        default_branch: git::default_branch(&e.root),
    }
}
