// Settings page ids and grouping. Ids follow Conductor's routes
// (/settings/user/<id>, evidence/settings/NOTES.md); pages are listed here
// only once they are built.

export type SettingsPage = "general" | "appearance" | "models" | "git" | "key-bindings" | "providers" | "experimental" | "advanced" | "terminal";

export const SETTINGS_GROUPS: { title: string; pages: { id: SettingsPage; label: string }[] }[] = [
  {
    title: "Personal",
    pages: [
      { id: "general", label: "General" },
      { id: "appearance", label: "Appearance" },
      { id: "models", label: "Default models" },
      { id: "git", label: "Git" },
      // Conductor gates this page behind internal settings; here it is a normal page.
      { id: "key-bindings", label: "Keyboard shortcuts" },
    ],
  },
  { title: "Agents & environment", pages: [{ id: "providers", label: "Agents" }] },
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

/**
 * The settings page a start URL asks for: `/settings` means General, and
 * `/settings/user/<id>` a page that exists here; anything else opens no settings.
 */
export function pageFromPath(pathname: string): SettingsPage | null {
  const m = /^\/settings(?:\/user\/([a-z-]+))?\/?$/.exec(pathname);
  if (!m) return null;
  const id = m[1] ?? "general";
  return PAGES.some((p) => p.id === id) ? (id as SettingsPage) : "general";
}
