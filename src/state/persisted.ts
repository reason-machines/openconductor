// Repositories and workspaces from conductor.db (src-tauri/src/persistence_commands.rs).
// In the desktop app these rows are the source of truth for the sidebar and Home;
// localStorage keeps only UI preferences (selection, sidebar visibility, collapsed repos).
import type { AppState, Repo, Selection, UnreadChat, Workspace } from "./types";
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
  /** `workspaces.user_set_workspace_name`: the sidebar shows workspaceName as is. */
  userSetWorkspaceName?: boolean;
  branch: string;
  placeholderBranchName: string | null;
  /** Schema value: initializing, setting_up, ready, archiving, archived, failed, ... */
  state: string;
  derivedStatus: string | null;
  manualStatus: string | null;
  workspacePath: string | null;
  /** `intended_target_branch`; absent from rows of an older backend. */
  intendedTargetBranch?: string | null;
  pinnedAt: string | null;
  /** `workspaces.unread`, the legacy per-workspace flag; folded into the main chat. */
  unread: boolean;
  /** The workspace's unread, non-hidden chats (`sessions.unread_count`); absent from rows of an older backend. */
  unreadChats?: { id: string; updatedAt: string }[];
  /** The PR's title and body as last stored (`pr_title`, `pr_description`). */
  prTitle: string | null;
  prDescription: string | null;
  /** `workspaces.number` (`W-<n>`); null for workspaces from before numbering. */
  number: number | null;
  createdAt: string;
  /** `workspaces.updated_at`; absent from rows of an older backend. */
  updatedAt?: string;
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

/** One `db_list_workspaces` row as a workspace; an archived row gets status "archived". */
export function workspaceFromRow(w: DbWorkspaceRow): Workspace {
  return {
    id: w.id,
    name: w.workspaceName ?? w.directoryName,
    workspaceName: w.workspaceName,
    directoryName: w.directoryName,
    branch: w.branch,
    status: w.state === "archived" ? "archived" : "idle",
    diff: { added: 0, removed: 0 },
    createdAt: sqliteTime(w.createdAt),
    updatedAt: w.updatedAt ? sqliteTime(w.updatedAt) : undefined,
    path: w.workspacePath ?? undefined,
    placeholderBranchName: w.placeholderBranchName,
    targetBranch: w.intendedTargetBranch ?? null,
    /* sidebar: pin, unread and status columns */
    pinnedAt: w.pinnedAt ? sqliteTime(w.pinnedAt) : undefined,
    unreadChats: unreadChatsOf(w),
    manualStatus: isWorkspaceStatus(w.manualStatus) ? w.manualStatus : undefined,
    derivedStatus: isWorkspaceStatus(w.derivedStatus) ? w.derivedStatus : undefined,
    prTitle: w.prTitle ?? null,
    prDescription: w.prDescription ?? null,
    number: w.number ?? null,
    state: w.state,
    userSetWorkspaceName: w.userSetWorkspaceName || undefined,
  };
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
      icon: r.icon,
      workspaces: workspaces
        .filter((w) => w.repositoryId === r.id && !HIDDEN_STATES.has(w.state))
        .map(workspaceFromRow),
    }));
}

/**
 * The row's unread chats. Only the main chat (id = workspace id) has a tab after a
 * restart, since review tabs live in memory: a stored unread review chat counts as
 * hidden, which Conductor leaves out of the workspace's unread (`zJo`). A legacy
 * `workspaces.unread` = 1 marks the main chat.
 */
export function unreadChatsOf(w: DbWorkspaceRow): UnreadChat[] | undefined {
  const chats = (w.unreadChats ?? []).filter((c) => c.id === w.id).map((c) => ({ id: c.id, at: sqliteTime(c.updatedAt) }));
  if (w.unread && chats.length === 0) chats.push({ id: w.id, at: sqliteTime(w.updatedAt ?? w.createdAt) });
  return chats.length > 0 ? chats : undefined;
}

/** Keep the selection only while it still points at a listed workspace. */
export function validSelection(selection: Selection, repos: Repo[]): Selection {
  if (selection.kind !== "workspace") return selection;
  const repo = repos.find((r) => r.id === selection.repoId);
  return repo?.workspaces.some((w) => w.id === selection.workspaceId) ? selection : { kind: "root" };
}

export function prefsOf(state: AppState): UiPrefs {
  return {
    selection: state.selection,
    sidebarVisible: state.sidebarVisible,
    collapsed: state.repos.filter((r) => r.collapsed).map((r) => r.id),
  };
}

export function parsePrefs(raw: string | null): UiPrefs {
  const fallback: UiPrefs = { selection: { kind: "root" }, collapsed: [] };
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      selection: p.selection?.kind === "workspace" || p.selection?.kind === "home" || p.selection?.kind === "root" ? p.selection : fallback.selection,
      sidebarVisible: typeof p.sidebarVisible === "boolean" ? p.sidebarVisible : undefined,
      collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return fallback;
  }
}
