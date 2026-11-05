// Palette result model: tabs, placeholders and grouped, ranked results.
// Tab order, placeholders, group order, recents-on-empty-query and the
// 50-result cap follow evidence/search-palette/README.md.

import { filterScore, tokensMatch } from "./score.ts";

export type PaletteTab = "all" | "workspaces" | "projects" | "actions" | "settings";
export type ActionGroupId = "workspace-actions" | "actions" | "navigation" | "settings" | "open-in";

export const TABS: readonly { value: PaletteTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "workspaces", label: "Workspaces" },
  { value: "projects", label: "Projects" },
  { value: "actions", label: "Actions" },
  { value: "settings", label: "Settings" },
];

export const ACTION_GROUP_ORDER: readonly ActionGroupId[] = ["workspace-actions", "actions", "navigation", "settings", "open-in"];
const ACTION_GROUP_HEADING: Record<ActionGroupId, string> = {
  "workspace-actions": "Workspace actions",
  actions: "Actions",
  navigation: "Navigation",
  settings: "Settings",
  "open-in": "Open in",
};

export const RESULT_CAP = 50;

const PLACEHOLDER: Record<PaletteTab, string> = {
  all: "Type a command or search...",
  workspaces: "Search workspaces...",
  projects: "Search projects...",
  actions: "Search actions...",
  settings: "Search settings...",
};

export function placeholderFor(tab: PaletteTab): string {
  return PLACEHOLDER[tab];
}

export function visibleTabs(showProjects: boolean): PaletteTab[] {
  return TABS.map((t) => t.value).filter((t) => t !== "projects" || showProjects);
}

/** Next (+1) or previous (-1) tab, wrapping and skipping hidden Projects. */
export function cycleTab(current: PaletteTab, dir: 1 | -1, showProjects: boolean): PaletteTab {
  const tabs = visibleTabs(showProjects);
  const i = Math.max(0, tabs.indexOf(current));
  return tabs[(i + dir + tabs.length) % tabs.length];
}

export interface WorkspaceEntry {
  id: string;
  name: string;
  branch: string;
  repoName: string;
  /** Last activity, ms since epoch; newest first. */
  lastActiveAt: number;
  archived?: boolean;
}

export interface ProjectEntry {
  id: string;
  name: string;
}

export interface ActionEntry {
  id: string;
  title: string;
  group: ActionGroupId;
  keywords?: readonly string[];
  /** Binding id whose chord is shown beside the item. */
  bindingId?: string;
}

export interface SettingEntry {
  id: string;
  title: string;
  section: string;
  keywords?: readonly string[];
}

export type ResultItem =
  | { kind: "workspace"; id: string; workspace: WorkspaceEntry }
  | { kind: "project"; id: string; project: ProjectEntry }
  | { kind: "action"; id: string; action: ActionEntry }
  | { kind: "setting"; id: string; setting: SettingEntry };

export interface ResultGroup {
  id: string;
  heading: string;
  items: ResultItem[];
}

export interface PaletteData {
  workspaces: readonly WorkspaceEntry[];
  projects: readonly ProjectEntry[];
  actions: readonly ActionEntry[];
  settings: readonly SettingEntry[];
  /** Most recent first. */
  recentWorkspaceIds: readonly string[];
  /** Workspace actions only show while a workspace is open. */
  activeWorkspaceId: string | null;
}

const byRecency = (a: WorkspaceEntry, b: WorkspaceEntry) => b.lastActiveAt - a.lastActiveAt;

function workspaceResults(data: PaletteData, query: string): ResultItem[] {
  const q = query.trim();
  return data.workspaces
    .filter((w) => !w.archived && (q === "" || tokensMatch(q, [w.name, w.branch, w.repoName])))
    .sort(byRecency)
    .slice(0, RESULT_CAP)
    .map((w) => ({ kind: "workspace", id: `workspace:${w.id}`, workspace: w }));
}

function projectResults(data: PaletteData, query: string): ResultItem[] {
  const q = query.trim();
  return data.projects
    .filter((p) => q === "" || tokensMatch(q, [p.name]))
    .slice(0, RESULT_CAP)
    .map((p) => ({ kind: "project", id: `project:${p.id}`, project: p }));
}

function ranked<T>(entries: readonly T[], query: string, text: (e: T) => string, keywords: (e: T) => readonly string[]): T[] {
  if (query.trim() === "") return [...entries];
  return entries
    .map((e, i) => ({ e, i, s: filterScore(text(e), query.trim(), keywords(e)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
}

function actionGroups(data: PaletteData, query: string): ResultGroup[] {
  const hits = ranked(data.actions, query, (a) => a.title, (a) => a.keywords ?? []);
  return ACTION_GROUP_ORDER.filter((g) => g !== "workspace-actions" || data.activeWorkspaceId !== null)
    .map((g) => ({
      id: g,
      heading: ACTION_GROUP_HEADING[g],
      items: hits.filter((a) => a.group === g).map((a): ResultItem => ({ kind: "action", id: `action:${a.id}`, action: a })),
    }))
    .filter((g) => g.items.length > 0);
}

function settingResults(data: PaletteData, query: string): ResultItem[] {
  return ranked(data.settings, query, (s) => s.title, (s) => [s.section, ...(s.keywords ?? [])])
    .slice(0, RESULT_CAP)
    .map((s) => ({ kind: "setting", id: `setting:${s.id}`, setting: s }));
}

function group(id: string, heading: string, items: ResultItem[]): ResultGroup[] {
  return items.length > 0 ? [{ id, heading, items }] : [];
}

/** Grouped results for a tab and query, in display order. */
export function buildResults(tab: PaletteTab, query: string, data: PaletteData): ResultGroup[] {
  const empty = query.trim() === "";
  switch (tab) {
    case "workspaces":
      return group("workspaces", "Workspaces", workspaceResults(data, query));
    case "projects":
      return group("projects", "Projects", projectResults(data, query));
    case "actions":
      return actionGroups(data, query);
    case "settings":
      return group("settings", "Settings", settingResults(data, query));
    case "all": {
      if (empty) {
        const byId = new Map(data.workspaces.map((w) => [w.id, w]));
        const recents = data.recentWorkspaceIds
          .map((id) => byId.get(id))
          .filter((w): w is WorkspaceEntry => w !== undefined && !w.archived)
          .map((w): ResultItem => ({ kind: "workspace", id: `workspace:${w.id}`, workspace: w }));
        return [...group("recent-workspaces", "Recent workspaces", recents), ...actionGroups(data, query)];
      }
      return [
        ...group("workspaces", "Workspaces", workspaceResults(data, query)),
        ...group("projects", "Projects", projectResults(data, query)),
        ...actionGroups(data, query),
        ...group("settings", "Settings", settingResults(data, query)),
      ];
    }
  }
}

/** Empty-state text when buildResults returns nothing. */
export function emptyText(tab: PaletteTab): string {
  return tab === "all" ? "No results found" : `No matching ${tab}`;
}
