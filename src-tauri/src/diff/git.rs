// parity:diff.changes-list:backend parity:diff.whitespace:backend
//! Load a workspace's changes from git: everything on the branch since it
//! left its base (committed and uncommitted), or only uncommitted work.
//! Untracked files are included as additions.

use super::model::{FileChange, FileDiff, FileStatus};
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
    /// Working tree versus the merge base of HEAD and `base` (e.g. `origin/main`).
    All { base: String },
    /// Working tree versus HEAD.
    Uncommitted,
    /// What one agent turn changed: the turn's start checkpoint versus its
    /// end checkpoint (`refs/conductor-checkpoints/session-<s>-turn-<t>-start`
    /// and `-end`, see [`turn_checkpoint_id`]). Both snapshots hold the full
    /// working tree, untracked files included, so nothing else is added.
    Turn { session_id: String, turn_id: String },
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

pub(super) fn base_commit(repo: &Path, scope: &Scope) -> Result<String, DiffError> {
    let head = git(repo, &["rev-parse", "--verify", "--quiet", "HEAD"], &[0, 1])?;
    if head.trim().is_empty() {
        return Ok(EMPTY_TREE.to_string());
    }
    match scope {
        Scope::Uncommitted => Ok(head.trim().to_string()),
        Scope::All { base } => Ok(git(repo, &["merge-base", "HEAD", base], &[0])?
            .trim()
            .to_string()),
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
pub fn workspace_diff(repo: &Path, req: &DiffRequest) -> Result<WorkspaceDiff, DiffError> {
    if let Scope::Turn {
        session_id,
        turn_id,
    } = &req.scope
    {
        return turn_diff(repo, session_id, turn_id, req);
    }
    if let Some(op) = operation_in_progress(repo)? {
        return Err(DiffError::OperationInProgress(op));
    }
    let base = base_commit(repo, &req.scope)?;
    let ws = if req.ignore_whitespace {
        Some("-w")
    } else {
        None
    };
    let context = req.context_lines.map(|n| format!("-U{n}"));

    let mut args: Vec<&str> = vec!["diff"];
    args.extend(DIFF_FLAGS);
    args.extend(ws);
    args.extend(context.as_deref());
    args.push(&base);
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
    Ok(WorkspaceDiff {
        base_commit: base,
        files,
    })
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

/// The changes list: every changed file with its counts, without hunks.
pub fn list_changes(repo: &Path, req: &DiffRequest) -> Result<Vec<FileChange>, DiffError> {
    Ok(workspace_diff(repo, req)?
        .files
        .iter()
        .map(FileDiff::summary)
        .collect())
}
