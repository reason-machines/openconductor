import { useCallback, useEffect, useState } from "react";
import { errorText, getSettings, updateSettings } from "./api";
import { applyAppearance, DEFAULT_ZOOM, SETTINGS_CHANGED, withAppearance, zoomStep } from "./appearance";
import "./appearance.css";
import type { Settings } from "./types";

/**
 * Loads settings and saves each change at once. A change the backend refuses
 * is rolled back and its message kept in `error`. Theme and appearance are
 * applied to the document as soon as a change is made.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getSettings().then(setSettings, (e) => setError(errorText(e)));
  }, []);
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
        setError(null);
        return true;
      } catch (e) {
        setSettings(prev);
        if (prev) applyAppearance(prev);
        setError(errorText(e));
        return false;
      }
    },
    [settings],
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
    applyAppearance(stored);
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  });
  zoomQueue = run.catch(() => undefined);
  return run;
}
