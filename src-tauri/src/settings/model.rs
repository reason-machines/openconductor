//! Typed user settings, persisted as `settings.toml`.
//!
//! Shape follows the reference app's user settings file (sections `[git]`,
//! `[models]`, `[models.codex]` with a `$schema` key, see
//! `evidence/runtime/README.md`) and the setting keys its frontend passes to
//! the backend (`evidence/ipc/frontend-invoke-candidates.json`:
//! `branch_prefix_type`, `branch_prefix`, `default_model`,
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
    /// Conductor's top-level Claude provider: `custom` routes Claude Code
    /// through an Anthropic API key, anything else (`default`, the legacy
    /// `openai`, the removed `bedrock` and `vertex`) uses the CLI's own
    /// login. `[providers.claude]` outranks it in the same layer
    /// ([`Settings::provider_for`]).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_provider: Option<String>,
    /// Conductor's top-level Codex provider: `custom` (OpenAI API key),
    /// `chatgpt_sign_in` or `default` (both the CLI's own login).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex_provider: Option<String>,
    /// Settings › Agents "Claude Code executable path"; blank means the
    /// bundled copy in agent-binaries/ (crate::agent_launch).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_code_executable_path: Option<String>,
    /// Settings › Agents "Codex executable path"; blank means the bundled
    /// copy in agent-binaries/ (crate::agent_launch).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex_executable_path: Option<String>,
    /// Agents › Reason › "Reason executable path"; blank means `reason`
    /// found on `PATH`, `~/.local/bin` or Homebrew (the installer's).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_executable_path: Option<String>,
    /// Advanced › "SSH private key path" for cloud workspace access; blank
    /// means a generated key.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_key_path: Option<String>,
    /// Account › "Claude Code tool approvals": agents ask before running
    /// tools. Off by default, as in Conductor, so agents run without asking.
    pub tool_approvals_enabled: bool,
    /// The terminal panel's Open URLs; the first is the default. Conductor's
    /// `preview_urls` (setting key `open_url_template`).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub preview_urls: Vec<PreviewUrl>,
    /// dotenv files whose variables agents, terminals and scripts get.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub environment_variable_files: Vec<String>,
    pub general: General,
    pub appearance: Appearance,
    pub git: Git,
    pub models: Models,
    pub providers: Providers,
    pub advanced: Advanced,
    pub experimental: Experimental,
    pub terminal: Terminal,
    pub prompts: Prompts,
    pub reason: ReasonSettings,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// `[reason]`: what new Reason chats start with (Settings › Agents › Reason).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ReasonSettings {
    /// Workspace slug from `reason whoami` that new Reason chats open their
    /// Session in (`reason --workspace SLUG acp`); `None` follows the
    /// workspace selected in the Reason desktop app.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    /// Reason model id for new Reason chats (`byok:anthropic:claude-opus-5-5`,
    /// `default` for Auto); `None` uses `models.default` as Reason runs it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Reasoning effort for new Reason chats (`low` ... `max`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            schema: SCHEMA_URL.to_string(),
            claude_provider: None,
            codex_provider: None,
            claude_code_executable_path: None,
            codex_executable_path: None,
            reason_executable_path: None,
            ssh_key_path: None,
            tool_approvals_enabled: false,
            preview_urls: Vec::new(),
            environment_variable_files: Vec::new(),
            general: General::default(),
            appearance: Appearance::default(),
            git: Git::default(),
            models: Models::default(),
            providers: Providers::default(),
            advanced: Advanced::default(),
            experimental: Experimental::default(),
            terminal: Terminal::default(),
            prompts: Prompts::default(),
            reason: ReasonSettings::default(),
            extra: toml::Table::new(),
        }
    }
}

pub use oc_scripts::config::PreviewUrl;

/// Custom instructions per action, Conductor's `[prompts]` (setting keys
/// `custom_prompt_<name>`). Repository settings files override each one;
/// the effective value is resolved by `oc_scripts::config::load_effective`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Prompts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub general: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_review: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_pr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix_errors: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rename_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolve_merge_conflicts: Option<String>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// Conductor's Advanced tab (Settings › More › Advanced). Key names are
/// Conductor's setting keys.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Advanced {
    /// Approximate terminal output to keep, in bytes; `None` means
    /// Conductor's 10 MB. Any value is accepted here: the terminal clamps it
    /// to 1 MB to 1 GB when it reads it, as Conductor does.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_scrollback_limit_bytes: Option<u64>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// Conductor's Experimental tab (Settings › More › Experimental). Key names
/// are Conductor's setting keys.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Experimental {
    /// "Big terminal mode": ⌘⇧T opens a terminal running the Big terminal preset.
    pub experimental_big_terminal_mode: bool,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// Conductor's "Big terminal" settings tab (tab id `terminal`).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Terminal {
    /// A built-in preset (`claude`, `codex`, ...) or `custom:<id>`; `None`
    /// means Conductor's default, Claude. Unknown values are kept; the
    /// frontend reads them as Claude, as Conductor does.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub big_terminal_preset: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub big_terminal_custom_commands: Vec<BigTerminalCustomCommand>,
    #[serde(flatten)]
    pub extra: toml::Table,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BigTerminalCustomCommand {
    pub id: String,
    pub command: String,
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
    /// Terminal font family, put in front of the terminal's fallback stack;
    /// `None` keeps the stack. Conductor's `terminal_font_family`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_font_family: Option<String>,
    /// Terminal font size in px, [`TERMINAL_FONT_SIZE_MIN`] to
    /// [`TERMINAL_FONT_SIZE_MAX`] (Conductor's slider), 12 by default.
    pub terminal_font_size: u32,
    /// Font ligatures in diffs and code views; on by default. Conductor's
    /// `file_ligatures_enabled`.
    pub file_ligatures_enabled: bool,
    /// Palette for colour vision differences (diff additions/deletions).
    pub color_vision: ColorVision,
    /// Syntax colours for code and diffs; `default` keeps the built-in palette.
    pub code_theme: CodeTheme,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// Conductor's `color_vision` values (renderApp settings row, REA read of the
/// bundle): default, protanopia-deuteranopia, tritanopia.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ColorVision {
    #[default]
    Default,
    ProtanopiaDeuteranopia,
    Tritanopia,
}

/// Conductor's `code_theme` ids: `default` plus eight named themes, each
/// for one mode (Catppuccin Latte light, the rest dark).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CodeTheme {
    #[default]
    Default,
    CatppuccinLatte,
    CatppuccinMacchiato,
    CatppuccinMocha,
    Dracula,
    Nord,
    TokyoNight,
    GruvboxDark,
    SolarizedDark,
}

pub const ZOOM_MIN: f64 = 0.5;
pub const ZOOM_MAX: f64 = 3.0;
pub const TERMINAL_FONT_SIZE_MIN: u32 = 10;
pub const TERMINAL_FONT_SIZE_MAX: u32 = 20;

impl Default for Appearance {
    fn default() -> Self {
        Appearance {
            zoom_level_v2: 1.0,
            low_contrast_dark_mode: false,
            mono_font: None,
            terminal_font_family: None,
            terminal_font_size: 12,
            file_ligatures_enabled: true,
            color_vision: ColorVision::Default,
            code_theme: CodeTheme::Default,
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
    /// `<branch_prefix>/<name>`.
    Custom,
    /// `<name>`.
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, from = "GitFile")]
pub struct Git {
    pub branch_prefix_type: BranchPrefixType,
    /// Custom prefix, Conductor's `git.branch_prefix` (setting key
    /// `branch_prefix_custom`). Files written by earlier rebuilds name it
    /// `branch_prefix_custom`; that name is read when this one is absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch_prefix: Option<String>,
    /// Delete the local branch when a workspace is archived (Conductor default: off).
    pub delete_branch_on_archive: bool,
    /// Archive a local workspace after its PR is merged in the app (default: off).
    pub archive_on_merge: bool,
    /// Set `push.autoSetupRemote` in each new workspace's worktree config so
    /// a plain `git push` sets the upstream (Conductor default: on).
    pub worktree_push_auto_setup_remote: bool,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// [`Git`] as read from a file: also takes the old `branch_prefix_custom`.
#[derive(Deserialize, Default)]
#[serde(default)]
struct GitFile {
    #[serde(flatten)]
    git: GitFields,
    branch_prefix_custom: Option<String>,
}

#[derive(Deserialize)]
#[serde(default)]
struct GitFields {
    branch_prefix_type: BranchPrefixType,
    branch_prefix: Option<String>,
    delete_branch_on_archive: bool,
    archive_on_merge: bool,
    worktree_push_auto_setup_remote: bool,
    #[serde(flatten)]
    extra: toml::Table,
}

impl Default for GitFields {
    fn default() -> Self {
        let g = Git::default();
        Self {
            branch_prefix_type: g.branch_prefix_type,
            branch_prefix: g.branch_prefix,
            delete_branch_on_archive: g.delete_branch_on_archive,
            archive_on_merge: g.archive_on_merge,
            worktree_push_auto_setup_remote: g.worktree_push_auto_setup_remote,
            extra: g.extra,
        }
    }
}

impl From<GitFile> for Git {
    fn from(f: GitFile) -> Self {
        let g = f.git;
        Git {
            branch_prefix_type: g.branch_prefix_type,
            branch_prefix: g.branch_prefix.or(f.branch_prefix_custom),
            delete_branch_on_archive: g.delete_branch_on_archive,
            archive_on_merge: g.archive_on_merge,
            worktree_push_auto_setup_remote: g.worktree_push_auto_setup_remote,
            extra: g.extra,
        }
    }
}

impl Default for Git {
    fn default() -> Self {
        Self {
            branch_prefix_type: BranchPrefixType::default(),
            branch_prefix: None,
            delete_branch_on_archive: false,
            archive_on_merge: false,
            worktree_push_auto_setup_remote: true,
            extra: toml::Table::new(),
        }
    }
}

/// Reasoning effort for Codex models (Codex CLI `model_reasoning_effort`).
/// Conductor's levels are `none`, `low` to `xhigh`, `max` and `ultra`;
/// `minimal` is kept for files written by earlier OpenConductor builds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingLevel {
    None,
    Minimal,
    Low,
    #[default]
    Medium,
    High,
    Xhigh,
    Max,
    Ultra,
}

impl ThinkingLevel {
    /// The value Codex's `model_reasoning_effort` takes. Codex 0.156 tops
    /// out at `xhigh`, so `max` and `ultra` run as `xhigh`.
    pub fn codex_value(self) -> &'static str {
        match self {
            ThinkingLevel::None => "none",
            ThinkingLevel::Minimal => "minimal",
            ThinkingLevel::Low => "low",
            ThinkingLevel::Medium => "medium",
            ThinkingLevel::High => "high",
            ThinkingLevel::Xhigh | ThinkingLevel::Max | ThinkingLevel::Ultra => "xhigh",
        }
    }
}

/// Claude Code effort: Conductor's `low` to `max`, plus `ultracode`
/// ("Ultracode runs at extra-high effort with dynamic workflow orchestration").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffortLevel {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
    Ultracode,
}

impl EffortLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            EffortLevel::Low => "low",
            EffortLevel::Medium => "medium",
            EffortLevel::High => "high",
            EffortLevel::Xhigh => "xhigh",
            EffortLevel::Max => "max",
            EffortLevel::Ultracode => "ultracode",
        }
    }

    /// The `claude --effort` value: Conductor runs `ultracode` as `xhigh`
    /// (its sidecar's `ly7`); the orchestration half is `ultracode: true` in
    /// `--settings`, which `settings::launch::claude_launch` adds.
    pub fn cli_value(self) -> &'static str {
        match self {
            EffortLevel::Ultracode => "xhigh",
            other => other.as_str(),
        }
    }
}

/// Conductor's "Claude output style" (`models.claude_code.personality`):
/// one of Claude Code's built-in output styles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClaudePersonality {
    #[default]
    Default,
    Proactive,
    Concise,
    Explanatory,
    Learning,
}

impl ClaudePersonality {
    pub const ALL: [ClaudePersonality; 5] = [
        ClaudePersonality::Default,
        ClaudePersonality::Proactive,
        ClaudePersonality::Concise,
        ClaudePersonality::Explanatory,
        ClaudePersonality::Learning,
    ];

    /// The output style name Claude Code's `outputStyle` setting takes;
    /// `None` for the default style.
    pub fn output_style(self) -> Option<&'static str> {
        match self {
            ClaudePersonality::Default => None,
            ClaudePersonality::Proactive => Some("Proactive"),
            ClaudePersonality::Concise => Some("Concise"),
            ClaudePersonality::Explanatory => Some("Explanatory"),
            ClaudePersonality::Learning => Some("Learning"),
        }
    }
}

/// Conductor's "Codex personality" (`models.codex.personality`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodexPersonality {
    None,
    Friendly,
    Pragmatic,
}

impl CodexPersonality {
    /// Codex's `personality` config value. Codex 0.167's own `Personality`
    /// is `none | friendly | pragmatic`, so "None" is passed as `none` (no
    /// personality instructions), not left out.
    pub fn codex_value(self) -> &'static str {
        match self {
            CodexPersonality::None => "none",
            CodexPersonality::Friendly => "friendly",
            CodexPersonality::Pragmatic => "pragmatic",
        }
    }
}

/// Account › "Codex tool approvals" (`models.codex.tool_approval_policy`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodexToolApprovalPolicy {
    /// Codex's approval requests reach the user.
    #[default]
    Default,
    /// Every Codex approval request is accepted without asking.
    AlwaysApprove,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Models {
    /// Model for new chats.
    pub default: String,
    /// Runtime for new chats. Absent in legacy settings, whose chats used Reason.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_agent: Option<AgentKind>,
    /// False until the first successful connection or an explicit model choice.
    pub default_initialized: bool,
    /// Model for code review; `None` means "same as default".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review: Option<String>,
    /// Extended thinking for Claude models in new chats / reviews.
    pub default_thinking_enabled: bool,
    pub review_thinking_enabled: bool,
    /// Fast mode for new chats (Conductor default: off).
    pub default_fast_mode: bool,
    /// Fast mode for reviews; `None` means the same as new chats.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_fast_mode: Option<bool>,
    /// "Default to plan mode in new chats".
    pub default_plan_mode: bool,
    /// Extra models per provider shown in model pickers: Conductor's JSON
    /// string `{"pi": ["pi:<id>", ...], ...}`; the removed Cursor and
    /// OpenCode agents' lists are ignored. Kept as written;
    /// [`Models::visible_models`] parses it the way Conductor does.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible_provider_models: Option<String>,
    pub claude_code: ClaudeCodeModels,
    pub codex: CodexModels,
    #[serde(flatten)]
    pub extra: toml::Table,
}

pub const DEFAULT_MODEL: &str = "opus";

/// Providers `visible_provider_models` can list models for, in Conductor's order.
pub const VISIBLE_MODEL_PROVIDERS: [&str; 3] = ["claude", "codex", "pi"];

impl Models {
    /// `visible_provider_models` as provider -> model ids, without the
    /// `provider:` prefix, trimmed and deduplicated in order. Like
    /// Conductor, a value that is not a JSON object, an unknown provider or
    /// a non-string entry is ignored rather than an error.
    pub fn visible_models(&self) -> std::collections::BTreeMap<&'static str, Vec<String>> {
        let mut out: std::collections::BTreeMap<&'static str, Vec<String>> =
            VISIBLE_MODEL_PROVIDERS
                .iter()
                .map(|p| (*p, Vec::new()))
                .collect();
        let Some(text) = self.visible_provider_models.as_deref() else {
            return out;
        };
        let Ok(serde_json::Value::Object(map)) = serde_json::from_str(text) else {
            return out;
        };
        for provider in VISIBLE_MODEL_PROVIDERS {
            let Some(serde_json::Value::Array(items)) = map.get(provider) else {
                continue;
            };
            let list = out.entry(provider).or_default();
            for item in items.iter().filter_map(serde_json::Value::as_str) {
                let id = item
                    .strip_prefix(provider)
                    .and_then(|r| r.strip_prefix(':'))
                    .unwrap_or(item)
                    .trim();
                if !id.is_empty() && !list.iter().any(|m| m == id) {
                    list.push(id.to_string());
                }
            }
        }
        out
    }
}

impl Default for Models {
    fn default() -> Self {
        Models {
            default: DEFAULT_MODEL.to_string(),
            default_agent: None,
            default_initialized: false,
            review: None,
            default_thinking_enabled: true,
            review_thinking_enabled: true,
            default_fast_mode: false,
            review_fast_mode: None,
            default_plan_mode: false,
            visible_provider_models: None,
            claude_code: ClaudeCodeModels::default(),
            codex: CodexModels::default(),
            extra: toml::Table::new(),
        }
    }
}

/// `[models.claude_code]`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ClaudeCodeModels {
    /// `claude --effort` for new chats; `None` leaves Claude Code's default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_effort_level: Option<EffortLevel>,
    /// Effort for reviews; `None` means the same as new chats.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_effort_level: Option<EffortLevel>,
    /// Output style for new chats.
    pub personality: ClaudePersonality,
    #[serde(flatten)]
    pub extra: toml::Table,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CodexModels {
    pub default_thinking_level: ThinkingLevel,
    pub review_thinking_level: ThinkingLevel,
    /// `None` leaves Codex's own personality.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub personality: Option<CodexPersonality>,
    pub tool_approval_policy: CodexToolApprovalPolicy,
    #[serde(flatten)]
    pub extra: toml::Table,
}

/// The provider each agent uses: `[providers.claude]`, `[providers.codex]`,
/// ... with the [`ProviderConfig`] `kind` tag and its non-secret options. A
/// missing entry means the agent CLI's own login
/// ([`ProviderConfig::default_for`]), and so does an entry naming a removed
/// provider kind ([`ProviderConfig::deserialize_stored`]). Tables for the
/// removed Cursor and OpenCode agents stay in `extra`, unused.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Providers {
    #[serde(
        skip_serializing_if = "Option::is_none",
        deserialize_with = "ProviderConfig::deserialize_stored"
    )]
    pub claude: Option<ProviderConfig>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        deserialize_with = "ProviderConfig::deserialize_stored"
    )]
    pub codex: Option<ProviderConfig>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        deserialize_with = "ProviderConfig::deserialize_stored"
    )]
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
            AgentKind::Reason => &self.reason,
        }
    }

    fn slot_mut(&mut self, agent: AgentKind) -> &mut Option<ProviderConfig> {
        match agent {
            AgentKind::Claude => &mut self.claude,
            AgentKind::Codex => &mut self.codex,
            AgentKind::Reason => &mut self.reason,
        }
    }
}
