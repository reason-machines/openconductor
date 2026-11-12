// parity:diff.changes-list:backend parity:diff.whitespace:backend
//! Load a workspace's changes from git: everything on the branch since it
//! left its base (committed and uncommitted), or only uncommitted work.
//! Untracked files are included as additions.

use super::model::{FileChange, FileDiff, FileHideReason, FileStatus};
use super::parse::{parse_unified, ParseError};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::Path;
use std::process::Command;

/// git's well-known empty tree, used when the branch has no commits yet.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Scope {
    /// Working tree versus the merge base of HEAD and `base`. With `remote`,
    /// `base` is the workspace's target branch name and the merge base is
    /// taken with `refs/remotes/<remote>/<base>` (falling back to the local
    /// branch when the remote has no such ref), see [`target_ref`].
    All {
        base: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        remote: Option<String>,
    },
    /// Working tree versus HEAD.
    Uncommitted,
    Commit {
        hash: String,
    },
    /// What one agent turn changed: the turn's start checkpoint versus its
    /// end checkpoint (`refs/conductor-checkpoints/session-<s>-turn-<t>-start`
    /// and `-end`, see [`turn_checkpoint_id`]). Both snapshots hold the full
    /// working tree, untracked files included, so nothing else is added.
    Turn {
        session_id: String,
        turn_id: String,
    },
}

/// Ref namespace of workspace checkpoints (same as `crate::checkpoint`,
/// which this std-only module cannot import in its standalone harness).
pub const CHECKPOINT_REF_NAMESPACE: &str = "refs/conductor-checkpoints";

/// The two checkpoints taken around every agent turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnPoint {
    Start,
    End,
}

impl TurnPoint {
    pub fn as_str(self) -> &'static str {
        match self {
            TurnPoint::Start => "start",
            TurnPoint::End => "end",
        }
    }
}

/// Checkpoint id of one end of a turn: `session-<session>-turn-<turn>-<point>`,
/// the scheme the reference app uses, so its refs and ours line up.
pub fn turn_checkpoint_id(session_id: &str, turn_id: &str, point: TurnPoint) -> String {
    format!("session-{session_id}-turn-{turn_id}-{}", point.as_str())
}

/// Session and turn ids end up in ref names and shell-free git arguments;
/// allow only letters, digits, `.`, `_` and `-` (no leading `.` or `-`).
pub fn valid_turn_part(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with(['.', '-'])
        && !s.contains("..")
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffRequest {
    pub scope: Scope,
    /// Pass `-w`: whitespace-only edits drop out of the hunks.
    #[serde(default)]
    pub ignore_whitespace: bool,
    /// Limit to one file (the file being opened); `None` loads every file.
    #[serde(default)]
    pub path: Option<String>,
    /// Unchanged lines around each change (`-U<n>`); `None` keeps git's default of 3.
    /// The entire-file view and "expand unmodified lines" ask for the whole file.
    #[serde(default)]
    pub context_lines: Option<u32>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceDiff {
    /// Commit the diff is taken against (merge base or HEAD), or the empty tree.
    pub base_commit: String,
    pub files: Vec<FileDiff>,
}

#[derive(Debug)]
pub enum DiffError {
    /// A rebase or merge is in progress; changes are shown once it finishes.
    OperationInProgress(&'static str),
    Git {
        args: String,
        stderr: String,
    },
    Parse(ParseError),
    Io(std::io::Error),
    /// A path that is absolute or leaves the worktree (`..`).
    InvalidPath(String),
    /// A session or turn id with characters a checkpoint id cannot hold.
    InvalidTurn(String),
    /// The turn's start or end checkpoint does not exist (yet).
    TurnNotReady {
        turn_id: String,
        start: bool,
        end: bool,
    },
    /// An action this scope does not offer.
    Unsupported(&'static str),
}

impl fmt::Display for DiffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DiffError::OperationInProgress(op) => {
                write!(f, "a {op} is in progress; finish it to see changes")
            }
            DiffError::Git { args, stderr } => write!(f, "git {args} failed: {}", stderr.trim()),
            DiffError::Parse(e) => write!(f, "could not parse git diff: {e}"),
            DiffError::Io(e) => write!(f, "could not run git: {e}"),
            DiffError::InvalidPath(p) => write!(f, "not a path inside the worktree: {p}"),
            DiffError::InvalidTurn(id) => write!(f, "invalid session or turn id: {id:?}"),
            DiffError::Unsupported(what) => write!(f, "{what} is not supported yet"),
            DiffError::TurnNotReady {
                turn_id,
                start,
                end,
            } => write!(
                f,
                "checkpoints for turn {turn_id} are not ready (start: {start}, end: {end})"
            ),
        }
    }
}

impl std::error::Error for DiffError {}

fn run(repo: &Path, args: &[&str]) -> Result<std::process::Output, DiffError> {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["-c", "core.quotePath=false"])
        .args(args)
        .output()
        .map_err(DiffError::Io)
}

/// Exit code of a git command whose output is not needed (`cat-file -e`).
pub(super) fn git_exit_code(repo: &Path, args: &[&str]) -> Result<i32, DiffError> {
    Ok(run(repo, args)?.status.code().unwrap_or(-1))
}

pub(super) fn git(repo: &Path, args: &[&str], ok_codes: &[i32]) -> Result<String, DiffError> {
    let out = run(repo, args)?;
    if !ok_codes.contains(&out.status.code().unwrap_or(-1)) {
        return Err(DiffError::Git {
            args: args.join(" "),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn operation_in_progress(repo: &Path) -> Result<Option<&'static str>, DiffError> {
    for (marker, op) in [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("MERGE_HEAD", "merge"),
    ] {
        let p = git(repo, &["rev-parse", "--git-path", marker], &[0])?;
        let p = Path::new(p.trim());
        let p = if p.is_absolute() {
            p.to_path_buf()
        } else {
            repo.join(p)
        };
        if p.exists() {
            return Ok(Some(op));
        }
    }
    Ok(None)
}

// parity:diff.changes-list:backend
/// The ref "All changes" is compared against. Conductor diffs a GitHub
/// workspace against `refs/remotes/<remote>/<target branch>` and a local-only
/// repo against the bare branch name (evidence/diff/target-ref.md); here the
/// remote ref is used when it exists, otherwise the branch as given.
pub fn target_ref(repo: &Path, branch: &str, remote: Option<&str>) -> Result<String, DiffError> {
    let Some(remote) = remote.filter(|r| !r.is_empty()) else {
        return Ok(branch.to_string());
    };
    let remote_ref = format!("refs/remotes/{remote}/{branch}");
    let verify = format!("{remote_ref}^{{commit}}");
    let found = git(
        repo,
        &["rev-parse", "--verify", "--quiet", &verify],
        &[0, 1],
    )?;
    Ok(if found.trim().is_empty() {
        branch.to_string()
    } else {
        remote_ref
    })
}

pub(super) fn base_commit(repo: &Path, scope: &Scope) -> Result<String, DiffError> {
    let head = git(repo, &["rev-parse", "--verify", "--quiet", "HEAD"], &[0, 1])?;
    if head.trim().is_empty() {
        return Ok(EMPTY_TREE.to_string());
    }
    match scope {
        Scope::Uncommitted => Ok(head.trim().to_string()),
        Scope::Commit { hash } => Ok(commit_refs(repo, hash)?.0),
        Scope::All { base, remote } => {
            let target = target_ref(repo, base, remote.as_deref())?;
            Ok(git(repo, &["merge-base", "HEAD", &target], &[0])?
                .trim()
                .to_string())
        }
        Scope::Turn {
            session_id,
            turn_id,
        } => Ok(turn_refs(repo, session_id, turn_id)?.0),
    }
}

/// Commit oids of a turn's start and end checkpoints.
pub fn turn_refs(
    repo: &Path,
    session_id: &str,
    turn_id: &str,
) -> Result<(String, String), DiffError> {
    for part in [session_id, turn_id] {
        if !valid_turn_part(part) {
            return Err(DiffError::InvalidTurn(part.to_string()));
        }
    }
    let resolve = |point| -> Result<Option<String>, DiffError> {
        let id = turn_checkpoint_id(session_id, turn_id, point);
        let reference = format!("{CHECKPOINT_REF_NAMESPACE}/{id}^{{commit}}");
        let out = git(
            repo,
            &["rev-parse", "--verify", "--quiet", &reference],
            &[0, 1],
        )?;
        let oid = out.trim();
        Ok((!oid.is_empty()).then(|| oid.to_string()))
    };
    match (resolve(TurnPoint::Start)?, resolve(TurnPoint::End)?) {
        (Some(start), Some(end)) => Ok((start, end)),
        (start, end) => Err(DiffError::TurnNotReady {
            turn_id: turn_id.to_string(),
            start: start.is_some(),
            end: end.is_some(),
        }),
    }
}

const DIFF_FLAGS: [&str; 5] = [
    "--no-color",
    "--no-ext-diff",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "-M",
];

/// Load the workspace diff described by `req`.
///
/// With `ignore_whitespace`, the files and their counts come from the plain
/// diff and only the hunks from `git diff -w`: `-w` leaves whitespace-only
/// files out entirely, and Conductor keeps them listed ("Only whitespace
/// changes found"), so such a file is returned with no hunks.
pub fn workspace_diff(repo: &Path, req: &DiffRequest) -> Result<WorkspaceDiff, DiffError> {
    if let Scope::Turn {
        session_id,
        turn_id,
    } = &req.scope
    {
        return turn_diff(repo, session_id, turn_id, req);
    }
    if let Scope::Commit { hash } = &req.scope {
        let (base, commit) = commit_refs(repo, hash)?;
        let names = git(
            repo,
            &["show", &commit, "--format=", "--name-only", "-z"],
            &[0],
        )?;
        let paths: std::collections::HashSet<&str> =
            names.split('\0').filter(|p| !p.is_empty()).collect();
        let mut files = revision_diff(repo, &base, &commit, req, false)?;
        files.retain(|file| paths.contains(file.path.as_str()));
        if req.ignore_whitespace {
            let mut hunks: std::collections::HashMap<String, Vec<_>> =
                revision_diff(repo, &base, &commit, req, true)?
                    .into_iter()
                    .map(|f| (f.path, f.hunks))
                    .collect();
            for file in &mut files {
                file.hunks = hunks.remove(&file.path).unwrap_or_default();
            }
        }
        for file in &mut files {
            apply_revision_size_policy(repo, &base, &commit, file);
        }
        return Ok(WorkspaceDiff {
            base_commit: base,
            files,
        });
    }
    if let Some(op) = operation_in_progress(repo)? {
        return Err(DiffError::OperationInProgress(op));
    }
    let base = base_commit(repo, &req.scope)?;
    let mut files = diff_files(repo, &base, req, None)?;
    if req.ignore_whitespace {
        let mut hunks: std::collections::HashMap<String, Vec<_>> =
            diff_files(repo, &base, req, Some("-w"))?
                .into_iter()
                .map(|f| (f.path, f.hunks))
                .collect();
        for f in &mut files {
            f.hunks = hunks.remove(&f.path).unwrap_or_default();
        }
    }
    for file in &mut files {
        file.last_modified_time = worktree_modified_time(repo, file);
        if matches!(req.scope, Scope::Uncommitted) {
            apply_worktree_size_policy(repo, &base, file);
        }
    }
    Ok(WorkspaceDiff {
        base_commit: base,
        files,
    })
}

fn apply_revision_size_policy(repo: &Path, base: &str, commit: &str, file: &mut FileDiff) {
    if file.binary {
        return;
    }
    let extension = Path::new(&file.path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if matches!(
        extension.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "tif"
            | "tiff"
            | "avif"
            | "bmp"
            | "mp4"
            | "m4v"
            | "mov"
            | "webm"
            | "ogv"
    ) {
        return;
    }
    let text_size = |revision: &str, path: &str| {
        git(repo, &["show", &format!("{revision}:{path}")], &[0])
            .ok()
            .map(|content| content.len())
    };
    let old_size = if file.status == FileStatus::Added {
        Some(0)
    } else {
        text_size(base, file.old_path.as_deref().unwrap_or(&file.path))
    };
    let new_size = if file.status == FileStatus::Deleted {
        Some(0)
    } else {
        text_size(commit, &file.path)
    };
    let (Some(old_size), Some(new_size)) = (old_size, new_size) else {
        return;
    };
    let size = old_size.max(new_size);
    if size <= 1024 * 1024 {
        return;
    }
    let sparse = size <= 5 * 1024 * 1024
        && revision_changed_line_count(repo, base, commit, file).is_some_and(|count| count <= 500);
    if !sparse {
        file.hide_reason = Some(FileHideReason::FileTooLarge);
        file.hunks.clear();
    }
}

fn revision_changed_line_count(repo: &Path, base: &str, commit: &str, file: &FileDiff) -> Option<u64> {
    let paths: Vec<_> = file
        .old_path
        .iter()
        .chain(std::iter::once(&file.path))
        .map(|path| format!(":(literal){path}"))
        .collect();
    let mut args = vec!["diff", "--no-ext-diff", "--numstat", base, commit, "--"];
    args.extend(paths.iter().map(String::as_str));
    let output = git(repo, &args, &[0]).ok()?;
    let mut count = None;
    for line in output.lines().filter(|line| !line.is_empty()) {
        let mut fields = line.splitn(3, '\t');
        let additions = fields.next()?.parse::<u64>().ok()?;
        let deletions = fields.next()?.parse::<u64>().ok()?;
        count = Some(
            count
                .unwrap_or(0_u64)
                .checked_add(additions)?
                .checked_add(deletions)?,
        );
    }
    count
}

fn apply_worktree_size_policy(repo: &Path, base: &str, file: &mut FileDiff) {
    if file.binary || matches!(file.status, FileStatus::Deleted | FileStatus::Untracked) {
        return;
    }
    let extension = Path::new(&file.path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if matches!(
        extension.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "tif"
            | "tiff"
            | "avif"
            | "bmp"
            | "mp4"
            | "m4v"
            | "mov"
            | "webm"
            | "ogv"
    ) {
        return;
    }
    let Ok(metadata) = std::fs::symlink_metadata(repo.join(&file.path)) else {
        return;
    };
    if !metadata.is_file() || metadata.len() <= 1024 * 1024 {
        return;
    }
    let sparse = metadata.len() <= 5 * 1024 * 1024
        && plain_changed_line_count(repo, base, file).is_some_and(|count| count <= 500);
    if !sparse {
        file.hide_reason = Some(FileHideReason::FileTooLarge);
        file.hunks.clear();
    }
}

fn plain_changed_line_count(repo: &Path, base: &str, file: &FileDiff) -> Option<u64> {
    let paths: Vec<_> = file
        .old_path
        .iter()
        .chain(std::iter::once(&file.path))
        .map(|path| format!(":(literal){path}"))
        .collect();
    let mut args = vec!["diff", "--no-ext-diff", "--numstat", base, "--"];
    args.extend(paths.iter().map(String::as_str));
    let output = git(repo, &args, &[0]).ok()?;
    let mut count = None;
    for line in output.lines().filter(|line| !line.is_empty()) {
        let mut fields = line.splitn(3, '\t');
        let additions = fields.next()?.parse::<u64>().ok()?;
        let deletions = fields.next()?.parse::<u64>().ok()?;
        count = Some(
            count
                .unwrap_or(0_u64)
                .checked_add(additions)?
                .checked_add(deletions)?,
        );
    }
    count
}

pub(super) fn worktree_modified_time(repo: &Path, file: &FileDiff) -> Option<i64> {
    if file.status == FileStatus::Deleted {
        return Some(0);
    }
    let modified = std::fs::symlink_metadata(repo.join(&file.path))
        .ok()?
        .modified()
        .ok()?;
    let nanos = match modified.duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => i128::try_from(duration.as_nanos()).ok()?,
        Err(error) => -i128::try_from(error.duration().as_nanos()).ok()?,
    };
    i64::try_from((nanos + 500_000).div_euclid(1_000_000)).ok()
}

/// Tracked changes against `base` plus untracked files, sorted by path.
fn diff_files(
    repo: &Path,
    base: &str,
    req: &DiffRequest,
    ws: Option<&str>,
) -> Result<Vec<FileDiff>, DiffError> {
    let context = req.context_lines.map(|n| format!("-U{n}"));

    let mut args: Vec<&str> = vec!["diff"];
    args.extend(DIFF_FLAGS);
    args.extend(ws);
    args.extend(context.as_deref());
    args.push(base);
    args.push("--");
    args.extend(req.path.as_deref());
    let mut files = parse_unified(&git(repo, &args, &[0])?).map_err(DiffError::Parse)?;

    let mut ls = vec!["ls-files", "--others", "--exclude-standard", "-z", "--"];
    ls.extend(req.path.as_deref());
    for path in git(repo, &ls, &[0])?.split('\0').filter(|p| !p.is_empty()) {
        let mut args: Vec<&str> = vec!["diff", "--no-index"];
        args.extend(DIFF_FLAGS);
        args.extend(ws);
        args.extend(context.as_deref());
        args.extend(["--", "/dev/null", path]);
        // --no-index exits 1 when the files differ, which is always the case here.
        for mut f in parse_unified(&git(repo, &args, &[0, 1])?).map_err(DiffError::Parse)? {
            f.status = FileStatus::Untracked;
            f.path = path.to_string();
            f.old_path = None;
            files.push(f);
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// One turn's changes: `git diff <start checkpoint> <end checkpoint>`, as the
/// reference checkpointer's `diff <start> <end>` does. Both sides are saved
/// snapshots, so a merge or rebase running now does not matter.
fn turn_diff(
    repo: &Path,
    session_id: &str,
    turn_id: &str,
    req: &DiffRequest,
) -> Result<WorkspaceDiff, DiffError> {
    let (start, end) = turn_refs(repo, session_id, turn_id)?;
    let context = req.context_lines.map(|n| format!("-U{n}"));
    let mut args: Vec<&str> = vec!["diff"];
    args.extend(DIFF_FLAGS);
    if req.ignore_whitespace {
        args.push("-w");
    }
    args.extend(context.as_deref());
    args.extend([start.as_str(), end.as_str(), "--"]);
    args.extend(req.path.as_deref());
    let mut files = parse_unified(&git(repo, &args, &[0])?).map_err(DiffError::Parse)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(WorkspaceDiff {
        base_commit: start,
        files,
    })
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct BranchCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: i64,
}

pub fn branch_commits(
    repo: &Path,
    base: &str,
    remote: Option<&str>,
) -> Result<Vec<BranchCommit>, DiffError> {
    if git(repo, &["rev-parse", "--verify", "--quiet", "HEAD"], &[0, 1])?
        .trim()
        .is_empty()
    {
        return Ok(Vec::new());
    }
    let target = target_ref(repo, base, remote)?;
    let range = format!("{target}..HEAD");
    let output = git(
        repo,
        &["log", "--format=%H%x00%s%x00%an%x00%at", &range, "--"],
        &[0],
    )?;
    Ok(output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\0');
            Some(BranchCommit {
                hash: fields.next()?.to_string(),
                message: fields.next()?.to_string(),
                author: fields.next()?.to_string(),
                date: fields.next()?.parse::<i64>().ok()?.checked_mul(1000)?,
            })
        })
        .collect())
}

fn commit_refs(repo: &Path, hash: &str) -> Result<(String, String), DiffError> {
    if !(7..=64).contains(&hash.len()) || !hash.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(DiffError::Unsupported("an invalid commit hash"));
    }
    let revision = format!("{hash}^{{commit}}");
    let commit = git(repo, &["rev-parse", "--verify", &revision], &[0])?
        .trim()
        .to_string();
    let parent = format!("{commit}^");
    let base = git(
        repo,
        &["rev-parse", "--verify", "--quiet", &parent],
        &[0, 1],
    )?;
    Ok((
        if base.trim().is_empty() {
            EMPTY_TREE.to_string()
        } else {
            base.trim().to_string()
        },
        commit,
    ))
}

fn revision_diff(
    repo: &Path,
    base: &str,
    commit: &str,
    req: &DiffRequest,
    whitespace: bool,
) -> Result<Vec<FileDiff>, DiffError> {
    let context = req.context_lines.map(|n| format!("-U{n}"));
    let mut args = vec!["diff"];
    args.extend(DIFF_FLAGS);
    if whitespace {
        args.push("-w");
    }
    args.extend(context.as_deref());
    args.extend([base, commit, "--"]);
    args.extend(req.path.as_deref());
    let mut files = parse_unified(&git(repo, &args, &[0])?).map_err(DiffError::Parse)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// The changes list: every changed file with its counts, without hunks.
pub fn list_changes(repo: &Path, req: &DiffRequest) -> Result<Vec<FileChange>, DiffError> {
    Ok(workspace_diff(repo, req)?
        .files
        .iter()
        .map(FileDiff::summary)
        .collect())
}
