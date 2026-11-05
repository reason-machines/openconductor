//! Minimal `git` subprocess runner for the workspace module.
//!
//! Workspace lifecycle is defined in terms of porcelain commands
//! (`worktree add`, `branch`, `fetch`, ...), so we shell out to the user's
//! `git` instead of re-implementing them.

use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};

use super::WorkspaceError;

/// Variables that would redirect git away from the directory we pass as cwd
/// (for example when the app itself is started from a git hook).
const SCRUBBED_ENV: &[&str] = &["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"];

pub(crate) struct GitOutput {
    pub(crate) success: bool,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

/// Run git in `cwd` and return its output whatever the exit status.
pub(crate) fn output<I, S>(cwd: &Path, args: I) -> Result<GitOutput, WorkspaceError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args);
    for key in SCRUBBED_ENV {
        cmd.env_remove(key);
    }
    // Never prompt for credentials or editors: the app has no terminal.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let out = cmd.output().map_err(WorkspaceError::Io)?;
    Ok(GitOutput {
        success: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// Run git in `cwd`, failing on a non-zero exit; returns stdout without the
/// trailing newline.
pub(crate) fn run<I, S>(cwd: &Path, args: I) -> Result<String, WorkspaceError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let args: Vec<String> = args
        .into_iter()
        .map(|a| a.as_ref().to_string_lossy().into_owned())
        .collect();
    let out = output(cwd, &args)?;
    if !out.success {
        return Err(WorkspaceError::Git {
            command: format!("git {}", args.join(" ")),
            stderr: out.stderr.trim().to_string(),
        });
    }
    Ok(out.stdout.trim_end_matches(['\n', '\r']).to_string())
}

/// Full ref names under `prefix` (for example `refs/remotes/origin/`).
pub(crate) fn refs_under(
    cwd: &Path,
    prefix: &str,
    sort: &str,
) -> Result<Vec<String>, WorkspaceError> {
    let out = run(
        cwd,
        [
            "for-each-ref",
            &format!("--sort={sort}"),
            "--format=%(refname)",
            prefix,
        ],
    )?;
    Ok(out
        .lines()
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}
