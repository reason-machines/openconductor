// parity:diff.appearance — wrap_lines settings DB bridge
//
// Conductor stores wrap_lines in the settings table, not in localStorage
// (`Te("wrap_lines",!0)` in index-BGEQ8YjU.js; evidence/diff/wrap-lines-
// and-range-comments.md). This module encapsulates the settings dependency so
// test fixtures can stub it as a single boundary without pulling in the full
// settings stack.
import { useSettings } from "../../settings/useSettings.ts";
import { boolPref, withBoolPref } from "../../settings/prefs.ts";

/** Default matches Conductor's registry: `Te("wrap_lines", !0)`. */
export const WRAP_LINES_DEFAULT = true;

/**
 * Reactive accessor for the `wrap_lines` settings-table key.
 *
 * Returns the current value (falling back to `true` while settings load)
 * and a save callback that writes to the settings DB. Stubs in test fixtures
 * replace the whole module to avoid pulling in the settings service stack.
 */
export function useWrapLinesPref(): { value: boolean; save: (v: boolean) => void } {
  const { settings, save } = useSettings();
  return {
    value: settings ? boolPref(settings, "wrap_lines") : WRAP_LINES_DEFAULT,
    save: (v: boolean) => {
      if (settings) void save(withBoolPref(settings, "wrap_lines", v));
    },
  };
}
