//! "Pull latest from <target>": bring the target branch into the workspace
//! branch, as Conductor's `gitPullLatestFromTarget` mutation does (index chunk
//! `aNt` @ ~3,207,600, REA-read on the shipped bundle, strings read as data):
//!
//! 1. Uncommitted work: ask the agent to commit it, then merge (or rebase).
//! 2. Fetch the remote.
//! 3. Check for uncommitted work again (the fetch can take a while).
//! 4. Resolve `refs/remotes/<remote>/<target>`; a missing one is reported.
//! 5. Compare with HEAD: in sync does nothing; only behind fast-forwards
//!    (`git merge --ff-only`); diverged asks the agent to merge (or rebase).
//!
//! Rebase or merge follows `git config pull.rebase` ([`pull_rebase_enabled`]).
//! Without a remote the local target branch is used and nothing is fetched,
//! with the reference's local-git wording.

use std::path::Path;
use std::process::{Command, Output};

use serde::Serialize;

use super::prompt::pull_rebase_enabled;

/// What the pull did. The frontend sends `Agent`'s message to the
/// workspace's chat and shows a toast for the others.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PullOutcome {
    /// The branch already has every target commit and nothing of its own.
    UpToDate,
    /// Fast-forwarded to the target.
    Pulled,
    /// The agent has to do it: uncommitted work, or the histories diverged.
    Agent { message: String },
    /// The target branch does not exist (on the remote, or locally).
    TargetMissing,
}

/// The message that asks the agent to reconcile the branch with its target
/// (the reference's `reconcileAgentInstruction`: `A5e` with a remote, `P5e`
/// for a local-only repository).
pub fn reconcile_instruction(
    remote: Option<&str>,
    target_branch: &str,
    use_rebase: bool,
    has_uncommitted: bool,
) -> String {
    let commit = if has_uncommitted {
        "Commit uncommitted changes, then "
    } else {
        ""
    };
    let (target, push_merge, push_rebase) = match remote {
        Some(r) => (
            format!("{r}/{target_branch}"),
            " Then push.",
            " Then push --force-with-lease.",
        ),
        None => (target_branch.to_string(), "", ""),
    };
    let action = if use_rebase {
        format!("rebase this branch onto {target}.{push_rebase}")
    } else {
        format!("merge {target} into this branch.{push_merge}")
    };
    if commit.is_empty() {
        let mut s = action;
        s[..1].make_ascii_uppercase();
        s
    } else {
        format!("{commit}{action}")
    }
}

/// `git rev-list --left-right --count <target>...HEAD`: (behind, ahead).
pub fn parse_left_right(text: &str) -> Option<(u32, u32)> {
    let mut it = text.split_whitespace();
    let behind = it.next()?.parse().ok()?;
    let ahead = it.next()?.parse().ok()?;
    Some((behind, ahead))
}

/// What to do once the target resolved, from (behind, ahead).
pub fn decide(behind: u32, ahead: u32) -> Step {
    match (behind, ahead) {
        (0, 0) => Step::Nothing,
        (b, 0) if b > 0 => Step::FastForward,
        _ => Step::AskAgent,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Nothing,
    FastForward,
    AskAgent,
}

fn run(dir: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        // Never wait on a credential prompt nobody can answer.
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("git: {e}"))
}

fn stderr_or(out: &Output, fallback: &str) -> String {
    let e = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if e.is_empty() {
        fallback.to_string()
    } else {
        e
    }
}

fn has_uncommitted(dir: &Path) -> Result<bool, String> {
    let out = run(dir, &["status", "--porcelain"])?;
    if !out.status.success() {
        return Err(stderr_or(&out, "Failed to read git status"));
    }
    Ok(!out.stdout.iter().all(u8::is_ascii_whitespace))
}

/// The target's commit, or `None` when it does not exist (`qLt`).
fn resolve_target(dir: &Path, target_ref: &str) -> Result<Option<String>, String> {
    let out = run(
        dir,
        &["rev-parse", "--verify", &format!("{target_ref}^{{commit}}")],
    )?;
    if out.status.success() {
        return Ok(Some(
            String::from_utf8_lossy(&out.stdout).trim().to_string(),
        ));
    }
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if [
        "Needed a single revision",
        "unknown revision",
        "ambiguous argument",
    ]
    .iter()
    .any(|m| text.contains(m))
    {
        return Ok(None);
    }
    Err(stderr_or(&out, "Failed to resolve target branch"))
}

/// Pull `target_branch` into the checkout at `dir` (see the module docs).
/// `remote` is the workspace's remote, `None` for a local-only repository.
pub fn pull_latest_from_target(
    dir: &Path,
    remote: Option<&str>,
    target_branch: &str,
) -> Result<PullOutcome, String> {
    let config = run(dir, &["config", "--get", "pull.rebase"])?;
    let use_rebase = config.status.success()
        && pull_rebase_enabled(Some(&String::from_utf8_lossy(&config.stdout)));
    let ask = |dirty: bool| PullOutcome::Agent {
        message: reconcile_instruction(remote, target_branch, use_rebase, dirty),
    };
    if has_uncommitted(dir)? {
        return Ok(ask(true));
    }
    if let Some(r) = remote {
        let out = run(dir, &["fetch", r])?;
        if !out.status.success() {
            return Err(stderr_or(&out, "Failed to fetch from remote"));
        }
    }
    if has_uncommitted(dir)? {
        return Ok(ask(true));
    }
    let target_ref = match remote {
        Some(r) => format!("refs/remotes/{r}/{target_branch}"),
        None => target_branch.to_string(),
    };
    let Some(oid) = resolve_target(dir, &target_ref)? else {
        return Ok(PullOutcome::TargetMissing);
    };
    let out = run(
        dir,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{oid}...HEAD"),
        ],
    )?;
    let (behind, ahead) = parse_left_right(&String::from_utf8_lossy(&out.stdout))
        .filter(|_| out.status.success())
        .ok_or_else(|| stderr_or(&out, "Failed to compare with the target branch"))?;
    match decide(behind, ahead) {
        Step::Nothing => Ok(PullOutcome::UpToDate),
        Step::FastForward => {
            let out = run(dir, &["merge", "--ff-only", &oid])?;
            if !out.status.success() {
                return Err(stderr_or(&out, "Failed to pull latest"));
            }
            Ok(PullOutcome::Pulled)
        }
        Step::AskAgent => Ok(ask(false)),
    }
}
