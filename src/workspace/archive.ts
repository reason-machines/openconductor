// Bridge to `archive_workspace` and `unarchive_workspace`
// (src-tauri/src/workspace_archive_commands.rs);
// types, copy and UI decisions are in archiveModel.ts.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import { chatStatuses } from "../features/chat/chatRuntime.ts";
import { chatAgentStatuses } from "../features/chat/chatStatus.ts";
import { stopChat } from "../features/chat/reasonChat";
import { stopCodex } from "../features/chat/codexChat";
import { workspaceOfChat, workspaceSessionStatus } from "../state/workspaceSessions";
import type { ArchiveMode, ArchiveResult, UnarchiveResult } from "./archiveModel.ts";

export * from "./archiveModel.ts";

/** Runs the full archive. Outside Tauri there is no worktree: it just succeeds. */
export async function archiveWorkspace(workspaceId: string, mode: ArchiveMode = "safe"): Promise<ArchiveResult> {
  if (!inTauri()) return { archived: true, branch: null, archiveCommit: null, notices: [] };
  return invoke<ArchiveResult>("archive_workspace", { workspaceId, mode });
}


/** Recreates an archived workspace's worktree. Outside Tauri there is none: it just succeeds. */
export async function unarchiveWorkspace(workspaceId: string): Promise<UnarchiveResult> {
  if (!inTauri()) return { restored: true, branch: null, recreatedBranch: false, restoredChanges: false, notices: [] };
  return invoke<UnarchiveResult>("unarchive_workspace", { workspaceId });
}

/** The workspace's session status over all its chats (main, background, review), for `blockedByAgents`. */
export function workspaceAgentStatus(workspaceId: string): string {
  return workspaceSessionStatus(chatStatuses(), workspaceId);
}

/**
 * "Stop agents and archive": stop the running turn of every chat in the
 * workspace, including one waiting on the user (a needs-* status is a turn
 * that still runs).
 */
export function stopWorkspaceAgents(workspaceId: string): void {
  for (const chatId of chatStatuses().keys()) {
    if (workspaceOfChat(chatId) !== workspaceId) continue;
    for (const [agent, status] of chatAgentStatuses(chatId)) {
      if (status === "idle" || status === "error") continue;
      (agent === "codex" ? stopCodex : stopChat)(chatId);
    }
  }
}
