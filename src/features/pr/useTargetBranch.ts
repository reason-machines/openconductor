// parity:pr.review-actions:ui
// Changing a workspace's target branch (Conductor's `changeTargetBranch`,
// see targetBranch.ts): retarget an open PR whose base differs
// (`pr_retarget`), then save `intended_target_branch`
// (`db_set_workspace_target_branch`) and refresh the PR lookup. Not built:
// Conductor's reset of a clean, unpushed workspace onto the new target, and
// the Graphite-stack lock.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useState, type Dispatch } from "react";
import type { Action } from "../../state/store";
import type { Repo, Workspace } from "../../state/types";
import { retargetPr } from "./edit/api";
import { retargetErrorMessage } from "./edit/edit";
import { effectiveTargetBranch, planTargetChange, savedAfterRetargetFailed } from "./targetBranch";
import type { PrInfo } from "./types";

interface Args {
  repo: Repo;
  workspace: Workspace;
  pr: PrInfo | null;
  refresh: () => Promise<void>;
  dispatch: Dispatch<Action>;
}

export interface TargetBranch {
  /** The branch the workspace merges into now. */
  branch: string;
  disabledReason: string | null;
  changing: boolean;
  error: string | null;
  /** Resolves to an error message, or null once changed (or nothing to change). */
  change: (next: string) => Promise<string | null>;
}

export function useTargetBranch({ repo, workspace, pr, refresh, dispatch }: Args): TargetBranch {
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = workspace.status === "archived";
  const intended = workspace.targetBranch ?? null;

  const change = useCallback(
    async (next: string): Promise<string | null> => {
      const plan = planTargetChange({ archived, pr, intended, repoDefault: repo.defaultBranch }, next);
      if (plan.kind === "refuse") return fail(plan.message);
      if (plan.kind === "noop") return null;
      setChanging(true);
      setError(null);
      try {
        if (plan.retarget !== null) {
          try {
            await retargetPr(workspace.path ?? "", plan.retarget, plan.branch);
          } catch (e) {
            void refresh();
            return fail(retargetErrorMessage(e));
          }
        }
        try {
          if (isTauri()) await invoke("db_set_workspace_target_branch", { workspaceId: workspace.id, branch: plan.branch });
        } catch (e) {
          if (plan.retarget !== null) return fail(savedAfterRetargetFailed(plan.retarget, plan.branch, e));
          return fail(`Failed to change target branch: ${e instanceof Error ? e.message : String(e)}`);
        }
        dispatch({ type: "setWorkspaceTargetBranch", repoId: repo.id, workspaceId: workspace.id, branch: plan.branch });
        void refresh();
        return null;
      } finally {
        setChanging(false);
      }
      function fail(message: string) {
        setError(message);
        return message;
      }
    },
    [archived, pr, intended, repo.defaultBranch, repo.id, workspace.id, workspace.path, refresh, dispatch],
  );

  return {
    branch: effectiveTargetBranch(pr, intended, repo.defaultBranch),
    disabledReason: archived ? "Target branch cannot be changed for archived workspaces" : null,
    changing,
    error,
    change,
  };
}
