// Repositories and workspaces from conductor.db (src-tauri/src/persistence_commands.rs).
// In the desktop app these rows are the source of truth for the sidebar and Home;
// localStorage keeps only UI preferences (selection, sidebar visibility, collapsed repos).
import type { AppState, Repo, Selection, Workspace } from "./types";
import { isWorkspaceStatus } from "./workspaceStatus.ts";

export interface DbRepoRow {
  id: string;
  name: string;
  rootPath: string;
  remoteUrl: string | null;
  defaultBranch: string;
  displayOrder: number;
  hidden: boolean;
  icon: string | null;
  createdAt: string;
}

export interface DbWorkspaceRow {
  id: string;
  repositoryId: string;
  directoryName: string;
  workspaceName: string | null;
  branch: string;
  placeholderBranchName: string | null;
  /** Schema value: initializing, setting_up, ready, archiving, archived, failed, ... */
  state: string;
  derivedStatus: string | null;
  manualStatus: string | null;
  workspacePath: string | null;
  pinnedAt: string | null;
  unread: boolean;
  /** The PR's title and body as last stored (`pr_title`, `pr_description`). */
  prTitle: string | null;
  prDescription: string | null;
  /** `workspaces.number` (`W-<n>`); null for workspaces from before numbering. */
  number: number | null;
  createdAt: string;
}

/** What the desktop app keeps in localStorage. */
export interface UiPrefs {
  selection: Selection;
  sidebarVisible?: boolean;
  collapsed: string[];
}

/** Rows that are not in the sidebar: archived, being archived, or deleted. */
const HIDDEN_STATES = new Set(["archiving", "archived", "deleted"]);

/** SQLite `datetime('now')` is UTC without a zone: `2026-11-05 12:00:00`. */
function sqliteTime(s: string): number {
  const t = Date.parse(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(t) ? 0 : t;
}

export function reposFromDb(repos: DbRepoRow[], workspaces: DbWorkspaceRow[], collapsed: Iterable<string>): Repo[] {
  const folded = new Set(collapsed);
  // Hidden repos stay in the list; the sidebar shows them behind its "show hidden" toggle.
  return repos
    .map((r) => ({
      id: r.id,
      name: r.name,
      path: r.rootPath,
      remote: r.remoteUrl ?? undefined,
      defaultBranch: r.defaultBranch,
      collapsed: folded.has(r.id) || undefined,
      hidden: r.hidden || undefined,
      workspaces: workspaces
        .filter((w) => w.repositoryId === r.id && !HIDDEN_STATES.has(w.state))
        .map(
          (w): Workspace => ({
            id: w.id,
            name: w.workspaceName ?? w.directoryName,
            branch: w.branch,
            status: "idle",
            diff: { added: 0, removed: 0 },
            createdAt: sqliteTime(w.createdAt),
            path: w.workspacePath ?? undefined,
            placeholderBranchName: w.placeholderBranchName,
            /* sidebar: pin, unread and status columns */
            pinnedAt: w.pinnedAt ? sqliteTime(w.pinnedAt) : undefined,
            unread: w.unread || undefined,
            manualStatus: isWorkspaceStatus(w.manualStatus) ? w.manualStatus : undefined,
            derivedStatus: isWorkspaceStatus(w.derivedStatus) ? w.derivedStatus : undefined,
            prTitle: w.prTitle ?? null,
            prDescription: w.prDescription ?? null,
            number: w.number ?? null,
          }),
        ),
    }));
}

/** Keep the selection only while it still points at a listed workspace. */
export function validSelection(selection: Selection, repos: Repo[]): Selection {
  if (selection.kind !== "workspace") return selection;
  const repo = repos.find((r) => r.id === selection.repoId);
  return repo?.workspaces.some((w) => w.id === selection.workspaceId) ? selection : { kind: "home" };
}

export function prefsOf(state: AppState): UiPrefs {
  return {
    selection: state.selection,
    sidebarVisible: state.sidebarVisible,
    collapsed: state.repos.filter((r) => r.collapsed).map((r) => r.id),
  };
}

export function parsePrefs(raw: string | null): UiPrefs {
  const fallback: UiPrefs = { selection: { kind: "home" }, collapsed: [] };
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      selection: p.selection?.kind === "workspace" || p.selection?.kind === "home" ? p.selection : fallback.selection,
      sidebarVisible: typeof p.sidebarVisible === "boolean" ? p.sidebarVisible : undefined,
      collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return fallback;
  }
}
