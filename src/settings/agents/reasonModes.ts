// Settings › Agents › Reason, without React: which card is active, what the
// status line and table say, and how a card or option changes settings.toml.
// The CLI facts behind it: evidence/reason-acp/account.md.
// Pure: reasonModes.test.ts covers it.

import type { ProviderConfig, Settings } from "../types";
import type { InfoRow } from "./agentAuth";

/** The cards select a Reason browser account, existing CLI credentials, or an API key. */
export type ReasonMode = "account" | "cli" | "apikey";

export const REASON_MODES: readonly { id: ReasonMode; label: string; recommended?: boolean }[] = [
  { id: "account", label: "Reason account", recommended: true },
  { id: "cli", label: "CLI" },
  { id: "apikey", label: "API key" },
];

/** Keychain key of the Reason API key (`agent::secret::keys::REASON_API_KEY`). */
export const REASON_KEY = "reason_api_key";
export const REASON_KEYS_URL = "https://reasonmachines.com/settings/api-keys";

/** `reason status --json` as `reason_account_status` returns it. */
export interface ReasonAccount {
  version: string | null;
  name: string | null;
  email: string | null;
  /** `login`, or how a key signed in. */
  credential: string | null;
  error: string | null;
  organization: string | null;
  workspaces: { slug: string; name: string; selected: boolean; connected: boolean }[];
  computerConnected: boolean;
}

export function reasonModeOf(settings: Settings): ReasonMode {
  const p = settings.providers.reason;
  if (p?.kind === "reason_api") return "apikey";
  return p?.kind === "reason_login" && p.source === "cli" ? "cli" : "account";
}

export function reasonProviderFor(mode: ReasonMode): ProviderConfig {
  if (mode === "apikey") return { kind: "reason_api" };
  return mode === "cli" ? { kind: "reason_login", source: "cli" } : { kind: "reason_login" };
}

export const signedIn = (a: ReasonAccount | null): a is ReasonAccount => !!a && !a.error && !!(a.email?.trim() || a.name?.trim());

/** The workspace new chats open in: the pinned one, else the Reason app's selection. */
export function activeWorkspace(settings: Settings, account: ReasonAccount | null) {
  const pinned = settings.reason?.workspace ?? null;
  const all = account?.workspaces ?? [];
  return all.find((w) => w.slug === pinned) ?? all.find((w) => w.selected) ?? null;
}

export interface ReasonStatus {
  connected: boolean;
  rows: InfoRow[];
  notConnectedMessage: string;
}

const NOT_CONNECTED: Record<ReasonMode, string> = {
  account: "Not signed in. Sign in with your Reason account.",
  cli: "Not signed in. Sign in with your Reason account.",
  apikey: "No Reason API key. Add one below.",
};

/** The status line and table: Version, Account, Workspace, This Mac. */
export function reasonStatus(mode: ReasonMode, account: ReasonAccount | null, settings: Settings, keyPresent: boolean): ReasonStatus {
  const connected = signedIn(account) && (mode !== "apikey" || keyPresent);
  const rows: InfoRow[] = [];
  if (account?.version) rows.push({ label: "Version", value: account.version });
  if (connected) {
    rows.push({ label: "Account", value: account.email ?? account.name ?? "" });
    if (mode === "apikey") rows.push({ label: "Auth", value: "API key" });
    const ws = activeWorkspace(settings, account);
    rows.push({ label: "Workspace", value: ws?.name ?? account.organization ?? "Default" });
    rows.push({ label: "This Mac", value: account.computerConnected ? "Connected" : "Not connected" });
  }
  const notConnectedMessage = account?.error ?? (account === null && mode !== "apikey" ? "Reason is not installed or did not answer." : NOT_CONNECTED[mode]);
  return { connected, rows, notConnectedMessage };
}

/** settings with `[reason].<key>` set; empty unsets it. */
export function withReason(settings: Settings, key: "workspace" | "model" | "reasoning_effort", value: string): Settings {
  const reason = { ...(settings.reason ?? {}), [key]: value.trim() === "" ? null : value };
  return { ...settings, reason };
}

/** Reason's effort levels (`reason acp --reasoning-effort`), as the composer lists them. */
export const REASON_EFFORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "Model default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];
