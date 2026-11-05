// Adapt the shell's AppState to palette data, and order workspaces the way
// the sidebar shows them (Cmd+1..9 and Cmd+Alt+Up/Down follow this order).

import type { AppState, Workspace } from "../state/types.ts";
import type { ActionEntry, PaletteData, WorkspaceEntry } from "./search/model.ts";

export interface WorkspaceRef {
  repoId: string;
  workspace: Workspace;
}

/** Workspaces in sidebar order: repos in order, then their workspaces. */
export function sidebarOrder(state: AppState): WorkspaceRef[] {
  return state.repos.flatMap((r) => r.workspaces.map((workspace) => ({ repoId: r.id, workspace })));
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
  { id: "go-home", title: "Go to Home", group: "navigation", bindingId: "nav.home" },
  { id: "next-workspace", title: "Next workspace", group: "navigation", bindingId: "workspace.next" },
  { id: "previous-workspace", title: "Previous workspace", group: "navigation", bindingId: "workspace.previous" },
];

/** `recentIds` is most recent first; it also drives each workspace's recency. */
export function paletteDataFromState(state: AppState, recentIds: readonly string[]): PaletteData {
  const known = new Set(sidebarOrder(state).map((w) => w.workspace.id));
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  const workspaces: WorkspaceEntry[] = state.repos.flatMap((r) =>
    r.workspaces.map((w) => {
      const r0 = rank.get(w.id);
      // Recently visited workspaces sort above the rest; others by creation time.
      const lastActiveAt = r0 === undefined ? w.createdAt : Number.MAX_SAFE_INTEGER - r0;
      return { id: w.id, name: w.name, branch: w.branch, repoName: r.name, lastActiveAt, archived: w.status === "archived" };
    }),
  );
  const activeWorkspaceId = state.selection.kind === "workspace" ? state.selection.workspaceId : null;
  return {
    workspaces,
    projects: state.repos.map((r) => ({ id: r.id, name: r.name })),
    actions: PALETTE_ACTIONS,
    settings: [],
    recentWorkspaceIds: recentIds.filter((id) => known.has(id)),
    activeWorkspaceId,
  };
}
