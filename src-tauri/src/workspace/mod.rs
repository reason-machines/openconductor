//! Workspace lifecycle on git worktrees.
//!
//! A workspace is a git worktree on its own branch, created under the app
//! data directory:
//!
//! ```text
//! <data_dir>/workspaces/<repo-slug>/<name>     active worktree
//! <data_dir>/archived/<repo-slug>/<name>.ws    archive record (branch, archive commit)
//! ```
//!
//! Lifecycle: [`WorkspaceManager::create`] -> setup script ->
//! run scripts -> [`WorkspaceManager::archive`] (archive script, HEAD
//! recorded, worktree removed, branch kept or deleted) ->
//! [`WorkspaceManager::restore`] or
//! [`WorkspaceManager::delete`] (worktree and branch removed).
//!
//! Behavior is taken from the reference app's bundled scripts and skill (see
//! `evidence/scripts/` and `evidence/scripts/WORKSPACE-NOTES.md`). Where the
//! evidence is silent the choice is ours and is marked as such.
//!
//! The core depends only on `std` and the `git` CLI. The app build adds
//! `commands` (Tauri) and `Serialize` derives (serde); build with
//! `--cfg workspace_std_only` to test the core without either.

pub mod files_to_copy;
pub mod git;
pub mod naming;
pub mod scripts;
pub mod service;

/// `#[tauri::command]` wrappers. Excluded from the std-only test build
/// (`rustc --cfg workspace_std_only --test mod.rs`), which has no `tauri` crate.
#[cfg(not(workspace_std_only))]
pub mod commands;

#[cfg(test)]
mod tests;

use std::collections::HashSet;
use std::fmt;
use std::path::{Path, PathBuf};

pub use git::BusyState;
pub use scripts::{RunningScript, ScriptContext, ScriptKind, ScriptOutput};

/// Errors from workspace operations.
#[derive(Debug)]
pub enum WorkspaceError {
    Io(std::io::Error),
    /// A git command failed.
    Git { args: Vec<String>, stderr: String },
    /// The requested workspace name or branch is not usable.
    InvalidName(String),
    /// The base branch / ref does not exist locally or on `origin`.
    BaseNotFound(String),
    NotFound(String),
    /// Uncommitted or untracked changes; pass `force` to proceed.
    Dirty(String),
    /// A merge/rebase/cherry-pick/revert is in progress.
    Busy(BusyState),
    /// An explicitly requested branch already exists.
    BranchExists(String),
    /// No repository is registered under this id.
    UnknownRepository(String),
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkspaceError::Io(e) => write!(f, "io error: {e}"),
            WorkspaceError::Git { args, stderr } => write!(f, "git {} failed: {stderr}", args.join(" ")),
            WorkspaceError::InvalidName(n) => write!(f, "invalid workspace name: {n:?}"),
            WorkspaceError::BaseNotFound(b) => write!(f, "base branch not found: {b}"),
            WorkspaceError::NotFound(n) => write!(f, "workspace not found: {n}"),
            WorkspaceError::Dirty(n) => write!(f, "workspace {n} has uncommitted changes"),
            WorkspaceError::Busy(s) => write!(f, "git operation in progress ({})", s.as_token()),
            WorkspaceError::BranchExists(b) => write!(f, "branch already exists: {b}"),
            WorkspaceError::UnknownRepository(id) => write!(f, "unknown repository: {id}"),
        }
    }
}

impl std::error::Error for WorkspaceError {}

impl From<std::io::Error> for WorkspaceError {
    fn from(e: std::io::Error) -> Self {
        WorkspaceError::Io(e)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(workspace_std_only), derive(serde::Serialize), serde(rename_all = "lowercase"))]
pub enum WorkspaceState {
    Active,
    Archived,
    /// Registered worktree whose directory is gone (prunable).
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(not(workspace_std_only), derive(serde::Serialize))]
pub struct Workspace {
    /// Stable id: `<repo-slug>/<name>`.
    pub id: String,
    pub name: String,
    pub repo_root: PathBuf,
    pub path: PathBuf,
    pub branch: String,
    pub state: WorkspaceState,
    /// Current HEAD commit; for an archived workspace, the commit recorded
    /// when it was archived (`archive_commit`).
    pub head: Option<String>,
}

/// Options for [`WorkspaceManager::create`].
#[derive(Debug, Clone, Default)]
pub struct CreateOptions {
    /// Requested name; slugified. `None` picks a generated name.
    pub name: Option<String>,
    /// Branch prefix, e.g. a username: branch becomes `<prefix>/<name>`.
    pub branch_prefix: Option<String>,
    /// Exact branch name, overriding `<prefix>/<name>`. Must not exist yet.
    /// When `name` is `None` the directory name comes from its last segment.
    pub branch_name: Option<String>,
    /// Base branch; defaults to the repository's default branch.
    pub base_branch: Option<String>,
    /// Fetch `origin/<base>` first so the workspace starts from the latest
    /// remote commit (does not move the branch checked out in the root).
    pub fetch: bool,
    /// `file_include_globs` from repository settings.
    pub file_include_globs: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct Created {
    pub workspace: Workspace,
    /// The ref the branch was created from, e.g. `origin/main`.
    pub base_ref: String,
    pub base_commit: String,
    /// Whether the `origin` fetch succeeded (false when skipped or offline).
    pub fetched: bool,
    pub copied_files: Vec<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct ArchiveOptions {
    /// Archive script from repository settings, run in the workspace first.
    pub archive_script: Option<String>,
    /// Archive even with uncommitted changes (they are lost). Never
    /// overrides an in-progress merge/rebase/cherry-pick/revert.
    pub force: bool,
    /// Delete the local branch after removing the worktree ("Delete branch
    /// on archive"). Restore recreates it from the archive commit.
    pub delete_branch: bool,
}

#[derive(Debug, Clone)]
pub struct Archived {
    pub workspace: Workspace,
    pub script: Option<ScriptOutput>,
}

/// Owns the on-disk layout under the app data directory.
#[derive(Debug, Clone)]
pub struct WorkspaceManager {
    data_dir: PathBuf,
}

const ARCHIVE_EXT: &str = "ws";

impl WorkspaceManager {
    pub fn new(data_dir: impl Into<PathBuf>) -> Self {
        Self { data_dir: data_dir.into() }
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// Slug used for a repository's directory under the data dir.
    pub fn repo_slug(repo_root: &Path) -> String {
        let name = repo_root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let s = naming::slugify(&name);
        if s.is_empty() { "repo".into() } else { s }
    }

    fn workspaces_dir(&self, repo_root: &Path) -> PathBuf {
        self.data_dir.join("workspaces").join(Self::repo_slug(repo_root))
    }

    fn archive_dir(&self, repo_root: &Path) -> PathBuf {
        self.data_dir.join("archived").join(Self::repo_slug(repo_root))
    }

    fn archive_record(&self, repo_root: &Path, name: &str) -> PathBuf {
        self.archive_dir(repo_root).join(format!("{name}.{ARCHIVE_EXT}"))
    }

    fn make(&self, repo_root: &Path, name: &str, branch: String, state: WorkspaceState, head: Option<String>) -> Workspace {
        Workspace {
            id: format!("{}/{}", Self::repo_slug(repo_root), name),
            name: name.to_string(),
            repo_root: repo_root.to_path_buf(),
            path: self.workspaces_dir(repo_root).join(name),
            branch,
            state,
            head,
        }
    }

    /// Create a workspace: new branch from the base, worktree under the data
    /// dir, then copy "files to copy" from the repository root.
    pub fn create(&self, repo: &Path, opts: &CreateOptions) -> Result<Created, WorkspaceError> {
        let root = git::toplevel(repo)?;
        let base = match &opts.base_branch {
            Some(b) => b.clone(),
            None => git::default_branch(&root),
        };

        let mut fetched = false;
        if opts.fetch && git::remote_exists(&root, "origin") {
            // A fetch failure (offline) falls back to the local base branch.
            fetched = git::git(&root, ["fetch", "--quiet", "origin", &base]).is_ok();
        }
        let remote_ref = format!("origin/{base}");
        let base_ref = if git::ref_exists(&root, &remote_ref) {
            remote_ref
        } else if git::ref_exists(&root, &base) {
            base.clone()
        } else {
            return Err(WorkspaceError::BaseNotFound(base));
        };
        let base_commit = git::git(&root, ["rev-parse", &format!("{base_ref}^{{commit}}")])?;

        let explicit_branch = opts.branch_name.as_deref().map(str::trim).filter(|b| !b.is_empty());
        if let Some(b) = explicit_branch {
            if !git::valid_branch_name(&root, b) {
                return Err(WorkspaceError::InvalidName(b.to_string()));
            }
            if git::branch_exists(&root, b) {
                return Err(WorkspaceError::BranchExists(b.to_string()));
            }
        }
        let name_source = opts
            .name
            .clone()
            .filter(|n| !n.trim().is_empty())
            .or_else(|| explicit_branch.map(|b| b.rsplit('/').next().unwrap_or(b).to_string()));
        let requested = match &name_source {
            Some(n) => {
                let s = naming::slugify(n);
                if s.is_empty() {
                    return Err(WorkspaceError::InvalidName(n.clone()));
                }
                Some(s)
            }
            None => None,
        };
        let prefix = opts.branch_prefix.as_deref();
        let ws_dir = self.workspaces_dir(&root);
        let taken = |c: &str| {
            ws_dir.join(c).exists()
                || self.archive_record(&root, c).exists()
                || (explicit_branch.is_none() && git::branch_exists(&root, &naming::branch_for(prefix, c)))
        };
        let name = match requested {
            Some(s) => naming::uniquify(&s, taken),
            None => {
                let used: HashSet<String> = self.list(&root)?.into_iter().map(|w| w.name).collect();
                naming::uniquify(&naming::generate_name(&used), taken)
            }
        };
        let branch = match explicit_branch {
            Some(b) => b.to_string(),
            None => naming::branch_for(prefix, &name),
        };
        if !git::valid_branch_name(&root, &branch) {
            return Err(WorkspaceError::InvalidName(branch));
        }

        let path = ws_dir.join(&name);
        std::fs::create_dir_all(&ws_dir)?;
        git::git(
            &root,
            [
                "worktree".as_ref(),
                "add".as_ref(),
                "--quiet".as_ref(),
                "--no-track".as_ref(),
                "-b".as_ref(),
                branch.as_ref(),
                path.as_os_str(),
                base_ref.as_ref(),
            ] as [&std::ffi::OsStr; 8],
        )?;

        let source = files_to_copy::resolve_source(&root, opts.file_include_globs.as_deref());
        let files = files_to_copy::files_to_copy(&root, &source)?;
        let copied_files = files_to_copy::copy_files(&root, &path, &files)?;

        let workspace = self.make(&root, &name, branch, WorkspaceState::Active, Some(base_commit.clone()));
        Ok(Created { workspace, base_ref, base_commit, fetched, copied_files })
    }

    /// Active (and missing) workspaces from `git worktree list`, plus archived
    /// records, sorted by name.
    pub fn list(&self, repo: &Path) -> Result<Vec<Workspace>, WorkspaceError> {
        let root = git::toplevel(repo)?;
        let ws_dir = self.workspaces_dir(&root);
        let ws_dir_canon = std::fs::canonicalize(&ws_dir).unwrap_or_else(|_| ws_dir.clone());
        let mut out = Vec::new();
        for e in git::list_worktrees(&root)? {
            let parent = e.path.parent().map(Path::to_path_buf).unwrap_or_default();
            let parent = std::fs::canonicalize(&parent).unwrap_or(parent);
            if parent != ws_dir_canon && parent != ws_dir {
                continue;
            }
            let Some(name) = e.path.file_name().map(|n| n.to_string_lossy().into_owned()) else { continue };
            let state = if e.prunable || !e.path.exists() { WorkspaceState::Missing } else { WorkspaceState::Active };
            out.push(self.make(&root, &name, e.branch.unwrap_or_default(), state, e.head));
        }
        if let Ok(rd) = std::fs::read_dir(self.archive_dir(&root)) {
            for entry in rd.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) != Some(ARCHIVE_EXT) {
                    continue;
                }
                let Some(name) = p.file_stem().map(|n| n.to_string_lossy().into_owned()) else { continue };
                let (branch, commit) = read_record(&p)?;
                out.push(self.make(&root, &name, branch.unwrap_or_default(), WorkspaceState::Archived, commit));
            }
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    pub fn get(&self, repo: &Path, name: &str) -> Result<Workspace, WorkspaceError> {
        self.list(repo)?
            .into_iter()
            .find(|w| w.name == name)
            .ok_or_else(|| WorkspaceError::NotFound(name.to_string()))
    }

    /// Environment and paths for running a script in `ws`.
    pub fn script_context(&self, ws: &Workspace, port: Option<u16>, is_local: bool) -> ScriptContext {
        ScriptContext {
            env_prefix: scripts::DEFAULT_ENV_PREFIX.to_string(),
            workspace_id: ws.id.clone(),
            workspace_name: ws.name.clone(),
            workspace_path: ws.path.clone(),
            root_path: ws.repo_root.clone(),
            default_branch: Some(git::default_branch(&ws.repo_root)),
            port,
            is_local,
            extra_env: Vec::new(),
        }
    }

    /// Run the repository's setup script in the workspace (blocking).
    pub fn run_setup(&self, ctx: &ScriptContext, script: &str) -> Result<ScriptOutput, WorkspaceError> {
        scripts::run_to_completion(ScriptKind::Setup, script, ctx)
    }

    /// Start a run script in its own process group.
    pub fn start_run(&self, ctx: &ScriptContext, script: &str) -> Result<RunningScript, WorkspaceError> {
        scripts::spawn_run(script, ctx)
    }

    /// Archive: run the archive script, remove the worktree, keep the branch.
    pub fn archive(&self, repo: &Path, name: &str, opts: &ArchiveOptions) -> Result<Archived, WorkspaceError> {
        let ws = self.get(repo, name)?;
        if ws.state == WorkspaceState::Archived {
            return Ok(Archived { workspace: ws, script: None });
        }
        if ws.state == WorkspaceState::Active {
            let busy = git::busy_state(&ws.path)?;
            if busy != BusyState::Clean {
                return Err(WorkspaceError::Busy(busy));
            }
            if !opts.force && git::is_dirty(&ws.path)? {
                return Err(WorkspaceError::Dirty(ws.name.clone()));
            }
        }
        let script = match (&opts.archive_script, ws.state) {
            (Some(s), WorkspaceState::Active) => {
                Some(scripts::run_to_completion(ScriptKind::Archive, s, &self.script_context(&ws, None, true))?)
            }
            _ => None,
        };
        let record = self.archive_record(&ws.repo_root, &ws.name);
        std::fs::create_dir_all(record.parent().expect("record has parent"))?;
        let commit = ws.head.clone().or_else(|| git::git(&ws.repo_root, ["rev-parse", "--verify", "-q", &format!("refs/heads/{}^{{commit}}", ws.branch)]).ok());
        let mut text = format!("branch={}\n", ws.branch);
        if let Some(c) = &commit {
            text.push_str(&format!("commit={c}\n"));
        }
        std::fs::write(&record, text)?;
        self.remove_worktree(&ws)?;
        if opts.delete_branch && !ws.branch.is_empty() && git::branch_exists(&ws.repo_root, &ws.branch) {
            git::git(&ws.repo_root, ["branch", "-D", &ws.branch])?;
        }
        let workspace = self.make(&ws.repo_root, &ws.name, ws.branch, WorkspaceState::Archived, commit);
        Ok(Archived { workspace, script })
    }

    /// Restore an archived workspace: re-add its worktree on its branch, or
    /// recreate the branch at the archive commit when it was deleted.
    pub fn restore(&self, repo: &Path, name: &str) -> Result<Workspace, WorkspaceError> {
        let ws = self.get(repo, name)?;
        if ws.state != WorkspaceState::Archived {
            return Ok(ws);
        }
        let recreate_at = if git::branch_exists(&ws.repo_root, &ws.branch) {
            None
        } else {
            match ws.head.as_deref().filter(|c| git::ref_exists(&ws.repo_root, &format!("{c}^{{commit}}"))) {
                Some(c) if !ws.branch.is_empty() => Some(c.to_string()),
                _ => return Err(WorkspaceError::NotFound(format!("branch {}", ws.branch))),
            }
        };
        std::fs::create_dir_all(self.workspaces_dir(&ws.repo_root))?;
        let mut args: Vec<&std::ffi::OsStr> = vec!["worktree".as_ref(), "add".as_ref(), "--quiet".as_ref()];
        if recreate_at.is_some() {
            args.extend(["-b".as_ref(), ws.branch.as_ref() as &std::ffi::OsStr]);
        }
        args.push(ws.path.as_os_str());
        args.push(recreate_at.as_deref().unwrap_or(&ws.branch).as_ref());
        git::git(&ws.repo_root, args)?;
        std::fs::remove_file(self.archive_record(&ws.repo_root, &ws.name))?;
        self.get(repo, name)
    }

    /// Delete: remove the worktree (forced), the branch and any archive record.
    pub fn delete(&self, repo: &Path, name: &str) -> Result<(), WorkspaceError> {
        let ws = self.get(repo, name)?;
        if ws.state != WorkspaceState::Archived {
            self.remove_worktree(&ws)?;
        }
        if !ws.branch.is_empty() && git::branch_exists(&ws.repo_root, &ws.branch) {
            git::git(&ws.repo_root, ["branch", "-D", &ws.branch])?;
        }
        let record = self.archive_record(&ws.repo_root, &ws.name);
        if record.exists() {
            std::fs::remove_file(record)?;
        }
        Ok(())
    }

    fn remove_worktree(&self, ws: &Workspace) -> Result<(), WorkspaceError> {
        if ws.path.exists() {
            // Forced: callers have already applied the dirty/busy policy, and
            // gitignored files (node_modules, .env) would otherwise block removal.
            git::git(
                &ws.repo_root,
                ["worktree".as_ref(), "remove".as_ref(), "--force".as_ref(), ws.path.as_os_str()]
                    as [&std::ffi::OsStr; 4],
            )?;
        }
        git::git(&ws.repo_root, ["worktree", "prune"])?;
        Ok(())
    }
}

/// `(branch, archive commit)` from an archive record; records written
/// before the commit was stored have only `branch=`.
fn read_record(path: &Path) -> Result<(Option<String>, Option<String>), WorkspaceError> {
    let text = std::fs::read_to_string(path)?;
    let field = |key: &str| text.lines().find_map(|l| l.strip_prefix(key)).map(str::to_string);
    Ok((field("branch="), field("commit=")))
}
