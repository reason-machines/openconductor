// Settings › Experimental › "Workspace status matrix" (`internal_workspace_status_matrix`):
// Home and the sidebar draw StatusMatrix instead of the row status icon when it is on.
// Conductor reads it with one shared query (`sde()`); here one store per window,
// read when the first row mounts (the settings view replaces the app, so closing
// it remounts the rows) and again whenever settings change.
import { useSyncExternalStore } from "react";
import { getSettings } from "./api";
import { SETTINGS_CHANGED } from "./appearance";
import { boolPref } from "./prefs";

let enabled = false;
const listeners = new Set<() => void>();

function load(): void {
  getSettings().then(
    (s) => {
      const next = boolPref(s, "internal_workspace_status_matrix");
      if (next === enabled) return;
      enabled = next;
      for (const l of listeners) l();
    },
    () => undefined,
  );
}

function subscribe(l: () => void): () => void {
  if (listeners.size === 0) {
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
  }
  listeners.add(l);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) window.removeEventListener(SETTINGS_CHANGED, load);
  };
}

const read = () => enabled;

/** True while the matrix-style status indicator is turned on. */
export function useStatusMatrix(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}
