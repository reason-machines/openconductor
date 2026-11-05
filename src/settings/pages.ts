// Settings page ids and grouping. Ids follow Conductor's routes
// (/settings/user/<id>, evidence/settings/NOTES.md); pages are listed here
// only once they are built.

export type SettingsPage = "general" | "appearance" | "models" | "git" | "key-bindings" | "providers" | "advanced";

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
  // Conductor's "More" group also holds Experimental, not built yet.
  { title: "More", pages: [{ id: "advanced", label: "Advanced" }] },
];

const PAGES = SETTINGS_GROUPS.flatMap((g) => g.pages);

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
