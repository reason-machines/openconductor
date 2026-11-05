// parity:sidebar.archived-view
// The archived workspaces list and unarchive, as Conductor 0.87.6 shows them
// (decoded renderApp chunk, read as data; evidence/parity/sidebar-home-create/archive-unarchive.md):
// - the palette action "View archived workspaces" switches to the Workspaces
//   tab with archived workspaces shown ("Showing all") and clears the query;
// - the Workspaces tab's "Archived workspaces" filter: "Hiding archived" /
//   "Showing all" / "Only archived";
// - each archived row has an "Unarchive workspace" button;
// - an archived workspace opens read-only, with "This workspace is archived."
//   and an "Unarchive" button ("Unarchiving..." while it runs).
// Pure (no Tauri imports), so node --test covers it.
import type { DbWorkspaceRow } from "../state/persisted.ts";
import { workspaceFromRow } from "../state/persisted.ts";
import type { Workspace } from "../state/types.ts";

export const UNARCHIVE_LABEL = "Unarchive workspace";
export const VIEW_ARCHIVED_LABEL = "View archived workspaces";
export const ARCHIVE_FILTER_LABEL = "Archived workspaces";

/** The archived workspace's banner (Conductor's `iIo`) and its tabs' placeholder (`Nji`). */
export const ARCHIVED_BANNER = {
  text: "This workspace is archived.",
  unarchive: "Unarchive",
  unarchiving: "Unarchiving...",
  placeholderTitle: "Workspace archived",
  placeholderText: "Unarchive this workspace to view files, terminals, and browser previews.",
} as const;

/** What the palette's Workspaces tab shows (Conductor's `archiveFilter`). */
export type ArchiveFilter = "active" | "all" | "archived";
export const ARCHIVE_FILTERS: readonly ArchiveFilter[] = ["active", "all", "archived"];
export const ARCHIVE_FILTER_TEXT: Record<ArchiveFilter, string> = {
  active: "Hiding archived",
  all: "Showing all",
  archived: "Only archived",
};

export function matchesArchiveFilter(archived: boolean, filter: ArchiveFilter): boolean {
  return filter === "all" || (filter === "archived") === archived;
}

/** A row of the archived list: the workspace as it was archived. */
export interface ArchivedWorkspace {
  id: string;
  repoId: string;
  name: string;
  branch: string;
  createdAt: number;
  workspace: Workspace;
}

/** Archived rows of `db_list_workspaces`, newest first. */
export function archivedFromRows(rows: readonly DbWorkspaceRow[]): ArchivedWorkspace[] {
  return rows
    .filter((w) => w.state === "archived")
    .map((w) => {
      const workspace = workspaceFromRow(w);
      return { id: w.id, repoId: w.repositoryId, name: workspace.name, branch: w.branch, createdAt: workspace.createdAt, workspace };
    })
    .reverse();
}

/** An archived workspace as the archived list keeps it. */
export function archivedEntry(repoId: string, ws: Workspace): ArchivedWorkspace {
  const workspace: Workspace = { ...ws, status: "archived", state: "archived" };
  return { id: ws.id, repoId, name: ws.name, branch: ws.branch, createdAt: ws.createdAt, workspace };
}
