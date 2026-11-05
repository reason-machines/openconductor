//! Workspace lifecycle on git worktrees.
//!
//! A workspace is a git worktree of a repository, on its own branch, in its
//! own directory; the repository root keeps its own checkout. Behavior is
//! recreated from REA evidence on Conductor v0.87.6 (see
//! `evidence/workspace/NOTES.md` for what is matched, what is our choice,
//! and what is still unverified).
//!
//! Naming (placeholder city names, the branch prefix and `-vN` collision
//! bumps) happens in the frontend, as in the reference app; this module
//! validates names and reports collisions but never renames.
//!
//! Std only: every operation shells out to `git`.

mod branches;
mod git;

#[cfg(test)]
mod test_util;
#[cfg(test)]
mod tests_branches;

use std::fmt;
use std::path::{Path, PathBuf};

pub use branches::{list_branches, primary_remote, BranchList};

#[derive(Debug)]
pub enum WorkspaceError {
    /// The path is not inside a git working tree.
    NotARepository(PathBuf),
    Git {
        command: String,
        stderr: String,
    },
    Io(std::io::Error),
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkspaceError::NotARepository(p) => write!(f, "not a git repository: {}", p.display()),
            WorkspaceError::Git { command, stderr } => write!(f, "{command} failed: {stderr}"),
            WorkspaceError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for WorkspaceError {}

/// Physical toplevel of the working tree containing `path`.
pub fn repo_root(path: &Path) -> Result<PathBuf, WorkspaceError> {
    let not_repo = || WorkspaceError::NotARepository(path.to_path_buf());
    if !path.is_dir() {
        return Err(not_repo());
    }
    let out = git::output(path, ["rev-parse", "--show-toplevel"])?;
    if !out.success {
        return Err(not_repo());
    }
    let top = PathBuf::from(out.stdout.trim());
    Ok(std::fs::canonicalize(&top).unwrap_or(top))
}
