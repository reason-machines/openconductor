import { useCallback, useEffect, useState } from "react";
import { errorText, getSettings, updateSettings } from "./api";
import { applyAppearance, DEFAULT_ZOOM, SETTINGS_CHANGED, withAppearance, zoomStep } from "./appearance";
import { withField } from "./model";
import { resolveDark } from "./sidebarTransparency";
import "./appearance.css";
import type { Settings } from "./types";

// The settings last read or saved. Settings opens on them at once (no "Loading…"
// frame) and reads them again behind the page; App primes it at startup.
let lastSettings: Settings | null = null;
export function rememberSettings(s: Settings): Settings {
  lastSettings = s;
  return s;
}

/**
 * Loads settings and saves each change at once. A change the backend refuses
 * is rolled back and its message kept in `error`. Theme and appearance are
 * applied to the document as soon as a change is made.
 */
export function useSettings() {
  const [settings, setSettingsState] = useState<Settings | null>(() => lastSettings);
  const setSettings = useCallback((s: Settings | null) => {
    if (s) rememberSettings(s);
    setSettingsState(s);
  }, []);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getSettings().then(setSettings, (e) => setError(errorText(e)));
  }, [setSettings]);
  useEffect(reload, [reload]);
  // A save from outside this view (⌘+ / ⌘− zoom) would otherwise be overwritten by the next save here.
  useEffect(() => {
    window.addEventListener(SETTINGS_CHANGED, reload);
    return () => window.removeEventListener(SETTINGS_CHANGED, reload);
  }, [reload]);

  const save = useCallback(
    async (next: Settings): Promise<boolean> => {
      const prev = settings;
      setSettings(next);
      applyAppearance(next);
      try {
        const stored = await updateSettings(next);
        setSettings(stored);
        window.dispatchEvent(new Event(SETTINGS_CHANGED));
        setError(null);
        return true;
      } catch (e) {
        setSettings(prev);
        if (prev) applyAppearance(prev);
        setError(errorText(e));
        return false;
      }
    },
    [settings, setSettings],
  );

  return { settings, error, save, reload };
}

// Zoom changes run one after another, so held or quick repeated keys each move a step.
let zoomQueue: Promise<void> = Promise.resolve();

/** ⌘+ / ⌘− / ⌘0: one zoom step (or back to 100%), saved and applied app-wide. */
export function changeZoom(direction: "in" | "out" | "reset"): Promise<void> {
  const run = zoomQueue.then(async () => {
    const s = await getSettings();
    const zoom = direction === "reset" ? DEFAULT_ZOOM : zoomStep(s.appearance.zoom_level_v2, direction);
    if (zoom === s.appearance.zoom_level_v2) return;
    const stored = await updateSettings(withAppearance(s, "zoom_level_v2", zoom));
    applyAppearance(rememberSettings(stored));
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  });
  zoomQueue = run.catch(() => undefined);
  return run;
}

/**
 * ⌥⌘T and the palette's "Toggle theme": the opposite of the mode in effect, saved as an explicit
 * theme (Conductor's `i(n === "dark" ? "light" : "dark")`, renderApp @10,904,339).
 */
export async function toggleTheme(): Promise<void> {
  const s = await getSettings();
  const dark = resolveDark(s.general.theme === "system" ? undefined : s.general.theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const stored = await updateSettings(withField(s, "general", "theme", dark ? "light" : "dark"));
  applyAppearance(rememberSettings(stored));
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
}
