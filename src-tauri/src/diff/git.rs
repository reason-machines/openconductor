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
    Ok(WorkspaceDiff {
        base_commit: base,
        files,
    })
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

/// The changes list: every changed file with its counts, without hunks.
pub fn list_changes(repo: &Path, req: &DiffRequest) -> Result<Vec<FileChange>, DiffError> {
    Ok(workspace_diff(repo, req)?
        .files
        .iter()
        .map(FileDiff::summary)
        .collect())
}
