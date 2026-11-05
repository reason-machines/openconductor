// Home's workspace list (Conductor's /all-workspaces route, which its sidebar
// Home row and the nav.home command open). Pure logic, read with REA from the
// decoded renderApp chunk of Conductor 0.87.6 (see evidence/screens/home.md):
//   - date groups: `jJo` (bucket) and `FJo`/`BJo` (labels, order);
//   - search: `pFi`/`AJo`/`kJo` (every query word must occur in name, branch,
//     directory, repo or "#<pr>"; "12", "w12" or "w-12" match workspace W-12);
//   - filters: `nFi` (project filter label, archive filter labels) and the
//     archive/project predicate in `UJo`;
//   - row time: `BPt` over `SS` (date-fns formatDistance, shortened).
// Conductor-only parts we leave out: owner filter and pinned group (cloud
// organizations only), cost column and the status-matrix setting.

import type { Repo, Workspace } from "../state/types";
import { workspaceLabel } from "../components/sidebarLabel.ts";

export type ArchiveFilter = "active" | "all" | "archived";

export interface HomeFilters {
  /** Repository ids; empty means every project. */
  projects: string[];
  archiveFilter: ArchiveFilter;
}

export const DEFAULT_FILTERS: HomeFilters = { projects: [], archiveFilter: "active" };

export const ARCHIVE_FILTERS: readonly ArchiveFilter[] = ["active", "all", "archived"];
export const ARCHIVE_FILTER_LABELS: Record<ArchiveFilter, string> = {
  active: "Hiding archived",
  all: "Showing all",
  archived: "Only archived",
};

/** Rows shown before scrolling to the end loads 50 more (`te`/`HJo`). */
export const PAGE_SIZE = 50;

export type DateBucket =
  | "today" | "yesterday" | "2daysAgo" | "3daysAgo" | "4daysAgo" | "5daysAgo" | "6daysAgo"
  | "1weekAgo" | "2weeksAgo" | "3weeksAgo" | "1monthAgo" | "2monthsAgo" | "3monthsAgo" | "older";

export const BUCKET_ORDER: readonly DateBucket[] = [
  "today", "yesterday", "2daysAgo", "3daysAgo", "4daysAgo", "5daysAgo", "6daysAgo",
  "1weekAgo", "2weeksAgo", "3weeksAgo", "1monthAgo", "2monthsAgo", "3monthsAgo", "older",
];

export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "2daysAgo": "2 days ago",
  "3daysAgo": "3 days ago",
  "4daysAgo": "4 days ago",
  "5daysAgo": "5 days ago",
  "6daysAgo": "6 days ago",
  "1weekAgo": "1 week ago",
  "2weeksAgo": "2 weeks ago",
  "3weeksAgo": "3 weeks ago",
  "1monthAgo": "1 month ago",
  "2monthsAgo": "2 months ago",
  "3monthsAgo": "3 months ago",
  older: "Older",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which date group a last-active time falls in, counted from local midnight (`jJo`). */
export function dateBucket(lastActiveAt: number, now: number = Date.now()): DateBucket {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (lastActiveAt >= midnight) return "today";
  const days = Math.floor((midnight - lastActiveAt) / DAY_MS);
  if (days === 0) return "yesterday";
  if (days <= 5) return `${days + 1}daysAgo` as DateBucket;
  if (days < 14) return "1weekAgo";
  if (days < 21) return "2weeksAgo";
  if (days < 30) return "3weeksAgo";
  if (days < 60) return "1monthAgo";
  if (days < 90) return "2monthsAgo";
  if (days < 120) return "3monthsAgo";
  return "older";
}

/**
 * Short relative time for a row: "now", "8m", "2h", "1d", "3mo", "1y".
 * Conductor runs date-fns `formatDistance` with a suffix, then shortens the
 * units and drops " ago" (`SS`, `BPt`); this applies the same thresholds.
 */
export function shortRelativeTime(at: number, now: number = Date.now()): string {
  const minutes = Math.round((now - Math.min(at, now)) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 45) return `${minutes}m`;
  if (minutes < 90) return "1h";
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  if (minutes < 2520) return "1d";
  if (minutes < 43200) return `${Math.round(minutes / 1440)}d`;
  if (minutes < 86400) return `${Math.round(minutes / 43200)}mo`;
  const months = monthsBetween(at, now);
  if (months < 12) return `${Math.round(minutes / 43200)}mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest < 3) return `${years}y`;
  if (rest < 9) return `over ${years}y`;
  return `almost ${years + 1}y`;
}

function monthsBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

/** The time a row sorts and groups by: the latest activity, else creation. */
export function lastActiveAt(w: Pick<Workspace, "createdAt" | "updatedAt">): number {
  return Math.max(w.createdAt, w.updatedAt ?? 0);
}

export interface SearchFields {
  name: string;
  branch: string;
  directory: string;
  repo: string;
  number?: number;
  prNumber?: number;
}

const TEXT_FIELDS = ["name", "branch", "directory", "repo"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

export interface FieldMatch {
  text: string;
  /** Character positions to highlight in `text`. */
  indices: number[];
}

export type FieldMatches = Partial<Record<TextField | "number", FieldMatch>>;

function words(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, i) => start + i);
}

function numberMatch(normalized: string, number: number): FieldMatch | undefined {
  const n = String(number);
  const text = `W-${n}`;
  if (/^\d+$/.test(normalized)) return normalized === n ? { text, indices: range(2, n.length) } : undefined;
  if (/^w-?\d+$/.test(normalized)) {
    if (`w-${n}`.startsWith(normalized)) return { text, indices: range(0, normalized.length) };
    if (`w${n}`.startsWith(normalized)) return { text, indices: [0, ...range(2, normalized.length - 1)] };
  }
  return undefined;
}

function textMatch(query: string, text: string): FieldMatch | undefined {
  const lower = text.toLowerCase();
  const hits = words(query).flatMap((w) => {
    const at = lower.indexOf(w);
    return at === -1 ? [] : range(at, w.length);
  });
  if (hits.length === 0) return undefined;
  return { text, indices: [...new Set(hits)].sort((a, b) => a - b) };
}

/** Field matches when the query matches, else undefined (`pFi`). */
export function matchWorkspace(query: string, fields: SearchFields): FieldMatches | undefined {
  const normalized = query.trim().toLowerCase();
  const byNumber = fields.number === undefined ? undefined : numberMatch(normalized, fields.number);
  const haystack = [...TEXT_FIELDS.map((f) => fields[f]), fields.prNumber === undefined ? "" : `#${fields.prNumber}`]
    .join(" ")
    .toLowerCase();
  let byText: FieldMatches | undefined;
  if (words(query).every((w) => haystack.includes(w))) {
    byText = {};
    for (const f of TEXT_FIELDS) {
      const m = textMatch(query, fields[f]);
      if (m) byText[f] = m;
    }
  }
  if (byNumber === undefined) return byText;
  return { ...byText, number: byNumber };
}

export interface HomeRow {
  repo: Repo;
  workspace: Workspace;
  /** Row title, after Conductor's display-name rule (`$V`). */
  title: string;
  lastActiveAt: number;
  archived: boolean;
  /** Present while a search query is active. */
  matches?: FieldMatches;
}

export interface HomeGroup {
  bucket: DateBucket;
  label: string;
  rows: HomeRow[];
}

/** Repositories that have at least one workspace (the project filter's choices, `je`). */
export function reposWithWorkspaces(repos: readonly Repo[]): Repo[] {
  return repos.filter((r) => r.workspaces.length > 0);
}

/** The project filter only shows when more than one project has workspaces. */
export function showProjectFilter(repos: readonly Repo[]): boolean {
  return reposWithWorkspaces(repos).length > 1;
}

/** "In all projects", "In tide-web" or "In 2 projects". */
export function projectFilterLabel(repos: readonly Repo[], projects: readonly string[]): string {
  if (projects.length === 0) return "In all projects";
  if (projects.length === 1) return `In ${repos.find((r) => r.id === projects[0])?.name ?? "1 project"}`;
  return `In ${projects.length} projects`;
}

export function toggleProject(projects: readonly string[], id: string): string[] {
  return projects.includes(id) ? projects.filter((p) => p !== id) : [...projects, id];
}

/** True when any filter differs from "everything" (`mr`), which offers Clear filters. */
export function hasActiveFilters(f: HomeFilters): boolean {
  return f.projects.length > 0 || f.archiveFilter !== "all";
}

/** Clear filters shows everything, archived included (`B`). */
export const CLEARED_FILTERS: HomeFilters = { projects: [], archiveFilter: "all" };

/** Every row passing the filters and query, newest activity first. */
export function homeRows(repos: readonly Repo[], filters: HomeFilters, query: string): HomeRow[] {
  const rows: HomeRow[] = [];
  for (const repo of repos) {
    for (const workspace of repo.workspaces) {
      const archived = workspace.status === "archived";
      if (filters.archiveFilter === "active" && archived) continue;
      if (filters.archiveFilter === "archived" && !archived) continue;
      if (filters.projects.length > 0 && !filters.projects.includes(repo.id)) continue;
      const title = workspaceLabel({
        name: workspace.name,
        branch: workspace.branch,
        prTitle: workspace.prTitle,
        userSetWorkspaceName: workspace.userSetWorkspaceName,
        targetBranch: repo.defaultBranch,
      });
      rows.push({ repo, workspace, title, lastActiveAt: lastActiveAt(workspace), archived });
    }
  }
  rows.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  if (!query.trim()) return rows;
  return rows.flatMap((row) => {
    const number = (row.workspace as Workspace & { number?: number }).number;
    const matches = matchWorkspace(query, {
      name: row.title,
      branch: row.workspace.branch,
      directory: row.workspace.name,
      repo: row.repo.name,
      number,
    });
    return matches ? [{ ...row, matches }] : [];
  });
}

/** Group rows by date, in Conductor's order, dropping empty groups. */
export function groupByDate(rows: readonly HomeRow[], now: number = Date.now()): HomeGroup[] {
  const by = new Map<DateBucket, HomeRow[]>();
  for (const row of rows) {
    const b = dateBucket(row.lastActiveAt, now);
    const list = by.get(b);
    if (list) list.push(row);
    else by.set(b, [row]);
  }
  return BUCKET_ORDER.filter((b) => by.has(b)).map((b) => ({ bucket: b, label: BUCKET_LABELS[b], rows: by.get(b)! }));
}

export type EmptyAction = "create" | "clear" | null;

/**
 * What the empty list offers below "No matching workspaces": Create a
 * workspace when nothing is filtered and there are no active workspaces at
 * all (`Or`), else Clear filters when a filter is set (`mr`).
 */
export function emptyAction(repos: readonly Repo[], filters: HomeFilters): EmptyAction {
  const anyActive = repos.some((r) => r.workspaces.some((w) => w.status !== "archived"));
  if (filters.projects.length === 0 && filters.archiveFilter === "active" && !anyActive) return "create";
  return hasActiveFilters(filters) ? "clear" : null;
}

const FILTERS_KEY = "openconductor.home.filters.v1";

/** Parse saved filters, dropping projects that no longer exist. */
export function parseFilters(raw: string | null, repoIds: ReadonlySet<string>): HomeFilters {
  if (!raw) return DEFAULT_FILTERS;
  try {
    const v = JSON.parse(raw) as Partial<HomeFilters>;
    const archiveFilter = ARCHIVE_FILTERS.includes(v.archiveFilter as ArchiveFilter) ? (v.archiveFilter as ArchiveFilter) : "active";
    const projects = Array.isArray(v.projects) ? v.projects.filter((p): p is string => typeof p === "string" && repoIds.has(p)) : [];
    return { projects, archiveFilter };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function loadFilters(repoIds: ReadonlySet<string>): HomeFilters {
  try {
    return parseFilters(localStorage.getItem(FILTERS_KEY), repoIds);
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(f: HomeFilters): void {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* storage unavailable */
  }
}
