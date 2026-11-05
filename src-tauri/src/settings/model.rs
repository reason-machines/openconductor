//! Typed user settings, persisted as TOML.
//!
//! Shape follows the reference app's user settings file (sections `[git]`,
//! `[models]`, `[models.codex]` with a `$schema` key, see
//! `evidence/runtime/README.md`) and the setting keys its frontend passes to
//! the backend (`evidence/ipc/frontend-invoke-candidates.json`:
//! `branch_prefix_type`, `branch_prefix_custom`, `default_model`,
//! `review_model`, `default_codex_thinking_level`,
//! `review_codex_thinking_level`, `default_thinking_enabled`,
//! `review_thinking_enabled`, `send_native_notification`,
//! `sound_type`). Value spellings are ours. Secrets never live here: provider
//! keys go to the Keychain through `agent::byok`.
//!
//! Every section keeps keys it does not know in `extra`, so a file written by
//! a newer build survives a round trip through an older one.

use serde::{Deserialize, Serialize};

use crate::agent::{AgentKind, ProviderConfig};

pub const SCHEMA_URL: &str = "https://openconductor.dev/schemas/settings.schema.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub general: General,
    pub appearance: Appearance,
    pub git: Git,
    pub models: Models,
    pub providers: Providers,
    #[serde(flatten)]
    pub extra: toml::Table,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            schema: SCHEMA_URL.to_string(),
            general: General::default(),
            appearance: Appearance::default(),
            git: Git::default(),
            models: Models::default(),
            providers: Providers::default(),
            extra: toml::Table::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SoundType {
    #[default]
    Default,
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct General {
    pub theme: Theme,
    pub send_native_notification: bool,
    pub sound_type: SoundType,
    #[serde(flatten)]
    pub extra: toml::Table,
}

impl Default for General {
    fn default() -> Self {
        General {
            theme: Theme::System,
            send_native_notification: true,
            sound_type: SoundType::Default,
            extra: toml::Table::new(),
        }
    }
}

/// Conductor's Appearance tab. Key names are Conductor's setting keys
/// (`evidence/settings/settings-registry.json`); Theme stays in `[general]`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Appearance {
    /// Interface zoom as a fraction: 1.0 is 100%. Conductor's steps are
    /// 50% to 300% in 10% steps ([`ZOOM_MIN`], [`ZOOM_MAX`]).
    pub zoom_level_v2: f64,
    /// Softer colors while the dark theme is in effect.
    pub low_contrast_dark_mode: bool,
    /// Font family for code and diffs; `None` keeps the built-in stack.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mono_font: Option<String>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

pub const ZOOM_MIN: f64 = 0.5;
pub const ZOOM_MAX: f64 = 3.0;

impl Default for Appearance {
    fn default() -> Self {
        Appearance {
            zoom_level_v2: 1.0,
            low_contrast_dark_mode: false,
            mono_font: None,
            extra: toml::Table::new(),
        }
    }
}

/// How new workspace branches are prefixed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BranchPrefixType {
    /// `<github-username>/<name>`.
    #[default]
    GithubUsername,
    /// `<branch_prefix_custom>/<name>`.
    Custom,
    /// `<name>`.
    None,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Git {
    pub branch_prefix_type: BranchPrefixType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch_prefix_custom: Option<String>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// Reasoning effort for Codex models (Codex CLI `model_reasoning_effort`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingLevel {
    Minimal,
    Low,
    #[default]
    Medium,
    High,
    Xhigh,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Models {
    /// Model for new chats.
    pub default: String,
    /// Model for code review; `None` means "same as default".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review: Option<String>,
    /// Extended thinking for Claude models in new chats / reviews.
    pub default_thinking_enabled: bool,
    pub review_thinking_enabled: bool,
    pub codex: CodexModels,
    #[serde(flatten)]
    pub extra: toml::Table,
}

pub const DEFAULT_MODEL: &str = "opus";

impl Default for Models {
    fn default() -> Self {
        Models {
            default: DEFAULT_MODEL.to_string(),
            review: None,
            default_thinking_enabled: true,
            review_thinking_enabled: true,
            codex: CodexModels::default(),
            extra: toml::Table::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CodexModels {
    pub default_thinking_level: ThinkingLevel,
    pub review_thinking_level: ThinkingLevel,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// The provider each agent uses: `[providers.claude]`, `[providers.codex]`,
/// ... with the [`ProviderConfig`] `kind` tag and its non-secret options. A
/// missing entry means the agent CLI's own login
/// ([`ProviderConfig::default_for`]).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Providers {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude: Option<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex: Option<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opencode: Option<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<ProviderConfig>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

impl Providers {
    pub fn get(&self, agent: AgentKind) -> Option<&ProviderConfig> {
        self.slot(agent).as_ref()
    }

    /// The configured provider, or the agent's own login.
    pub fn effective(&self, agent: AgentKind) -> ProviderConfig {
        self.get(agent)
            .cloned()
            .unwrap_or_else(|| ProviderConfig::default_for(agent))
    }

    pub fn set(&mut self, agent: AgentKind, config: Option<ProviderConfig>) {
        *self.slot_mut(agent) = config;
    }

    fn slot(&self, agent: AgentKind) -> &Option<ProviderConfig> {
        match agent {
            AgentKind::Claude => &self.claude,
            AgentKind::Codex => &self.codex,
            AgentKind::Cursor => &self.cursor,
            AgentKind::Opencode => &self.opencode,
            AgentKind::Reason => &self.reason,
        }
    }

    fn slot_mut(&mut self, agent: AgentKind) -> &mut Option<ProviderConfig> {
        match agent {
            AgentKind::Claude => &mut self.claude,
            AgentKind::Codex => &mut self.codex,
            AgentKind::Cursor => &mut self.cursor,
            AgentKind::Opencode => &mut self.opencode,
            AgentKind::Reason => &mut self.reason,
        }
    }
}
