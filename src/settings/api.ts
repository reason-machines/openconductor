// Settings IPC client (src-tauri/src/settings/commands.rs). Outside Tauri
// (vite dev, previews) settings live in localStorage so the pages are usable
// without the app; provider keys are never stored there, so the preview
// reports providers as unavailable instead of pretending to hold a key.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import { DEFAULT_PROVIDER, DEFAULT_SETTINGS, type AgentKind, type ProviderConfig, type ProviderStatus, type SecretInput, type Settings } from "./types";

const LS_KEY = "openconductor.settings.preview";
export const PREVIEW_NO_KEYS = "Provider keys are stored only by the desktop app.";

export async function getSettings(): Promise<Settings> {
  if (inTauri()) return invoke<Settings>("get_settings");
  const saved = localStorage.getItem(LS_KEY);
  return saved ? { ...DEFAULT_SETTINGS, ...(JSON.parse(saved) as Settings) } : DEFAULT_SETTINGS;
}

/** Validates and saves; resolves to what was stored, rejects with the backend's message. */
export async function updateSettings(settings: Settings): Promise<Settings> {
  if (inTauri()) return invoke<Settings>("update_settings", { settings });
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
  return settings;
}

export async function providerStatus(agent: AgentKind): Promise<ProviderStatus> {
  if (inTauri()) return invoke<ProviderStatus>("provider_status", { agent });
  const kind = (await getSettings()).providers[agent]?.kind ?? DEFAULT_PROVIDER[agent];
  return { kind, agent, secrets: [], ready: false, problem: PREVIEW_NO_KEYS };
}

/** Saves `config` as the agent's provider and stores `secrets` in the Keychain. */
export async function connectProvider(agent: AgentKind, config: ProviderConfig, secrets: SecretInput[]): Promise<ProviderStatus> {
  if (inTauri()) return invoke<ProviderStatus>("connect_provider", { agent, config, secrets });
  throw new Error(PREVIEW_NO_KEYS);
}

/** Deletes the agent's keys and puts it back on its CLI's own login. */
export async function disconnectProvider(agent: AgentKind): Promise<ProviderStatus> {
  if (inTauri()) return invoke<ProviderStatus>("disconnect_provider", { agent });
  throw new Error(PREVIEW_NO_KEYS);
}

/** Tauri rejects with the command's error string; keep messages readable. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
