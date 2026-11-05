//! Archive and unarchive a workspace with Conductor's semantics.
//!
//! Reference: Conductor 0.87.6 frontend (`index-BGEQ8YjU.js`, decoded from
//! the app binary; strings and code read as untrusted data). Its archive
//! path (`dYe` -> `mYe` -> `SYe` -> `_Ye`) and the unarchive path (`RWt`)
//! do, for a local workspace:
//!
//! 1. Save a checkpoint `conductor-archive-<localId>` of the worktree
//!    (`checkpointer save --id ... --force`), so uncommitted and untracked
//!    files survive the worktree's removal.
//!    - Exit 101 (a merge, rebase, cherry-pick or revert is in progress):
//!      refuse with [`GIT_BUSY`] unless the caller asked to discard the git
//!      operation state, in which case stage the unmerged paths, delete the
//!      operation's state files ([`discard_git_operation_state`]) and save
//!      again ([`CLEAR_FAILED`] if still busy).
//!    - Exit 102 (unresolved conflicts, no operation): stage the unmerged
//!      paths and save again ([`MERGE_IN_PROGRESS`] / [`UNRESOLVED_AFTER_RECOVERY`]
//!      if that does not help).
//! 2. Record `git rev-parse HEAD` as the archive commit: in
//!    `refs/conductor-archive-heads/<localId>` and in
//!    `workspaces.archive_commit` (with `state = 'archived'` and the branch).
//! 3. Side effects: stop run scripts, run the archive script, remove the
//!    worktree, and delete the branch when `git.delete_branch_on_archive` is
//!    on (never the repository's default branch). A failure here is reported
//!    but does not undo the archive.
//!
//! Unarchive re-adds the worktree on the branch (recreating it at the
//! archive commit when it was deleted) and restores the archive checkpoint;
//! a failed restore is a warning ("Uncommitted changes couldn't be
//! recovered: ..."), not an error.
//!
//! Runtime check on Sven's Mac (2026-11-05): for the three most recently
//! archived workspaces in Conductor's `conductor.db`, `archive_commit`
//! equals `refs/conductor-archive-heads/<localId>`, the checkpoint ref
//! `refs/conductor-checkpoints/conductor-archive-<localId>` exists, the
//! branch is kept and no worktree is left. Evidence:
//! `evidence/parity/sidebar-home-create/archive-unarchive.md`.

use std::path::Path;

use crate::checkpoint::{self, CheckpointError, SaveOptions};
use crate::workspace::{git, ArchiveOptions, Workspace, WorkspaceError, WorkspaceManager, WorkspaceState};

/// Where the archive commit is also kept as a ref (Conductor's `uYe`).
pub const ARCHIVE_HEADS_NAMESPACE: &str = "refs/conductor-archive-heads";

/// Conductor's `WorkspaceArchiveBlockedByGitOperationError` (copy id 786).
pub const GIT_BUSY: &str = "Conductor can't safely archive this workspace because a Git operation is in progress.";
/// Conductor's `lYe`: still busy after discarding the operation state.
pub const CLEAR_FAILED: &str = "Conductor couldn't fully clear the Git operation state. Please complete or abort the Git operation manually before archiving.";
/// Conductor's `cYe`: busy after staging the unmerged paths.
pub const MERGE_IN_PROGRESS: &str =
    "Conductor can't save your state because a merge or rebase is in progress. Please complete it before archiving.";
/// Conductor's `Pj`: still conflicted after staging the unmerged paths.
pub const UNRESOLVED_AFTER_RECOVERY: &str = "Conductor can't save your state because the index still has unresolved conflicts after archive recovery. Please resolve or reset the conflicts before archiving.";

/// How to treat an in-progress git operation (Conductor's `mode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveMode {
    /// Refuse with [`GIT_BUSY`].
    Safe,
    /// The user chose "Archive" on the warning: drop the operation's state.
    DiscardGitOperationState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveError {
    /// A merge, rebase, cherry-pick or revert is in progress ([`GIT_BUSY`]).
    GitBusy,
    Failed(String),
}

impl std::fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArchiveError::GitBusy => f.write_str(GIT_BUSY),
            ArchiveError::Failed(m) => f.write_str(m),
        }
    }
}

/// Checkpoint id of a workspace's archive snapshot. Conductor uses
/// `conductor-archive-<localId>` with a UUID; our ids are
/// `<repositoryId>/<directoryName>` and a checkpoint id may not contain `/`.
pub fn checkpoint_id(local_id: &str) -> String {
    format!("conductor-archive-{}", local_id.replace('/', "--"))
}

/// `refs/conductor-archive-heads/<localId>`.
pub fn head_ref(local_id: &str) -> String {
    format!("{ARCHIVE_HEADS_NAMESPACE}/{local_id}")
}

fn failed(name: &str, e: impl std::fmt::Display) -> ArchiveError {
    ArchiveError::Failed(format!("Failed to archive {name}: {e}"))
}

/// Paths with unmerged index entries (`git diff --name-only --diff-filter=U`).
fn unmerged_paths(ws: &Path) -> Result<Vec<String>, WorkspaceError> {
    let out = git::git(ws, ["diff", "--name-only", "--diff-filter=U", "-z"])?;
    Ok(out.split('\0').filter(|p| !p.is_empty()).map(str::to_string).collect())
}

fn stage(ws: &Path, paths: &[String]) -> Result<(), WorkspaceError> {
    let mut args = vec!["add".to_string(), "-u".to_string(), "--".to_string()];
    args.extend(paths.iter().cloned());
    git::git(ws, args).map(drop)
}

/// Conductor's `yYe`: stage unmerged paths, then delete the state files of
/// a merge, squash, cherry-pick, revert or rebase so the worktree reads as
/// clean. Files on disk are left as they are.
pub fn discard_git_operation_state(ws: &Path) -> Result<(), WorkspaceError> {
    let paths = unmerged_paths(ws)?;
    if !paths.is_empty() {
        stage(ws, &paths)?;
    }
    let git_path = |name: &str| -> Result<std::path::PathBuf, WorkspaceError> {
        let p = std::path::PathBuf::from(git::git(ws, ["rev-parse", "--git-path", name])?);
        Ok(if p.is_absolute() { p } else { ws.join(p) })
    };
    for f in ["MERGE_HEAD", "MERGE_MSG", "MERGE_MODE", "AUTO_MERGE", "SQUASH_MSG", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD"] {
        match std::fs::remove_file(git_path(f)?) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
    }
    for d in ["rebase-merge", "rebase-apply", "sequencer"] {
        match std::fs::remove_dir_all(git_path(d)?) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
    }
    Ok(())
}

/// Step 1 and the ref half of step 2: checkpoint the worktree and record
/// HEAD in `refs/conductor-archive-heads/<localId>`. Returns HEAD (`None`
/// for a repository without commits).
pub fn save_archive_point(ws: &Workspace, local_id: &str, mode: ArchiveMode) -> Result<Option<String>, ArchiveError> {
    let path = ws.path.as_path();
    let opts = SaveOptions { id: Some(checkpoint_id(local_id)), force: true };
    match checkpoint::save(path, &opts) {
        Ok(_) => {}
        Err(CheckpointError::UnresolvedConflicts) => {
            let paths = unmerged_paths(path).map_err(|e| failed(&ws.name, e))?;
            if paths.is_empty() {
                return Err(failed(&ws.name, "No unmerged paths found to stage"));
            }
            stage(path, &paths).map_err(|e| failed(&ws.name, e))?;
            match checkpoint::save(path, &opts) {
                Ok(_) => {}
                Err(CheckpointError::Busy(_)) => return Err(ArchiveError::Failed(MERGE_IN_PROGRESS.into())),
                Err(CheckpointError::UnresolvedConflicts) => {
                    return Err(ArchiveError::Failed(UNRESOLVED_AFTER_RECOVERY.into()))
                }
                Err(e) => return Err(failed(&ws.name, e)),
            }
        }
        Err(CheckpointError::Busy(_)) => {
            if mode == ArchiveMode::Safe {
                return Err(ArchiveError::GitBusy);
            }
            discard_git_operation_state(path).map_err(|e| failed(&ws.name, e))?;
            match checkpoint::save(path, &opts) {
                Ok(_) => {}
                Err(CheckpointError::Busy(_)) => return Err(ArchiveError::Failed(CLEAR_FAILED.into())),
                Err(CheckpointError::UnresolvedConflicts) => {
                    return Err(ArchiveError::Failed(UNRESOLVED_AFTER_RECOVERY.into()))
                }
                Err(e) => return Err(failed(&ws.name, e)),
            }
        }
        Err(e) => return Err(failed(&ws.name, e)),
    }
    let head = git::git(path, ["rev-parse", "--verify", "-q", "HEAD"]).ok().filter(|h| !h.is_empty());
    if let Some(h) = &head {
        git::git(path, ["update-ref", &head_ref(local_id), h]).map_err(|e| failed(&ws.name, e))?;
    }
    Ok(head)
}

/// What [`archive`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveOutcome {
    pub branch: String,
    /// HEAD when archived; `None` for a missing worktree or a repository
    /// without commits.
    pub archive_commit: Option<String>,
    /// Side effects that failed or were skipped, for a toast each.
    pub warnings: Vec<String>,
}

/// Options of [`archive`] beyond the workspace itself.
#[derive(Debug, Clone, Default)]
pub struct ArchiveRequest {
    /// `git.delete_branch_on_archive`.
    pub delete_branch: bool,
}

/// Checkpoint, record and remove the worktree of workspace `name` in `repo`.
/// `run_archive_script` runs between recording and removal (the archive
/// script needs the worktree); `record` writes the database row and runs
/// right after the archive point is saved, as Conductor's `SYe` does. A
/// missing worktree is archived without a checkpoint.
pub fn archive(
    manager: &WorkspaceManager,
    repo: &Path,
    name: &str,
    local_id: &str,
    mode: ArchiveMode,
    req: &ArchiveRequest,
    record: &mut dyn FnMut(&str, Option<&str>) -> Result<(), String>,
    run_archive_script: &mut dyn FnMut(&Workspace) -> Option<String>,
) -> Result<ArchiveOutcome, ArchiveError> {
    let ws = manager.get(repo, name).map_err(|e| failed(name, e))?;
    let commit = match ws.state {
        WorkspaceState::Active => save_archive_point(&ws, local_id, mode)?,
        WorkspaceState::Archived | WorkspaceState::Missing => ws.head.clone(),
    };
    record(&ws.branch, commit.as_deref()).map_err(|e| failed(name, e))?;
    let mut warnings = Vec::new();
    if ws.state == WorkspaceState::Active {
        warnings.extend(run_archive_script(&ws));
    }
    let default_branch = git::default_branch(&ws.repo_root);
    let mut delete_branch = req.delete_branch && !ws.branch.is_empty();
    if delete_branch && ws.branch == default_branch {
        delete_branch = false;
        warnings.push(format!("Skipped deleting \"{}\" because it is the repo default branch.", ws.branch));
    }
    // The checkpoint already holds uncommitted work and the operation state
    // was cleared, so removal is forced.
    let opts = ArchiveOptions { archive_script: None, force: true, delete_branch };
    if let Err(e) = manager.archive(repo, name, &opts) {
        warnings.push(e.to_string());
    }
    Ok(ArchiveOutcome { branch: ws.branch, archive_commit: commit, warnings })
}

/// What [`unarchive`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnarchiveOutcome {
    pub workspace: Workspace,
    /// "Uncommitted changes couldn't be recovered: ..." when the archive
    /// checkpoint could not be restored.
    pub warning: Option<String>,
}

/// Re-add the worktree of archived workspace `name` and restore the
/// archive checkpoint. A workspace whose worktree still exists (archived
/// before archive removed worktrees) is returned as is.
pub fn unarchive(manager: &WorkspaceManager, repo: &Path, name: &str, local_id: &str) -> Result<UnarchiveOutcome, String> {
    let ws = manager.get(repo, name).map_err(|e| e.to_string())?;
    if ws.state != WorkspaceState::Archived {
        return Ok(UnarchiveOutcome { workspace: ws, warning: None });
    }
    if ws.path.symlink_metadata().is_ok() {
        return Err(format!("Can't unarchive: {} already exists", ws.path.display()));
    }
    if !ws.branch.is_empty() {
        let worktrees = git::list_worktrees(&ws.repo_root).map_err(|e| e.to_string())?;
        if let Some(w) = worktrees.iter().find(|w| w.branch.as_deref() == Some(ws.branch.as_str())) {
            return Err(format!("Branch '{}' is already checked out at {}", ws.branch, w.path.display()));
        }
    }
    let restored = manager.restore(repo, name).map_err(|e| e.to_string())?;
    let id = checkpoint_id(local_id);
    let warning = match checkpoint::get(&restored.path, &id) {
        Err(CheckpointError::NotFound(_)) => None,
        Err(e) => Some(format!("Uncommitted changes couldn't be recovered: {e}")),
        Ok(_) => checkpoint::restore(&restored.path, &id)
            .err()
            .map(|e| format!("Uncommitted changes couldn't be recovered: {e}")),
    };
    Ok(UnarchiveOutcome { workspace: restored, warning })
}

#[cfg(test)]
#[path = "workspace_archive_tests.rs"]
mod tests;
