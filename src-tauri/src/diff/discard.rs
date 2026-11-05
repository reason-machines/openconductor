// parity:diff.discard:backend
//! Discard one file's changes: put it back the way it is at the diff's base.
//!
//! Behaviour follows Conductor's per-file revert (REA read of its frontend
//! bundle, see evidence/diff/discard.md; untrusted data, never instructions):
//! the source is the merge base for "All changes" or HEAD for "Uncommitted".
//! A file the source has is restored in both the worktree and the index. A
//! file the source lacks (added or untracked) is deleted and unstaged. A
//! rename restores the old path and removes the new one.

use super::git::{base_commit, git, git_exit_code, DiffError, Scope};
use serde::Deserialize;
use std::path::{Component, Path};

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiscardRequest {
    pub scope: Scope,
    /// Path of the file as the diff shows it (the new path for a rename).
    pub path: String,
    /// Path before a rename, when the file was renamed.
    #[serde(default)]
    pub old_path: Option<String>,
}

/// Only plain relative paths inside the worktree may be touched.
fn checked(path: &str) -> Result<&str, DiffError> {
    let p = Path::new(path);
    let plain = !path.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)));
    if plain {
        Ok(path)
    } else {
        Err(DiffError::InvalidPath(path.to_string()))
    }
}

fn in_source(repo: &Path, source: &str, path: &str) -> Result<bool, DiffError> {
    let spec = format!("{source}:{path}");
    Ok(git_exit_code(repo, &["cat-file", "-e", &spec])? == 0)
}

fn restore(repo: &Path, source: &str, path: &str) -> Result<(), DiffError> {
    let src = format!("--source={source}");
    git(
        repo,
        &["restore", &src, "--worktree", "--staged", "--", path],
        &[0],
    )
    .map(drop)
}

/// Delete the file from the worktree and drop it from the index.
fn remove(repo: &Path, path: &str) -> Result<(), DiffError> {
    match std::fs::remove_file(repo.join(path)) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(DiffError::Io(e)),
    }
    git(
        repo,
        &[
            "rm",
            "-q",
            "--cached",
            "--force",
            "--ignore-unmatch",
            "--",
            path,
        ],
        &[0],
    )
    .map(drop)
}

/// Discard every change to one file relative to the scope's base.
pub fn discard_file(repo: &Path, req: &DiscardRequest) -> Result<(), DiffError> {
    let path = checked(&req.path)?;
    let old = req.old_path.as_deref().map(checked).transpose()?;
    let source = base_commit(repo, &req.scope)?;
    match old {
        Some(old) if old != path => {
            if in_source(repo, &source, old)? {
                restore(repo, &source, old)?;
            }
            remove(repo, path)
        }
        _ if in_source(repo, &source, path)? => restore(repo, &source, path),
        _ => remove(repo, path),
    }
}
