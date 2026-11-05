//! How a Codex session is launched: its tool approval policy and sandbox,
//! and the `codex app-server` command line.
//!
//! The reference app drives Codex through `codex app-server --listen
//! stdio://`, a JSON-RPC server on stdin and stdout (see
//! `evidence/providers/README.md`). Approval and sandbox are not flags: they
//! go in each `thread/start` and `thread/resume` request
//! ([`super::codex_rpc`]). The values below are the ones the app-server
//! schema accepts in Codex 0.156.1, the version the reference app downloads,
//! and in 0.166.0 (`evidence/providers/codex-app-server.md`).

use std::ffi::OsStr;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use super::env::LaunchEnv;

/// When Codex stops to ask before running a command or applying a patch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalPolicy {
    /// Ask for anything not on Codex's trusted-command list.
    Untrusted,
    /// The model decides when to ask.
    OnRequest,
    /// Never ask; failures go back to the model.
    Never,
}

/// What commands Codex runs may touch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxMode {
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
}

impl ApprovalPolicy {
    pub const ALL: [ApprovalPolicy; 3] = [
        ApprovalPolicy::Untrusted,
        ApprovalPolicy::OnRequest,
        ApprovalPolicy::Never,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            ApprovalPolicy::Untrusted => "untrusted",
            ApprovalPolicy::OnRequest => "on-request",
            ApprovalPolicy::Never => "never",
        }
    }
}

impl SandboxMode {
    pub const ALL: [SandboxMode; 3] = [
        SandboxMode::ReadOnly,
        SandboxMode::WorkspaceWrite,
        SandboxMode::DangerFullAccess,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            SandboxMode::ReadOnly => "read-only",
            SandboxMode::WorkspaceWrite => "workspace-write",
            SandboxMode::DangerFullAccess => "danger-full-access",
        }
    }
}

/// A value that is not one of a setting's allowed strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownValue {
    pub setting: &'static str,
    pub value: String,
}

impl fmt::Display for UnknownValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown {} {:?}", self.setting, self.value)
    }
}

impl std::error::Error for UnknownValue {}

impl FromStr for ApprovalPolicy {
    type Err = UnknownValue;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        ApprovalPolicy::ALL
            .into_iter()
            .find(|p| p.as_str() == s)
            .ok_or_else(|| UnknownValue {
                setting: "approval policy",
                value: s.to_owned(),
            })
    }
}

impl FromStr for SandboxMode {
    type Err = UnknownValue;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        SandboxMode::ALL
            .into_iter()
            .find(|m| m.as_str() == s)
            .ok_or_else(|| UnknownValue {
                setting: "sandbox mode",
                value: s.to_owned(),
            })
    }
}

/// Tool approval for a Codex session. A field left unset inherits the
/// user's own Codex configuration (`~/.codex/config.toml`); both unset is
/// the reference app's `inherit` choice.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexPolicy {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<ApprovalPolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
}

impl CodexPolicy {
    /// Use whatever the user's Codex configuration says.
    pub fn inherit() -> Self {
        Self::default()
    }

    pub fn new(approval_policy: ApprovalPolicy, sandbox: SandboxMode) -> Self {
        Self {
            approval_policy: Some(approval_policy),
            sandbox: Some(sandbox),
        }
    }

    pub fn is_inherit(&self) -> bool {
        self.approval_policy.is_none() && self.sandbox.is_none()
    }
}

/// Everything needed to start one `codex app-server` for a session.
#[derive(Debug, Clone)]
pub struct CodexLaunch {
    /// The `codex` executable: a configured path, or `codex` on `PATH`.
    pub executable: PathBuf,
    /// The workspace the agent works in.
    pub cwd: PathBuf,
    /// Provider environment from [`super::Provider::launch_env`].
    pub env: LaunchEnv,
    /// `-c key=value` overrides of Codex's config, in order. Values are
    /// TOML, as the CLI parses them.
    pub config: Vec<(String, String)>,
}

impl CodexLaunch {
    pub fn new(cwd: impl Into<PathBuf>, env: LaunchEnv) -> Self {
        Self {
            executable: PathBuf::from("codex"),
            cwd: cwd.into(),
            env,
            config: Vec::new(),
        }
    }

    /// Arguments after the executable. `-c` must come after `app-server`:
    /// the overrides belong to that subcommand.
    pub fn args(&self) -> Vec<String> {
        let mut args: Vec<String> = ["app-server", "--listen", "stdio://"]
            .map(String::from)
            .to_vec();
        for (key, value) in &self.config {
            args.extend(["-c".into(), format!("{key}={value}")]);
        }
        args
    }

    /// The command to spawn: piped stdio, the workspace as cwd, and the
    /// provider environment applied over the inherited one.
    pub fn command(&self) -> Command {
        let mut cmd = Command::new(&self.executable);
        cmd.args(self.args())
            .current_dir(&self.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        self.env.apply(&mut cmd);
        cmd
    }
}

/// Where `codex` is installed when `PATH` misses it: its own installer's
/// `~/.local/bin` (added by the caller), Homebrew, `/usr/local/bin`.
const FALLBACK_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

/// The first executable `codex` on `path_var`, then `~/.local/bin`, then
/// Homebrew and `/usr/local/bin`. Relative `PATH` entries are skipped. An
/// app opened from Finder gets a minimal `PATH`, so callers pass the login
/// shell's.
pub fn find_codex_cli(path_var: Option<&OsStr>, home: Option<&Path>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = path_var
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    if let Some(home) = home {
        dirs.push(home.join(".local/bin"));
    }
    dirs.extend(FALLBACK_DIRS.iter().map(PathBuf::from));
    dirs.into_iter()
        .filter(|d| d.is_absolute())
        .map(|d| d.join("codex"))
        .find(|p| is_executable(p))
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(p: &Path) -> bool {
    p.is_file()
}

#[cfg(test)]
mod tests {
    use super::super::env::vars;
    use super::super::{AgentKind, SecretString};
    use super::*;

    #[test]
    fn policy_strings_round_trip_through_str_and_json() {
        for p in ApprovalPolicy::ALL {
            assert_eq!(p.as_str().parse::<ApprovalPolicy>(), Ok(p));
            let json = serde_json::to_string(&p).unwrap();
            assert_eq!(json, format!("\"{}\"", p.as_str()));
            assert_eq!(serde_json::from_str::<ApprovalPolicy>(&json).unwrap(), p);
        }
        for m in SandboxMode::ALL {
            assert_eq!(m.as_str().parse::<SandboxMode>(), Ok(m));
            let json = serde_json::to_string(&m).unwrap();
            assert_eq!(json, format!("\"{}\"", m.as_str()));
        }
        // `on-failure` was removed from the app-server schema.
        let err = "on-failure".parse::<ApprovalPolicy>().unwrap_err();
        assert_eq!(err.to_string(), "unknown approval policy \"on-failure\"");
        assert!("workspace_write".parse::<SandboxMode>().is_err());
    }

    #[test]
    fn inherit_is_both_unset_and_serializes_empty() {
        let inherit = CodexPolicy::inherit();
        assert!(inherit.is_inherit());
        assert_eq!(serde_json::to_string(&inherit).unwrap(), "{}");
        let p = CodexPolicy::new(ApprovalPolicy::OnRequest, SandboxMode::WorkspaceWrite);
        assert!(!p.is_inherit());
        let json = serde_json::to_value(p).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"approvalPolicy": "on-request", "sandbox": "workspace-write"})
        );
        assert_eq!(serde_json::from_value::<CodexPolicy>(json).unwrap(), p);
        assert!(serde_json::from_str::<CodexPolicy>(r#"{"approval":"never"}"#).is_err());
    }

    #[test]
    fn launch_runs_the_stdio_app_server_with_config_overrides() {
        let mut launch = CodexLaunch::new("/work/ws", LaunchEnv::cleared_for(AgentKind::Codex));
        assert_eq!(launch.args(), ["app-server", "--listen", "stdio://"]);
        launch
            .config
            .push(("model_reasoning_effort".into(), "\"high\"".into()));
        assert_eq!(
            launch.args(),
            [
                "app-server",
                "--listen",
                "stdio://",
                "-c",
                "model_reasoning_effort=\"high\""
            ]
        );
    }

    #[test]
    fn command_sets_cwd_and_provider_env_without_args_leaking_secrets() {
        let mut env = LaunchEnv::cleared_for(AgentKind::Codex);
        env.set_secret(vars::CODEX_API_KEY, SecretString::new("sk-test-123"));
        let launch = CodexLaunch::new("/work/ws", env);
        let cmd = launch.command();
        assert_eq!(
            cmd.get_current_dir(),
            Some(std::path::Path::new("/work/ws"))
        );
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy()).collect();
        assert!(args.iter().all(|a| !a.contains("sk-test-123")));
        let key = cmd
            .get_envs()
            .find(|(k, _)| *k == vars::CODEX_API_KEY)
            .and_then(|(_, v)| v);
        assert_eq!(key.map(|v| v.to_string_lossy()), Some("sk-test-123".into()));
    }

    #[cfg(unix)]
    #[test]
    fn finds_codex_on_path_then_in_local_bin() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("oc-find-codex-{}", std::process::id()));
        let (on_path, home) = (root.join("bin"), root.join("home"));
        std::fs::create_dir_all(&on_path).unwrap();
        std::fs::create_dir_all(home.join(".local/bin")).unwrap();
        let local = home.join(".local/bin/codex");
        std::fs::write(&local, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&local, std::fs::Permissions::from_mode(0o755)).unwrap();
        // Not executable: skipped.
        std::fs::write(on_path.join("codex"), "").unwrap();
        let path = std::env::join_paths([PathBuf::from("rel"), on_path.clone()]).unwrap();
        assert_eq!(find_codex_cli(Some(&path), Some(&home)), Some(local));
        std::fs::set_permissions(
            on_path.join("codex"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        assert_eq!(
            find_codex_cli(Some(&path), Some(&home)),
            Some(on_path.join("codex"))
        );
    }
}
