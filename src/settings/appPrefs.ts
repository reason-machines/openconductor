// App preferences kept in conductor.db's `settings` table (src-tauri/src/app_prefs),
// not in settings.toml: Conductor registers these keys as non-file-backed. One shared
// store per window; every write goes through a typed `set_app_pref` update.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

/** Field names are the settings-table keys (see `AppPrefs` in app_prefs/mod.rs). */
export interface AppPrefs {
  garry_mode: boolean;
  experimental_show_agent_cost: boolean;
  experimental_tab_freak_mode: boolean;
  graphite_disabled: boolean;
  default_open_in: string | null;
  open_in_mru_order: string[];
  left_panel_visible: boolean;
  right_panel_visible: boolean;
  left_panel_width: number;
  onboarding_step: number;
  first_time_onboarding_step: number;
  last_clone_directory: string | null;
  last_seen_announcement: string | null;
  roundhouse_client_user_id: string | null;
  /** The sidebar's "Filter by project" repository id; null is all projects. */
  sidebar_repo_filter: string | null;
  /** Experimental "Dashboard": the sidebar's Dashboard row and the /dashboard board. */
  dashboard_enabled: boolean;
}

/** One typed write: `{ key: "garry_mode", value: true }`. */
export type AppPrefUpdate =
  | {
      key:
        | "garry_mode"
        | "experimental_show_agent_cost"
        | "experimental_tab_freak_mode"
        | "graphite_disabled"
        | "left_panel_visible"
        | "right_panel_visible"
        | "dashboard_enabled";
      value: boolean;
    }
  | { key: "left_panel_width" | "onboarding_step" | "first_time_onboarding_step"; value: number }
  | { key: "last_clone_directory" | "last_seen_announcement"; value: string }
  | { key: "roundhouse_client_user_id" | "sidebar_repo_filter"; value: string | null };

/** What the table reads as when it has no rows (Conductor's hook defaults). */
export const DEFAULT_APP_PREFS: AppPrefs = {
  garry_mode: false,
  experimental_show_agent_cost: false,
  experimental_tab_freak_mode: false,
  graphite_disabled: false,
  default_open_in: null,
  open_in_mru_order: [],
  left_panel_visible: true,
  right_panel_visible: true,
  left_panel_width: 256,
  onboarding_step: 0,
  first_time_onboarding_step: 1,
  last_clone_directory: null,
  last_seen_announcement: null,
  roundhouse_client_user_id: null,
  sidebar_repo_filter: null,
  dashboard_enabled: false,
};

/** The state an update leads to, for the optimistic copy and the browser fallback. */
export function applyUpdate(prefs: AppPrefs, u: AppPrefUpdate): AppPrefs {
  if (u.key === "left_panel_width") return { ...prefs, left_panel_width: Math.round(u.value) };
  return { ...prefs, [u.key]: u.value };
}

let current: AppPrefs = DEFAULT_APP_PREFS;
let loaded = false;
/** True once the database values (or, outside the desktop app, the defaults) are in. */
let ready = !isTauri();
const listeners = new Set<() => void>();

function publish(next: AppPrefs): void {
  current = next;
  for (const l of listeners) l();
}

/** Read every preference from the database once; later reads come from the store. */
export async function loadAppPrefs(): Promise<AppPrefs> {
  if (!isTauri()) return current;
  const prefs = await invoke<AppPrefs>("get_app_prefs");
  ready = true;
  publish(prefs);
  loaded = true;
  return current;
}

/** Write one preference. The store updates at once and settles on what the database holds. */
export async function setAppPref(update: AppPrefUpdate): Promise<AppPrefs> {
  publish(applyUpdate(current, update));
  if (!isTauri()) return current;
  try {
    publish(await invoke<AppPrefs>("set_app_pref", { update }));
  } catch (err) {
    await loadAppPrefs().catch(() => undefined);
    throw err;
  }
  return current;
}

/** "Open in <app>": makes it the default and moves it to the front of the MRU order. */
export async function recordOpenIn(appId: string, isRemote?: boolean): Promise<AppPrefs> {
  if (!isTauri()) return current;
  publish(await invoke<AppPrefs>("record_open_in", { appId, isRemote: isRemote ?? null }));
  return current;
}

export function getAppPrefs(): AppPrefs {
  return current;
}

/**
 * Whether the stored values have loaded. Like Conductor's `isSuccess` gate, a
 * screen that redirects on a preference waits for this rather than acting on
 * the defaults.
 */
export function appPrefsReady(): boolean {
  return ready;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (!loaded) {
    loaded = true;
    loadAppPrefs().catch((err) => console.warn("could not read app preferences", err));
  }
  return () => listeners.delete(l);
}

/** The current preferences; re-renders when any of them changes. */
export function useAppPrefs(): AppPrefs {
  return useSyncExternalStore(subscribe, getAppPrefs, getAppPrefs);
}

/** Conductor's sidebar drag range (`Zsa = 192`, `eoa = 480`). */
export const SIDEBAR_MIN_WIDTH = 192;
export const SIDEBAR_MAX_WIDTH = 480;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_APP_PREFS.left_panel_width;
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
}
