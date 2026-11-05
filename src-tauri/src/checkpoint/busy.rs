//! In-progress git operation detection, matching the reference
//! `git-busy-check.sh` (itself modelled on git's contrib git-prompt.sh).

use std::path::{Path, PathBuf};

use super::git::Git;
use super::CheckpointError;

/// What the reference script prints: `clean` or `busy:<kind>`.
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
    /// The exact token the reference script prints.
    pub fn as_str(self) -> &'static str {
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

fn git_path(git: &Git<'_>, cwd: &Path, name: &str) -> Result<PathBuf, CheckpointError> {
    let p = PathBuf::from(git.run(["rev-parse", "--git-path", name])?);
    Ok(if p.is_absolute() { p } else { cwd.join(p) })
}

/// Detect an in-progress rebase / merge / conflicted squash / cherry-pick /
/// revert, checked in the same order as the reference script.
pub fn busy_state(workspace: &Path) -> Result<BusyState, CheckpointError> {
    let git = Git::new(workspace);
    if git_path(&git, workspace, "rebase-merge")?.is_dir()
        || git_path(&git, workspace, "rebase-apply")?.is_dir()
    {
        return Ok(BusyState::Rebase);
    }
    if git_path(&git, workspace, "MERGE_HEAD")?.exists() {
        return Ok(BusyState::Merge);
    }
    // A clean `merge --squash` also leaves SQUASH_MSG; only the conflicted
    // variant (unmerged index entries) counts as busy.
    if git_path(&git, workspace, "SQUASH_MSG")?.exists() && has_unmerged_entries(workspace)? {
        return Ok(BusyState::SquashMerge);
    }
    if git_path(&git, workspace, "CHERRY_PICK_HEAD")?.exists() {
        return Ok(BusyState::CherryPick);
    }
    if git_path(&git, workspace, "REVERT_HEAD")?.exists() {
        return Ok(BusyState::Revert);
    }
    Ok(BusyState::Clean)
}

/// `git ls-files -u` is non-empty (stage 1/2/3 entries).
pub(crate) fn has_unmerged_entries(workspace: &Path) -> Result<bool, CheckpointError> {
    let out = Git::new(workspace).output(["ls-files", "-u"])?;
    Ok(out.success && !out.stdout.trim().is_empty())
}
