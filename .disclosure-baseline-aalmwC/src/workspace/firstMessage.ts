// Applies the placeholder -> generated rename once a workspace gets its first
// message (sent from the Create-workspace dialog or the workspace chat).
import type { Dispatch } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { planWorkspaceRename } from "./rename";
import { renameWorkspaceBranch } from "./api";

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
  dispatch({ type: "renameWorkspace", repoId: repo.id, workspaceId: ws.id, name: plan.workspace_name, branch });
}
