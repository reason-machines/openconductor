//! Workspace lifecycle on git worktrees.
//!
//! A workspace is a git worktree on its own branch, created under the root
//! directory (the `conductor_root_path` setting, default the app data
//! directory; Conductor's default is `~/conductor`):
//!
//! ```text
//! <root>/workspaces/<repo-slug>/<name>     active worktree
//! <root>/archived/<repo-slug>/<name>.ws    archive record (branch, archive commit)
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
pub mod init_log;
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
use std::sync::{Arc, Mutex};

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
    /// `existing_branch` was set but the branch is neither local nor on `origin`.
    BranchNotFound(String),
    /// `existing_branch` names a branch already checked out in another worktree.
    BranchCheckedOut { branch: String, path: PathBuf },
    /// `existing_branch` with `pr_number`: the branch is neither local nor on
    /// `origin`, and fetching `pull/<number>/head` failed too.
    PullRequestNotFound { number: u64, branch: String, stderr: String },
    /// No repository is registered under this id.
    UnknownRepository(String),
    /// The workspace is still being created; see [`WorkspaceManager::mark_initializing`].
    Initializing(String),
    /// The operation needs an active worktree, but the workspace is archived or missing.
    NotActive(String),
    /// `clone_repository`: no folder name can be derived from the URL.
    InvalidCloneUrl(String),
    /// `clone_repository`: the target folder is missing and is not the default
    /// clone directory (which is created on demand).
    TargetMissing(PathBuf),
    /// `clone_repository`: `git clone` failed; see [`git::clone`] for the text.
    CloneFailed(String),
    /// `git worktree add` failed and left no worktree; the text is
    /// [`init_log::worktree_failure_message`].
    WorktreeFailed(String),
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
            WorkspaceError::BranchNotFound(b) => write!(f, "branch not found locally or on origin: {b}"),
            WorkspaceError::BranchCheckedOut { branch, path } => {
                write!(f, "branch {branch} is already checked out at {}", path.display())
            }
            WorkspaceError::PullRequestNotFound { number, branch, stderr } => {
                write!(f, "branch not found locally or on origin, and pull request #{number} could not be fetched into {branch}")?;
                if !stderr.is_empty() {
                    write!(f, ": {stderr}")?;
                }
                Ok(())
            }
            WorkspaceError::UnknownRepository(id) => write!(f, "unknown repository: {id}"),
            WorkspaceError::Initializing(n) => write!(f, "workspace {n} is still initializing; try again when it is ready"),
            WorkspaceError::NotActive(n) => write!(f, "workspace {n} is archived or missing"),
            WorkspaceError::InvalidCloneUrl(u) => write!(f, "cannot derive a repository name from {u:?}"),
            WorkspaceError::TargetMissing(p) => write!(f, "Target directory does not exist: {}", p.display()),
            WorkspaceError::CloneFailed(msg) | WorkspaceError::WorktreeFailed(msg) => f.write_str(msg),
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
    /// Exact branch name, overriding `<prefix>/<name>`. Must not exist yet
    /// unless `existing_branch` is set.
    /// When `name` is `None` the directory name comes from its last segment.
    pub branch_name: Option<String>,
    /// Check out `branch_name` instead of creating it: the local branch if it
    /// exists (and is not checked out elsewhere), otherwise a new local branch
    /// tracking `origin/<branch_name>`. `base_branch` is ignored.
    pub existing_branch: bool,
    /// With `existing_branch`: the pull request whose head `branch_name` is.
    /// When the branch is neither local nor on `origin` (a PR from a fork),
    /// `pull/<pr_number>/head` is fetched into a new local `branch_name`
    /// without upstream and checked out. Needs `fetch`.
    pub pr_number: Option<u64>,
    /// Base branch; defaults to the repository's default branch.
    pub base_branch: Option<String>,
    /// Fetch `origin/<base>` first so the workspace starts from the latest
    /// remote commit (does not move the branch checked out in the root).
    pub fetch: bool,
    /// `file_include_globs` from repository settings.
    pub file_include_globs: Option<Vec<String>>,
    /// Set `push.autoSetupRemote` in the new worktree's config
    /// (`git.worktree_push_auto_setup_remote`, see [`git::configure_push_upstream`]).
    pub push_auto_setup_remote: bool,
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
    /// Set when `push_auto_setup_remote` was asked for but could not be applied.
    pub upstream_warning: Option<String>,
    /// Log of the `git worktree add` script (`workspaces.initialization_log_path`).
    pub initialization_log_path: Option<PathBuf>,
    /// `git ls-files | wc -l` in the new worktree, which Conductor stores as
    /// `workspaces.initialization_files_copied`.
    pub initialization_files_copied: i64,
    /// Non-fatal problems, joined with a space: the worktree exists although
    /// `git worktree add` failed, push upstream could not be configured, files
    /// could not be copied. Shown as a persistent toast with "View logs".
    pub auxiliary_failure_message: Option<String>,
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

/// Owns the on-disk layout under the root directory.
#[derive(Debug, Clone)]
pub struct WorkspaceManager {
    data_dir: PathBuf,
    /// Where workspaces, archive records and default clones live; the app
    /// data directory unless the `conductor_root_path` setting names another.
    root: PathBuf,
    /// Worktree paths still being set up. In memory only, so a crash never
    /// leaves a workspace stuck as initializing.
    initializing: Arc<Mutex<HashSet<PathBuf>>>,
    /// Shell and directory for internal scripts and their logs
    /// ([`init_log::default_shell`], `$TMPDIR`).
    script_shell: PathBuf,
    script_tmp_dir: PathBuf,
}

/// Marks a workspace as initializing until dropped.
#[derive(Debug)]
pub struct InitializingGuard {
    set: Arc<Mutex<HashSet<PathBuf>>>,
    path: PathBuf,
}

impl Drop for InitializingGuard {
    fn drop(&mut self) {
        self.set.lock().unwrap_or_else(|e| e.into_inner()).remove(&self.path);
    }
}

const ARCHIVE_EXT: &str = "ws";

impl WorkspaceManager {
    /// Rooted at `data_dir` until [`Self::with_root`] names another root.
    pub fn new(data_dir: impl Into<PathBuf>) -> Self {
        let data_dir = data_dir.into();
        Self {
            root: data_dir.clone(),
            data_dir,
            initializing: Arc::default(),
            script_shell: init_log::default_shell(),
            script_tmp_dir: std::env::temp_dir(),
        }
    }

    /// Write internal scripts and their logs to `dir` instead of `$TMPDIR`.
    pub fn with_script_tmp_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.script_tmp_dir = dir.into();
        self
    }

    /// Keep workspaces, archive records and default clones under `root`.
    pub fn with_root(mut self, root: impl Into<PathBuf>) -> Self {
        self.root = root.into();
        self
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Mark the workspace at `path` as initializing (worktree creation, setup
    /// script) until the guard drops. Branch renames are refused meanwhile.
    pub fn mark_initializing(&self, path: &Path) -> InitializingGuard {
        self.initializing.lock().unwrap_or_else(|e| e.into_inner()).insert(path.to_path_buf());
        InitializingGuard { set: Arc::clone(&self.initializing), path: path.to_path_buf() }
    }

    pub fn is_initializing(&self, path: &Path) -> bool {
        self.initializing.lock().unwrap_or_else(|e| e.into_inner()).contains(path)
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

    /// A repository's workspaces directory, `<root>/workspaces/<repo slug>`
    /// (Conductor's repo settings show it as "Workspaces path").
    pub fn workspaces_dir(&self, repo_root: &Path) -> PathBuf {
        self.root.join("workspaces").join(Self::repo_slug(repo_root))
    }

    fn archive_dir(&self, repo_root: &Path) -> PathBuf {
        self.root.join("archived").join(Self::repo_slug(repo_root))
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

    /// Create a workspace: new branch from the base (or an existing branch,
    /// see [`CreateOptions::existing_branch`]), worktree under the data dir,
    /// then copy "files to copy" from the repository root.
    pub fn create(&self, repo: &Path, opts: &CreateOptions) -> Result<Created, WorkspaceError> {
        let root = git::toplevel(repo)?;
        let explicit_branch = opts.branch_name.as_deref().map(str::trim).filter(|b| !b.is_empty());
        if let Some(b) = explicit_branch {
            if !git::valid_branch_name(&root, b) {
                return Err(WorkspaceError::InvalidName(b.to_string()));
            }
        }

        let mut fetched = false;
        let (base_ref, checkout) = if opts.existing_branch {
            let b = explicit_branch.ok_or_else(|| WorkspaceError::InvalidName(String::new()))?;
            if git::branch_exists(&root, b) {
                if let Some(wt) = git::list_worktrees(&root)?.into_iter().find(|w| w.branch.as_deref() == Some(b)) {
                    return Err(WorkspaceError::BranchCheckedOut { branch: b.to_string(), path: wt.path });
                }
                (b.to_string(), Checkout::Local)
            } else {
                let remote_ref = format!("origin/{b}");
                if opts.fetch && git::remote_exists(&root, "origin") {
                    // Explicit refspec: updates origin/<b> even without a default fetch refspec.
                    let spec = format!("+refs/heads/{b}:refs/remotes/{remote_ref}");
                    fetched = git::git(&root, ["fetch", "--quiet", "origin", &spec]).is_ok();
                }
                if git::ref_exists(&root, &remote_ref) {
                    (remote_ref, Checkout::Track)
                } else if let (Some(n), true) = (opts.pr_number, opts.fetch && git::remote_exists(&root, "origin")) {
                    // A fork's branch is not on origin; GitHub serves every PR's head as pull/<n>/head.
                    let spec = format!("pull/{n}/head:refs/heads/{b}");
                    match git::git(&root, ["fetch", "--quiet", "origin", &spec]) {
                        Ok(_) => {}
                        Err(WorkspaceError::Git { stderr, .. }) => {
                            return Err(WorkspaceError::PullRequestNotFound { number: n, branch: b.to_string(), stderr });
                        }
                        Err(e) => return Err(e),
                    }
                    fetched = true;
                    (b.to_string(), Checkout::Local)
                } else {
                    return Err(WorkspaceError::BranchNotFound(b.to_string()));
                }
            }
        } else {
            if let Some(b) = explicit_branch {
                if git::branch_name_is_taken(&root, b)? {
                    return Err(WorkspaceError::BranchExists(b.to_string()));
                }
            }
            let base = match &opts.base_branch {
                Some(b) => b.clone(),
                None => git::default_branch(&root),
            };
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
            (base_ref, Checkout::NewBranch)
        };
        let base_commit = git::git(&root, ["rev-parse", &format!("{base_ref}^{{commit}}")])?;
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
        let _initializing = self.mark_initializing(&path);
        std::fs::create_dir_all(&ws_dir)?;
        // Conductor's UYe: `git worktree add` runs as a logged internal script
        // in the main worktree (see `init_log`).
        let q = |s: &str| init_log::shell_quote(s);
        let p = q(&path.to_string_lossy());
        let command = match checkout {
            // From the resolved commit, as Conductor does, so no upstream is set.
            Checkout::NewBranch => format!("git worktree add {p} -b {} {}", q(&branch), q(&base_commit)),
            Checkout::Track => format!("git worktree add --track -b {} {p} {}", q(&branch), q(&base_ref)),
            Checkout::Local => format!("git worktree add {p} {}", q(&base_ref)),
        };
        let run = init_log::run_internal_script(
            &command,
            &root,
            &self.script_shell,
            &self.script_tmp_dir,
            &[("GIT_TERMINAL_PROMPT", "0"), ("GIT_EDITOR", "true")],
        );
        let mut aux = None;
        if run.exit_code != 0 {
            if worktree_listed(&root, &path) {
                eprintln!("Worktree created at {} but post-checkout hook failed: {}", path.display(), run.stderr);
                aux = Some(init_log::WORKTREE_PARTIAL_FAILURE.to_string());
            } else {
                return Err(WorkspaceError::WorktreeFailed(init_log::worktree_failure_message(
                    &init_log::failure_output(&run),
                )));
            }
        }

        let upstream_warning = if opts.push_auto_setup_remote {
            git::configure_push_upstream(&root, &path).map(str::to_string)
        } else {
            None
        };
        aux = init_log::join_messages(aux, upstream_warning.clone());
        let source = files_to_copy::resolve_source(&root, opts.file_include_globs.as_deref());
        let copied_files = match files_to_copy::files_to_copy(&root, &source)
            .and_then(|files| files_to_copy::copy_files(&root, &path, &files))
        {
            Ok(copied) => copied,
            Err(e) => {
                let msg = format!("Couldn't copy files from .worktreeinclude: {e}");
                eprintln!("{msg}");
                aux = init_log::join_messages(aux, Some(msg));
                Vec::new()
            }
        };
        let initialization_files_copied = match git::git(&path, ["ls-files"]) {
            Ok(out) => out.lines().count() as i64,
            Err(e) => {
                eprintln!("Failed to parse number of files: {e}");
                0
            }
        };
        if let Some(msg) = &aux {
            let at = run.log_file_path.as_ref().map(|p| format!(" See logs at: {}", p.display())).unwrap_or_default();
            eprintln!("Workspace {name} had non-fatal initialization issues. Workspace created successfully.{at} ({msg})");
        }

        let workspace = self.make(&root, &name, branch, WorkspaceState::Active, Some(base_commit.clone()));
        Ok(Created {
            workspace,
            base_ref,
            base_commit,
            fetched,
            copied_files,
            upstream_warning,
            initialization_log_path: run.log_file_path,
            initialization_files_copied,
            auxiliary_failure_message: aux,
        })
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
        let commit = ws.head.clone().or_else(|| git::git(&ws.repo_root, ["rev-parse", "--verify", "-q", &format!("refs/heads/{}^{{commit}}", ws.branch)]).ok());
        self.record_archive(&ws.repo_root, &ws.name, &ws.branch, commit.as_deref())?;
        self.remove_worktree(&ws)?;
        if opts.delete_branch && !ws.branch.is_empty() && git::branch_exists(&ws.repo_root, &ws.branch) {
            git::git(&ws.repo_root, ["branch", "-D", &ws.branch])?;
        }
        let workspace = self.make(&ws.repo_root, &ws.name, ws.branch, WorkspaceState::Archived, commit);
        Ok(Archived { workspace, script })
    }

    /// Write the archive record (`branch=`, `commit=`) that keeps an archived
    /// workspace listed and its name taken. [`Self::archive`] and the app's
    /// full archive (`workspace_archive_commands`) both write it.
    pub fn record_archive(
        &self,
        repo_root: &Path,
        name: &str,
        branch: &str,
        commit: Option<&str>,
    ) -> Result<(), WorkspaceError> {
        let record = self.archive_record(repo_root, name);
        std::fs::create_dir_all(record.parent().expect("record has parent"))?;
        let mut text = format!("branch={branch}\n");
        if let Some(c) = commit {
            text.push_str(&format!("commit={c}\n"));
        }
        std::fs::write(&record, text)?;
        Ok(())
    }

    /// Remove the archive record of `name`, if any (the full unarchive in
    /// `workspace_archive` recreated the worktree itself).
    pub fn forget_archive_record(&self, repo_root: &Path, name: &str) -> Result<(), WorkspaceError> {
        let record = self.archive_record(repo_root, name);
        if record.exists() {
            std::fs::remove_file(record)?;
        }
        Ok(())
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

    /// Rename an active workspace's branch (`git branch -m` in its worktree).
    /// The directory name stays. Refused while the workspace is initializing,
    /// mid merge/rebase, or when `new_branch` is taken locally or on a remote.
    /// Renaming to the current name is a no-op.
    pub fn rename_branch(&self, repo: &Path, name: &str, new_branch: &str) -> Result<Workspace, WorkspaceError> {
        let ws = self.get(repo, name)?;
        if self.is_initializing(&ws.path) {
            return Err(WorkspaceError::Initializing(ws.name));
        }
        if ws.state != WorkspaceState::Active || ws.branch.is_empty() {
            return Err(WorkspaceError::NotActive(ws.name));
        }
        let new_branch = new_branch.trim();
        if new_branch == ws.branch {
            return Ok(ws);
        }
        if !git::valid_branch_name(&ws.repo_root, new_branch) {
            return Err(WorkspaceError::InvalidName(new_branch.to_string()));
        }
        if git::branch_name_is_taken(&ws.repo_root, new_branch)? {
            return Err(WorkspaceError::BranchExists(new_branch.to_string()));
        }
        let busy = git::busy_state(&ws.path)?;
        if busy != BusyState::Clean {
            return Err(WorkspaceError::Busy(busy));
        }
        git::git(&ws.path, ["branch", "-m", &ws.branch, new_branch])?;
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

/// `git worktree list --porcelain` has a worktree at `path`.
fn worktree_listed(root: &Path, path: &Path) -> bool {
    let want = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    git::list_worktrees(root).is_ok_and(|list| {
        list.iter().any(|w| w.path == path || std::fs::canonicalize(&w.path).is_ok_and(|p| p == want))
    })
}

/// How [`WorkspaceManager::create`] gets the worktree's branch.
#[derive(Debug, Clone, Copy)]
enum Checkout {
    /// `-b <branch> <base>` without upstream tracking.
    NewBranch,
    /// The existing local branch.
    Local,
    /// `--track -b <branch> origin/<branch>`.
    Track,
}

/// `(branch, archive commit)` from an archive record; records written
/// before the commit was stored have only `branch=`.
fn read_record(path: &Path) -> Result<(Option<String>, Option<String>), WorkspaceError> {
    let text = std::fs::read_to_string(path)?;
    let field = |key: &str| text.lines().find_map(|l| l.strip_prefix(key)).map(str::to_string);
    Ok((field("branch="), field("commit=")))
}
