// Adapt the shell's AppState to palette data, and order workspaces the way
// the sidebar shows them (Cmd+1..9 and Cmd+Alt+Up/Down follow this order).

import type { AppState, Workspace } from "../state/types.ts";
import type { ActionEntry, PaletteData, WorkspaceEntry } from "./search/model.ts";
import { VIEW_ARCHIVED_LABEL, type ArchivedWorkspace } from "../workspace/archivedList.ts";

/** Handled inside the palette: it switches tabs instead of closing. */
export const VIEW_ARCHIVED_ACTION = "view-archived-workspaces";
import { sidebarEntries } from "../state/sidebarOrder.ts";
import { nextUnreadChat } from "../state/nextUnread.ts";

export interface WorkspaceRef {
  repoId: string;
  workspace: Workspace;
}

/** Workspaces in sidebar order: Pinned, then each repo's group, newest first (src/state/sidebarOrder.ts). */
export function sidebarOrder(state: AppState): WorkspaceRef[] {
  return sidebarEntries(state);
}

/** What Cmd+1..9 count: the rows on screen, so collapsed repos are skipped, as the row hints are. */
export function shortcutOrder(state: AppState): WorkspaceRef[] {
  return sidebarEntries(state, { visibleOnly: true });
}

/** The workspace `delta` steps from the selected one, wrapping; first one if none is selected. */
export function stepWorkspace(state: AppState, delta: 1 | -1): WorkspaceRef | undefined {
  const order = sidebarOrder(state);
  if (order.length === 0) return undefined;
  const sel = state.selection;
  const i = sel.kind === "workspace" ? order.findIndex((w) => w.workspace.id === sel.workspaceId) : -1;
  if (i === -1) return order[delta === 1 ? 0 : order.length - 1];
  return order[(i + delta + order.length) % order.length];
}

export const PALETTE_ACTIONS: readonly ActionEntry[] = [
  { id: "archive-workspace", title: "Archive workspace", group: "workspace-actions", bindingId: "workspace.archive" },
  { id: "new-workspace", title: "New workspace", group: "actions", bindingId: "workspace.create", keywords: ["create"] },
  { id: "add-project", title: "Open project", group: "actions", keywords: ["add", "repository", "folder"] },
  { id: "clone-project", title: "Open GitHub project", group: "actions", keywords: ["clone", "repository"] },
  { id: "quick-start", title: "Quick start", group: "actions", keywords: ["new", "project"] },
  // Conductor lists it first under Navigation, only while something is unread (renderApp @10,916,846).
  { id: "go-to-next-unread", title: "Go to next unread", group: "navigation", bindingId: "chat.nextAttention", keywords: ["go", "to", "next", "unread", "attention", "chat", "session"] },
  { id: "go-home", title: "Go to Home", group: "navigation", bindingId: "nav.home" },
  { id: "next-workspace", title: "Next workspace", group: "navigation", bindingId: "workspace.next" },
  { id: "previous-workspace", title: "Previous workspace", group: "navigation", bindingId: "workspace.previous" },
  // Conductor: opens the Workspaces tab with archived workspaces shown (`view-archived-workspaces`).
  { id: VIEW_ARCHIVED_ACTION, title: VIEW_ARCHIVED_LABEL, group: "navigation", keywords: ["archive", "archived", "workspaces", "view", "show"] },
];

/**
 * `recentIds` is most recent first; it also drives each workspace's recency.
 * `archived` are the archived workspaces from conductor.db; they list after
 * the active ones, newest first.
 */
export function paletteDataFromState(state: AppState, recentIds: readonly string[], archived: readonly ArchivedWorkspace[] = []): PaletteData {
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  const workspaces: WorkspaceEntry[] = state.repos.flatMap((r) =>
    r.workspaces.map((w) => {
      const r0 = rank.get(w.id);
      // Recently visited workspaces sort above the rest; others by creation time.
      const lastActiveAt = r0 === undefined ? w.createdAt : Number.MAX_SAFE_INTEGER - r0;
      return { id: w.id, name: w.name, branch: w.branch, repoName: r.name, lastActiveAt, archived: w.status === "archived", number: w.number ?? null };
    }),
  );
  const repoNames = new Map(state.repos.map((r) => [r.id, r.name]));
  for (const a of archived) {
    if (!repoNames.has(a.repoId)) continue;
    workspaces.push({ id: a.id, name: a.name, branch: a.branch, repoName: repoNames.get(a.repoId) ?? "", lastActiveAt: a.createdAt - Number.MAX_SAFE_INTEGER / 2, archived: true, number: a.workspace.number ?? null });
  }
  const activeWorkspaceId = state.selection.kind === "workspace" ? state.selection.workspaceId : null;
  return {
    workspaces,
    projects: state.repos.map((r) => ({ id: r.id, name: r.name })),
    actions: nextUnreadChat(state, { skipSelected: false }) ? PALETTE_ACTIONS : PALETTE_ACTIONS.filter((a) => a.id !== "go-to-next-unread"),
    settings: [],
    // Archived workspaces stay in Recent, as in Conductor; ids of deleted ones drop out here
    // but stay stored, so they still count toward the cap of 5 (recordViewedWorkspace never prunes).
    recentWorkspaceIds: recentIds.filter((id) => workspaces.some((w) => w.id === id)),
    activeWorkspaceId,
  };
}
