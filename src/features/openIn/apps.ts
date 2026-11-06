// "Open in": the apps the workspace header's Open button offers, and what
// it does with them. The list comes from the backend (src-tauri/src/open_in),
// which keeps Conductor's catalog and its "installed" check; the rules here are
// Conductor's `P9` / `bvs` (renderApp chunk, REA-extracted and read as data).
import { invoke, isTauri } from "@tauri-apps/api/core";

export type AppIconType = "folder" | "code" | "terminal";

export interface OpenInApp {
  id: string;
  name: string;
  iconType: AppIconType;
  /** The app's own icon as a data URL; null draws the glyph for `iconType`. */
  icon: string | null;
}

/** Number keys 1-9 pick menu rows while the menu is open (Conductor's `J7t`). */
export const NUMBERED_ROWS = 9;

/** Toast label for "Copy path" on a workspace (Conductor's `gvs("workspace")`). */
export const COPY_PATH_TOAST = "Copied workspace path to clipboard";

/**
 * The app the button opens: the saved default (`default_open_in`, the last app
 * used) when it is offered, else the first offered app.
 */
export function defaultAppId(apps: readonly OpenInApp[], saved: string | null): string | undefined {
  return saved !== null && apps.some((a) => a.id === saved) ? saved : apps[0]?.id;
}

/** The number shown on each app row, then on "Copy path"; rows past the ninth get none. */
export function rowNumbers(appCount: number): { apps: (number | undefined)[]; copyPath: number | undefined } {
  const n = (i: number) => (i < NUMBERED_ROWS ? i + 1 : undefined);
  return { apps: Array.from({ length: appCount }, (_, i) => n(i)), copyPath: n(appCount) };
}

/** Outside the desktop app (the browser preview) only the always-offered apps exist. */
const BROWSER_APPS: OpenInApp[] = [
  { id: "finder", name: "Finder", iconType: "folder", icon: null },
  { id: "terminal", name: "Terminal", iconType: "terminal", icon: null },
];

/** Conductor keeps the answer for an hour (`staleTime` of its connectedApps query). */
export const APPS_STALE_MS = 60 * 60 * 1000;

let cached: { at: number; apps: Promise<OpenInApp[]> } | null = null;

export function loadOpenInApps(now = Date.now()): Promise<OpenInApp[]> {
  if (cached && now - cached.at < APPS_STALE_MS) return cached.apps;
  const apps = isTauri() ? invoke<OpenInApp[]>("open_in_apps") : Promise.resolve(BROWSER_APPS);
  cached = { at: now, apps };
  apps.catch(() => {
    if (cached?.apps === apps) cached = null;
  });
  return apps;
}

export async function openInApp(appId: string, path: string): Promise<void> {
  if (!isTauri()) throw new Error("Opening apps needs the desktop app");
  await invoke("open_in_app", { appId, path });
}

export async function copyText(text: string): Promise<void> {
  if (isTauri()) await invoke("plugin:clipboard-manager|write_text", { text });
  else await navigator.clipboard.writeText(text);
}
