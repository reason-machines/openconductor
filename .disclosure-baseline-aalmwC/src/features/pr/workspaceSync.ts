// Keep the workspace row in step with its pull request: the status the PR
// implies (none: in progress, open: in review, merged: done, closed:
// canceled) and the PR's title and body. Like the reference (index chunk
// `iLt` / `OQe`, REA-extracted, read as data), a new derived status replaces
// the user's manual one, and nothing is written while the status is unchanged.
import { useCallback, useRef, type Dispatch } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Action } from "../../state/store";
import type { Workspace } from "../../state/types";
import { DEFAULT_DERIVED_STATUS } from "../../state/workspaceStatus.ts";
import { syncWorkspace } from "./api.ts";
import type { PrInfo, WorkspacePrStatus } from "./types.ts";

/** The status to store, or null when `next` is what is stored already. A
 *  workspace with none stored has the column default, in progress (as
 *  `effectiveStatus` reads it), so a branch without a PR changes nothing. */
export function derivedStatusChange(stored: WorkspacePrStatus | null | undefined, next: WorkspacePrStatus): WorkspacePrStatus | null {
  return (stored ?? DEFAULT_DERIVED_STATUS) === next ? null : next;
}

interface Args {
  repoId: string;
  workspace: Pick<Workspace, "id" | "derivedStatus">;
  dispatch: Dispatch<Action>;
}

/** The `onDerivedStatus` callback for `usePullRequest`. */
export function useWorkspacePrSync({ repoId, workspace, dispatch }: Args): (status: WorkspacePrStatus, pr: PrInfo | null) => void {
  const stored = useRef(workspace.derivedStatus);
  stored.current = workspace.derivedStatus;
  // The PR is re-read every 30 s; only a change is worth a database round trip.
  const last = useRef<string | null>(null);
  const workspaceId = workspace.id;
  return useCallback(
    (status: WorkspacePrStatus, pr: PrInfo | null) => {
      const key = JSON.stringify([workspaceId, status, pr?.title ?? null, pr?.body ?? null]);
      if (key === last.current) return;
      last.current = key;
      const apply = () => dispatch({ type: "setWorkspaceDerivedStatus", repoId, workspaceId, status });
      if (!isTauri()) {
        if (derivedStatusChange(stored.current, status)) apply();
        return;
      }
      syncWorkspace(workspaceId, status, pr?.title ?? null, pr?.body ?? null).then(
        (r) => {
          if (r.statusChanged) apply();
        },
        (e: unknown) => {
          last.current = null;
          console.warn("Couldn't store the workspace's PR status:", e);
        },
      );
    },
    [dispatch, repoId, workspaceId],
  );
}
