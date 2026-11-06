import { isTauri } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { appPrefsReady, setAppPref, useAppPrefs } from "../settings/appPrefs";

// Conductor keeps the Experimental "Dashboard" switch in conductor.db's
// settings table (`dashboard_enabled`, "true"/"false"; `mzt` / `eGt` in
// index-BGEQ8YjU.js). The desktop app does the same through the app
// preferences store. The browser build has no database, so it keeps the flag
// in localStorage under the same name.
const STORAGE_KEY = "openconductor.dashboard_enabled";
const listeners = new Set<() => void>();

function readLocal(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeLocal(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Turn the dashboard on or off (the Experimental row). */
export function setDashboardEnabled(on: boolean): void {
  if (isTauri()) {
    setAppPref({ key: "dashboard_enabled", value: on }).catch((err) => console.error("conductor.db: could not save dashboard_enabled", err));
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(on));
  } catch {
    /* storage unavailable: nothing to remember it in */
  }
  for (const l of listeners) l();
}

/** `{ enabled, ready }`: `ready` is false until the stored value has loaded. */
export function useDashboardEnabled(): { enabled: boolean; ready: boolean } {
  const prefs = useAppPrefs();
  const local = useSyncExternalStore(subscribeLocal, readLocal, readLocal);
  if (isTauri()) return { enabled: prefs.dashboard_enabled, ready: appPrefsReady() };
  return { enabled: local, ready: true };
}
