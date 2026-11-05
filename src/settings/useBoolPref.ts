// One of conductor.db's `settings` flags (./prefs.ts) for code outside the
// Settings pages. Reads Conductor's default until the stored value loads, and
// re-reads when settings change elsewhere in the app. Settings replaces the
// whole app view, so a component under it mounts again (and reads again) when
// Settings closes.
import { useEffect, useState } from "react";
import { getSettings } from "./api";
import { SETTINGS_CHANGED } from "./appearance";
import { BOOL_PREFS, boolPref, type BoolPrefKey } from "./prefs";

export function useBoolPref(key: BoolPrefKey): boolean {
  const [value, setValue] = useState<boolean>(BOOL_PREFS[key].default);
  useEffect(() => {
    let live = true;
    const load = () =>
      void getSettings().then(
        (s) => live && setValue(boolPref(s, key)),
        () => live && setValue(BOOL_PREFS[key].default),
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
