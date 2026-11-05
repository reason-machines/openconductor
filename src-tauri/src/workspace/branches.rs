//! Branch queries the create-workspace dialog needs: which branches a new
//! workspace can start from and the repo's default branch.

use std::path::Path;

use super::{git, repo_root, WorkspaceError};

/// Branches a workspace can be created from (IPC `list_branches`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchList {
    /// The remote branches are listed from: `origin` when it exists, else
    /// the first configured remote; `None` for a repo without remotes, in
    /// which case `branches` are local branches.
    pub remote_name: Option<String>,
    /// Branch new workspaces start from by default, without remote prefix.
    pub default_branch: String,
    /// Branch names without the `<remote>/` prefix, most recent commit first.
    pub branches: Vec<String>,
}

/// Fallback when neither the remote HEAD nor a conventional name resolves.
const FALLBACK_DEFAULT_BRANCH: &str = "main";

/// The remote new workspaces track: `origin` if configured, else the first.
pub fn primary_remote(repo: &Path) -> Result<Option<String>, WorkspaceError> {
    let remotes = git::run(repo, ["remote"])?;
    let remotes: Vec<&str> = remotes.lines().filter(|l| !l.is_empty()).collect();
    Ok(remotes
        .iter()
        .find(|r| **r == "origin")
        .or_else(|| remotes.first())
        .map(|r| r.to_string()))
}

/// List branches for the create-workspace picker.
///
/// The default branch is the remote's `HEAD` symref when known (what
/// `git clone` records), else `main` or `master` if present, else the
/// branch checked out in the repo root, else `main`.
pub fn list_branches(repo: &Path) -> Result<BranchList, WorkspaceError> {
    let repo = repo_root(repo)?;
    let remote_name = primary_remote(&repo)?;
    let prefix = match &remote_name {
        Some(r) => format!("refs/remotes/{r}/"),
        None => "refs/heads/".to_string(),
    };
    let branches: Vec<String> = git::refs_under(&repo, &prefix, "-committerdate")?
        .into_iter()
        .filter_map(|r| r.strip_prefix(&prefix).map(str::to_string))
        .filter(|b| b != "HEAD")
        .collect();

    let remote_head = match &remote_name {
        Some(r) => {
            let out = git::output(
                &repo,
                ["symbolic-ref", "-q", &format!("refs/remotes/{r}/HEAD")],
            )?;
            let target = out.stdout.trim();
            target
                .strip_prefix(&prefix)
                .filter(|_| out.success)
                .map(str::to_string)
        }
        None => None,
    };
    let current = git::output(&repo, ["symbolic-ref", "-q", "--short", "HEAD"])?;
    let current =
        Some(current.stdout.trim().to_string()).filter(|s| current.success && !s.is_empty());

    let default_branch = remote_head
        .filter(|b| branches.contains(b))
        .or_else(|| {
            ["main", "master"]
                .into_iter()
                .find(|c| branches.iter().any(|b| b == c))
                .map(str::to_string)
        })
        .or(current)
        .unwrap_or_else(|| FALLBACK_DEFAULT_BRANCH.to_string());

    Ok(BranchList {
        remote_name,
        default_branch,
        branches,
    })
}
