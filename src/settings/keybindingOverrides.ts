// Keybinding overrides in the settings file. Conductor keeps them as a JSON
// string in its `settings` table under `keybinding_overrides_v1`
// (evidence/keybindings/README.md, "Overrides"); OpenConductor keeps the same
// string under the same key at the top level of its settings file, where the
// backend preserves keys it does not model.
import type { OverrideStorage } from "../keybindings/overrides.ts";
import type { Settings } from "./types.ts";

export const KEYBINDING_OVERRIDES_KEY = "keybinding_overrides_v1";

export function overridesRaw(settings: Settings): string | undefined {
  const raw = settings[KEYBINDING_OVERRIDES_KEY];
  return typeof raw === "string" ? raw : undefined;
}

export const withOverridesRaw = (settings: Settings, raw: string): Settings => ({ ...settings, [KEYBINDING_OVERRIDES_KEY]: raw });

/**
 * Override storage on top of the settings page's own state and save, so the
 * key-bindings page and the other pages write through one path and never
 * overwrite each other with a stale copy. `latest` is read at call time.
 */
export function settingsOverrideStorage(latest: () => Settings, save: (next: Settings) => Promise<boolean>): OverrideStorage {
  return {
    read: async () => overridesRaw(latest()),
    write: (raw) => save(withOverridesRaw(latest(), raw)),
  };
}
