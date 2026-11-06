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
  | "terminal"
  | "setup-cloud";

export interface SettingsGroup {
  title: string;
  /** A badge after the title (the Cloud group's "Legacy"). */
  badge?: string;
  pages: { id: SettingsPage; label: string }[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
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

/** Conductor's "Big terminal" tab, only while Big terminal mode is on. */
export const BIG_TERMINAL_PAGE: { id: SettingsPage; label: string } = { id: "terminal", label: "Big terminal" };

/**
 * The page list to show. Conductor's `dti` (renderApp-D_fmY7hW.js @11,263,400) appends the
 * Big terminal tab to the last group's tabs (More, after Advanced) when the mode is on.
 */
export function settingsGroups(bigTerminalEnabled: boolean, cloud = false): SettingsGroup[] {
  const groups = !bigTerminalEnabled
    ? SETTINGS_GROUPS
    : SETTINGS_GROUPS.map((g, i) => (i === SETTINGS_GROUPS.length - 1 ? { ...g, pages: [...g.pages, BIG_TERMINAL_PAGE] } : g));
  return cloud ? [...groups, CLOUD_GROUP] : groups;
}

/**
 * Conductor's `zWt`: the "Cloud" group, with a "Legacy" badge, listed last
 * in the nav (`I9a`) only for an account with cloud access (`F`: a personal
 * organization with the cloud entitlement). Its one tab, Cloud setup, is
 * /settings/cloud/setup, not a /settings/user tab. OpenConductor's cloud is
 * Reason: the group shows when the Reason CLI is signed in.
 */
export const CLOUD_GROUP: SettingsGroup = { title: "Cloud", badge: "Legacy", pages: [{ id: "setup-cloud", label: "Cloud setup" }] };

const PAGES = [...SETTINGS_GROUPS.flatMap((g) => g.pages), BIG_TERMINAL_PAGE];

export const pageLabel = (page: SettingsPage): string => [...PAGES, ...CLOUD_GROUP.pages].find((p) => p.id === page)?.label ?? "";

/** Every /settings/user/<id> page, for the router (Cloud setup has its own route). */
export const USER_PAGES: readonly SettingsPage[] = PAGES.map((p) => p.id);
