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
  | "setup-cloud"
  | OrgPage;

/**
 * Conductor's organization settings tabs (`UWt`, `HWt`, `VWt`, `WWt`, `GWt`,
 * renderApp-D_fmY7hW.js @10,190,501), each at /settings/organization/<path>.
 * OpenConductor's organization is the Reason workspace the `reason` CLI is
 * signed in to; the pages read and change it through `reason call`.
 */
export type OrgPage = "org-preferences" | "org-members" | "org-computer" | "org-environment" | "org-mcp" | "org-prompts";

/** Each organization page's route segment (`/settings/organization/<segment>`). */
export const ORG_PAGE_PATHS: Record<OrgPage, string> = {
  "org-preferences": "preferences",
  "org-members": "members",
  "org-computer": "computer",
  "org-environment": "environment",
  "org-mcp": "mcp",
  "org-prompts": "prompts",
};

export const ORG_PAGES = Object.keys(ORG_PAGE_PATHS) as OrgPage[];

export const isOrgPage = (page: string): page is OrgPage => (ORG_PAGES as string[]).includes(page);

export interface SettingsGroup {
  title: string;
  /** A badge after the title (the Cloud group's "Legacy"). */
  badge?: string;
  pages: { id: SettingsPage; label: string }[];
  /** Links after the pages that open in the browser (the Admin group's Billing). */
  links?: { label: string; href: string }[];
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

/** Where the Admin group's Billing goes: the Reason workspace's plan (Conductor's `mWt`, its billing page). */
export const BILLING_URL = "https://reasonmachines.com/customize";

/**
 * Conductor's navigation with a cloud organization active, as its frontend
 * renders it (REA capture of /settings/organization/members, tools/screens
 * "team" scenario): Personal (… Git, Ports), Agents & environment (Agents,
 * Prompts, Environment, MCP, Cloud computer), the organization's
 * repositories, Admin (Preferences, Members, Billing ↗), More. The local
 * Environment page gives way to the organization's, and Cloud setup is gone
 * (the organization already is a cloud one). OpenConductor has no Ports page
 * (Conductor's cloud port forwarding), so Personal ends at Git.
 */
export function orgSettingsGroups(bigTerminalEnabled: boolean): SettingsGroup[] {
  const local = settingsGroups(bigTerminalEnabled);
  const personal = local.find((g) => g.title === "Personal")!;
  const more = local.find((g) => g.title === "More")!;
  return [
    personal,
    {
      title: "Agents & environment",
      pages: [
        { id: "providers", label: "Agents" },
        { id: "org-prompts", label: "Prompts" },
        { id: "org-environment", label: "Environment" },
        { id: "org-mcp", label: "MCP" },
        { id: "org-computer", label: "Cloud computer" },
      ],
    },
    {
      title: "Admin",
      pages: [
        { id: "org-preferences", label: "Preferences" },
        { id: "org-members", label: "Members" },
      ],
      links: [{ label: "Billing", href: BILLING_URL }],
    },
    more,
  ];
}

const PAGES = [...SETTINGS_GROUPS.flatMap((g) => g.pages), BIG_TERMINAL_PAGE];

export const pageLabel = (page: SettingsPage): string =>
  [...PAGES, ...CLOUD_GROUP.pages, ...orgSettingsGroups(false).flatMap((g) => g.pages)].find((p) => p.id === page)?.label ?? "";

/** Every /settings/user/<id> page, for the router (Cloud setup has its own route). */
export const USER_PAGES: readonly SettingsPage[] = PAGES.map((p) => p.id);
