// Pure rules behind Settings › Agents, each mirroring Conductor 0.87.6's
// providers page (renderApp-D_fmY7hW.js; evidence/settings/NOTES.md,
// "Agents"): which Authentication card is selected, the status line text and
// its info table, and which tab the `providerTab` search parameter opens.
import type { ProviderConfig, ProviderKind, Settings } from "../types";
import type { CliLoginStatus } from "./api";
import type { AgentTabId } from "./icons";

/** The Authentication cards (Conductor's `C0a`). */
export type AuthMode = "cli" | "apikey" | "chatgpt";

/** Conductor's card list for Claude Code and Codex without ChatGPT sign-in (`Pzi`). */
export const AUTH_MODES: readonly AuthMode[] = ["cli", "apikey"];

export const AUTH_MODE_LABEL: Record<AuthMode, string> = { cli: "CLI", apikey: "API key", chatgpt: "ChatGPT" };

export const AGENT_TABS: readonly { id: AgentTabId; label: string }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "opencode", label: "OpenCode" },
];

/** Conductor's `$pa`: `codex`, `cursor` and the ACP agents open their tab; anything else opens Claude Code. */
export function providerTabFrom(value: string | null | undefined): AgentTabId {
  return value === "codex" || value === "cursor" || value === "opencode" ? value : "claude";
}

/** Kinds the Claude Code "API key" card stands for (Conductor: `claude_provider = custom`). */
const CLAUDE_KEY_KINDS: readonly ProviderKind[] = ["anthropic_api"];
const CODEX_KEY_KINDS: readonly ProviderKind[] = ["openai_api", "codex_gateway"];

/** Conductor's `K = z ?? (x ? "apikey" : "cli")`: API key when a key-based provider is stored. */
export function authModeOf(agent: "claude" | "codex", config: ProviderConfig | null | undefined): AuthMode {
  const kinds = agent === "claude" ? CLAUDE_KEY_KINDS : CODEX_KEY_KINDS;
  return config && kinds.includes(config.kind) ? "apikey" : "cli";
}

/**
 * Stored providers Conductor's page has no card for (Bedrock, Vertex,
 * Foundry): the page leaves them as they are and says so.
 */
export function otherProvider(agent: "claude" | "codex", config: ProviderConfig | null | undefined): ProviderKind | null {
  if (!config) return null;
  const shown: ProviderKind[] = agent === "claude" ? ["claude_login", "anthropic_api"] : ["codex_login", "openai_api", "codex_gateway"];
  return shown.includes(config.kind) ? null : config.kind;
}

export interface InfoRow {
  label: string;
  value: string;
}

/** What the status line shows: connected with an info table, or a red dot and why not. */
export interface AuthState {
  authenticated: boolean;
  rows: InfoRow[];
  notConnectedMessage: string;
}

/**
 * Claude Code's status (Conductor's `jpa` message and `Yki` rows: Version,
 * Provider, Login method or Auth, Organization, Email).
 */
export function claudeAuthState(mode: AuthMode, cli: CliLoginStatus | null, keyStored: boolean, setupToken = false): AuthState {
  if (mode === "apikey") {
    const rows: InfoRow[] = [];
    if (cli?.version) rows.push({ label: "Version", value: cli.version });
    rows.push({ label: "Provider", value: "Anthropic API" }, { label: "Auth", value: "API key" });
    return { authenticated: keyStored, rows, notConnectedMessage: "No Anthropic API key configured" };
  }
  const rows: InfoRow[] = [];
  if (cli?.version) rows.push({ label: "Version", value: cli.version });
  // A pasted setup token replaces the CLI's own login for chats.
  if (setupToken) return { authenticated: true, rows: [...rows, { label: "Login method", value: "Setup token" }], notConnectedMessage: "CLI not authenticated" };
  if (cli?.method) rows.push({ label: "Login method", value: cli.method });
  if (cli?.organization) rows.push({ label: "Organization", value: cli.organization });
  if (cli?.email) rows.push({ label: "Email", value: cli.email });
  return { authenticated: cli?.authenticated === true, rows, notConnectedMessage: "CLI not authenticated" };
}

/** Codex's status (Conductor's `Fpa` message and `Qki` rows: Provider, Auth, Account). */
export function codexAuthState(mode: AuthMode, cli: CliLoginStatus | null, keyStored: boolean): AuthState {
  if (mode === "apikey") {
    return {
      authenticated: keyStored,
      rows: [
        { label: "Provider", value: "OpenAI API" },
        { label: "Auth", value: "API key" },
      ],
      notConnectedMessage: "No OpenAI API key configured",
    };
  }
  const rows: InfoRow[] = [];
  if (cli?.method === "ChatGPT login") rows.push({ label: "Provider", value: "OpenAI" });
  else if (cli?.method === "API key") rows.push({ label: "Provider", value: "OpenAI API" });
  if (cli?.method) rows.push({ label: "Auth", value: cli.method });
  if (cli?.email) rows.push({ label: "Account", value: cli.email });
  return { authenticated: cli?.authenticated === true, rows, notConnectedMessage: "CLI not authenticated" };
}

/** The provider config a card click stores, keeping options of the same kind. */
export function configForMode(agent: "claude" | "codex", mode: AuthMode, stored: ProviderConfig | null | undefined): ProviderConfig {
  if (agent === "claude") {
    if (mode === "apikey") return stored?.kind === "anthropic_api" ? stored : { kind: "anthropic_api", auth: "api_key" };
    return { kind: "claude_login" };
  }
  if (mode === "apikey") return stored && CODEX_KEY_KINDS.includes(stored.kind) ? stored : { kind: "openai_api" };
  return { kind: "codex_login" };
}

/** The keychain key the API key field saves for this agent and config. */
export function apiKeyName(agent: "claude" | "codex" | "cursor", config: ProviderConfig | null | undefined): string {
  if (agent === "cursor") return "cursor_api_key";
  if (agent === "claude") return config?.kind === "anthropic_api" && config.auth === "auth_token" ? "anthropic_auth_token" : "anthropic_api_key";
  if (config?.kind === "codex_gateway") return config.gateway === "vercel_ai_gateway" ? "vercel_ai_gateway_api_key" : "openrouter_api_key";
  return "openai_api_key";
}

export const providerOf = (settings: Settings, agent: "claude" | "codex" | "cursor" | "opencode") => settings.providers[agent] ?? null;

/** Keychain key of a pasted `claude setup-token` (Conductor's legacy `claude_code_oauth_token`). */
export const SETUP_TOKEN_KEY = "claude_code_oauth_token";

/**
 * Cleans a pasted setup token the way Conductor does (`I7r`): takes the value
 * of an `export CLAUDE_CODE_OAUTH_TOKEN=...` line or a `Bearer` line, drops
 * quotes, a `Bearer` / `Authorization:` prefix and all whitespace. Mirrors
 * `normalize_setup_token` in src-tauri/src/agent/auth_sources.rs.
 */
export function normalizeSetupToken(pasted: string): string {
  const unbearer = (t: string) => t.replace(/^authorization\s*:\s*bearer\s+/i, "").replace(/^bearer\s+/i, "").trim();
  const unquote = (t: string) => {
    const v = t.trim();
    const q = v[0];
    return v.length >= 2 && (q === '"' || q === "'" || q === "`") && v.endsWith(q) ? v.slice(1, -1).trim() : v;
  };
  const lines = pasted.trim().split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const assigned = lines.find((l) => /^(?:export\s+)?CLAUDE_CODE_OAUTH_TOKEN\s*=/.test(l))?.match(/^(?:export\s+)?CLAUDE_CODE_OAUTH_TOKEN\s*=\s*(.+?);?$/);
  const bearer = lines.find((l) => /^(?:authorization\s*:\s*)?bearer\s+/i.test(l));
  const picked = assigned?.[1] ?? bearer ?? pasted;
  return unbearer(unquote(unbearer(picked))).replace(/\s+/g, "");
}
