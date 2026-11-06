// Pure rules behind Settings › Agents, each mirroring Conductor 0.87.6's
// providers page (renderApp-D_fmY7hW.js; evidence/settings/NOTES.md,
// "Agents"): which Authentication card is selected, the status line text and
// its info table.
import type { ProviderConfig, ProviderKind, Settings } from "../types";
import type { CliLoginStatus } from "./api";

/** The Authentication cards (Conductor's `C0a`). */
export type AuthMode = "cli" | "apikey" | "chatgpt";

/** Conductor's card list for Claude Code and Codex without ChatGPT sign-in (`Pzi`). */
export const AUTH_MODES: readonly AuthMode[] = ["cli", "apikey"];

export const AUTH_MODE_LABEL: Record<AuthMode, string> = { cli: "CLI", apikey: "API key", chatgpt: "ChatGPT" };

/** Kinds the Claude Code "API key" card stands for (Conductor: `claude_provider = custom`). */
const CLAUDE_KEY_KINDS: readonly ProviderKind[] = ["anthropic_api"];
const CODEX_KEY_KINDS: readonly ProviderKind[] = ["openai_api"];

/** Conductor's `K = z ?? (x ? "apikey" : "cli")`: API key when a key-based provider is stored. */
export function authModeOf(agent: "claude" | "codex", config: ProviderConfig | null | undefined): AuthMode {
  const kinds = agent === "claude" ? CLAUDE_KEY_KINDS : CODEX_KEY_KINDS;
  return config && kinds.includes(config.kind) ? "apikey" : "cli";
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
export function claudeAuthState(mode: AuthMode, cli: CliLoginStatus | null, keyStored: boolean): AuthState {
  if (mode === "apikey") {
    const rows: InfoRow[] = [];
    if (cli?.version) rows.push({ label: "Version", value: cli.version });
    rows.push({ label: "Provider", value: "Anthropic API" }, { label: "Auth", value: "API key" });
    return { authenticated: keyStored, rows, notConnectedMessage: "No Anthropic API key configured" };
  }
  const rows: InfoRow[] = [];
  if (cli?.version) rows.push({ label: "Version", value: cli.version });
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
  return "openai_api_key";
}

export const providerOf = (settings: Settings, agent: "claude" | "codex" | "cursor" | "opencode") => settings.providers[agent] ?? null;
