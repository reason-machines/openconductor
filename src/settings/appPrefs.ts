// App preferences kept in conductor.db's `settings` table (src-tauri/src/app_prefs),
// not in settings.toml: Conductor registers these keys as non-file-backed. One shared
// store per window; every write goes through a typed `set_app_pref` update.
import { persistenceOwner } from "../lib/persistence/restartPersistence.ts";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import type { SendKeyMode } from "../keybindings/registry.ts";
import { parseSidebarSort, type SidebarSort } from "../home/sidebarSort.ts";
import { parseSidebarGroupBy, type SidebarGroupBy } from "../home/sidebarGroupBy.ts";

/** Field names are the settings-table keys (see `AppPrefs` in app_prefs/mod.rs). */
export interface AppPrefs {
  garry_mode: boolean;
  experimental_show_agent_cost: boolean;
  experimental_tab_freak_mode: boolean;
  /** Create workspaces on the full-screen `/create` page instead of the dialog. */
  experimental_new_workspace_page: boolean;
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
  sidebar_sort_by: SidebarSort;
  sidebar_group_by: SidebarGroupBy;
  /** Experimental "Show sidebar resource usage"; off by default. */
  sidebar_resource_usage: boolean;
  /** Legacy "Send messages with" choice; the keybinding overrides hold the live keys. */
  message_send_key: SendKeyMode;
  /** Experimental "Dashboard": the sidebar's Dashboard row and the /dashboard board. */
  dashboard_enabled: boolean;
  /** "Use Claude Code with Chrome" (Settings › Agents › Claude Code): Claude Code chats start with `--chrome`. */
  chrome_mode_enabled: boolean;
}

/** One typed write: `{ key: "garry_mode", value: true }`. */
export type AppPrefUpdate =
  | {
      key:
        | "garry_mode"
        | "experimental_show_agent_cost"
        | "experimental_tab_freak_mode"
        | "experimental_new_workspace_page"
        | "graphite_disabled"
        | "left_panel_visible"
        | "right_panel_visible"
        | "sidebar_resource_usage"
        | "dashboard_enabled"
        | "chrome_mode_enabled";
      value: boolean;
    }
  | { key: "left_panel_width" | "onboarding_step" | "first_time_onboarding_step"; value: number }
  | { key: "last_clone_directory" | "last_seen_announcement"; value: string }
  | { key: "roundhouse_client_user_id" | "sidebar_repo_filter"; value: string | null }
  | { key: "message_send_key"; value: SendKeyMode }
  | { key: "sidebar_sort_by"; value: SidebarSort }
  | { key: "sidebar_group_by"; value: SidebarGroupBy };

/** What the table reads as when it has no rows (Conductor's hook defaults). */
export const DEFAULT_APP_PREFS: AppPrefs = {
  garry_mode: false,
  experimental_show_agent_cost: false,
  experimental_tab_freak_mode: false,
  experimental_new_workspace_page: false,
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
  sidebar_sort_by: "updated",
  sidebar_group_by: "repo",
  sidebar_resource_usage: false,
  message_send_key: "enter",
  dashboard_enabled: false,
  chrome_mode_enabled: false,
};

/** The state an update leads to, for the optimistic copy and the browser fallback. */
export function applyUpdate(prefs: AppPrefs, u: AppPrefUpdate): AppPrefs {
  if (u.key === "left_panel_width") return { ...prefs, left_panel_width: Math.round(u.value) };
  return { ...prefs, [u.key]: u.value };
}

function browserSidebarSort(): SidebarSort {
  try {
    return parseSidebarSort(localStorage.getItem("openconductor.sidebar_sort_by"));
  } catch {
    return "updated";
  }
}

function browserSidebarGroupBy(): SidebarGroupBy {
  try {
    return parseSidebarGroupBy(localStorage.getItem("openconductor.sidebar_group_by"));
  } catch {
    return "repo";
  }
}

function browserRepoFilter(): string | null {
  try {
    return localStorage.getItem("openconductor.sidebar_repo_filter") || null;
  } catch {
    return null;
  }
}

let current: AppPrefs = { ...DEFAULT_APP_PREFS, sidebar_sort_by: browserSidebarSort(), sidebar_group_by: browserSidebarGroupBy(), sidebar_repo_filter: browserRepoFilter() };
let loaded = false;
/** True once the database values (or, outside the desktop app, the defaults) are in. */
let ready = !isTauri();
const listeners = new Set<() => void>();

function publish(next: AppPrefs): void {
  current = next;
  for (const l of listeners) l();
}

let confirmed = current;
const pendingWrites = new Set<{ update: AppPrefUpdate }>();
let nativeOperations = Promise.resolve();
const preferenceWrites = persistenceOwner();

function enqueueNative<T>(operation: () => Promise<T>, key?: string): Promise<T> {
  const queued = () => nativeOperations.then(operation);
  const result = key === undefined ? queued() : preferenceWrites.run(queued, undefined, key);
  nativeOperations = result.then(() => undefined, () => undefined);
  return result;
}

function publishConfirmed(next: AppPrefs): AppPrefs {
  confirmed = next;
  for (const { update } of pendingWrites) next = applyUpdate(next, update);
  publish(next);
  return current;
}

/** Read every preference from the database once; later reads come from the store. */
export async function loadAppPrefs(): Promise<AppPrefs> {
  if (!isTauri()) return current;
  return enqueueNative(async () => {
    const prefs = await invoke<AppPrefs>("get_app_prefs");
    ready = true;
    loaded = true;
    return publishConfirmed(prefs);
  });
}

/** Write one preference. The store updates at once and settles on what the database holds. */
export async function setAppPref(update: AppPrefUpdate): Promise<AppPrefs> {
  if (!isTauri()) {
    publish(applyUpdate(current, update));
    if (update.key === "sidebar_sort_by" || update.key === "sidebar_group_by" || update.key === "sidebar_repo_filter") {
      try {
        if (update.value === null) localStorage.removeItem(`openconductor.${update.key}`);
        else localStorage.setItem(`openconductor.${update.key}`, update.value);
      } catch { /* Session-only when storage is unavailable. */ }
    }
    return current;
  }
  const pending = { update };
  pendingWrites.add(pending);
  publish(applyUpdate(current, update));
  return enqueueNative(async () => {
    try {
      const prefs = await invoke<AppPrefs>("set_app_pref", { update });
      pendingWrites.delete(pending);
      return publishConfirmed(prefs);
    } catch (err) {
      pendingWrites.delete(pending);
      const prefs = await invoke<AppPrefs>("get_app_prefs").catch(() => confirmed);
      publishConfirmed(prefs);
      throw err;
    }
  }, update.key);
}

/** "Open in <app>": makes it the default and moves it to the front of the MRU order. */
export async function recordOpenIn(appId: string, isRemote?: boolean): Promise<AppPrefs> {
  if (!isTauri()) return current;
  return enqueueNative(async () => publishConfirmed(
    await invoke<AppPrefs>("record_open_in", { appId, isRemote: isRemote ?? null }),
  ), "openIn");
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
/** The rail's double-click target and the unset setting's value (`mBe = 256`, `yta = 256`). */
export const SIDEBAR_DEFAULT_WIDTH = DEFAULT_APP_PREFS.left_panel_width;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_APP_PREFS.left_panel_width;
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
}
