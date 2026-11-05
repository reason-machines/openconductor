//! Full archive of a local workspace, recreated from Conductor 0.87.6
//! (`index-BGEQ8YjU.js`; offsets below are into that chunk, see
//! `evidence/archive/NOTES.md`).
//!
//! Conductor's `archiveWorkspace` (@ ~1,063,549) calls `dYe` (@ ~966,478),
//! which runs, in order:
//!
//! 1. [`prepare`] (`mYe` @ ~969,300): refuse a missing directory
//!    ([`ArchiveError::Corrupted`]); save the whole worktree as checkpoint
//!    `conductor-archive-<id>` (`checkpointer.sh save --force`), clearing
//!    abandoned conflict residue (exit 102) or, in
//!    [`ArchiveMode::DiscardGitOperationState`] only, an in-progress git
//!    operation (exit 101); read the local branch; record `HEAD` as the
//!    archive commit under `refs/conductor-archive-heads/<id>` (`vYe`).
//! 2. The caller marks the row archived with `branch` and `archive_commit`
//!    (`SYe` @ ~976,240).
//! 3. The caller stops the workspace's processes and runs the archive script
//!    (`Z$`, `wYe` @ ~975,700); a failing script is reported, not fatal.
//! 4. [`teardown`] (`_Ye` @ ~973,300): move `.context` to
//!    `<root>/archived-contexts/<repo>/<dir>` (`Bmt` @ ~2,268,138), remove the
//!    worktree (`Vpe` @ ~3,205,035), and delete the branch when "Delete
//!    branch on archive" is on, never the repository's default branch.
//!
//! The core is std-only (git CLI and [`crate::checkpoint`]) so it is tested
//! without Tauri; `workspace_archive_commands.rs` wires it to the database
//! and script service.

#[cfg(test)]
mod tests;

use std::ffi::OsStr;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::checkpoint::{self, CheckpointError, SaveOptions};

/// Ref namespace for archive commits (`uYe` @ ~966,443).
pub const ARCHIVE_HEADS_NAMESPACE: &str = "refs/conductor-archive-heads";

/// The workspace's `.context` folder (`OW` @ ~2,252,478).
pub const CONTEXT_FOLDER: &str = ".context";

/// Under the root directory, where archived `.context` folders go (`rmt`).
pub const ARCHIVED_CONTEXTS_DIR: &str = "archived-contexts";

/// `WorkspaceArchiveBlockedByGitOperationError` (`Pse` @ ~667,655).
pub const GIT_OPERATION_MESSAGE: &str =
    "OpenConductor can't safely archive this workspace because a Git operation is in progress.";
/// `cYe` @ ~966,028: a merge or rebase reappeared after clearing conflict residue.
pub const MERGE_IN_PROGRESS_MESSAGE: &str =
    "OpenConductor can't save your state because a merge or rebase is in progress. Please complete it before archiving.";
/// `Pj` @ ~966,145.
pub const UNRESOLVED_CONFLICTS_MESSAGE: &str =
    "OpenConductor can't save your state because the index still has unresolved conflicts after archive recovery. Please resolve or reset the conflicts before archiving.";
/// `lYe` @ ~966,311.
pub const DISCARD_FAILED_MESSAGE: &str =
    "OpenConductor couldn't fully clear the Git operation state. Please complete or abort the Git operation manually before archiving.";

/// `mode` of Conductor's `archiveWorkspace`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ArchiveMode {
    /// Refuse while a merge, rebase, cherry-pick or revert is in progress.
    #[default]
    Safe,
    /// The user chose "Archive" on the git-operation warning: stage the
    /// unmerged paths and drop the operation's state files, then save.
    DiscardGitOperationState,
}

impl ArchiveMode {
    /// `"safe"` (also the default for `None`) or `"discardGitOperationState"`.
    pub fn parse(s: Option<&str>) -> Result<Self, String> {
        match s {
            None | Some("safe") => Ok(Self::Safe),
            Some("discardGitOperationState") => Ok(Self::DiscardGitOperationState),
            Some(other) => Err(format!("unknown archive mode: {other}")),
        }
    }
}

/// The workspace being archived, from its `conductor.db` row and repository.
#[derive(Debug, Clone)]
pub struct ArchiveTarget {
    /// `workspaces.local_id`.
    pub local_id: String,
    pub directory_name: String,
    pub workspace_path: PathBuf,
    /// The repository's main worktree.
    pub repo_root: PathBuf,
    pub repo_name: String,
    /// `workspaces.branch` as stored; kept when the worktree has no branch.
    pub branch: String,
    pub default_branch: String,
}

/// What [`prepare`] found; the caller stores `persisted_branch` and
/// `archive_commit` on the row, and [`teardown`] deletes `branch_to_delete`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Prepared {
    pub persisted_branch: String,
    /// The worktree's checked-out branch; `None` on a detached HEAD.
    pub branch_to_delete: Option<String>,
    /// `HEAD` at archive time; `None` when it could not be read (unborn).
    pub archive_commit: Option<String>,
    /// The checkpoint holding the worktree as it was (`conductor-archive-<id>`).
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveError {
    /// `WORKSPACE_CORRUPTED` (`hv` @ ~667,504): no path, or no git worktree there.
    Corrupted,
    /// `WorkspaceArchiveBlockedByGitOperationError`, only in [`ArchiveMode::Safe`].
    GitOperationInProgress,
    /// Anything else; the text is shown as is.
    Failed(String),
}

impl ArchiveError {
    /// Stable code the frontend switches on (Conductor's error class names).
    pub fn code(&self) -> &'static str {
        match self {
            ArchiveError::Corrupted => "WORKSPACE_CORRUPTED",
            ArchiveError::GitOperationInProgress => "WorkspaceArchiveBlockedByGitOperationError",
            ArchiveError::Failed(_) => "ArchiveFailed",
        }
    }
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArchiveError::Corrupted => f.write_str("Workspace directory not found"),
            ArchiveError::GitOperationInProgress => f.write_str(GIT_OPERATION_MESSAGE),
            ArchiveError::Failed(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for ArchiveError {}

/// A toast the archive leaves for the user (`showWorkspaceToast`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub kind: NoticeKind,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoticeKind {
    Info,
    Error,
}

impl Notice {
    pub fn info(message: impl Into<String>) -> Self {
        Self { kind: NoticeKind::Info, message: message.into() }
    }
    pub fn error(message: impl Into<String>) -> Self {
        Self { kind: NoticeKind::Error, message: message.into() }
    }
}

/// `conductor-archive-<localId>`. Our ids are `<repo>/<dir>`, and a
/// checkpoint id may not contain `/`, so anything outside `[A-Za-z0-9._-]`
/// becomes `-` (Conductor's ids are UUIDs and need no mapping).
pub fn checkpoint_id(local_id: &str) -> String {
    format!("conductor-archive-{}", ref_component(local_id))
}

/// `refs/conductor-archive-heads/<localId>`, with the same mapping.
pub fn archive_head_ref(local_id: &str) -> String {
    format!("{ARCHIVE_HEADS_NAMESPACE}/{}", ref_component(local_id))
}

fn ref_component(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '-' })
        .collect()
}

/// Step 1 (`mYe`): checkpoint, branch and archive commit. Touches nothing
/// on disk except the checkpoint and archive-head refs and, in the recovery
/// paths, the index and the git operation's state files.
pub fn prepare(t: &ArchiveTarget, mode: ArchiveMode) -> Result<Prepared, ArchiveError> {
    let path = &t.workspace_path;
    if path.as_os_str().is_empty() || !path.exists() {
        return Err(ArchiveError::Corrupted);
    }
    let fail = |m: &dyn fmt::Display| ArchiveError::Failed(format!("Failed to archive {}: {m}", t.directory_name));
    let id = checkpoint_id(&t.local_id);
    match save(path, &id) {
        Ok(()) => {}
        // Exit 102: conflict residue from an abandoned merge. Stage the
        // unmerged paths, then try once more.
        Err(CheckpointError::UnresolvedConflicts) => {
            stage_unmerged(path, true).map_err(|e| fail(&e))?;
            match save(path, &id) {
                Ok(()) => {}
                Err(CheckpointError::Busy(_)) => return Err(ArchiveError::Failed(MERGE_IN_PROGRESS_MESSAGE.into())),
                Err(CheckpointError::UnresolvedConflicts) => {
                    return Err(ArchiveError::Failed(UNRESOLVED_CONFLICTS_MESSAGE.into()))
                }
                Err(e) => return Err(fail(&e)),
            }
        }
        // Exit 101: a git operation is in progress.
        Err(CheckpointError::Busy(_)) => {
            if mode != ArchiveMode::DiscardGitOperationState {
                return Err(ArchiveError::GitOperationInProgress);
            }
            discard_git_operation_state(path).map_err(|e| fail(&e))?;
            match save(path, &id) {
                Ok(()) => {}
                Err(CheckpointError::Busy(_)) => return Err(ArchiveError::Failed(DISCARD_FAILED_MESSAGE.into())),
                Err(CheckpointError::UnresolvedConflicts) => {
                    return Err(ArchiveError::Failed(UNRESOLVED_CONFLICTS_MESSAGE.into()))
                }
                Err(e) => return Err(fail(&e)),
            }
        }
        Err(CheckpointError::NotARepository(_)) => return Err(ArchiveError::Corrupted),
        Err(e) => return Err(fail(&e)),
    }

    // `ensureLocalBranch`: the checked-out branch, else the stored one.
    let current = git(path, ["branch", "--show-current"]).ok().filter(|b| !b.is_empty());
    let persisted_branch = current.clone().unwrap_or_else(|| t.branch.clone());

    let archive_commit = git(path, ["rev-parse", "HEAD"]).ok().filter(|c| !c.is_empty());
    if let Some(commit) = &archive_commit {
        git(path, ["update-ref", &archive_head_ref(&t.local_id), commit]).map_err(|e| fail(&e))?;
    }
    Ok(Prepared { persisted_branch, branch_to_delete: current, archive_commit, checkpoint_id: id })
}

fn save(path: &Path, id: &str) -> Result<(), CheckpointError> {
    checkpoint::save(path, &SaveOptions { id: Some(id.to_string()), force: true }).map(|_| ())
}

/// `git add -u` the unmerged paths. With `require_some`, finding none is an
/// error (the 102 path); otherwise it is fine (the discard path).
fn stage_unmerged(path: &Path, require_some: bool) -> Result<(), String> {
    let out = git_raw(path, ["diff", "--name-only", "--diff-filter=U", "-z"])?;
    if !out.0 {
        return Err(format!("Failed to list unmerged paths: {}", out.2.trim()));
    }
    let paths: Vec<&str> = out.1.split('\0').filter(|p| !p.is_empty()).collect();
    if paths.is_empty() {
        return if require_some { Err("No unmerged paths found to stage".into()) } else { Ok(()) };
    }
    let mut args = vec!["add", "-u", "--"];
    args.extend(paths);
    git(path, args).map(|_| ())
}

/// `yYe` @ ~970,900: stage unmerged paths, then remove the state files of a
/// merge, cherry-pick, revert or rebase so the worktree is no longer busy.
fn discard_git_operation_state(path: &Path) -> Result<(), String> {
    stage_unmerged(path, false)?;
    for name in [
        "MERGE_HEAD",
        "MERGE_MSG",
        "MERGE_MODE",
        "AUTO_MERGE",
        "SQUASH_MSG",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "REBASE_HEAD",
    ] {
        let p = git_path(path, name)?;
        if p.exists() {
            std::fs::remove_file(&p).map_err(|e| format!("{}: {e}", p.display()))?;
        }
    }
    for name in ["rebase-merge", "rebase-apply", "sequencer"] {
        let p = git_path(path, name)?;
        if p.exists() {
            std::fs::remove_dir_all(&p).map_err(|e| format!("{}: {e}", p.display()))?;
        }
    }
    Ok(())
}

fn git_path(path: &Path, name: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(git(path, ["rev-parse", "--git-path", name])?);
    Ok(if p.is_absolute() { p } else { path.join(p) })
}

/// Step 4 (`_Ye`): `.context`, worktree, branch. Never fails: what goes
/// wrong is returned as notices, as Conductor shows toasts and carries on.
/// `root_dir` is the root directory (`conductor_root_path`), `None` to keep
/// `.context` with the worktree.
pub fn teardown(t: &ArchiveTarget, p: &Prepared, delete_branch: bool, root_dir: Option<&Path>) -> Vec<Notice> {
    let mut notices = Vec::new();
    if let Some(root) = root_dir {
        // Conductor only logs this failure.
        let _ = archive_context_folder(&t.workspace_path, root, &t.repo_name, &t.directory_name);
    }
    if let Err(message) = remove_worktree(&t.repo_root, &t.workspace_path) {
        notices.push(Notice::error(message));
    }
    if delete_branch {
        if let Some(branch) = p.branch_to_delete.as_deref() {
            if let Some(n) = delete_local_branch(&t.repo_root, branch, &t.default_branch) {
                notices.push(n);
            }
        }
    }
    notices
}

/// `Bmt`: move `<workspace>/.context` to
/// `<root>/archived-contexts/<repo>/<dir>`, replacing an older copy.
/// `Ok(None)` when there is no `.context`.
pub fn archive_context_folder(
    workspace: &Path,
    root: &Path,
    repo_name: &str,
    directory_name: &str,
) -> std::io::Result<Option<PathBuf>> {
    let src = workspace.join(CONTEXT_FOLDER);
    if !src.exists() {
        return Ok(None);
    }
    let dest = root.join(ARCHIVED_CONTEXTS_DIR).join(repo_name).join(directory_name);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        std::fs::remove_dir_all(&dest)?;
    }
    std::fs::rename(&src, &dest)?;
    Ok(Some(dest))
}

/// `Vpe`: `git worktree remove --force --force`; when that fails, delete the
/// directory and prune. The error is the toast text.
pub fn remove_worktree(repo_root: &Path, workspace: &Path) -> Result<(), String> {
    let args: [&OsStr; 5] =
        ["worktree".as_ref(), "remove".as_ref(), "--force".as_ref(), "--force".as_ref(), workspace.as_os_str()];
    if git(repo_root, args).is_ok() {
        return Ok(());
    }
    if workspace.exists() {
        std::fs::remove_dir_all(workspace).map_err(|e| format!("Failed to remove directory: {e}"))?;
    }
    git(repo_root, ["worktree", "prune"]).map(|_| ()).map_err(|e| {
        format!(
            "Directory removed, but the worktree registration may still be stale (git worktree prune failed: {e}). Branch deletion may fail until this is resolved manually."
        )
    })
}

/// "Delete branch on archive": `git branch -D`, skipping the default branch.
pub fn delete_local_branch(repo_root: &Path, branch: &str, default_branch: &str) -> Option<Notice> {
    if branch == default_branch {
        return Some(Notice::info(format!("Skipped deleting \"{branch}\" because it is the repo default branch.")));
    }
    match git(repo_root, ["branch", "-D", branch]) {
        Ok(_) => None,
        Err(e) => Some(Notice::error(format!("Failed to delete branch \"{branch}\": {e}"))),
    }
}

/// `(success, stdout, stderr)`; git's redirecting variables are cleared.
fn git_raw<I, S>(cwd: &Path, args: I) -> Result<(bool, String, String), String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .output()
        .map_err(|e| format!("git: {e}"))?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    ))
}

/// Trimmed stdout, or the trimmed stderr (or exit text) as the error.
fn git<I, S>(cwd: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let (ok, stdout, stderr) = git_raw(cwd, args)?;
    if ok {
        Ok(stdout.trim().to_string())
    } else {
        let e = stderr.trim();
        Err(if e.is_empty() { stdout.trim().to_string() } else { e.to_string() })
    }
}
