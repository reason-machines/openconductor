// Bridge to `archive_workspace` and `unarchive_workspace`
// (src-tauri/src/workspace_archive_commands.rs);
// types, copy and UI decisions are in archiveModel.ts.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import { chatStatuses, stopChat } from "../features/chat/reasonChat";
import { workspaceOfChat, workspaceSessionStatus } from "../state/workspaceSessions";
import type { ArchiveMode, ArchiveResult, UnarchiveResult } from "./archiveModel.ts";
import { archivedEntry, archivedFromRows, type ArchivedWorkspace } from "./archivedList.ts";
import type { DbWorkspaceRow } from "../state/persisted";
import type { Workspace } from "../state/types";

export * from "./archiveModel.ts";
export * from "./archivedList.ts";

// Outside Tauri (vite dev, the demo, e2e) archived rows are kept here, so the
// archived list and unarchive can be exercised without conductor.db.
const browserArchived = new Map<string, ArchivedWorkspace>();

/** The store archived `ws` outside the desktop app. */
export function rememberBrowserArchived(repoId: string, ws: Workspace): void {
  browserArchived.set(ws.id, archivedEntry(repoId, ws));
}

/** The browser stand-in's archived workspace, removed from the list. */
export function takeBrowserArchived(workspaceId: string): ArchivedWorkspace | undefined {
  const a = browserArchived.get(workspaceId);
  browserArchived.delete(workspaceId);
  return a;
}

/** Archived workspaces (conductor.db `state = 'archived'`), newest first. */
export async function listArchivedWorkspaces(): Promise<ArchivedWorkspace[]> {
  if (!inTauri()) return [...browserArchived.values()].reverse();
  return archivedFromRows(await invoke<DbWorkspaceRow[]>("db_list_workspaces"));
}

/** Runs the full archive. Outside Tauri there is no worktree: it just succeeds. */
export async function archiveWorkspace(workspaceId: string, mode: ArchiveMode = "safe"): Promise<ArchiveResult> {
  if (!inTauri()) return { archived: true, branch: null, archiveCommit: null, notices: [] };
  return invoke<ArchiveResult>("archive_workspace", { workspaceId, mode });
}


/**
 * Recreates an archived workspace's worktree. With `useNewBranch` it goes on a
 * new, uniquely named branch from the archive commit (the restore dialog's
 * "Restore to new branch"). Outside Tauri there is none: it just succeeds.
 */
export async function unarchiveWorkspace(workspaceId: string, opts: { useNewBranch?: boolean } = {}): Promise<UnarchiveResult> {
  if (!inTauri()) return { restored: true, branch: null, recreatedBranch: false, restoredChanges: false, notices: [], scenario: null };
  return invoke<UnarchiveResult>("unarchive_workspace", { workspaceId, useNewBranch: opts.useNewBranch ?? false });
}

/** The workspace's session status over all its chats (main, background, review), for `blockedByAgents`. */
export function workspaceAgentStatus(workspaceId: string): string {
  return workspaceSessionStatus(chatStatuses(), workspaceId);
}

/** "Stop agents and archive": stop the running turn of every chat in the workspace. */
export function stopWorkspaceAgents(workspaceId: string): void {
  for (const [chatId, status] of chatStatuses()) {
    if (workspaceOfChat(chatId) === workspaceId && (status === "working" || status === "cancelling")) stopChat(chatId);
  }
}

/** "Delete permanently" / "Delete anyway": the row and the workspace folder (`delete_workspace`). */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (!inTauri()) return;
  await invoke("delete_workspace", { workspaceId });
}

/** The directory-exists toast's "Open in Finder". */
export async function revealUnarchiveConflict(workspaceId: string): Promise<void> {
  if (!inTauri()) return;
  await invoke("reveal_unarchive_conflict", { workspaceId });
}

/** "Clear & unarchive": delete the folder in the way; the caller unarchives again. */
export async function clearUnarchiveConflict(workspaceId: string): Promise<void> {
  if (!inTauri()) return;
  await invoke("clear_unarchive_conflict", { workspaceId });
}
