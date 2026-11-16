// Palette result model: tabs, placeholders and grouped, ranked results.
// Tab order, placeholders, group order, recents-on-empty-query and the
// 50-result cap follow evidence/search-palette/README.md.

import { filterScore, tokensMatch } from "./score.ts";
import { matchesArchiveFilter, type ArchiveFilter } from "../../workspace/archivedList.ts";

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
  /** Recency rank; newest first (recently viewed workspaces sort above the rest). */
  lastActiveAt: number;
  /** Workspace update timestamp used by All-search buckets, separate from recent visits. */
  updatedAt?: number;
  archived?: boolean;
  /** `workspaces.number`, shown as `W-<n>` with "Show workspace numbers"; null before numbering. */
  number?: number | null;
  /** The sidebar's display name (Conductor's `$V`); the row shows it in the All tab. */
  label?: string;
  /** Last activity in ms since epoch, for the row's "17m" (Conductor's `BPt`). */
  activeAt?: number;
  /** Bold when a chat is unread (Conductor's `SUi` `font-semibold`). */
  unread?: boolean;
}

export interface ProjectEntry {
  id: string;
  name: string;
}

/** Leading icon of an action row (Conductor draws a Lucide icon before each item). */
export type PaletteIcon =
  | "plus"
  | "folder-plus"
  | "sun-moon"
  | "panel-left"
  | "panel-right"
  | "maximize"
  | "message"
  | "keyboard"
  | "book"
  | "chevron-right"
  | "settings"
  | "home"
  | "archive"
  | "file"
  | "link";

export interface ActionEntry {
  id: string;
  title: string;
  group: ActionGroupId;
  keywords?: readonly string[];
  /** Binding id whose chord is shown beside the item. */
  bindingId?: string;
  /** A fixed hint shown instead of a binding (Conductor writes "⌘," beside Settings). */
  hint?: string;
  icon?: PaletteIcon;
}

export interface SettingEntry {
  id: string;
  title: string;
  /** The page a row lives on; pages themselves have none. */
  section?: string;
  keywords?: readonly string[];
  /** A settings row (Conductor's `xUi`), listed only while there is a query; pages always are. */
  row?: boolean;
}

export type ResultItem =
  | { kind: "workspace"; id: string; workspace: WorkspaceEntry }
  | { kind: "project"; id: string; project: ProjectEntry }
  | { kind: "action"; id: string; action: ActionEntry }
  | { kind: "setting"; id: string; setting: SettingEntry };

export interface ResultGroup {
  id: string;
  /** Absent for the Projects tab's one group (Conductor's `heading: undefined`). */
  heading?: string;
  items: ResultItem[];
  /** Shown as a disabled row when the group has no items (the All tab's "No results found"). */
  emptyText?: string;
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
const byUpdatedAt = (a: WorkspaceEntry, b: WorkspaceEntry) => (b.updatedAt ?? b.lastActiveAt) - (a.updatedAt ?? a.lastActiveAt);

function workspaceResults(data: PaletteData, query: string, archiveFilter: ArchiveFilter = "active", order = byRecency): ResultItem[] {
  const q = query.trim();
  return data.workspaces
    .filter((w) => matchesArchiveFilter(!!w.archived, archiveFilter) && (q === "" || tokensMatch(q, [w.label ?? w.name, w.name, w.branch, w.repoName])))
    .sort(order)
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

/**
 * Words each command group answers to (Conductor's `ua` map in `m_a`, renderApp @10,896,700);
 * Open in adds the names of the apps it lists.
 */
const GROUP_WORDS: Record<ActionGroupId, string> = {
  "workspace-actions":
    "quick open file search find picker changes diff uncommitted all files tree checks ci notes scratchpad link issue linear pull request github archive copy url share move section organize",
  actions:
    "new workspace create toggle theme dark light left right sidebar panel zen mode focus distraction send feedback report submit prompt request feature idea show keyboard shortcuts keys hotkeys passport globe world cities visited check update updates version changelog release notes",
  navigation: "go to next unread attention chat session settings preferences config archive archived workspaces view show open docs documentation help guide history",
  settings: "settings preferences config chat appearance theme git env environment variables claude code account experimental advanced storage",
  "open-in": "open in",
};

/**
 * Group order for a query: groups whose words contain more of the query's words come
 * first, ties keep the fixed order (Conductor's `J1`, with `O_a` as the comparator).
 */
export function groupOrder(query: string, openInNames: readonly string[] = []): ActionGroupId[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...ACTION_GROUP_ORDER];
  const hay = (g: ActionGroupId) => (g === "open-in" ? `${openInNames.join(" ")} open in` : GROUP_WORDS[g]);
  return ACTION_GROUP_ORDER.map((g, index) => ({ g, index, n: words.filter((w) => hay(g).includes(w)).length }))
    .sort((a, b) => b.n - a.n || a.index - b.index)
    .map((x) => x.g);
}

/** The command groups each tab lists (Conductor's `$s`): Actions has no Navigation or Settings, Settings only Settings. */
function tabGroups(tab: PaletteTab, order: readonly ActionGroupId[]): ActionGroupId[] {
  if (tab === "actions") return order.filter((g) => g === "workspace-actions" || g === "actions" || g === "open-in");
  if (tab === "settings") return order.filter((g) => g === "settings");
  if (tab === "all") return [...order];
  return [];
}

/** Settings pages, and with a query their rows too (Conductor's `[...We, ...query ? He : []]`). */
function settingItems(data: PaletteData, query: string): ResultItem[] {
  const listed = query.trim() === "" ? data.settings.filter((s) => !s.row) : data.settings;
  return ranked(listed, query, (s) => s.title, (s) => [...(s.section ? [s.section] : []), ...(s.keywords ?? [])])
    .map((s) => ({ kind: "setting", id: `setting:${s.id}`, setting: s }));
}

function commandGroups(tab: PaletteTab, data: PaletteData, query: string): ResultGroup[] {
  const hits = ranked(data.actions, query, (a) => a.title, (a) => a.keywords ?? []);
  const openIn = data.actions.filter((a) => a.group === "open-in").map((a) => a.title);
  return tabGroups(tab, groupOrder(query, openIn))
    .filter((g) => g !== "workspace-actions" || data.activeWorkspaceId !== null)
    .map((g) => ({
      id: g,
      heading: ACTION_GROUP_HEADING[g],
      items: g === "settings" ? settingItems(data, query) : hits.filter((a) => a.group === g).map((a): ResultItem => ({ kind: "action", id: `action:${a.id}`, action: a })),
    }))
    .filter((g) => g.items.length > 0);
}

function group(id: string, heading: string | undefined, items: ResultItem[]): ResultGroup[] {
  return items.length > 0 ? [{ id, heading, items }] : [];
}

/**
 * Grouped results for a tab and query, in display order (Conductor's `m_a`). `archiveFilter`
 * is the Workspaces tab's "Archived workspaces" filter; All queries include both states.
 */
export function buildResults(tab: PaletteTab, query: string, data: PaletteData, archiveFilter: ArchiveFilter = "active"): ResultGroup[] {
  const empty = query.trim() === "";
  switch (tab) {
    case "workspaces":
      return group("workspaces", "Workspaces", workspaceResults(data, query, archiveFilter));
    case "projects":
      return group("projects", undefined, projectResults(data, query));
    case "actions":
    case "settings":
      return commandGroups(tab, data, query);
    case "all": {
      if (empty) {
        // Conductor (m_a, renderApp @10,854,949) maps each recent id onto every
        // workspace, archived included, and drops only ids it cannot find.
        const byId = new Map(data.workspaces.map((w) => [w.id, w]));
        const recents = data.recentWorkspaceIds
          .map((id) => byId.get(id))
          .filter((w): w is WorkspaceEntry => w !== undefined)
          .map((w): ResultItem => ({ kind: "workspace", id: `workspace:${w.id}`, workspace: w }));
        return [...group("recent-workspaces", "Recent workspaces", recents), ...commandGroups(tab, data, query)];
      }
      // With a query: the command groups, then Projects, then Workspaces, which stays mounted
      // with "No results found" while no project matches either.
      const projects = projectResults(data, query);
      const workspaces = [...workspaceResults(data, query, "active", byUpdatedAt), ...workspaceResults(data, query, "archived", byUpdatedAt)];
      const showWorkspaces = projects.length === 0 || workspaces.length > 0;
      return [
        ...commandGroups(tab, data, query),
        ...group("projects", "Projects", projects),
        ...(showWorkspaces ? [{ id: "workspaces", heading: "Workspaces", items: workspaces, emptyText: "No results found" }] : []),
      ];
    }
  }
}

/** Empty-state text when buildResults returns nothing. */
export function emptyText(tab: PaletteTab): string {
  return tab === "all" ? "No results found" : `No matching ${tab}`;
}
