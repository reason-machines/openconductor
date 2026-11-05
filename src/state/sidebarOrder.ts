// Order of workspace rows in the left sidebar, shared by the sidebar itself
// and by the commands that walk it (Cmd+1..9, next/previous workspace).
// Conductor lists pinned workspaces in a "Pinned" group above the repository
// groups and leaves them out of their repository group; inside a repository
// the newest activity comes first.
import type { AppState, Workspace } from "./types.ts";
import { byRecentActivity } from "../components/sidebarLabel.ts";

export interface SidebarEntry {
  repoId: string;
  workspace: Workspace;
}

export function isPinned(ws: Workspace): boolean {
  return typeof ws.pinnedAt === "number";
}

/** Pinned workspaces across repositories, in the order they were pinned. */
export function pinnedEntries(state: AppState): SidebarEntry[] {
  return state.repos
    .flatMap((r) => r.workspaces.filter(isPinned).map((workspace) => ({ repoId: r.id, workspace })))
    .sort((a, b) => (a.workspace.pinnedAt ?? 0) - (b.workspace.pinnedAt ?? 0));
}

/** A repository group's rows: unpinned workspaces, newest activity first. */
export function repoGroupWorkspaces(workspaces: readonly Workspace[]): Workspace[] {
  return byRecentActivity(workspaces.filter((w) => !isPinned(w)));
}

/**
 * Every row in display order: pinned first, then each repository's group.
 * With `visibleOnly`, rows inside a collapsed repository are skipped, which is
 * what Conductor numbers for its Cmd+1..9 hints.
 */
export function sidebarEntries(state: AppState, { visibleOnly = false, pinnedCollapsed = false } = {}): SidebarEntry[] {
  const pinned = visibleOnly && pinnedCollapsed ? [] : pinnedEntries(state);
  const grouped = state.repos.flatMap((r) =>
    visibleOnly && r.collapsed ? [] : repoGroupWorkspaces(r.workspaces).map((workspace) => ({ repoId: r.id, workspace })),
  );
  return [...pinned, ...grouped];
}
