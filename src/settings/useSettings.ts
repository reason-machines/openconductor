import { useCallback, useEffect, useState } from "react";
import { errorText, getSettings, updateSettings } from "./api";
import type { Settings, Theme } from "./types";

/** Follows the saved theme; "system" defers to prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Loads settings and saves each change at once. A change the backend refuses
 * is rolled back and its message kept in `error`.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings, (e) => setError(errorText(e)));
  }, []);

  const save = useCallback(
    async (next: Settings) => {
      const prev = settings;
      setSettings(next);
      applyTheme(next.general.theme);
      try {
        const stored = await updateSettings(next);
        setSettings(stored);
        setError(null);
      } catch (e) {
        setSettings(prev);
        if (prev) applyTheme(prev.general.theme);
        setError(errorText(e));
      }
    },
    [settings],
  );

  return { settings, error, save };
}
