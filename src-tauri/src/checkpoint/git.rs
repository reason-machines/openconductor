//! Minimal `git` subprocess helper used by the checkpoint module.
//!
//! The checkpoint semantics are defined in terms of git plumbing commands
//! (write-tree, read-tree, commit-tree, update-ref, ...), so we shell out to
//! the user's `git` exactly like the reference behavior does instead of
//! re-implementing the object model.

use std::ffi::OsStr;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use super::CheckpointError;

/// Environment variables that would redirect git away from the workspace we
/// operate on. They are cleared for every call; the temp index is passed
/// explicitly where needed.
const SCRUBBED_ENV: &[&str] = &["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"];

pub(crate) struct Git<'a> {
    cwd: &'a Path,
    envs: Vec<(String, String)>,
    stdin: Option<String>,
}

pub(crate) struct GitOutput {
    pub(crate) success: bool,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

impl<'a> Git<'a> {
    pub(crate) fn new(cwd: &'a Path) -> Self {
        Self {
            cwd,
            envs: Vec::new(),
            stdin: None,
        }
    }

    pub(crate) fn env(mut self, key: &str, value: impl AsRef<OsStr>) -> Self {
        self.envs.push((
            key.to_string(),
            value.as_ref().to_string_lossy().into_owned(),
        ));
        self
    }

    pub(crate) fn stdin(mut self, input: impl Into<String>) -> Self {
        self.stdin = Some(input.into());
        self
    }

    /// Run git and return its output whatever the exit status.
    pub(crate) fn output<I, S>(&self, args: I) -> Result<GitOutput, CheckpointError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = Command::new("git");
        cmd.current_dir(self.cwd).args(args);
        for key in SCRUBBED_ENV {
            cmd.env_remove(key);
        }
        for (k, v) in &self.envs {
            cmd.env(k, v);
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.stdin(if self.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });

        let mut child = cmd.spawn().map_err(CheckpointError::Io)?;
        if let Some(input) = &self.stdin {
            if let Some(mut pipe) = child.stdin.take() {
                pipe.write_all(input.as_bytes())
                    .map_err(CheckpointError::Io)?;
            }
        }
        let out = child.wait_with_output().map_err(CheckpointError::Io)?;
        Ok(GitOutput {
            success: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }

    /// Run git, failing on a non-zero exit, and return trimmed stdout.
    pub(crate) fn run<I, S>(&self, args: I) -> Result<String, CheckpointError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<String> = args
            .into_iter()
            .map(|a| a.as_ref().to_string_lossy().into_owned())
            .collect();
        let out = self.output(&args)?;
        if !out.success {
            return Err(CheckpointError::Git {
                command: format!("git {}", args.join(" ")),
                stderr: out.stderr.trim().to_string(),
            });
        }
        Ok(out.stdout.trim_end_matches(['\n', '\r']).to_string())
    }

    /// `git rev-parse -q --verify <rev>`; `None` when it does not resolve.
    pub(crate) fn verify(&self, rev: &str) -> Result<Option<String>, CheckpointError> {
        let out = self.output(["rev-parse", "-q", "--verify", rev])?;
        let oid = out.stdout.trim();
        Ok(if out.success && !oid.is_empty() {
            Some(oid.to_string())
        } else {
            None
        })
    }
}
