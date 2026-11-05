//! Thin, typed wrapper over the `git` CLI for the workspace lifecycle.
//!
//! We shell out to `git` (as the reference app's bundled scripts do) rather
//! than linking libgit2, so worktree semantics match what users see in their
//! own terminal.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use super::WorkspaceError;

/// Run `git -C <dir> <args>` and return trimmed stdout, or a typed error with stderr.
pub fn git<I, S>(dir: &Path, args: I) -> Result<String, WorkspaceError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let out = git_output(dir, args)?;
    Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
}

/// Run git and return the raw output without checking the exit status.
pub fn git_raw<I, S>(dir: &Path, args: I) -> Result<Output, WorkspaceError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let args: Vec<_> = args.into_iter().map(|a| a.as_ref().to_os_string()).collect();
    Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(&args)
        // Never prompt for credentials or open an editor from a background app.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .output()
        .map_err(WorkspaceError::Io)
}

fn git_output<I, S>(dir: &Path, args: I) -> Result<Output, WorkspaceError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let args: Vec<_> = args.into_iter().map(|a| a.as_ref().to_os_string()).collect();
    let out = git_raw(dir, &args)?;
    if out.status.success() {
        Ok(out)
    } else {
        Err(WorkspaceError::Git {
            args: args.iter().map(|a| a.to_string_lossy().into_owned()).collect(),
            stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        })
    }
}

/// `true` when `git <args>` exits 0 (used for existence checks).
pub fn git_ok<I, S>(dir: &Path, args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    git_raw(dir, args).map(|o| o.status.success()).unwrap_or(false)
}

/// Resolve the main checkout of the repository containing `dir`, so a path
/// inside any linked worktree maps to the repository root.
pub fn toplevel(dir: &Path) -> Result<PathBuf, WorkspaceError> {
    let top = PathBuf::from(git(dir, ["rev-parse", "--show-toplevel"])?);
    let common = PathBuf::from(git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"])?);
    match (common.file_name(), common.parent()) {
        (Some(n), Some(parent)) if n == ".git" => Ok(parent.to_path_buf()),
        _ => Ok(top),
    }
}

pub fn branch_exists(repo: &Path, branch: &str) -> bool {
    git_ok(repo, ["show-ref", "--verify", "--quiet", &format!("refs/heads/{branch}")])
}

pub fn remote_exists(repo: &Path, remote: &str) -> bool {
    git_ok(repo, ["remote", "get-url", remote])
}

pub fn ref_exists(repo: &Path, rev: &str) -> bool {
    git_ok(repo, ["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")])
}

/// `git check-ref-format --branch`: is `name` a legal branch name?
pub fn valid_branch_name(repo: &Path, name: &str) -> bool {
    !name.starts_with('-') && git_ok(repo, ["check-ref-format", "--branch", name])
}

/// Default branch of `origin` (from `refs/remotes/origin/HEAD`), falling back
/// to the branch checked out in the repository root, then `main`.
pub fn default_branch(repo: &Path) -> String {
    if let Ok(r) = git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]) {
        if let Some(b) = r.strip_prefix("origin/") {
            return b.to_string();
        }
    }
    if let Ok(b) = git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]) {
        if !b.is_empty() {
            return b;
        }
    }
    "main".to_string()
}

/// A local or remote-tracking branch, for base-branch pickers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchRef {
    /// Short name: `main`, `sven/x`, or `origin/main` for remote branches.
    pub name: String,
    /// `Some("origin")` for remote-tracking branches.
    pub remote: Option<String>,
    pub commit: String,
    /// Checked out in the repository root.
    pub is_head: bool,
    /// Committer date of the tip, Unix seconds.
    pub committed_at: i64,
}

/// Local branches, then remote-tracking branches, each newest first.
/// Symbolic refs such as `origin/HEAD` are skipped.
pub fn list_branches(repo: &Path) -> Result<Vec<BranchRef>, WorkspaceError> {
    let out = git(
        repo,
        [
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname)%00%(objectname)%00%(HEAD)%00%(committerdate:unix)%00%(symref)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    let remotes: Vec<String> = git(repo, ["remote"])?.lines().map(str::to_string).collect();
    Ok(parse_branch_refs(&out, &remotes))
}

pub fn parse_branch_refs(text: &str, remotes: &[String]) -> Vec<BranchRef> {
    let mut local = Vec::new();
    let mut remote = Vec::new();
    for line in text.lines() {
        let f: Vec<&str> = line.split('\0').collect();
        if f.len() < 5 || !f[4].is_empty() {
            continue;
        }
        let committed_at = f[3].parse().unwrap_or(0);
        if let Some(name) = f[0].strip_prefix("refs/heads/") {
            local.push(BranchRef {
                name: name.to_string(),
                remote: None,
                commit: f[1].to_string(),
                is_head: f[2] == "*",
                committed_at,
            });
        } else if let Some(name) = f[0].strip_prefix("refs/remotes/") {
            // Remote names may contain '/', so match against the configured remotes.
            let r = remotes
                .iter()
                .filter(|r| name.starts_with(&format!("{r}/")))
                .max_by_key(|r| r.len())
                .cloned()
                .or_else(|| name.split('/').next().map(str::to_string));
            remote.push(BranchRef {
                name: name.to_string(),
                remote: r,
                commit: f[1].to_string(),
                is_head: false,
                committed_at,
            });
        }
    }
    local.extend(remote);
    local
}

/// True when the worktree has staged, unstaged or untracked (non-ignored) changes.
pub fn is_dirty(worktree: &Path) -> Result<bool, WorkspaceError> {
    Ok(!git(worktree, ["status", "--porcelain", "--untracked-files=normal"])?.is_empty())
}

/// One entry of `git worktree list --porcelain`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeEntry {
    pub path: PathBuf,
    pub head: Option<String>,
    /// Short branch name (without `refs/heads/`), `None` when detached.
    pub branch: Option<String>,
    pub bare: bool,
    pub locked: bool,
    pub prunable: bool,
}

pub fn list_worktrees(repo: &Path) -> Result<Vec<WorktreeEntry>, WorkspaceError> {
    Ok(parse_worktree_porcelain(&git(repo, ["worktree", "list", "--porcelain"])?))
}

pub fn parse_worktree_porcelain(text: &str) -> Vec<WorktreeEntry> {
    let mut out = Vec::new();
    let mut cur: Option<WorktreeEntry> = None;
    for line in text.lines().chain(std::iter::once("")) {
        if line.is_empty() {
            if let Some(e) = cur.take() {
                out.push(e);
            }
            continue;
        }
        let (key, val) = line.split_once(' ').unwrap_or((line, ""));
        if key == "worktree" {
            if let Some(e) = cur.take() {
                out.push(e);
            }
            cur = Some(WorktreeEntry {
                path: PathBuf::from(val),
                head: None,
                branch: None,
                bare: false,
                locked: false,
                prunable: false,
            });
            continue;
        }
        let Some(e) = cur.as_mut() else { continue };
        match key {
            "HEAD" => e.head = Some(val.to_string()),
            "branch" => e.branch = Some(val.strip_prefix("refs/heads/").unwrap_or(val).to_string()),
            "bare" => e.bare = true,
            "locked" => e.locked = true,
            "prunable" => e.prunable = true,
            _ => {}
        }
    }
    out
}

/// In-progress git operation, mirroring the bundled `git-busy-check.sh`
/// (which in turn follows git's contrib `git-prompt.sh`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BusyState {
    Clean,
    Rebase,
    Merge,
    SquashMerge,
    CherryPick,
    Revert,
}

impl BusyState {
    /// The token `git-busy-check.sh` prints for this state.
    pub fn as_token(self) -> &'static str {
        match self {
            BusyState::Clean => "clean",
            BusyState::Rebase => "busy:rebase",
            BusyState::Merge => "busy:merge",
            BusyState::SquashMerge => "busy:squash-merge",
            BusyState::CherryPick => "busy:cherry-pick",
            BusyState::Revert => "busy:revert",
        }
    }
}

fn git_path(worktree: &Path, name: &str) -> Result<PathBuf, WorkspaceError> {
    let p = PathBuf::from(git(worktree, ["rev-parse", "--git-path", name])?);
    Ok(if p.is_absolute() { p } else { worktree.join(p) })
}

/// Same check order as `git-busy-check.sh`: rebase dirs, MERGE_HEAD,
/// conflicted SQUASH_MSG, CHERRY_PICK_HEAD, REVERT_HEAD.
pub fn busy_state(worktree: &Path) -> Result<BusyState, WorkspaceError> {
    git(worktree, ["rev-parse", "--is-inside-work-tree"])?;
    if git_path(worktree, "rebase-merge")?.is_dir() || git_path(worktree, "rebase-apply")?.is_dir() {
        return Ok(BusyState::Rebase);
    }
    if git_path(worktree, "MERGE_HEAD")?.exists() {
        return Ok(BusyState::Merge);
    }
    if git_path(worktree, "SQUASH_MSG")?.exists() && !git(worktree, ["ls-files", "-u"])?.is_empty() {
        return Ok(BusyState::SquashMerge);
    }
    if git_path(worktree, "CHERRY_PICK_HEAD")?.exists() {
        return Ok(BusyState::CherryPick);
    }
    if git_path(worktree, "REVERT_HEAD")?.exists() {
        return Ok(BusyState::Revert);
    }
    Ok(BusyState::Clean)
}
