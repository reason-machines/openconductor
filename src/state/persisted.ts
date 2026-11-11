// Repositories and workspaces from conductor.db (src-tauri/src/persistence_commands.rs).
// In the desktop app these rows are the source of truth for the sidebar and Home;
// localStorage keeps only UI preferences (selection, sidebar visibility, collapsed repos).
import type { AppState, Repo, Selection, UnreadChat, Workspace } from "./types";
import { isWorkspaceStatus } from "./workspaceStatus.ts";
import { parseStatusCollapsed } from "../home/sidebarGroupBy.ts";
import { restoreChatTabs, type StoredChatTab } from "./openChat.ts";

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
  linkedWorkspaceIds?: string[];
  linkedDirectoryPaths?: string[];
  /** `intended_target_branch`; absent from rows of an older backend. */
  intendedTargetBranch?: string | null;
  pinnedAt: string | null;
  /** `workspaces.unread`, the legacy per-workspace flag; folded into the main chat. */
  unread: boolean;
  /** The workspace's unread, non-hidden chats (`sessions.unread_count`); absent from rows of an older backend. */
  unreadChats?: { id: string; updatedAt: string }[];
  /** The open chat tabs besides the main chat (review, fork, "+"), oldest first; absent from rows of an older backend. */
  chatTabs?: StoredChatTab[];
  /** The main chat's own title once renamed ("Rename chat"); absent otherwise and from rows of an older backend. */
  chatTitle?: string | null;
  primaryChatId?: string;
  activeSessionId?: string | null;
  /** The PR's title and body as last stored (`pr_title`, `pr_description`). */
  prTitle: string | null;
  prDescription: string | null;
  /** `workspaces.number` (`W-<n>`); null for workspaces from before numbering. */
  number: number | null;
  /** `initialization_log_path` / `initialization_files_copied`; absent from rows of an older backend. */
  initializationLogPath?: string | null;
  initializationFilesCopied?: number | null;
  createdAt: string;
  /** `workspaces.updated_at`; absent from rows of an older backend. */
  updatedAt?: string;
}

/** What the desktop app keeps in localStorage. */
export interface UiPrefs {
  selection: Selection;
  sidebarVisible?: boolean;
  /** Repository groups folded by hand. */
  collapsed: string[];
  /** Repository groups unfolded by hand; the others follow the open workspace (isRepoCollapsed). */
  expanded: string[];
  sidebarStatusCollapsed?: AppState["sidebarStatusCollapsed"];
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
    linkedWorkspaceIds: w.linkedWorkspaceIds ?? [],
    linkedDirectoryPaths: w.linkedDirectoryPaths ?? [],
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
    chatTitle: w.chatTitle ?? undefined,
    primaryChatId: w.primaryChatId ?? w.id,
    activeSessionId: w.activeSessionId ?? undefined,
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
 * The row's unread chats: the main chat (id = workspace id) and the chats whose
 * tab was open when the app last ran, which come back after a restart as
 * Conductor's do (its tabs are the workspace's non-hidden sessions, index `ylt`
 * at 1226:63776). Any other stored unread chat counts as hidden, which Conductor
 * leaves out of the workspace's unread (`zJo`). A legacy `workspaces.unread` = 1
 * marks the main chat.
 */
export function unreadChatsOf(w: DbWorkspaceRow): UnreadChat[] | undefined {
  const primary = w.primaryChatId ?? w.id;
  const tabbed = (id: string) => id === primary || (w.chatTabs?.some((t) => t.id === id) ?? false);
  const chats = (w.unreadChats ?? []).filter((c) => tabbed(c.id)).map((c) => ({ id: c.id, at: sqliteTime(c.updatedAt) }));
  if (w.unread && primary === w.id && chats.length === 0) chats.push({ id: primary, at: sqliteTime(w.updatedAt ?? w.createdAt) });
  return chats.length > 0 ? chats : undefined;
}

/** Show again the chat tabs that were open when the app last ran (`db_list_workspaces` rows). */
export function restoreChatTabsOf(rows: readonly DbWorkspaceRow[]): void {
  for (const w of rows) restoreChatTabs(w.id, w.chatTabs ?? [], w.primaryChatId ?? w.id);
}

/** Keep the selection only while it still points at a listed workspace. */
export function validSelection(selection: Selection, repos: Repo[]): Selection {
  if (selection.kind !== "workspace") return selection;
  const repo = repos.find((r) => r.id === selection.repoId);
  return repo?.workspaces.some((w) => w.id === selection.workspaceId) ? selection : { kind: "root" };
}

/** A workspace re-read from conductor.db keeps the pull request the app last read (not a column). */
export function keepPr(fresh: Workspace, old: Workspace | undefined): Workspace {
  return old?.pr !== undefined ? { ...fresh, pr: old.pr } : fresh;
}

/**
 * Browser shell state saved before a reload: no agent from before it is
 * running, so drop session statuses (the demo's, and the old `status: "working"`).
 */
export function withoutLiveSessions(state: AppState): AppState {
  const repos = state.repos.map((r) => ({
    ...r,
    workspaces: r.workspaces.map((w): Workspace => {
      const { sessionStatus: _gone, ...rest } = w;
      return (rest.status as string) === "working" ? { ...rest, status: "idle" } : rest;
    }),
  }));
  return { ...state, repos };
}

export function prefsOf(state: AppState): UiPrefs {
  return {
    selection: state.selection,
    sidebarVisible: state.sidebarVisible,
    collapsed: state.repos.filter((r) => r.collapsed === true).map((r) => r.id),
    expanded: state.repos.filter((r) => r.collapsed === false).map((r) => r.id),
    ...(state.sidebarStatusCollapsed ? { sidebarStatusCollapsed: state.sidebarStatusCollapsed } : {}),
  };
}

export function parsePrefs(raw: string | null): UiPrefs {
  const fallback: UiPrefs = { selection: { kind: "root" }, collapsed: [], expanded: [] };
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((id): id is string => typeof id === "string") : []);
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as Partial<UiPrefs>;
    const sidebarStatusCollapsed = parseStatusCollapsed(p.sidebarStatusCollapsed);
    return {
      selection: p.selection?.kind === "workspace" || p.selection?.kind === "home" || p.selection?.kind === "root" ? p.selection : fallback.selection,
      sidebarVisible: typeof p.sidebarVisible === "boolean" ? p.sidebarVisible : undefined,
      collapsed: ids(p.collapsed),
      expanded: ids(p.expanded),
      ...(sidebarStatusCollapsed ? { sidebarStatusCollapsed } : {}),
    };
  } catch {
    return fallback;
  }
}
