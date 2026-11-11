// One boolean table pref (prefs.ts BOOL_PREFS) for a view: read when the view
// mounts and again whenever settings are saved elsewhere (SETTINGS_CHANGED).
import { useEffect, useState } from "react";
import { getSettings } from "./api";
import { SETTINGS_CHANGED } from "./appearance";
import { BOOL_PREFS, boolPref, type BoolPrefKey } from "./prefs";

export function useBoolPref(key: BoolPrefKey): boolean {
  return useBoolPrefState(key) ?? BOOL_PREFS[key].default;
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
