//! Typed user settings, persisted as TOML.
//!
//! Shape follows the reference app's user settings file (sections `[git]`,
//! `[models]`, `[models.codex]` with a `$schema` key, see
//! `evidence/runtime/README.md`) and the setting keys its frontend passes to
//! the backend (`evidence/ipc/frontend-invoke-candidates.json`:
//! `branch_prefix_type`, `branch_prefix_custom`, `default_model`,
//! `review_model`, `default_codex_thinking_level`,
//! `review_codex_thinking_level`, `default_thinking_enabled`,
//! `review_thinking_enabled`, `claude_provider`, `send_native_notification`,
//! `sound_type`). Value spellings are ours. Secrets never live here: provider
//! keys go to the keychain (`super::secrets`).
//!
//! Every section keeps keys it does not know in `extra`, so a file written by
//! a newer build survives a round trip through an older one.

use serde::{Deserialize, Serialize};

pub const SCHEMA_URL: &str = "https://openconductor.dev/schemas/settings.schema.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub general: General,
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

/// Which backend Claude Code authenticates against.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClaudeProvider {
    /// The user's Claude subscription via the local `claude` login.
    #[default]
    Subscription,
    /// `ANTHROPIC_API_KEY` from the keychain.
    Anthropic,
    Bedrock,
    Vertex,
}

/// Non-secret provider options. Keys and tokens are in the keychain.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Providers {
    pub claude_provider: ClaudeProvider,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anthropic_base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bedrock_region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bedrock_profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertex_project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertex_region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openai_base_url: Option<String>,
    #[serde(flatten)]
    pub extra: toml::Table,
}
