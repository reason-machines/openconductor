// User settings the PR control reads. Conductor keeps both outside
// settings.toml (non-file-backed keys); we keep them as top-level keys of
// our settings file, which the backend passes through untouched.
import type { Settings } from "../../settings/types.ts";

export interface PrSettings {
  /** "Automerge": offer automerge while checks are pending. */
  automerge: boolean;
  /** "Treat optional checks as blocking": hide Merge when any check failed. */
  optionalChecksBlock: boolean;
}

export const DEFAULT_PR_SETTINGS: PrSettings = { automerge: false, optionalChecksBlock: false };

/** The two keys, whether or not the Settings type declares them yet. */
type WithPrKeys = Settings & { automerge_enabled?: unknown; treat_optional_checks_as_blocking?: unknown };

export function prSettings(settings: WithPrKeys | null): PrSettings {
  if (!settings) return DEFAULT_PR_SETTINGS;
  return {
    automerge: settings.automerge_enabled === true,
    optionalChecksBlock: settings.treat_optional_checks_as_blocking === true,
  };
}
