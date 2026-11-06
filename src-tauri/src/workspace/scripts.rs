//! Setup / run / archive script hooks.
//!
//! Behavior from the bundled skill (evidence/scripts/conductor-skill):
//! - scripts run from the workspace directory in a non-interactive shell:
//!   `zsh` on macOS, `bash` elsewhere (cloud);
//! - they receive `<PREFIX>_WORKSPACE_NAME`, `_WORKSPACE_ID`, `_WORKSPACE_PATH`,
//!   `_ROOT_PATH`, `_DEFAULT_BRANCH` (local only), `_PORT` (local only, first
//!   of ten) and `_IS_LOCAL` (`1`/`0`);
//! - a run script that starts several processes should keep them in one
//!   process group, so we start each run script as its own group leader and
//!   stop the whole group.
//!
//! The variable prefix is a parameter so the app can pick its own name; the
//! default keeps settings files written for the reference app working.

use std::collections::HashSet;
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

use super::WorkspaceError;

const SIGTERM: i32 = 15;

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

pub const DEFAULT_ENV_PREFIX: &str = "CONDUCTOR";
/// Each local workspace gets this many consecutive ports.
pub const PORTS_PER_WORKSPACE: u16 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScriptKind {
    Setup,
    Run,
    Archive,
}

#[derive(Debug, Clone)]
pub struct ScriptContext {
    pub env_prefix: String,
    pub workspace_id: String,
    pub workspace_name: String,
    pub workspace_path: PathBuf,
    pub root_path: PathBuf,
    pub default_branch: Option<String>,
    pub port: Option<u16>,
    pub is_local: bool,
    /// Extra environment (e.g. the captured login-shell environment).
    pub extra_env: Vec<(String, String)>,
}

impl ScriptContext {
    pub fn env_vars(&self) -> Vec<(String, String)> {
        let p = &self.env_prefix;
        let mut v = vec![
            (format!("{p}_WORKSPACE_NAME"), self.workspace_name.clone()),
            (format!("{p}_WORKSPACE_ID"), self.workspace_id.clone()),
            (
                format!("{p}_WORKSPACE_PATH"),
                self.workspace_path.display().to_string(),
            ),
            (
                format!("{p}_ROOT_PATH"),
                self.root_path.display().to_string(),
            ),
            (
                format!("{p}_IS_LOCAL"),
                if self.is_local { "1" } else { "0" }.to_string(),
            ),
        ];
        if self.is_local {
            if let Some(b) = &self.default_branch {
                v.push((format!("{p}_DEFAULT_BRANCH"), b.clone()));
            }
            if let Some(port) = self.port {
                v.push((format!("{p}_PORT"), port.to_string()));
            }
        }
        v
    }
}

/// Shell used for scripts: zsh on macOS, bash elsewhere.
pub fn script_shell() -> &'static str {
    if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "bash"
    }
}

fn command_for(script: &str, ctx: &ScriptContext) -> Command {
    let mut cmd = Command::new(script_shell());
    // `-c` without `-i`/`-l`: non-interactive, no rc files beyond zshenv.
    cmd.arg("-c").arg(script).current_dir(&ctx.workspace_path);
    cmd.envs(ctx.extra_env.iter().map(|(k, v)| (k, v)));
    cmd.envs(ctx.env_vars());
    cmd
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScriptOutput {
    pub kind: ScriptKind,
    /// `None` when killed by a signal.
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl ScriptOutput {
    pub fn success(&self) -> bool {
        self.exit_code == Some(0)
    }
}

/// Run a setup or archive script to completion.
pub fn run_to_completion(
    kind: ScriptKind,
    script: &str,
    ctx: &ScriptContext,
) -> Result<ScriptOutput, WorkspaceError> {
    let out = command_for(script, ctx)
        .stdin(Stdio::null())
        .output()
        .map_err(WorkspaceError::Io)?;
    Ok(ScriptOutput {
        kind,
        exit_code: out.status.code(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// A long-running run script, leader of its own process group.
pub struct RunningScript {
    pub child: Child,
}

impl RunningScript {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// Send SIGTERM to the whole process group, then reap the leader.
    pub fn stop(mut self) -> Result<Option<i32>, WorkspaceError> {
        let pgid = self.child.id() as i32;
        // The child is its own group leader (process_group(0)); a negative pid
        // signals the whole group. Never signal pid <= 1 (our group / init).
        if pgid > 1 {
            // SAFETY: plain syscall wrapper from the C library std already links.
            unsafe {
                kill(-pgid, SIGTERM);
            }
        }
        let status = self.child.wait().map_err(WorkspaceError::Io)?;
        Ok(status.code())
    }
}

/// Start a run script with piped stdout/stderr in its own process group.
pub fn spawn_run(script: &str, ctx: &ScriptContext) -> Result<RunningScript, WorkspaceError> {
    let child = command_for(script, ctx)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(WorkspaceError::Io)?;
    Ok(RunningScript { child })
}

/// First port of a free block of [`PORTS_PER_WORKSPACE`] ports, at or above
/// `base`, stepping by the block size and skipping blocks in `used_starts`.
/// (Port base is our choice; the reference app's base is not yet verified.)
pub fn allocate_port_block(base: u16, used_starts: &HashSet<u16>) -> Option<u16> {
    let mut start = base;
    loop {
        start.checked_add(PORTS_PER_WORKSPACE - 1)?;
        if !used_starts.contains(&start) {
            return Some(start);
        }
        start = start.checked_add(PORTS_PER_WORKSPACE)?;
    }
}
