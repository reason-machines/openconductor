// Bridge to `archive_workspace` and `unarchive_workspace`
// (src-tauri/src/workspace_archive_commands.rs);
// types, copy and UI decisions are in archiveModel.ts.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
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
