// IPC for Settings › Agents and Default models beyond settings.toml
// (src-tauri/src/agent_settings_commands.rs). Outside the desktop app the CLIs
// report as not installed and the loadout lives in localStorage.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";

export { openUrl as openExternal } from "../../backend";

/** An agent CLI's own login, as the "Authentication" status line shows it. */
export interface CliLoginStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  /** "Claude account", "ChatGPT login", "API key". */
  method?: string;
  email?: string;
  organization?: string;
}

export type CliAgent = "claude" | "codex" | "opencode";

export async function cliLoginStatus(agent: CliAgent): Promise<CliLoginStatus> {
  if (inTauri()) return invoke<CliLoginStatus>("cli_login_status", { agent });
  return { installed: false, authenticated: false };
}

/** A sign-in OpenConductor found for an agent (`agent_auth_sources`). Never carries a value. */
export interface AuthSource {
  id: string;
  label: string;
  plan: "subscription" | "api_key";
  location: string;
  /** A chat started now uses this one. */
  active: boolean;
  /** A login-shell key that "Import" copies into OpenConductor's Keychain. */
  importable: boolean;
  detail?: string;
}

export async function authSources(agent: "claude" | "codex"): Promise<AuthSource[]> {
  if (inTauri()) return invoke<AuthSource[]>("agent_auth_sources", { agent });
  return [];
}

/** Copies a login-shell key into the Keychain and switches the agent to it. */
export async function importAuthSource(agent: "claude" | "codex", sourceId: string): Promise<void> {
  await invoke("agent_auth_import", { agent, sourceId });
}

/** One `favorite_models` row: its id and configuration JSON without the id. */
export interface FavoriteRow {
  id: string;
  configuration: string;
}

const LS_FAVORITES = "openconductor.favorite-models.preview";

export async function listFavorites(): Promise<FavoriteRow[]> {
  if (inTauri()) return invoke<FavoriteRow[]>("favorite_models_list");
  const saved = localStorage.getItem(LS_FAVORITES);
  return saved ? (JSON.parse(saved) as FavoriteRow[]) : [];
}

export async function replaceFavorites(favorites: FavoriteRow[]): Promise<void> {
  if (inTauri()) return invoke<void>("favorite_models_replace", { favorites });
  localStorage.setItem(LS_FAVORITES, JSON.stringify(favorites));
}

/** The user's home folder, where the login terminal starts (Conductor's `Xj()`). */
export async function homeDir(): Promise<string> {
  if (!inTauri()) return "/";
  const { homeDir } = await import("@tauri-apps/api/path");
  return homeDir();
}
