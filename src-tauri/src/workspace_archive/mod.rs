//! Full archive of a local workspace, recreated from Conductor 0.87.6
//! (`index-BGEQ8YjU.js`; offsets below are into that chunk, see
//! `evidence/archive/NOTES.md`).
//!
//! Conductor's `archiveWorkspace` (@ ~1,063,549) calls `dYe` (@ ~966,478),
//! which runs, in order:
//!
//! 1. [`prepare`] (`mYe` @ ~969,254): refuse a missing directory
//!    ([`ArchiveError::Corrupted`]); save the whole worktree as checkpoint
//!    `conductor-archive-<id>` (`checkpointer.sh save --force`), clearing
//!    abandoned conflict residue (exit 102) or, in
//!    [`ArchiveMode::DiscardGitOperationState`] only, an in-progress git
//!    operation (exit 101); read the local branch; record `HEAD` as the
//!    archive commit under `refs/conductor-archive-heads/<id>` (`vYe`).
//! 2. The caller marks the row archived with `branch` and `archive_commit`
//!    (`SYe` @ ~976,156).
//! 3. The caller stops the workspace's processes and runs the archive script
//!    (`Z$`, `wYe` @ ~975,286); a failing script is reported, not fatal.
//! 4. [`teardown`] (`_Ye` @ ~973,236): move `.context` to
//!    `<root>/archived-contexts/<repo>/<dir>` (`Bmt` @ ~2,268,138), remove the
//!    worktree (`Vpe` @ ~3,205,035), and delete the branch when "Delete
//!    branch on archive" is on, never the repository's default branch.
//!
//! The git steps here are std-only (git CLI and [`crate::checkpoint`]);
//! [`flow`] runs all four steps against `conductor.db` and the script
//! service, without Tauri, so the whole archive is tested
//! (`tools/archive/run-rust-tests.sh`). `workspace_archive_commands.rs` is
//! the Tauri command over [`flow`].

pub mod flow;

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
        Self {
            kind: NoticeKind::Info,
            message: message.into(),
        }
    }
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            kind: NoticeKind::Error,
            message: message.into(),
        }
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
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '-'
            }
        })
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
    let fail = |m: &dyn fmt::Display| {
        ArchiveError::Failed(format!("Failed to archive {}: {m}", t.directory_name))
    };
    let id = checkpoint_id(&t.local_id);
    match save(path, &id) {
        Ok(()) => {}
        // Exit 102: conflict residue from an abandoned merge. Stage the
        // unmerged paths, then try once more.
        Err(CheckpointError::UnresolvedConflicts) => {
            stage_unmerged(path, true).map_err(|e| fail(&e))?;
            match save(path, &id) {
                Ok(()) => {}
                Err(CheckpointError::Busy(_)) => {
                    return Err(ArchiveError::Failed(MERGE_IN_PROGRESS_MESSAGE.into()))
                }
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
                Err(CheckpointError::Busy(_)) => {
                    return Err(ArchiveError::Failed(DISCARD_FAILED_MESSAGE.into()))
                }
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
    let current = git(path, ["branch", "--show-current"])
        .ok()
        .filter(|b| !b.is_empty());
    let persisted_branch = current.clone().unwrap_or_else(|| t.branch.clone());

    let archive_commit = git(path, ["rev-parse", "HEAD"])
        .ok()
        .filter(|c| !c.is_empty());
    if let Some(commit) = &archive_commit {
        git(path, ["update-ref", &archive_head_ref(&t.local_id), commit]).map_err(|e| fail(&e))?;
    }
    Ok(Prepared {
        persisted_branch,
        branch_to_delete: current,
        archive_commit,
        checkpoint_id: id,
    })
}

fn save(path: &Path, id: &str) -> Result<(), CheckpointError> {
    checkpoint::save(
        path,
        &SaveOptions {
            id: Some(id.to_string()),
            force: true,
        },
    )
    .map(|_| ())
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
        return if require_some {
            Err("No unmerged paths found to stage".into())
        } else {
            Ok(())
        };
    }
    let mut args = vec!["add", "-u", "--"];
    args.extend(paths);
    git(path, args).map(|_| ())
}

/// `yYe` @ ~972,309: stage unmerged paths, then remove the state files of a
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
pub fn teardown(
    t: &ArchiveTarget,
    p: &Prepared,
    delete_branch: bool,
    root_dir: Option<&Path>,
) -> Vec<Notice> {
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
    let dest = root
        .join(ARCHIVED_CONTEXTS_DIR)
        .join(repo_name)
        .join(directory_name);
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
    let args: [&OsStr; 5] = [
        "worktree".as_ref(),
        "remove".as_ref(),
        "--force".as_ref(),
        "--force".as_ref(),
        workspace.as_os_str(),
    ];
    if git(repo_root, args).is_ok() {
        return Ok(());
    }
    if workspace.exists() {
        std::fs::remove_dir_all(workspace)
            .map_err(|e| format!("Failed to remove directory: {e}"))?;
    }
    git(repo_root, ["worktree", "prune"]).map(|_| ()).map_err(|e| {
        format!(
            "Directory removed, but the worktree registration may still be stale (git worktree prune failed: {e}). Branch deletion may fail until this is resolved manually."
        )
    })
}

/// What [`restore`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Restored {
    pub branch: String,
    /// The workspace went onto a new branch ("Restore to new branch").
    pub recreated_branch: bool,
    /// Uncommitted work from the archive checkpoint was put back.
    pub restored_changes: bool,
    pub notices: Vec<Notice>,
}

/// Why the stored branch cannot take the workspace back (Conductor's `CWt`
/// @ ~3,304,700); the UI then asks "Restore to new branch?".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreScenario {
    /// `refs/heads/<branch>` is gone (deleted or renamed).
    BranchDeleted,
    /// Another worktree has the branch checked out.
    BranchTaken,
    /// The branch no longer points at the archive commit.
    BranchDiverged,
}

impl RestoreScenario {
    pub fn as_str(self) -> &'static str {
        match self {
            RestoreScenario::BranchDeleted => "branchDeleted",
            RestoreScenario::BranchTaken => "branchTaken",
            RestoreScenario::BranchDiverged => "branchDiverged",
        }
    }
}

/// Why [`restore`] refused; `DirectoryExists` gets its own toast.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RestoreError {
    /// Conductor's `xfe`: "Can't unarchive: <path> already exists".
    DirectoryExists(PathBuf),
    Failed(String),
}

impl fmt::Display for RestoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RestoreError::DirectoryExists(p) => {
                write!(f, "Can't unarchive: {} already exists", p.display())
            }
            RestoreError::Failed(m) => f.write_str(m),
        }
    }
}

impl From<String> for RestoreError {
    fn from(m: String) -> Self {
        RestoreError::Failed(m)
    }
}

/// Conductor's `CWt`: deleted first, then checked out elsewhere, then moved
/// since `archive_commit`. `None` is its "happy" scenario.
pub fn restore_scenario(t: &ArchiveTarget, archive_commit: Option<&str>) -> Option<RestoreScenario> {
    let branch = t.branch.trim();
    let branch_ref = format!("refs/heads/{branch}");
    let Ok(tip) = git(&t.repo_root, ["rev-parse", "--verify", "-q", &branch_ref]) else {
        return Some(RestoreScenario::BranchDeleted);
    };
    let worktrees = git(&t.repo_root, ["worktree", "list", "--porcelain"]).unwrap_or_default();
    if worktrees.lines().any(|l| l == format!("branch {branch_ref}")) {
        return Some(RestoreScenario::BranchTaken);
    }
    match archive_commit {
        Some(c) if tip != c => Some(RestoreScenario::BranchDiverged),
        _ => None,
    }
}

/// Conductor's `hf`: `name` -> `name-v1`, `name-v1` -> `name-v2`.
pub fn next_branch_name(name: &str) -> String {
    if let Some((stem, n)) = name.rsplit_once("-v") {
        if !stem.is_empty() && !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) {
            if let Ok(n) = n.parse::<u64>() {
                return format!("{stem}-v{}", n + 1);
            }
        }
    }
    format!("{name}-v1")
}

/// Conductor's `makeBranchNameUnique` (`CYe`): `next_branch_name` until no
/// local branch and no remote-tracking branch has the name (`Qpe`).
pub fn unique_branch_name(repo_root: &Path, branch: &str) -> Result<String, String> {
    let taken = |b: &str| {
        git(repo_root, ["rev-parse", "--verify", "-q", &format!("refs/heads/{b}")]).is_ok()
            || git(repo_root, ["for-each-ref", "--format=%(refname)", "refs/remotes"])
                .map(|out| out.lines().any(|r| r.splitn(4, '/').nth(3) == Some(b)))
                .unwrap_or(false)
    };
    let mut name = branch.to_string();
    for _ in 0..1000 {
        if !taken(&name) {
            return Ok(name);
        }
        name = next_branch_name(&name);
    }
    Err("Failed to make branch name unique after 1000 attempts".into())
}

/// "Restore to new branch" (`RWt` with `useNewBranch`): a uniquely named
/// branch at `archive_commit` (or the stored branch's tip for rows archived
/// without one), which [`restore`] then checks out. Returns its name.
pub fn create_restore_branch(t: &ArchiveTarget, archive_commit: Option<&str>) -> Result<String, String> {
    let branch = t.branch.trim();
    if branch.is_empty() {
        return Err("Cannot rehydrate workspace without branch information".into());
    }
    let base = match archive_commit {
        Some(c) => c.to_string(),
        None => git(&t.repo_root, ["rev-parse", &format!("refs/heads/{branch}")]).map_err(|_| {
            format!("Cannot restore workspace: branch \"{branch}\" was deleted or renamed. This workspace was archived with an older version of OpenConductor.")
        })?,
    };
    let new_branch = unique_branch_name(&t.repo_root, branch)?;
    git(&t.repo_root, ["branch", &new_branch, &base])
        .map_err(|e| format!("Failed to create branch {new_branch}: {e}"))?;
    Ok(new_branch)
}

/// Unarchive (Conductor's `PY` @ ~3,305,400): re-add the worktree at
/// `t.workspace_path` on `t.branch`, copy the repository's gitignored
/// include files into it (`iWt`), put back the uncommitted work saved in
/// checkpoint `conductor-archive-<id>`, and move the archived `.context`
/// back (`Wmt`). The caller marks the row and reruns setup.
///
/// Callers check [`restore_scenario`] first (or made a new branch with
/// [`create_restore_branch`]); `new_branch` skips the branch validation, as
/// Conductor's `skipBranchValidation` does. Refused when the row has no
/// branch, the directory exists, the branch is gone or checked out in
/// another worktree.
pub fn restore(
    t: &ArchiveTarget,
    archive_commit: Option<&str>,
    root_dir: Option<&Path>,
    new_branch: bool,
) -> Result<Restored, RestoreError> {
    let branch = t.branch.trim();
    if branch.is_empty() {
        return Err("Cannot rehydrate workspace without branch information".to_string().into());
    }
    let path = &t.workspace_path;
    if path.as_os_str().is_empty() || path == &t.repo_root {
        return Err("Workspace directory not found".to_string().into());
    }
    if path.exists() {
        return Err(RestoreError::DirectoryExists(path.clone()));
    }
    let branch_ref = format!("refs/heads/{branch}");
    if !new_branch {
        if git(&t.repo_root, ["rev-parse", "--verify", "-q", &branch_ref]).is_err() {
            return Err(format!("Branch '{branch}' no longer exists").into());
        }
        let worktrees = git(&t.repo_root, ["worktree", "list", "--porcelain"])?;
        let mut current = "";
        for line in worktrees.lines() {
            if let Some(p) = line.strip_prefix("worktree ") {
                current = p;
            } else if line == format!("branch {branch_ref}") {
                return Err(format!("Branch '{branch}' is already checked out at {current}").into());
            }
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    let add: [&OsStr; 4] = [
        "worktree".as_ref(),
        "add".as_ref(),
        path.as_os_str(),
        branch.as_ref(),
    ];
    let mut notices = Vec::new();
    if let Err(e) = git(&t.repo_root, add) {
        let want = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let created = crate::workspace::git::list_worktrees(&t.repo_root).is_ok_and(|list| {
            list.iter().any(|w| {
                w.path == *path || std::fs::canonicalize(&w.path).is_ok_and(|p| p == want)
            })
        });
        if !created {
            return Err(e.into());
        }
        notices.push(Notice::error(crate::workspace::init_log::WORKTREE_PARTIAL_FAILURE));
    }
    let include_source = crate::settings::effective::resolve(&t.repo_root, Some(path)).map(|settings| {
        crate::workspace::files_to_copy::resolve_source(
            &t.repo_root,
            settings.file_include_globs.as_ref().map(|globs| globs.value.as_str()),
        )
    });

    let mut restored_changes = false;
    if archive_commit.is_some() {
        match checkpoint::restore(path, &checkpoint_id(&t.local_id)) {
            Ok(()) => restored_changes = true,
            Err(e) => notices.push(Notice::error(format!(
                "Uncommitted changes couldn't be recovered: {e}"
            ))),
        }
    }
    // `iWt` copies the gitignored include files while it adds the worktree;
    // here they come after the checkpoint restore, which cleans untracked
    // files, and `copy_files` never overwrites what the checkpoint put back.
    // A failure is a toast; the workspace is restored anyway.
    if let Err(e) = include_source.and_then(|source| {
        crate::workspace::files_to_copy::files_to_copy(&t.repo_root, &source)
            .and_then(|files| crate::workspace::files_to_copy::copy_files(&t.repo_root, path, &files))
            .map_err(|e| e.to_string())
    }) {
        notices.push(Notice::error(format!("Couldn't copy gitignored files: {e}")));
    }
    let saved_context = root_dir.map(|root| {
        root.join(ARCHIVED_CONTEXTS_DIR)
            .join(&t.repo_name)
            .join(&t.directory_name)
    });
    if let Some(saved) = saved_context.filter(|saved| saved.exists()) {
        let dest = path.join(CONTEXT_FOLDER);
        // The archived copy wins over one the checkpoint brought back
        // (Conductor git-excludes `.context`, so its checkpoints never hold
        // it). Conductor only logs a failure here.
        if dest.exists() {
            let _ = std::fs::remove_dir_all(&dest);
        }
        let _ = std::fs::rename(&saved, &dest);
    } else {
        create_context_folder(path)?;
    }
    Ok(Restored {
        branch: branch.to_string(),
        recreated_branch: new_branch,
        restored_changes,
        notices,
    })
}

fn create_context_folder(workspace: &Path) -> Result<(), String> {
    use std::io::Write;

    let exclude = PathBuf::from(git(workspace, ["rev-parse", "--git-path", "info/exclude"])?);
    let exclude = if exclude.is_absolute() {
        exclude
    } else {
        workspace.join(exclude)
    };
    let contents = match std::fs::read_to_string(&exclude) {
        Ok(contents) => contents,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("{}: {e}", exclude.display())),
    };
    if !contents.lines().any(|line| line == "/.context/") {
        if let Some(parent) = exclude.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&exclude)
            .map_err(|e| format!("{}: {e}", exclude.display()))?;
        let separator = if contents.is_empty() || contents.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        writeln!(file, "{separator}/.context/").map_err(|e| format!("{}: {e}", exclude.display()))?;
    }
    let context = workspace.join(CONTEXT_FOLDER);
    std::fs::create_dir_all(&context).map_err(|e| format!("{}: {e}", context.display()))?;
    let todos = context.join("todos.md");
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&todos)
    {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(format!("{}: {e}", todos.display())),
    }
}

/// `git worktree prune` after a workspace folder was deleted.
pub fn prune_worktrees(repo_root: &Path) -> Result<(), String> {
    git(repo_root, ["worktree", "prune"]).map(|_| ())
}

/// "Delete branch on archive": `git branch -D`, skipping the default branch.
pub fn delete_local_branch(repo_root: &Path, branch: &str, default_branch: &str) -> Option<Notice> {
    if branch == default_branch {
        return Some(Notice::info(format!(
            "Skipped deleting \"{branch}\" because it is the repo default branch."
        )));
    }
    match git(repo_root, ["branch", "-D", branch]) {
        Ok(_) => None,
        Err(e) => Some(Notice::error(format!(
            "Failed to delete branch \"{branch}\": {e}"
        ))),
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
        Err(if e.is_empty() {
            stdout.trim().to_string()
        } else {
            e.to_string()
        })
    }
}
