// parity:pr.archive-on-merge:ui
// React side of archive on merge (see archiveOnMerge.ts).
import { useCallback, useRef, type Dispatch } from "react";
import type { Action } from "../../state/store";
import type { Repo, Workspace } from "../../state/types";
import { getSettings } from "../../settings/api";
import { AGENT_RUNNING_MESSAGE, archiveDecision, archivedMessage, archiveFailedMessage, mergedTransition } from "./archiveOnMerge";
import type { PrLookup } from "./types";

export interface ArchiveOnMergeArgs {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  agentWorking: boolean;
  notify?: (kind: "info" | "error", message: string) => void;
  /** Reads `git.archive_on_merge`; the settings file by default. */
  readSetting?: () => Promise<boolean>;
}

const readArchiveOnMerge = async () => (await getSettings()).git.archive_on_merge === true;

/** The `onLookup` callback for `usePullRequest`. */
export function useArchiveOnMerge(args: ArchiveOnMergeArgs): (next: PrLookup, previous: PrLookup | null) => void {
  const latest = useRef(args);
  latest.current = args;
  return useCallback((next: PrLookup, previous: PrLookup | null) => {
    const merged = mergedTransition(next, previous);
    if (!merged) return;
    void (async () => {
      const { repo, workspace, dispatch, agentWorking, notify, readSetting = readArchiveOnMerge } = latest.current;
      try {
        const decision = archiveDecision({ enabled: await readSetting(), archived: workspace.status === "archived", agentWorking });
        if (decision === "agent-running") notify?.("error", AGENT_RUNNING_MESSAGE);
        if (decision !== "archive") return;
        dispatch({ type: "archiveWorkspace", repoId: repo.id, workspaceId: workspace.id });
        notify?.("info", archivedMessage(merged.number));
      } catch (e) {
        notify?.("error", archiveFailedMessage(e instanceof Error ? e.message : String(e)));
      }
    })();
  }, []);
}
