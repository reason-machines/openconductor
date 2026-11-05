// Shapes of the settings IPC (src-tauri/src/settings/commands.rs). Field
// names match the Rust serde names; unknown keys from newer builds ride along
// untouched because every section is spread, never rebuilt field by field.

export type Theme = "system" | "light" | "dark";
export type SoundType = "default" | "none";
export type BranchPrefixType = "github_username" | "custom" | "none";
export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

/** `agent::AgentKind`. */
export type AgentKind = "claude" | "codex" | "cursor" | "opencode" | "reason";
export const AGENTS: AgentKind[] = ["claude", "codex", "cursor", "opencode", "reason"];

/** `agent::ProviderConfig`, tagged by `kind`. Options are per kind. */
export type ProviderKind =
  | "claude_login"
  | "anthropic_api"
  | "bedrock"
  | "vertex"
  | "foundry"
  | "codex_login"
  | "openai_api"
  | "codex_gateway"
  | "cursor_api"
  | "opencode_login"
  | "reason_login";
export interface ProviderConfig {
  kind: ProviderKind;
  [option: string]: unknown;
}

/** The provider each agent uses when settings name none: its CLI's own login. */
export const DEFAULT_PROVIDER: Record<AgentKind, ProviderKind> = {
  claude: "claude_login",
  codex: "codex_login",
  cursor: "cursor_api",
  opencode: "opencode_login",
  reason: "reason_login",
};

export interface Settings {
  $schema: string;
  general: { theme: Theme; send_native_notification: boolean; sound_type: SoundType; [extra: string]: unknown };
  /** Conductor's Appearance keys; zoom is a fraction (1 = 100%). */
  appearance: {
    zoom_level_v2: number;
    low_contrast_dark_mode: boolean;
    mono_font?: string | null;
    terminal_font_family?: string | null;
    /** Whole px, 10 to 20; 12 by default. */
    terminal_font_size?: number;
    [extra: string]: unknown;
  };
  git: {
    branch_prefix_type: BranchPrefixType;
    branch_prefix_custom?: string | null;
    delete_branch_on_archive: boolean;
    archive_on_merge: boolean;
    worktree_push_auto_setup_remote: boolean;
    [extra: string]: unknown;
  };
  models: {
    default: string;
    review?: string | null;
    default_thinking_enabled: boolean;
    review_thinking_enabled: boolean;
    codex: { default_thinking_level: ThinkingLevel; review_thinking_level: ThinkingLevel; [extra: string]: unknown };
    [extra: string]: unknown;
  };
  providers: { [agent in AgentKind]?: ProviderConfig | null } & { [extra: string]: unknown };
  /** Conductor's Advanced keys; older builds may not send the section. */
  advanced?: {
    /** Approximate terminal output to keep, in bytes; absent means 10 MB. */
    terminal_scrollback_limit_bytes?: number | null;
    [extra: string]: unknown;
  };
  /** Conductor's Experimental keys. */
  experimental?: {
    /** "Big terminal mode": ⌘⇧T opens a terminal running the Big terminal preset. */
    experimental_big_terminal_mode?: boolean;
    [extra: string]: unknown;
  };
  /** Conductor's "Big terminal" settings tab (id `terminal`). */
  terminal?: {
    /** A built-in preset or `custom:<id>`; absent or unknown means Claude. */
    big_terminal_preset?: string | null;
    big_terminal_custom_commands?: { id: string; command: string }[];
    [extra: string]: unknown;
  };
  [extra: string]: unknown;
}

/** One secret for `connect_provider`. Write-only: the backend never returns values. */
export interface SecretInput {
  key: string;
  value: string;
}

/** `agent::byok::ProviderStatus`: whether each key is stored, never its value. */
export interface ProviderStatus {
  kind: ProviderKind;
  agent: AgentKind;
  secrets: { key: string; present: boolean }[];
  /** Options and keys are present and well formed; not that the backend accepts them. */
  ready: boolean;
  /** Why it is not ready, safe to display. */
  problem?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  $schema: "https://openconductor.dev/schemas/settings.schema.json",
  general: { theme: "system", send_native_notification: true, sound_type: "default" },
  appearance: { zoom_level_v2: 1, low_contrast_dark_mode: false, terminal_font_size: 12 },
  git: {
    branch_prefix_type: "github_username",
    delete_branch_on_archive: false,
    archive_on_merge: false,
    worktree_push_auto_setup_remote: true,
  },
  models: {
    default: "opus",
    default_thinking_enabled: true,
    review_thinking_enabled: true,
    codex: { default_thinking_level: "medium", review_thinking_level: "medium" },
  },
  providers: {},
};
