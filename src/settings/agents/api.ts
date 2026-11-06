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

export type CliAgent = "claude" | "codex";

export async function cliLoginStatus(agent: CliAgent): Promise<CliLoginStatus> {
  if (inTauri()) return invoke<CliLoginStatus>("cli_login_status", { agent });
  return { installed: false, authenticated: false };
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
