//! Spotlight testing: mirror a workspace into the repository's root checkout
//! so projects that only run from the root can test a workspace's changes.
//!
//! Recreated from the reference app (see `evidence/spotlight/NOTES.md`):
//!
//! * [`begin`] runs once when Spotlight starts. It first undoes a session
//!   that was never ended (a leftover `pre-spotlight` checkpoint), refuses a
//!   root with a rebase, a merge or a detached HEAD, then saves the root's
//!   own state as the `pre-spotlight` checkpoint.
//! * [`sync_once`] runs on every change: save the workspace as one
//!   checkpoint id per session (overwritten each time), then restore it in
//!   the root. A busy workspace or a failed save is skipped, not an error.
//! * [`end`] puts the root back to its `pre-spotlight` state and drops the
//!   ref. If that restore fails the ref is kept, so the next [`begin`]
//!   retries it.
//!
//! [`watch`] runs [`sync_once`] at start and after each file change.
//! [`service`] keeps one session per repository root and reports each step
//! as an event for the UI.
//!
//! Everything goes through [`crate::checkpoint`], whose refs are shared by
//! every worktree of a repository.

pub mod service;
#[cfg(test)]
mod tests;
pub mod watch;

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::checkpoint::{self, CheckpointError, SaveOptions};

/// Checkpoint id holding the root's state from before Spotlight started.
pub const PRE_SPOTLIGHT_ID: &str = "pre-spotlight";

/// Checkpoint id a session syncs through: `cp-spotlight-<epoch>-<pid>`,
/// chosen once per session, like the reference watcher script.
pub fn session_checkpoint_id(epoch_secs: u64, pid: u32) -> String {
    format!("cp-spotlight-{epoch_secs}-{pid}")
}

/// Why the root checkout cannot take Spotlight syncs. Checked in this order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RootBlocker {
    Rebase,
    Merge,
    DetachedHead,
}

impl RootBlocker {
    /// What the user should do, shown when Spotlight refuses to start.
    pub fn message(self) -> &'static str {
        match self {
            RootBlocker::Rebase => {
                "A rebase is in progress in the repository root. Finish or abort it there (git rebase --abort), then start Spotlight again."
            }
            RootBlocker::Merge => {
                "A merge is in progress in the repository root. Finish or abort it there (git merge --abort), then start Spotlight again."
            }
            RootBlocker::DetachedHead => {
                "The repository root is on a detached HEAD. Check out a branch there, then start Spotlight again."
            }
        }
    }
}

#[derive(Debug)]
pub enum SpotlightError {
    /// The root checkout is not in a state Spotlight can write into.
    Root(RootBlocker),
    Checkpoint(CheckpointError),
    /// A git command failed to run or reported an error.
    Git(String),
}

impl fmt::Display for SpotlightError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SpotlightError::Root(b) => f.write_str(b.message()),
            SpotlightError::Checkpoint(e) => write!(f, "{e}"),
            SpotlightError::Git(e) => f.write_str(e),
        }
    }
}

impl std::error::Error for SpotlightError {}

impl From<CheckpointError> for SpotlightError {
    fn from(e: CheckpointError) -> Self {
        SpotlightError::Checkpoint(e)
    }
}

/// Run git in `dir` with an environment that cannot redirect it elsewhere.
fn git(dir: &Path, args: &[&str]) -> Result<String, SpotlightError> {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_PREFIX")
        .output()
        .map_err(|e| SpotlightError::Git(format!("git {}: {e}", args.join(" "))))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(SpotlightError::Git(format!(
            "git {}: {}",
            args.join(" "),
            stderr.trim()
        )));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn git_path(root: &Path, name: &str) -> Result<PathBuf, SpotlightError> {
    let p = PathBuf::from(git(root, &["rev-parse", "--git-path", name])?);
    Ok(if p.is_absolute() { p } else { root.join(p) })
}

/// The first reason the root cannot take syncs, or `None` when it can.
pub fn root_blocker(root: &Path) -> Result<Option<RootBlocker>, SpotlightError> {
    let rebase =
        git_path(root, "rebase-merge")?.is_dir() || git_path(root, "rebase-apply")?.is_dir();
    if rebase {
        return Ok(Some(RootBlocker::Rebase));
    }
    if git_path(root, "MERGE_HEAD")?.exists() {
        return Ok(Some(RootBlocker::Merge));
    }
    if git(root, &["branch", "--show-current"])?.is_empty() {
        return Ok(Some(RootBlocker::DetachedHead));
    }
    Ok(None)
}

fn has_checkpoint(root: &Path, id: &str) -> Result<bool, SpotlightError> {
    match checkpoint::get(root, id) {
        Ok(_) => Ok(true),
        Err(CheckpointError::NotFound(_)) => Ok(false),
        Err(e) => Err(e.into()),
    }
}

fn delete_checkpoint(root: &Path, id: &str) -> Result<(), SpotlightError> {
    let reference = format!("{}/{id}", checkpoint::REF_NAMESPACE);
    git(root, &["update-ref", "-d", &reference]).map(|_| ())
}

/// What [`begin`] found from a session that was never ended.
#[derive(Debug, PartialEq, Eq)]
pub enum LeftoverSession {
    None,
    /// The root was put back to its earlier `pre-spotlight` state.
    Restored,
    /// Restoring it failed; the root keeps the last synced state and the
    /// new session saves that as its `pre-spotlight` state.
    RestoreFailed(String),
}

/// Prepare the root for a Spotlight session. See the module docs.
pub fn begin(root: &Path) -> Result<LeftoverSession, SpotlightError> {
    let leftover = if has_checkpoint(root, PRE_SPOTLIGHT_ID)? {
        match checkpoint::restore(root, PRE_SPOTLIGHT_ID) {
            Ok(()) => {
                delete_checkpoint(root, PRE_SPOTLIGHT_ID)?;
                LeftoverSession::Restored
            }
            Err(e) => LeftoverSession::RestoreFailed(e.to_string()),
        }
    } else {
        LeftoverSession::None
    };
    if let Some(blocker) = root_blocker(root)? {
        return Err(SpotlightError::Root(blocker));
    }
    checkpoint::save(
        root,
        &SaveOptions {
            id: Some(PRE_SPOTLIGHT_ID.to_string()),
            force: true,
        },
    )?;
    Ok(leftover)
}

/// Result of one sync from the workspace into the root.
#[derive(Debug, PartialEq, Eq)]
pub enum SyncOutcome {
    Synced,
    /// The workspace has a merge, rebase, cherry-pick or revert running.
    SkippedBusy,
    /// Saving the workspace failed for another reason.
    SkippedSaveFailed(String),
    /// The workspace was saved but the root could not be updated.
    RestoreFailed(String),
}

/// Save `workspace` as checkpoint `id` and restore it into `root`.
pub fn sync_once(workspace: &Path, root: &Path, id: &str) -> SyncOutcome {
    let opts = SaveOptions {
        id: Some(id.to_string()),
        force: true,
    };
    match checkpoint::save(workspace, &opts) {
        Ok(_) => {}
        Err(CheckpointError::Busy(_)) => return SyncOutcome::SkippedBusy,
        Err(e) => return SyncOutcome::SkippedSaveFailed(e.to_string()),
    }
    match checkpoint::restore(root, id) {
        Ok(()) => SyncOutcome::Synced,
        Err(e) => SyncOutcome::RestoreFailed(e.to_string()),
    }
}

/// End a session: put the root back as it was before [`begin`]. A root
/// without a `pre-spotlight` checkpoint is left alone.
pub fn end(root: &Path) -> Result<(), SpotlightError> {
    if !has_checkpoint(root, PRE_SPOTLIGHT_ID)? {
        return Ok(());
    }
    checkpoint::restore(root, PRE_SPOTLIGHT_ID)?;
    delete_checkpoint(root, PRE_SPOTLIGHT_ID)
}
