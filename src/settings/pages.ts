// User settings page ids and grouping. Ids follow Conductor's routes
// (/settings/user/<id>, evidence/settings/NOTES.md); routes.ts resolves URLs
// to them. Groups follow Conductor's navigation (`jWt`) for a local user:
// Ports needs a cloud organization and Internal an internal build, so
// neither is listed.

export type SettingsPage =
  | "general"
  | "account"
  | "appearance"
  | "models"
  | "git"
  | "key-bindings"
  | "providers"
  | "environment"
  | "experimental"
  | "advanced"
  | "terminal";

export const SETTINGS_GROUPS: { title: string; pages: { id: SettingsPage; label: string }[] }[] = [
  {
    title: "Personal",
    pages: [
      { id: "general", label: "General" },
      { id: "account", label: "Account" },
      { id: "appearance", label: "Appearance" },
      // Conductor inserts this after Appearance only with internal settings on; here it is a normal page.
      { id: "key-bindings", label: "Keyboard shortcuts" },
      { id: "models", label: "Default models" },
      { id: "git", label: "Git" },
    ],
  },
  {
    title: "Agents & environment",
    pages: [
      { id: "providers", label: "Agents" },
      { id: "environment", label: "Environment" },
    ],
  },
  {
    title: "More",
    pages: [
      { id: "experimental", label: "Experimental" },
      { id: "advanced", label: "Advanced" },
    ],
  },
];

/** Conductor's "Big terminal" tab: listed after every group, only while Big terminal mode is on. */
export const BIG_TERMINAL_PAGE: { id: SettingsPage; label: string } = { id: "terminal", label: "Big terminal" };

/** The page list to show; the Big terminal tab joins as its own untitled group when the mode is on. */
export function settingsGroups(bigTerminalEnabled: boolean): typeof SETTINGS_GROUPS {
  return bigTerminalEnabled ? [...SETTINGS_GROUPS, { title: "", pages: [BIG_TERMINAL_PAGE] }] : SETTINGS_GROUPS;
}

const PAGES = [...SETTINGS_GROUPS.flatMap((g) => g.pages), BIG_TERMINAL_PAGE];

export const pageLabel = (page: SettingsPage): string => PAGES.find((p) => p.id === page)?.label ?? "";

/** Every user page id, for the router. */
export const USER_PAGES: readonly SettingsPage[] = PAGES.map((p) => p.id);
