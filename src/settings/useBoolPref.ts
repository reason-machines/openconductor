// One boolean table pref (prefs.ts BOOL_PREFS) for a view: read when the view
// mounts and again whenever settings are saved elsewhere (SETTINGS_CHANGED).
import { useCallback, useEffect, useState } from "react";
import { getSettings, updateSettings } from "./api";
import { SETTINGS_CHANGED } from "./appearance";
import { BOOL_PREFS, boolPref, withBoolPref, type BoolPrefKey } from "./prefs";

export function useBoolPref(key: BoolPrefKey): boolean {
  return useBoolPrefState(key) ?? BOOL_PREFS[key].default;
}

/**
 * Read a bool pref and return a stable [value, save] pair.
 * `save(v)` persists the new value to conductor.db and fires SETTINGS_CHANGED
 * so every other useBoolPref subscriber updates immediately.
 */
export function useBoolPrefWithSave(key: BoolPrefKey): [boolean, (value: boolean) => void] {
  const value = useBoolPref(key);
  const save = useCallback(
    (v: boolean) => {
      void getSettings()
        .then((s) => updateSettings(withBoolPref(s, key, v)))
        .then(() => window.dispatchEvent(new Event(SETTINGS_CHANGED)));
    },
    [key],
  );
  return [value, save];
}

export function useBoolPrefState(key: BoolPrefKey): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      getSettings().then(
        (s) => live && setValue(boolPref(s, key)),
        (err) => {
          if (live) setValue(BOOL_PREFS[key].default);
          console.warn(`Failed to read ${key}`, err);
        },
      );
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, [key]);
  return value;
}
