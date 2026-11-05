//! Local git facts the workspace header's PR control needs next to the PR
//! lookup: uncommitted work, whether the branch differs from its target,
//! the remote to push to, and how the branch tracks its upstream.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

use super::header::UpstreamSync;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitState {
    pub has_uncommitted: bool,
    /// Uncommitted work, or commits that are not on the target branch.
    pub has_changes: bool,
    pub has_remote: bool,
    /// The push remote is on GitHub, so `gh pr create` can open a PR.
    pub can_create_pr: bool,
    /// Remote to push to and open the PR against: the upstream's remote,
    /// else `origin`, else the first remote.
    pub remote: Option<String>,
    /// `None` when the branch tracks nothing.
    pub upstream: Option<UpstreamSync>,
}

/// What `git status --porcelain=v2 --branch` says about the branch.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StatusV2 {
    /// `origin/feature` when an upstream is configured.
    pub upstream: Option<String>,
    /// `(ahead, behind)`; `None` when the upstream ref does not exist.
    pub ahead_behind: Option<(u32, u32)>,
    pub dirty: bool,
}

pub fn parse_status_v2(text: &str) -> StatusV2 {
    let mut s = StatusV2::default();
    for line in text.lines() {
        if let Some(up) = line.strip_prefix("# branch.upstream ") {
            s.upstream = Some(up.trim().to_string());
        } else if let Some(ab) = line.strip_prefix("# branch.ab ") {
            let mut it = ab.split_whitespace();
            let ahead = it.next().and_then(|a| a.strip_prefix('+')?.parse().ok());
            let behind = it.next().and_then(|b| b.strip_prefix('-')?.parse().ok());
            if let (Some(a), Some(b)) = (ahead, behind) {
                s.ahead_behind = Some((a, b));
            }
        } else if !line.starts_with('#') && !line.trim().is_empty() {
            s.dirty = true;
        }
    }
    s
}

/// Tracking state from parsed status. Both ahead and behind means the
/// histories diverged (for example the remote branch was rewritten).
pub fn upstream_sync(s: &StatusV2) -> Option<UpstreamSync> {
    s.upstream.as_ref()?;
    Some(match s.ahead_behind {
        Some((ahead, behind)) => UpstreamSync {
            branch_exists: true,
            diverged: ahead > 0 && behind > 0,
            ahead,
            behind,
        },
        None => UpstreamSync::default(),
    })
}

/// The remote that `upstream` (`<remote>/<branch>`) lives on, picking the
/// longest matching name since remote names may contain `/`.
pub fn pick_remote(remotes: &[String], upstream: Option<&str>) -> Option<String> {
    if let Some(up) = upstream {
        let found = remotes
            .iter()
            .filter(|r| up.starts_with(&format!("{r}/")))
            .max_by_key(|r| r.len());
        if let Some(r) = found {
            return Some(r.clone());
        }
    }
    remotes
        .iter()
        .find(|r| *r == "origin")
        .or_else(|| remotes.first())
        .cloned()
}

/// GitHub remote URLs: `https://github.com/o/r(.git)`, `git@github.com:o/r`,
/// `ssh://git@github.com/o/r`.
pub fn is_github_url(url: &str) -> bool {
    let url = url.trim().to_ascii_lowercase();
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .or_else(|| url.strip_prefix("ssh://"))
        .or_else(|| url.strip_prefix("git://"))
        .unwrap_or(&url);
    let host = rest
        .rsplit_once('@')
        .map_or(rest, |(_, h)| h)
        .split([':', '/'])
        .next()
        .unwrap_or("");
    host == "github.com" || host == "www.github.com"
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Read the git state of the checkout at `dir`, comparing against
/// `target_branch` (remote copy preferred, else the local branch).
pub fn read_git_state(dir: &Path, target_branch: &str) -> Result<GitState, String> {
    let status = git(dir, &["status", "--porcelain=v2", "--branch"])
        .ok_or_else(|| format!("{} is not a git checkout", dir.display()))?;
    let status = parse_status_v2(&status);
    let remotes: Vec<String> = git(dir, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .map(String::from)
        .collect();
    let remote = pick_remote(&remotes, status.upstream.as_deref());
    let can_create_pr = remote
        .as_deref()
        .and_then(|r| git(dir, &["remote", "get-url", r]))
        .is_some_and(|u| is_github_url(&u));
    let target = remote
        .as_deref()
        .map(|r| format!("{r}/{target_branch}"))
        .filter(|t| git(dir, &["rev-parse", "--verify", "--quiet", t]).is_some())
        .or_else(|| {
            git(dir, &["rev-parse", "--verify", "--quiet", target_branch])
                .map(|_| target_branch.to_string())
        });
    let ahead_of_target = target
        .and_then(|t| git(dir, &["rev-list", "--count", &format!("{t}..HEAD")]))
        .and_then(|n| n.trim().parse::<u32>().ok())
        .is_some_and(|n| n > 0);
    Ok(GitState {
        has_uncommitted: status.dirty,
        has_changes: status.dirty || ahead_of_target,
        has_remote: !remotes.is_empty(),
        can_create_pr,
        remote,
        upstream: upstream_sync(&status),
    })
}
