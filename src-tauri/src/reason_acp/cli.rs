//! Finding and launching the Reason CLI's ACP agent.
//!
//! The agent is started as `<absolute path to reason> [--workspace SLUG] acp
//! -y [--model ID] [--reasoning-effort LEVEL]`, directly and never through
//! a shell. The path must be absolute because an app launched from Finder
//! gets a bare `PATH`; the installer puts `reason` in `~/.local/bin`, and
//! Homebrew and manual installs use `/opt/homebrew/bin` or `/usr/local/bin`.
//! `-y` accepts every default so a turn never stops on a terminal prompt.
//! `--workspace` goes before `acp` (it is a global flag).
//!
//! There is one provider: no `--cloud` or `--on`. A Reason Session starts on
//! this computer and the agent itself moves work to a cloud computer.
//!
//! Without `--workspace`, `reason` (0.2.690) uses the workspace selected in
//! the Reason desktop app, which can change while OpenConductor is closed.
//! A Session lives in one workspace, so the provider pins each chat's agent
//! with `--workspace`; [`LaunchConfig::whoami`] and
//! [`LaunchConfig::session_presence`] say which workspaces there are and
//! which one has a Session.

use std::collections::VecDeque;
use std::env;
use std::ffi::{OsStr, OsString};
use std::fmt;
use std::io::{self, BufRead, BufReader};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Output, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

/// Folders checked after `PATH`, in order.
const FALLBACK_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];
/// Stderr lines kept for error reports when the agent exits.
const STDERR_TAIL: usize = 40;

/// The first executable `reason` on `path_var`, then `~/.local/bin`, then
/// [`FALLBACK_DIRS`]. Relative `PATH` entries are skipped.
pub fn find_reason_cli(path_var: Option<&OsStr>, home: Option<&Path>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = path_var
        .map(|p| env::split_paths(p).collect())
        .unwrap_or_default();
    if let Some(home) = home {
        dirs.push(home.join(".local/bin"));
    }
    dirs.extend(FALLBACK_DIRS.iter().map(PathBuf::from));
    dirs.into_iter()
        .filter(|d| d.is_absolute())
        .map(|d| d.join("reason"))
        .find(|p| is_executable(p))
}

fn is_executable(p: &Path) -> bool {
    p.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchError {
    RelativeCliPath(PathBuf),
    /// A value that is empty, starts with `-` (it would read as a flag) or
    /// has characters a slug, model id or effort level never has.
    BadValue {
        flag: &'static str,
        value: String,
    },
}

impl fmt::Display for LaunchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LaunchError::RelativeCliPath(p) => {
                write!(f, "the Reason CLI path must be absolute: {}", p.display())
            }
            LaunchError::BadValue { flag, value } => write!(f, "invalid {flag} value {value:?}"),
        }
    }
}

impl std::error::Error for LaunchError {}

/// How to start `reason acp`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchConfig {
    cli: PathBuf,
    workspace: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

impl LaunchConfig {
    pub fn new(cli: impl Into<PathBuf>) -> Result<Self, LaunchError> {
        let cli = cli.into();
        if !cli.is_absolute() {
            return Err(LaunchError::RelativeCliPath(cli));
        }
        Ok(LaunchConfig {
            cli,
            workspace: None,
            model: None,
            reasoning_effort: None,
        })
    }

    /// The signed-in Workspace to use (`reason whoami` names it).
    pub fn workspace(mut self, slug: &str) -> Result<Self, LaunchError> {
        self.workspace = Some(checked("--workspace", slug)?);
        Ok(self)
    }

    /// Starting model; the chat's model picker can change it later.
    pub fn model(mut self, id: &str) -> Result<Self, LaunchError> {
        self.model = Some(checked("--model", id)?);
        Ok(self)
    }

    pub fn reasoning_effort(mut self, level: &str) -> Result<Self, LaunchError> {
        self.reasoning_effort = Some(checked("--reasoning-effort", level)?);
        Ok(self)
    }

    /// This configuration in `slug`'s workspace; `None` keeps its own.
    pub fn in_workspace(&self, slug: Option<&str>) -> Result<Self, LaunchError> {
        match slug {
            Some(slug) => self.clone().workspace(slug),
            None => Ok(self.clone()),
        }
    }

    pub fn cli(&self) -> &Path {
        &self.cli
    }

    fn workspace_args(&self) -> Vec<String> {
        match &self.workspace {
            Some(slug) => vec!["--workspace".into(), slug.clone()],
            None => Vec::new(),
        }
    }

    pub fn args(&self) -> Vec<String> {
        let mut args = self.workspace_args();
        args.extend(["acp".into(), "-y".into()]);
        if let Some(model) = &self.model {
            args.extend(["--model".into(), model.clone()]);
        }
        if let Some(level) = &self.reasoning_effort {
            args.extend(["--reasoning-effort".into(), level.clone()]);
        }
        args
    }

    /// The command, with piped stdio, run in `dir`. `PATH` gets the CLI's
    /// own folder and the fallback folders appended so the tools `reason`
    /// runs on this computer (git, gh) resolve under a bare GUI `PATH`.
    /// `DYLD_*` variables are dropped: `reason` refuses to start with them
    /// ("unsafe inherited runtime environment"), and `cargo run`, `cargo
    /// test` and `tauri dev` set `DYLD_FALLBACK_LIBRARY_PATH` on macOS.
    pub fn command(&self, dir: &Path) -> Command {
        let mut cmd = self.base_command(dir);
        cmd.args(self.args())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }

    fn base_command(&self, dir: &Path) -> Command {
        let mut cmd = Command::new(&self.cli);
        for key in refused_env(env::vars_os()) {
            cmd.env_remove(key);
        }
        cmd.current_dir(dir)
            .env("PATH", self.path_env(env::var_os("PATH")));
        cmd
    }

    /// Runs `reason [--workspace SLUG] ARGS` in `dir` with no input; `None`
    /// when it cannot start or takes longer than [`SUBCOMMAND_TIMEOUT`].
    fn run(&self, dir: &Path, args: &[&str], stdout: bool) -> Option<Output> {
        let mut cmd = self.base_command(dir);
        cmd.args(self.workspace_args())
            .args(args)
            .stdin(Stdio::null())
            .stdout(if stdout {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stderr(Stdio::piped());
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = tx.send(cmd.output());
        });
        rx.recv_timeout(SUBCOMMAND_TIMEOUT).ok()?.ok()
    }

    /// The signed-in workspaces as `reason whoami` lists them; `None` when
    /// it fails or lists none (e.g. signed in with `REASON_API_KEY`).
    pub fn whoami(&self, dir: &Path) -> Option<Workspaces> {
        let out = self.run(dir, &["whoami"], true)?;
        if !out.status.success() {
            return None;
        }
        let w = parse_whoami(&String::from_utf8_lossy(&out.stdout));
        (!w.saved.is_empty()).then_some(w)
    }

    /// Whether `slug`'s workspace has the Session (`reason session get`).
    pub fn session_presence(&self, dir: &Path, slug: &str, session_id: &str) -> Presence {
        let Ok(cfg) = self.in_workspace(Some(slug)) else {
            return Presence::Unknown;
        };
        if checked("session", session_id).is_err() {
            return Presence::Unknown;
        }
        match cfg.run(dir, &["session", "get", session_id, "--json"], false) {
            Some(out) if out.status.success() => Presence::Found,
            Some(out) if is_not_found(&String::from_utf8_lossy(&out.stderr)) => Presence::Missing,
            _ => Presence::Unknown,
        }
    }

    /// The model and reasoning effort Session `session_id` last ran with,
    /// as `reason session get --json` reports them (`model`,
    /// `reasoning_effort`). A Session on "Auto" names the model Reason
    /// picked for it here, not `default`. `None` when `reason` cannot say.
    pub fn session_model(
        &self,
        dir: &Path,
        workspace: Option<&str>,
        session_id: &str,
    ) -> Option<(String, Option<String>)> {
        let cfg = self.in_workspace(workspace).ok()?;
        checked("session", session_id).ok()?;
        let out = cfg.run(dir, &["session", "get", session_id, "--json"], true)?;
        if !out.status.success() {
            return None;
        }
        parse_session_model(&String::from_utf8_lossy(&out.stdout))
    }

    fn path_env(&self, current: Option<OsString>) -> OsString {
        let mut dirs: Vec<PathBuf> = current
            .map(|p| env::split_paths(&p).collect())
            .unwrap_or_default();
        let extra = self.cli.parent().map(Path::to_path_buf).into_iter();
        for d in extra.chain(FALLBACK_DIRS.iter().map(PathBuf::from)) {
            if !dirs.contains(&d) {
                dirs.push(d);
            }
        }
        env::join_paths(dirs).unwrap_or_default()
    }
}

/// How long `reason whoami` or `reason session get` may take.
const SUBCOMMAND_TIMEOUT: Duration = Duration::from_secs(20);

/// `model` and `reasoning_effort` of `reason session get --json` output
/// (0.2.692 prints the Session object; a versioned `{ data: … }` envelope is
/// read too).
pub fn parse_session_model(json: &str) -> Option<(String, Option<String>)> {
    let v: serde_json::Value = serde_json::from_str(json.trim()).ok()?;
    let s = if v["data"].is_object() {
        &v["data"]
    } else {
        &v
    };
    let model = s["model"].as_str().filter(|m| !m.trim().is_empty())?;
    let effort = s["reasoning_effort"]
        .as_str()
        .filter(|e| !e.trim().is_empty());
    Some((model.to_string(), effort.map(str::to_string)))
}

/// The workspaces `reason whoami` lists.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Workspaces {
    /// The one `reason` uses without `--workspace` (marked `[selected]`).
    pub selected: Option<String>,
    /// Every saved workspace's slug, in the order listed.
    pub saved: Vec<String>,
}

/// Reads `reason whoami` (0.2.690):
///
/// ```text
/// sven@ara.so
/// Organization: Reason Engineering
/// Saved workspaces:
///   reason-engineering (Reason Engineering) [selected]
///   reason-experiments (Reason Experiments)
/// ```
pub fn parse_whoami(text: &str) -> Workspaces {
    let mut w = Workspaces::default();
    let mut in_list = false;
    for line in text.lines() {
        if line.trim_end() == "Saved workspaces:" {
            in_list = true;
            continue;
        }
        if !in_list {
            continue;
        }
        if !line.starts_with("  ") {
            break;
        }
        let Some(slug) = line.split_whitespace().next() else {
            continue;
        };
        if checked("--workspace", slug).is_err() {
            continue;
        }
        if line.trim_end().ends_with("[selected]") {
            w.selected = Some(slug.to_string());
        }
        w.saved.push(slug.to_string());
    }
    w
}

/// What `reason session get` said about a Session in one workspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Presence {
    Found,
    /// `404 session_not_found`: not in this workspace.
    Missing,
    /// It could not tell (offline, timed out, another error).
    Unknown,
}

fn is_not_found(stderr: &str) -> bool {
    stderr.contains("(404 session_not_found)")
}

/// The inherited variables `reason` refuses to start with.
pub(crate) fn refused_env(vars: impl Iterator<Item = (OsString, OsString)>) -> Vec<OsString> {
    vars.filter(|(k, _)| k.to_string_lossy().starts_with("DYLD_"))
        .map(|(k, _)| k)
        .collect()
}

fn checked(flag: &'static str, value: &str) -> Result<String, LaunchError> {
    let ok = !value.is_empty()
        && !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-:/".contains(c));
    if ok {
        Ok(value.to_string())
    } else {
        Err(LaunchError::BadValue {
            flag,
            value: value.to_string(),
        })
    }
}

/// A running `reason acp`. Dropping it kills the process.
pub struct AgentProcess {
    child: Child,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
}

impl AgentProcess {
    /// Starts the agent in `dir` and hands back its stdin and stdout for an
    /// [`super::rpc::RpcConnection`]. Stderr (Reason's log) is drained on
    /// a thread; the last lines are kept for [`Self::stderr_tail`].
    pub fn spawn(cfg: &LaunchConfig, dir: &Path) -> io::Result<(Self, ChildStdin, ChildStdout)> {
        let mut child = cfg.command(dir).spawn()?;
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let tail = Arc::new(Mutex::new(VecDeque::with_capacity(STDERR_TAIL)));
        let sink = tail.clone();
        thread::Builder::new()
            .name("reason-acp-stderr".into())
            .spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let mut tail = sink.lock().unwrap();
                    if tail.len() == STDERR_TAIL {
                        tail.pop_front();
                    }
                    tail.push_back(line);
                }
            })?;
        let process = AgentProcess {
            child,
            stderr_tail: tail,
        };
        Ok((process, stdin, stdout))
    }

    pub fn id(&self) -> u32 {
        self.child.id()
    }

    /// The last lines Reason logged, oldest first.
    pub fn stderr_tail(&self) -> Vec<String> {
        self.stderr_tail.lock().unwrap().iter().cloned().collect()
    }

    /// Whether the process is still running.
    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for AgentProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
