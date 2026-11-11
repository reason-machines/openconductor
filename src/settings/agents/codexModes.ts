// Pure rules behind Settings › Agents › Codex (CodexTab.tsx): which
// Authentication card a settings file stands for, what switching cards
// writes, and the status line for each card.
//
// Storage (Sven's decision for the redesigned page):
//   ChatGPT  top-level `codex_provider = "chatgpt_sign_in"`, no [providers.codex]
//   CLI      `codex_provider` unset or "default"; [providers.codex] kind codex_login or none
//   API key  [providers.codex] kind openai_api (Conductor's `codex_provider = "custom"` reads as it too)
import type { AuthState, InfoRow } from "./agentAuth";
import type { ProviderConfig, Settings } from "../types";

export type CodexMode = "chatgpt" | "cli" | "apikey";

export const CODEX_MODES: readonly { id: CodexMode; label: string; recommended?: boolean }[] = [
  { id: "chatgpt", label: "ChatGPT", recommended: true },
  { id: "cli", label: "CLI" },
  { id: "apikey", label: "API key" },
];

export const CHATGPT_SIGN_IN = "chatgpt_sign_in";
export const MANAGE_USAGE_URL = "https://chatgpt.com/codex/settings/usage";
export const OPENAI_KEY = "openai_api_key";

/** `invoke("codex_account")`: the Codex CLI's own account (`account/read`). */
export interface CodexAccount {
  kind?: string;
  email?: string;
  planType?: string;
  workspaceName?: string;
  requiresOpenaiAuth: boolean;
}

/** The end of a ChatGPT sign-in (`codex-login-event`). */
export interface CodexLoginEvent {
  loginId: string;
  status: "success" | "failed" | "cancelled" | "timedOut";
  account?: CodexAccount;
  error?: string;
}

export function codexModeOf(settings: Settings): CodexMode {
  const p = settings.providers.codex;
  if (p) return p.kind === "openai_api" ? "apikey" : "cli";
  const top = settings.codex_provider?.trim();
  if (top === CHATGPT_SIGN_IN) return "chatgpt";
  return top === "custom" ? "apikey" : "cli";
}

/** Settings with `codex_provider` set (or cleared) and no [providers.codex]. */
export function withCodexProvider(settings: Settings, value: string | null): Settings {
  const { codex: _, ...providers } = settings.providers;
  return { ...settings, codex_provider: value, providers };
}

export type SwitchStep = { op: "disconnect" } | { op: "save"; settings: Settings } | { op: "connect"; config: ProviderConfig };

/** What a card click writes, in order. `connect`/`disconnect` write the file themselves. */
export function switchSteps(settings: Settings, to: CodexMode): SwitchStep[] {
  const stored = settings.providers.codex ?? null;
  const top = settings.codex_provider?.trim();
  if (to === "chatgpt") {
    const steps: SwitchStep[] = stored || top ? [{ op: "disconnect" }] : [];
    return [...steps, { op: "save", settings: withCodexProvider(settings, CHATGPT_SIGN_IN) }];
  }
  const clear: SwitchStep[] = top && top !== "default" ? [{ op: "save", settings: withCodexProvider(settings, null) }] : [];
  const config: ProviderConfig = to === "cli" ? { kind: "codex_login" } : stored?.kind === "openai_api" ? stored : { kind: "openai_api" };
  return [...clear, { op: "connect", config }];
}

/**
 * The ChatGPT card's status line and table (the CLI and API key cards use agentAuth's codexAuthState).
 * The table holds the account's email only: Conductor's `[{ label: "ChatGPT account", value: email }]`
 * (renderApp-D_fmY7hW.js, offset 10581008), with no plan or workspace row.
 */
export function chatgptStatus(account: CodexAccount | null): AuthState {
  const rows: InfoRow[] = [];
  const on = account?.kind === "chatgpt";
  if (on && account.email) rows.push({ label: "ChatGPT account", value: account.email });
  return { authenticated: on, rows, notConnectedMessage: "Not signed in with ChatGPT" };
}

/** What a sign-in's end means for the page: the account, or an error to show (null when cancelled). */
export function loginResult(e: CodexLoginEvent): { account: CodexAccount } | { error: string | null } {
  if (e.status === "success" && e.account) return { account: e.account };
  if (e.status === "cancelled") return { error: null };
  if (e.status === "timedOut") return { error: "The ChatGPT sign-in timed out. Try again." };
  return { error: e.error ? `ChatGPT sign-in failed: ${e.error}` : "ChatGPT sign-in failed." };
}
