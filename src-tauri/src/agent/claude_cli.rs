//! How a Claude Code session is launched: the permission mode it runs in and
//! the `claude` command line.
//!
//! The reference app drives Claude through the Claude Agent SDK, which runs
//! the `claude` CLI with stream-json on stdin and stdout and answers tool
//! permission prompts over the same pipe (the SDK's `canUseTool`). We launch
//! the CLI the same way from Rust: `--input-format stream-json
//! --output-format stream-json --verbose`, with `--permission-prompt-tool
//! stdio` when the app answers permission prompts itself. Flag names are the
//! CLI's public interface; see `evidence/providers/README.md`.

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::env::LaunchEnv;

/// The agent skill the bundle ships, a Claude Code plugin directory:
/// `Contents/Resources/conductor-skill/`, the same place Conductor 0.87.6
/// ships its own (`evidence/scripts/MANIFEST.md`). Source:
/// `src-tauri/resources/conductor-skill/`.
pub const BUNDLED_PLUGIN: &str = "conductor-skill";

static BUNDLED_PLUGIN_DIR: OnceLock<PathBuf> = OnceLock::new();

/// `<resource_dir>/conductor-skill` when it holds a plugin manifest; `None`
/// for a dev build without bundle resources.
pub fn bundled_plugin_dir(resource_dir: &Path) -> Option<PathBuf> {
    let dir = resource_dir.join(BUNDLED_PLUGIN);
    dir.join(".claude-plugin/plugin.json")
        .is_file()
        .then_some(dir)
}

/// Remember the bundled plugin at startup, so every [`ClaudeLaunch::new`]
/// loads it with `--plugin-dir`.
pub fn set_bundled_plugin_dir(resource_dir: &Path) {
    if let Some(dir) = bundled_plugin_dir(resource_dir) {
        let _ = BUNDLED_PLUGIN_DIR.set(dir);
    }
}

/// The bundled plugin directory remembered at startup, if any.
pub fn bundled_plugin() -> Option<PathBuf> {
    BUNDLED_PLUGIN_DIR.get().cloned()
}

/// Claude Code permission modes. The six values the reference app offers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// Ask before edits and commands.
    #[default]
    Default,
    /// Apply file edits without asking; still ask for commands.
    AcceptEdits,
    /// Read and plan only; no edits or commands.
    Plan,
    /// Never ask; every tool call runs.
    BypassPermissions,
    /// Never ask; anything not already allowed is denied.
    DontAsk,
    /// Let the CLI's classifier decide each prompt.
    Auto,
}

impl PermissionMode {
    pub const ALL: [PermissionMode; 6] = [
        PermissionMode::Default,
        PermissionMode::AcceptEdits,
        PermissionMode::Plan,
        PermissionMode::BypassPermissions,
        PermissionMode::DontAsk,
        PermissionMode::Auto,
    ];

    /// The value of `--permission-mode`.
    pub fn as_str(self) -> &'static str {
        match self {
            PermissionMode::Default => "default",
            PermissionMode::AcceptEdits => "acceptEdits",
            PermissionMode::Plan => "plan",
            PermissionMode::BypassPermissions => "bypassPermissions",
            PermissionMode::DontAsk => "dontAsk",
            PermissionMode::Auto => "auto",
        }
    }

    /// Whether the CLI can stop and ask the app about a tool call in this
    /// mode. Only then does `--permission-prompt-tool stdio` matter.
    pub fn may_prompt(self) -> bool {
        !matches!(
            self,
            PermissionMode::BypassPermissions | PermissionMode::DontAsk
        )
    }
}

impl fmt::Display for PermissionMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownPermissionMode(pub String);

impl fmt::Display for UnknownPermissionMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown permission mode {:?}", self.0)
    }
}

impl std::error::Error for UnknownPermissionMode {}

impl FromStr for PermissionMode {
    type Err = UnknownPermissionMode;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        PermissionMode::ALL
            .into_iter()
            .find(|m| m.as_str() == s)
            .ok_or_else(|| UnknownPermissionMode(s.to_owned()))
    }
}

/// Everything needed to start one Claude Code process for a session.
#[derive(Debug, Clone)]
pub struct ClaudeLaunch {
    /// The `claude` executable: a configured path, or `claude` on `PATH`.
    pub executable: PathBuf,
    /// The workspace the agent works in.
    pub cwd: PathBuf,
    /// Provider environment from [`super::Provider::launch_env`].
    pub env: LaunchEnv,
    pub permission_mode: PermissionMode,
    /// Model alias or id (`--model`); the CLI default when unset.
    pub model: Option<String>,
    /// Resume this Claude session id instead of starting a new one.
    pub resume: Option<String>,
    /// The app answers permission prompts over stdio (the SDK's `canUseTool`).
    pub prompt_over_stdio: bool,
    /// Extra directories the agent may read and edit (`--add-dir`).
    pub add_dirs: Vec<PathBuf>,
    /// Text appended to Claude Code's system prompt.
    pub append_system_prompt: Option<String>,
    /// Plugins loaded for this session only (`--plugin-dir`); starts with
    /// the bundled OpenConductor skill when the app has one.
    pub plugin_dirs: Vec<PathBuf>,
    /// `--effort` (`low`, `medium`, `high`, `xhigh`, `max`); the CLI default when unset.
    pub effort: Option<String>,
    /// Settings JSON passed with `--settings` (for example `outputStyle`, `fastMode`).
    pub settings: Option<serde_json::Value>,
    /// `--chrome`: Claude in Chrome ("Use Claude Code with Chrome",
    /// the `chrome_mode_enabled` app preference).
    pub chrome: bool,
}

impl ClaudeLaunch {
    pub fn new(cwd: impl Into<PathBuf>, env: LaunchEnv) -> Self {
        Self {
            executable: PathBuf::from("claude"),
            cwd: cwd.into(),
            env,
            permission_mode: PermissionMode::Default,
            model: None,
            resume: None,
            prompt_over_stdio: true,
            add_dirs: Vec::new(),
            append_system_prompt: None,
            plugin_dirs: BUNDLED_PLUGIN_DIR.get().cloned().into_iter().collect(),
            effort: None,
            chrome: false,
            settings: None,
        }
    }

    /// Arguments after the executable, in a fixed order.
    pub fn args(&self) -> Vec<String> {
        let mut args: Vec<String> = [
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--permission-mode",
            self.permission_mode.as_str(),
        ]
        .map(String::from)
        .to_vec();
        if self.prompt_over_stdio && self.permission_mode.may_prompt() {
            args.extend(["--permission-prompt-tool".into(), "stdio".into()]);
        }
        if let Some(model) = &self.model {
            args.extend(["--model".into(), model.clone()]);
        }
        if let Some(id) = &self.resume {
            args.extend(["--resume".into(), id.clone()]);
        }
        for dir in &self.add_dirs {
            args.extend(["--add-dir".into(), dir.display().to_string()]);
        }
        if let Some(text) = &self.append_system_prompt {
            args.extend(["--append-system-prompt".into(), text.clone()]);
        }
        for dir in &self.plugin_dirs {
            args.extend(["--plugin-dir".into(), dir.display().to_string()]);
        }
        if let Some(effort) = &self.effort {
            args.extend(["--effort".into(), effort.clone()]);
        }
        if let Some(settings) = &self.settings {
            args.extend(["--settings".into(), settings.to_string()]);
        }
        if self.chrome {
            args.push("--chrome".into());
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

#[cfg(test)]
mod tests {
    use super::super::env::vars;
    use super::super::{AgentKind, SecretString};
    use super::*;

    fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        let i = args.iter().position(|a| a == flag)?;
        args.get(i + 1).map(String::as_str)
    }

    #[test]
    fn permission_modes_round_trip_as_cli_and_json_values() {
        let names: Vec<&str> = PermissionMode::ALL.iter().map(|m| m.as_str()).collect();
        assert_eq!(
            names,
            [
                "default",
                "acceptEdits",
                "plan",
                "bypassPermissions",
                "dontAsk",
                "auto"
            ]
        );
        for mode in PermissionMode::ALL {
            assert_eq!(mode.as_str().parse::<PermissionMode>(), Ok(mode));
            let json = serde_json::to_string(&mode).unwrap();
            assert_eq!(json, format!("\"{}\"", mode.as_str()));
            assert_eq!(serde_json::from_str::<PermissionMode>(&json).unwrap(), mode);
        }
        assert!("yolo".parse::<PermissionMode>().is_err());
        assert_eq!(PermissionMode::default(), PermissionMode::Default);
    }

    #[test]
    fn chrome_mode_adds_the_chrome_flag_only_when_on() {
        let mut launch = ClaudeLaunch::new("/w", LaunchEnv::new());
        assert!(!launch.args().iter().any(|a| a == "--chrome"));
        launch.chrome = true;
        assert_eq!(launch.args().last().map(String::as_str), Some("--chrome"));
    }

    #[test]
    fn default_launch_speaks_stream_json_and_prompts_over_stdio() {
        let args = ClaudeLaunch::new("/w", LaunchEnv::new()).args();
        assert_eq!(flag_value(&args, "--input-format"), Some("stream-json"));
        assert_eq!(flag_value(&args, "--output-format"), Some("stream-json"));
        assert!(args.contains(&"--verbose".to_owned()));
        assert_eq!(flag_value(&args, "--permission-mode"), Some("default"));
        assert_eq!(flag_value(&args, "--permission-prompt-tool"), Some("stdio"));
        assert!(!args.iter().any(|a| a == "--model" || a == "--resume"));
        // Interactive one-shot print mode is never used.
        assert!(!args.iter().any(|a| a == "-p" || a == "--print"));
    }

    #[test]
    fn modes_that_never_ask_skip_the_prompt_tool() {
        for mode in PermissionMode::ALL {
            let mut launch = ClaudeLaunch::new("/w", LaunchEnv::new());
            launch.permission_mode = mode;
            let args = launch.args();
            assert_eq!(flag_value(&args, "--permission-mode"), Some(mode.as_str()));
            assert_eq!(
                args.contains(&"--permission-prompt-tool".to_owned()),
                mode.may_prompt(),
                "{mode}"
            );
        }
    }

    #[test]
    fn optional_flags_follow_the_launch() {
        let mut launch = ClaudeLaunch::new("/w", LaunchEnv::new());
        launch.model = Some("opus".into());
        launch.resume = Some("3f1c".into());
        launch.add_dirs = vec!["/a".into(), "/b".into()];
        launch.append_system_prompt = Some("be brief".into());
        launch.prompt_over_stdio = false;
        let args = launch.args();
        assert_eq!(flag_value(&args, "--model"), Some("opus"));
        assert_eq!(flag_value(&args, "--resume"), Some("3f1c"));
        assert_eq!(
            flag_value(&args, "--append-system-prompt"),
            Some("be brief")
        );
        let dirs: Vec<_> = args
            .windows(2)
            .filter(|w| w[0] == "--add-dir")
            .map(|w| w[1].as_str())
            .collect();
        assert_eq!(dirs, ["/a", "/b"]);
        assert!(!args.contains(&"--permission-prompt-tool".to_owned()));
    }

    #[test]
    fn plugin_dirs_become_plugin_dir_flags() {
        let mut launch = ClaudeLaunch::new("/w", LaunchEnv::new());
        launch.plugin_dirs = vec!["/r/conductor-skill".into()];
        let args = launch.args();
        assert_eq!(
            flag_value(&args, "--plugin-dir"),
            Some("/r/conductor-skill")
        );
    }

    #[test]
    fn bundled_plugin_needs_a_manifest() {
        let res = std::env::temp_dir().join(format!("oc-plugin-res-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&res);
        std::fs::create_dir_all(res.join("conductor-skill")).unwrap();
        assert_eq!(bundled_plugin_dir(&res), None, "no manifest: dev build");
        std::fs::create_dir_all(res.join("conductor-skill/.claude-plugin")).unwrap();
        std::fs::write(res.join("conductor-skill/.claude-plugin/plugin.json"), "{}").unwrap();
        assert_eq!(bundled_plugin_dir(&res), Some(res.join("conductor-skill")));
        let _ = std::fs::remove_dir_all(&res);
    }

    #[test]
    fn shipped_plugin_is_a_claude_code_plugin_with_one_skill() {
        let manifest: serde_json::Value = serde_json::from_str(include_str!(
            "../../resources/conductor-skill/.claude-plugin/plugin.json"
        ))
        .unwrap();
        assert_eq!(manifest["name"], "openconductor");
        let skill = include_str!("../../resources/conductor-skill/skills/conductor/SKILL.md");
        let front = skill
            .strip_prefix("---\n")
            .and_then(|rest| rest.split_once("\n---\n"))
            .map(|(front, _)| front)
            .expect("SKILL.md starts with YAML frontmatter");
        assert!(front.lines().any(|l| l == "name: conductor"), "{front}");
        assert!(
            front.lines().any(|l| l.starts_with("description: ")),
            "{front}"
        );
    }

    #[test]
    fn command_runs_in_the_workspace_with_the_provider_env() {
        let mut env = LaunchEnv::cleared_for(AgentKind::Claude);
        env.set_secret(vars::ANTHROPIC_API_KEY, SecretString::new("sk-ant-new"));
        let mut launch = ClaudeLaunch::new("/work/space", env);
        launch.executable = "/opt/claude/bin/claude".into();
        let cmd = launch.command();
        assert_eq!(cmd.get_program(), "/opt/claude/bin/claude");
        assert_eq!(
            cmd.get_current_dir(),
            Some(std::path::Path::new("/work/space"))
        );
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args, launch.args());
        let envs: std::collections::HashMap<String, Option<String>> = cmd
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();
        assert_eq!(
            envs.get(vars::ANTHROPIC_API_KEY),
            Some(&Some("sk-ant-new".to_owned()))
        );
        // Cleared routing variables are removed, not inherited.
        assert_eq!(envs.get(vars::ANTHROPIC_BASE_URL), Some(&None));
        assert_eq!(envs.get(vars::CLAUDE_CODE_USE_BEDROCK), Some(&None));
    }
}
