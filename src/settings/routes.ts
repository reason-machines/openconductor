// Conductor's settings route tree and the redirects it applies, so a start
// URL or an in-app link lands on the same page Conductor would show.
//
// Source: Conductor 0.87.6 `renderApp-D_fmY7hW.js` (TanStack routes under
// `path:"/settings"`, the `/settings` index redirect `nCa` and the tab-to-path
// map `Jse`), REA-extracted on sven m5 max; evidence/settings/NOTES.md,
// "Settings routes". OpenConductor has no Conductor account or cloud
// organization, so every route Conductor gates behind one resolves where
// Conductor sends a local user: /settings/user/general.

import type { SettingsPage } from "./pages.ts";

/**
 * Tabs of a repository's settings (`/settings/repos/$repoId/<section>`), Conductor's `BCe`, in
 * the order its nav lists them: `dti` keeps the repository-capable tabs of its page list
 * (Git under Personal, Environment under Agents & environment, then Scripts, Actions, Misc).
 * Opening a repository still lands on Environment (`oYe`).
 */
export const REPO_SECTIONS = ["git", "environment", "scripts", "actions", "misc"] as const;
export type RepoSection = (typeof REPO_SECTIONS)[number];

export const REPO_SECTION_LABELS: Record<RepoSection, string> = {
  environment: "Environment",
  git: "Git",
  scripts: "Scripts",
  actions: "Actions",
  misc: "Misc",
};

/** Where settings is open: a user page or one repository's section (Conductor's "workspace" scope). */
export type SettingsLocation =
  | { scope: "user"; page: SettingsPage }
  | { scope: "repo"; repoId: string; section: RepoSection };

export interface RouteContext {
  /** Repository ids in sidebar order. */
  repoIds: readonly string[];
  /** The repository of the last workspace viewed, which /settings/repos opens first. */
  lastRepoId?: string | null;
  /** User pages that exist here; anything else falls back to General. */
  userPages: readonly SettingsPage[];
}

const GENERAL: SettingsLocation = { scope: "user", page: "general" };

/**
 * Settings routes that need a Conductor cloud organization or account
 * (Conductor's `lW` and `Jna` gates). Each redirects to /settings/user/general
 * for a local user, which is every OpenConductor user.
 */
export const CLOUD_ONLY_ROUTES = [
  "/settings/cloud",
  "/settings/cloud/setup",
  "/settings/cloud/$cloudProjectId",
  "/settings/organization",
  "/settings/organization/github",
  "/settings/organization/members",
  "/settings/organization/preferences",
  "/settings/organization/computer",
  "/settings/organization/environment",
  "/settings/organization/mcp",
  "/settings/organization/mcp-servers",
  "/settings/organization/prompts",
  "/settings/organization/repositories/$owner/$repo",
  "/settings/organization/repositories/$owner/$repo/scripts",
  "/settings/organization/repositories/$owner/$repo/git",
] as const;

/** User tabs Conductor shows only with a cloud organization (Ports) or internal settings (Internal). */
export const GATED_USER_TABS = ["ports", "internal"] as const;

/**
 * Conductor's `Jse`: the `?tab=` values the /settings index accepts and the
 * path each one opens. Cloud and organization targets are gated as above.
 */
export const TAB_PATHS: Record<string, string> = {
  general: "/settings/user/general",
  account: "/settings/user/account",
  models: "/settings/user/models",
  appearance: "/settings/user/appearance",
  "key-bindings": "/settings/user/key-bindings",
  experimental: "/settings/user/experimental",
  advanced: "/settings/user/advanced",
  environment: "/settings/user/environment",
  git: "/settings/user/git",
  ports: "/settings/user/ports",
  terminal: "/settings/user/terminal",
  internal: "/settings/user/internal",
  providers: "/settings/user/providers",
  "setup-cloud": "/settings/cloud/setup",
  organization: "/settings/organization/github",
  "organization-preferences": "/settings/organization/preferences",
  "organization-members": "/settings/organization/members",
  "organization-computer": "/settings/organization/computer",
  "organization-environment": "/settings/organization/environment",
  "organization-mcp-servers": "/settings/organization/mcp",
  "organization-prompts": "/settings/organization/prompts",
};

/** Repo sections a user page also has (`environment`, `git`): with no repo they open the user page. */
const USER_CAPABLE_SECTIONS: readonly RepoSection[] = ["environment", "git"];

const isRepoSection = (s: string | null | undefined): s is RepoSection =>
  !!s && (REPO_SECTIONS as readonly string[]).includes(s);

type Params = Record<string, string>;

/** `params` of `pattern` (`$name` segments) when it matches `segments` exactly, else null. */
function match(pattern: string, segments: string[]): Params | null {
  const parts = pattern.split("/").filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params: Params = {};
  for (const [i, p] of parts.entries()) {
    if (p.startsWith("$")) params[p.slice(1)] = decodeURIComponent(segments[i]);
    else if (p !== segments[i]) return null;
  }
  return params;
}

function userPage(tab: string, ctx: RouteContext): SettingsLocation {
  if ((GATED_USER_TABS as readonly string[]).includes(tab)) return GENERAL;
  return (ctx.userPages as readonly string[]).includes(tab) ? { scope: "user", page: tab as SettingsPage } : GENERAL;
}

/** /settings/repos: the last-viewed repository, else the first one; none opens General. */
function reposIndex(ctx: RouteContext, section: string | null): SettingsLocation {
  const repoId = ctx.lastRepoId && ctx.repoIds.includes(ctx.lastRepoId) ? ctx.lastRepoId : ctx.repoIds[0];
  if (!repoId) return GENERAL;
  return { scope: "repo", repoId, section: isRepoSection(section) ? section : "environment" };
}

function repoLocation(repoId: string, section: RepoSection, ctx: RouteContext): SettingsLocation {
  return ctx.repoIds.includes(repoId) ? { scope: "repo", repoId, section } : reposIndex(ctx, section);
}

/** The /settings index redirect (`nCa`), driven by its search parameters. */
function settingsIndex(search: URLSearchParams, ctx: RouteContext): SettingsLocation {
  const tab = search.get("tab");
  const repoId = search.get("repoId");
  if (search.get("cloudProjectId")) return GENERAL;
  if (tab?.startsWith("repo-")) return repoLocation(tab.slice("repo-".length), "misc", ctx);
  if (isRepoSection(tab)) {
    if (repoId) return repoLocation(repoId, tab, ctx);
    if (!USER_CAPABLE_SECTIONS.includes(tab)) return reposIndex(ctx, tab);
  }
  if (!tab) return GENERAL;
  return resolvePath(TAB_PATHS[tab] ?? TAB_PATHS.general, new URLSearchParams(), ctx) ?? GENERAL;
}

type Resolver = (params: Params, search: URLSearchParams, ctx: RouteContext) => SettingsLocation;

/**
 * The route tree, first match wins. Conductor's per-tab user routes are one
 * `$tab` entry here; the gated cloud and organization routes all open General.
 */
export const SETTINGS_ROUTES: readonly (readonly [string, Resolver])[] = [
  ["/settings", (_, search, ctx) => settingsIndex(search, ctx)],
  ["/settings/user", () => GENERAL],
  ["/settings/user/$tab", ({ tab }, _, ctx) => userPage(tab, ctx)],
  ["/settings/repos", (_, search, ctx) => reposIndex(ctx, search.get("section"))],
  ["/settings/repos/$repoId", ({ repoId }, _, ctx) => repoLocation(repoId, "environment", ctx)],
  [
    "/settings/repos/$repoId/$section",
    ({ repoId, section }, _, ctx) => (isRepoSection(section) ? repoLocation(repoId, section, ctx) : GENERAL),
  ],
  ...CLOUD_ONLY_ROUTES.map((p) => [p, () => GENERAL] as const),
];

function resolvePath(pathname: string, search: URLSearchParams, ctx: RouteContext): SettingsLocation | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "settings") return null;
  for (const [pattern, resolve] of SETTINGS_ROUTES) {
    const params = match(pattern, segments);
    if (params) return resolve(params, search, ctx);
  }
  return GENERAL; // an unknown settings path still opens settings
}

/**
 * The settings location a URL asks for, after Conductor's redirects; `null`
 * when the URL is not under /settings.
 */
export function resolveSettingsUrl(pathname: string, search: string, ctx: RouteContext): SettingsLocation | null {
  return resolvePath(pathname, new URLSearchParams(search), ctx);
}

/** Search parameters the /settings routes read; dropped once the URL shows the resolved page. */
export const SETTINGS_SEARCH_PARAMS = ["tab", "repoId", "providerTab", "scrollTo", "cloudProjectId", "section"] as const;

/** `search` without the settings parameters, for the URL of a resolved page ("" or "?..."). */
export function keptSearch(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of SETTINGS_SEARCH_PARAMS) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** The canonical path of a location, as Conductor's router shows it. */
export function settingsPath(loc: SettingsLocation): string {
  return loc.scope === "user"
    ? `/settings/user/${loc.page}`
    : `/settings/repos/${encodeURIComponent(loc.repoId)}/${loc.section}`;
}

export const sameLocation = (a: SettingsLocation, b: SettingsLocation): boolean =>
  settingsPath(a) === settingsPath(b);
