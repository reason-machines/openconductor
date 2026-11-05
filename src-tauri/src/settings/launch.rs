//! What the agent keys of `settings.toml` do when an agent starts: the
//! provider it runs on, the executable launched, the model, effort, output
//! style or personality, fast mode, plan mode and tool approvals.
//!
//! Key meanings follow Conductor 0.87.6 (`evidence/settings/NOTES.md`,
//! "Models and providers"): its launch reads `claude_executable_path`
//! (file key `claude_code_executable_path`), `claude_provider`,
//! `codex_executable_path` and `codex_provider`, uses a path only when it is
//! not blank, and keeps API-key routing only when the provider is `custom`.
//! How each value reaches the CLI is the CLI's own option, checked against
//! the Claude Code 2.1.284 and Codex 0.156.1 binaries Conductor bundles.
//!
//! Pass the effective settings for the workspace's repository
//! ([`super::layers::for_repo`]) so repository overrides apply.

use std::path::{Path, PathBuf};

use serde_json::json;

use super::{CodexToolApprovalPolicy, Settings};
use crate::agent::claude::AnthropicApi;
use crate::agent::claude_cloud::{Bedrock, Vertex};
use crate::agent::codex::{CodexLogin, OpenAiApi};
use crate::agent::codex_cli::CodexLaunch;
use crate::agent::codex_rpc::ApprovalDecision;
use crate::agent::{
    AgentKind, ClaudeLaunch, PermissionMode, ProviderConfig, ProviderError, SecretStore,
};

/// Which of the settings' two configurations a session uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Purpose {
    /// A new chat: `models.default`, default effort, output style, plan mode.
    Chat,
    /// A code review: `models.review` (else the default), review effort.
    Review,
}

/// Vertex region when `claude_provider = "vertex"`: Claude Code's `global`
/// endpoint, since Conductor's settings carry no Vertex region.
pub const VERTEX_DEFAULT_REGION: &str = "global";

fn nonblank(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

/// The agent that runs a model id from Conductor's catalog: `gpt-*` is
/// Codex, Cursor's ids are Cursor, everything else is Claude.
pub fn model_agent(model: &str) -> AgentKind {
    if model.starts_with("gpt-") {
        AgentKind::Codex
    } else if model == "auto" || model.starts_with("composer-") || model.starts_with("grok-") {
        AgentKind::Cursor
    } else {
        AgentKind::Claude
    }
}

/// The `claude --model` value for a Conductor model id, as Conductor maps
/// it for the Anthropic API: `opus-5-5-1m` is `claude-opus-5-5[1m]`,
/// `opus-4-8` is `claude-opus-4-8`. The CLI aliases (`opus`, `sonnet`,
/// `haiku`, `opus-1m`) stay aliases.
pub fn claude_cli_model(model: &str) -> String {
    let (base, one_m) = match model.strip_suffix("-1m") {
        Some(b) => (b, "[1m]"),
        None => (model, ""),
    };
    if matches!(base, "opus" | "sonnet" | "haiku") || base.starts_with("claude-") {
        format!("{base}{one_m}")
    } else {
        format!("claude-{base}{one_m}")
    }
}

impl Settings {
    /// The provider an agent runs on. Precedence, highest first:
    /// `[providers.<agent>]`, then Conductor's top-level `claude_provider` /
    /// `codex_provider`, then the CLI's own login. (A repository or managed
    /// layer that sets the top-level key replaces a lower `[providers.*]`
    /// table, see [`super::layers::merge`].)
    ///
    /// `claude_provider`: `custom` is the Anthropic API with the stored key;
    /// `bedrock` / `vertex` (OpenConductor's) use `bedrock_region` /
    /// `vertex_project_id` and fall back to the login when that is blank;
    /// anything else is the login. `codex_provider`: `custom` is the OpenAI
    /// API with the stored key; anything else (`default`, `chatgpt_sign_in`)
    /// is Codex's own login.
    pub fn provider_for(&self, agent: AgentKind) -> ProviderConfig {
        if let Some(p) = self.providers.get(agent) {
            return p.clone();
        }
        match agent {
            AgentKind::Claude => match nonblank(&self.claude_provider) {
                Some("custom") => ProviderConfig::AnthropicApi(AnthropicApi::default()),
                Some("bedrock") => match nonblank(&self.bedrock_region) {
                    Some(region) => ProviderConfig::Bedrock(Bedrock {
                        region: region.to_string(),
                        ..Bedrock::default()
                    }),
                    None => ProviderConfig::default_for(agent),
                },
                Some("vertex") => match nonblank(&self.vertex_project_id) {
                    Some(project) => ProviderConfig::Vertex(Vertex {
                        project_id: project.to_string(),
                        region: VERTEX_DEFAULT_REGION.to_string(),
                        ..Vertex::default()
                    }),
                    None => ProviderConfig::default_for(agent),
                },
                _ => ProviderConfig::default_for(agent),
            },
            AgentKind::Codex => match nonblank(&self.codex_provider) {
                Some("custom") => ProviderConfig::OpenaiApi(OpenAiApi::default()),
                _ => ProviderConfig::CodexLogin(CodexLogin {}),
            },
            _ => ProviderConfig::default_for(agent),
        }
    }

    /// The executable launched for an agent: the Advanced tab's path when
    /// not blank, else the agent's command on `PATH`.
    pub fn executable(&self, agent: AgentKind) -> PathBuf {
        let configured = match agent {
            AgentKind::Claude => nonblank(&self.claude_code_executable_path),
            AgentKind::Codex => nonblank(&self.codex_executable_path),
            AgentKind::Opencode => nonblank(&self.opencode_executable_path),
            _ => None,
        };
        PathBuf::from(configured.unwrap_or(agent.as_str()))
    }

    /// `ssh_key_path` when set: the key used for cloud workspace access.
    pub fn ssh_key(&self) -> Option<PathBuf> {
        nonblank(&self.ssh_key_path).map(PathBuf::from)
    }

    /// The model a session of `purpose` starts with.
    pub fn model_for(&self, purpose: Purpose) -> &str {
        match purpose {
            Purpose::Chat => &self.models.default,
            Purpose::Review => nonblank(&self.models.review).unwrap_or(&self.models.default),
        }
    }

    pub fn fast_mode_for(&self, purpose: Purpose) -> bool {
        match purpose {
            Purpose::Chat => self.models.default_fast_mode,
            Purpose::Review => self
                .models
                .review_fast_mode
                .unwrap_or(self.models.default_fast_mode),
        }
    }

    /// The answer to every Codex approval request when the user chose
    /// "always approve" (Conductor answers `always_allow` for Codex
    /// sessions), else `None`: ask the user.
    pub fn codex_auto_approval(&self) -> Option<ApprovalDecision> {
        match self.models.codex.tool_approval_policy {
            CodexToolApprovalPolicy::AlwaysApprove => Some(ApprovalDecision::Accept),
            CodexToolApprovalPolicy::Default => None,
        }
    }
}

/// A Claude Code session in `cwd`, configured by `settings`.
///
/// Permission mode: plan for a new chat with "Default to plan mode" on;
/// otherwise `default` (Claude Code asks before tools) when "Claude Code
/// tool approvals" is on, `bypassPermissions` when it is off, as
/// Conductor's own Claude command (`claude --dangerously-skip-permissions`
/// unless approvals are required).
pub fn claude_launch(
    settings: &Settings,
    cwd: &Path,
    store: &dyn SecretStore,
    purpose: Purpose,
) -> Result<ClaudeLaunch, ProviderError> {
    let env = settings.provider_for(AgentKind::Claude).launch_env(store)?;
    let mut launch = ClaudeLaunch::new(cwd, env);
    launch.executable = settings.executable(AgentKind::Claude);
    let model = settings.model_for(purpose);
    if model_agent(model) == AgentKind::Claude {
        launch.model = Some(claude_cli_model(model));
    }
    launch.permission_mode = if purpose == Purpose::Chat && settings.models.default_plan_mode {
        PermissionMode::Plan
    } else if settings.tool_approvals_enabled {
        PermissionMode::Default
    } else {
        PermissionMode::BypassPermissions
    };
    let cc = &settings.models.claude_code;
    let effort = match purpose {
        Purpose::Chat => cc.default_effort_level,
        Purpose::Review => cc.review_effort_level.or(cc.default_effort_level),
    };
    launch.effort = effort.map(|e| e.as_str().to_string());
    let mut extra = serde_json::Map::new();
    if let (Purpose::Chat, Some(style)) = (purpose, cc.personality.output_style()) {
        extra.insert("outputStyle".into(), json!(style));
    }
    if settings.fast_mode_for(purpose) {
        extra.insert("fastMode".into(), json!(true));
    }
    if !extra.is_empty() {
        launch.settings = Some(serde_json::Value::Object(extra));
    }
    Ok(launch)
}

/// A `codex app-server` in `cwd`, configured by `settings`: model,
/// `model_reasoning_effort`, `personality` and the `fast` service tier as
/// `-c` overrides. Approval answers come from
/// [`Settings::codex_auto_approval`].
pub fn codex_launch(
    settings: &Settings,
    cwd: &Path,
    store: &dyn SecretStore,
    purpose: Purpose,
) -> Result<CodexLaunch, ProviderError> {
    let env = settings.provider_for(AgentKind::Codex).launch_env(store)?;
    let mut launch = CodexLaunch::new(cwd, env);
    launch.executable = settings.executable(AgentKind::Codex);
    let quoted = |v: &str| toml::Value::String(v.to_string()).to_string();
    let model = settings.model_for(purpose);
    if model_agent(model) == AgentKind::Codex {
        launch.config.push(("model".into(), quoted(model)));
    }
    let codex = &settings.models.codex;
    let level = match purpose {
        Purpose::Chat => codex.default_thinking_level,
        Purpose::Review => codex.review_thinking_level,
    };
    launch
        .config
        .push(("model_reasoning_effort".into(), quoted(level.codex_value())));
    if let Some(p) = codex.personality.and_then(|p| p.codex_value()) {
        launch.config.push(("personality".into(), quoted(p)));
    }
    if settings.fast_mode_for(purpose) {
        launch.config.push(("service_tier".into(), quoted("fast")));
    }
    Ok(launch)
}

/// The OpenCode ACP command: the configured executable and `acp`, as
/// Conductor starts it.
pub fn opencode_acp_command(settings: &Settings) -> (PathBuf, Vec<String>) {
    (
        settings.executable(AgentKind::Opencode),
        vec!["acp".to_string()],
    )
}
