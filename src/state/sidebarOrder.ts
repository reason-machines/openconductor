// Order of workspace rows in the left sidebar, shared by the sidebar itself
// and by the commands that walk it (Cmd+1..9, next/previous workspace).
// Conductor lists pinned workspaces in a "Pinned" group above the repository
// groups and leaves them out of their repository group; inside a repository
// the newest activity comes first. User sections (navigationSections.ts) sit
// between Pinned and the repository groups, and a workspace in a section
// leaves both (renderApp `nra`: Pinned and My workspaces filter out
// `sectionedWorkspaceIds`).
import type { AppState, Repo, Selection, Workspace } from "./types.ts";
import { sortSidebarWorkspaces, type SidebarSort } from "../home/sidebarSort.ts";
import { projectSections, type NavSection } from "./navigationSections.ts";

export interface SidebarEntry {
  repoId: string;
  workspace: Workspace;
}

export function isPinned(ws: Workspace): boolean {
  return typeof ws.pinnedAt === "number";
}

export interface SidebarSection {
  section: NavSection;
  entries: SidebarEntry[];
}

/** Each user section with the rows it shows, and the ids of every sectioned row. */
export function sectionEntries(state: AppState): { sections: SidebarSection[]; sectioned: Set<string> } {
  const rows = state.repos.flatMap((r) =>
    r.workspaces.map((workspace) => ({
      id: workspace.id,
      updatedAt: workspace.updatedAt ?? workspace.createdAt,
      listed: !r.hidden && workspace.status !== "archived",
      entry: { repoId: r.id, workspace },
    })),
  );
  const projection = projectSections(state.sections, rows);
  return {
    sections: projection.sections.map(({ section, workspaces }) => ({ section, entries: workspaces.map((w) => w.entry) })),
    sectioned: projection.sectioned,
  };
}

/** Pinned workspaces outside sections, across repositories, in the order they were pinned. */
export function pinnedEntries(state: AppState, sectioned: ReadonlySet<string> = sectionEntries(state).sectioned): SidebarEntry[] {
  return state.repos
    .flatMap((r) => r.workspaces.filter((w) => isPinned(w) && !sectioned.has(w.id)).map((workspace) => ({ repoId: r.id, workspace })))
    .sort((a, b) => (a.workspace.pinnedAt ?? 0) - (b.workspace.pinnedAt ?? 0));
}

/** Unpinned workspaces outside sections, in the selected timestamp order. */
export function repoGroupWorkspaces(workspaces: readonly Workspace[], sectioned: ReadonlySet<string> = new Set(), sort: SidebarSort = "updated"): Workspace[] {
  return sortSidebarWorkspaces(workspaces.filter((w) => !isPinned(w) && !sectioned.has(w.id)), sort);
}

/**
 * Whether a repository group is folded. Conductor 0.87.6 (`Dra` in the decoded
 * renderApp-D_fmY7hW.js @10,033,200) keeps one flag per group under
 * `repo-<id>` (`aW`, route state `workspace.sidebar` / `collapsedGroups`), and a
 * group nobody has toggled is collapsed unless the open workspace is one of its
 * rows (`defaultCollapsed: !rows.includes(routeWorkspaceId)`). `repo.collapsed`
 * is that stored flag: `undefined` until the group is toggled.
 */
export function isRepoCollapsed(repo: Repo, selection: Selection, sectioned: ReadonlySet<string> = new Set()): boolean {
  if (repo.collapsed !== undefined) return repo.collapsed;
  if (selection.kind !== "workspace" || selection.repoId !== repo.id) return true;
  return !repoGroupWorkspaces(repo.workspaces, sectioned).some((w) => w.id === selection.workspaceId);
}

/** A click on a repository header stores the opposite of what the group shows now (`aW`'s toggle). */
export function toggleRepoCollapsed(state: AppState, repoId: string): Repo[] {
  const { sectioned } = sectionEntries(state);
  return state.repos.map((r) => (r.id === repoId ? { ...r, collapsed: !isRepoCollapsed(r, state.selection, sectioned) } : r));
}

/**
 * Every row in display order: pinned first, then each user section, then each
 * repository's group. With `visibleOnly`, rows inside a collapsed repository
 * or section are skipped, which is what Conductor numbers for its Cmd+1..9
 * hints.
 */
export function sidebarEntries(
  state: AppState,
  { visibleOnly = false, pinnedCollapsed = false, collapsedSections = new Set<string>() }: { visibleOnly?: boolean; pinnedCollapsed?: boolean; collapsedSections?: ReadonlySet<string> } = {},
): SidebarEntry[] {
  const { sections, sectioned } = sectionEntries(state);
  const pinned = visibleOnly && pinnedCollapsed ? [] : pinnedEntries(state, sectioned);
  const inSections = sections.flatMap((s) => (visibleOnly && collapsedSections.has(s.section.id) ? [] : s.entries));
  const grouped = state.repos.flatMap((r) =>
    visibleOnly && isRepoCollapsed(r, state.selection, sectioned) ? [] : repoGroupWorkspaces(r.workspaces, sectioned, state.sidebarSort).map((workspace) => ({ repoId: r.id, workspace })),
  );
  return [...pinned, ...inSections, ...grouped];
}
