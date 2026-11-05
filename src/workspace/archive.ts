// parity:sidebar.archive / parity:sidebar.archived-view
// Archive and unarchive, as Conductor 0.87.6 does them (decoded frontend,
// read as data; see evidence/parity/sidebar-home-create/archive-unarchive.md):
//
// - Archive asks for confirmation only while agents are running: "Archive
//   workspace?" / "Agents are still running in this workspace. Archiving will
//   stop them and end any in-progress work." / Cancel / "Stop agents and
//   archive ⌘↵". Otherwise it archives straight away.
// - The backend (`archive_workspace`) checkpoints the worktree, records
//   `archive_commit`, then removes the worktree. A merge, rebase, cherry-pick
//   or revert in progress refuses it ("gitBusy"); the UI then shows a sticky
//   warning whose "Archive" button retries with the operation state dropped.
// - Archived workspaces are listed in the command palette's Workspaces tab
//   (filter "Hiding archived" / "Showing all" / "Only archived"; the "View
//   archived workspaces" action switches to it showing all), each with an
//   "Unarchive workspace" button.
//
// Outside Tauri (vite dev, the e2e tests, screenshots) a small in-memory list
// stands in for conductor.db so the round trip can be exercised.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { DbWorkspaceRow } from "../state/persisted";
import { archivedFromRows, type ArchiveMode, type ArchivedWorkspace } from "./archiveRules.ts";

export * from "./archiveRules.ts";

export interface Archived {
  archiveCommit: string | null;
  /** Cleanup that failed or was skipped; one toast each. */
  warnings: string[];
}

export interface Unarchived {
  workspace: DbWorkspaceRow;
  /** "Uncommitted changes couldn't be recovered: ..." */
  warning: string | null;
}

/* ---- browser stand-in ---- */

const browserArchived = new Map<string, ArchivedWorkspace>();

/** Called by the archive flow outside Tauri, so the archived list has the row. */
export function rememberBrowserArchived(ws: ArchivedWorkspace) {
  browserArchived.set(ws.id, ws);
}

/* ---- backend ---- */

export async function archiveWorkspace(workspaceId: string, mode: ArchiveMode): Promise<Archived> {
  if (!inTauri()) return { archiveCommit: null, warnings: [] };
  return invoke<Archived>("archive_workspace", { workspaceId, mode });
}

/** Archived rows from conductor.db, newest first. */
export async function listArchivedWorkspaces(): Promise<ArchivedWorkspace[]> {
  if (!inTauri()) return [...browserArchived.values()].reverse();
  const rows = await invoke<DbWorkspaceRow[]>("db_list_workspaces");
  return archivedFromRows(rows);
}

export async function unarchiveWorkspace(workspaceId: string): Promise<Unarchived> {
  if (!inTauri()) {
    const ws = browserArchived.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");
    browserArchived.delete(workspaceId);
    const row: DbWorkspaceRow = {
      id: ws.id,
      repositoryId: ws.repoId,
      directoryName: ws.name,
      workspaceName: ws.name,
      branch: ws.branch,
      placeholderBranchName: null,
      state: "ready",
      derivedStatus: null,
      manualStatus: null,
      workspacePath: null,
      pinnedAt: null,
      unread: false,
      number: null,
      prTitle: null,
      prDescription: null,
      createdAt: new Date(ws.createdAt).toISOString(),
    };
    return { workspace: row, warning: null };
  }
  return invoke<Unarchived>("unarchive_workspace", { workspaceId });
}
