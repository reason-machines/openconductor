// Applies the placeholder -> generated rename once a workspace gets its first
// message (sent from the Create-workspace dialog or the workspace chat).
import type { Dispatch } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { planWorkspaceRename } from "./rename";
import { renameWorkspaceBranch } from "./api";
import { renameWorkspaceRecord } from "../backend";

export async function renameAfterFirstMessage(repo: Repo, ws: Workspace, message: string, dispatch: Dispatch<Action>): Promise<void> {
  const plan = planWorkspaceRename(repo, ws, message);
  if (plan.placeholder_branch_name !== null) return;
  let branch = plan.branch;
  if (branch) {
    try {
      await renameWorkspaceBranch(ws.id, branch);
    } catch {
      // No backend rename yet (or it failed): keep the branch the worktree has.
      branch = undefined;
    }
  }
  // Persist the workspace name so it survives a restart (Bug H8-2: previously
  // only an in-memory dispatch was made, losing workspace_name on restart).
  if (plan.workspace_name !== undefined) {
    const newDirName = branch ?? ws.directoryName ?? ws.id.split("/").pop() ?? ws.id;
    try {
      await renameWorkspaceRecord(ws.id, newDirName, plan.workspace_name ?? null);
    } catch {
      // Non-fatal: in-memory rename still improves UX for this session.
    }
  }
  dispatch({ type: "renameWorkspace", repoId: repo.id, workspaceId: ws.id, name: plan.workspace_name, branch,
    ...(branch !== undefined ? { directoryName: branch } : {}) });
}
