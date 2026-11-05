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
  /** Archives through the backend (src/workspace/useArchiveFlow); rejects on failure. Defaults to the store action. */
  archive?: (target: { repoId: string; workspaceId: string }) => Promise<void>;
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
      const { repo, workspace, dispatch, agentWorking, notify, readSetting = readArchiveOnMerge, archive } = latest.current;
      try {
        const decision = archiveDecision({ enabled: await readSetting(), archived: workspace.status === "archived", agentWorking });
        if (decision === "agent-running") notify?.("error", AGENT_RUNNING_MESSAGE);
        if (decision !== "archive") return;
        const target = { repoId: repo.id, workspaceId: workspace.id };
        if (archive) await archive(target);
        else dispatch({ type: "archiveWorkspace", ...target });
        notify?.("info", archivedMessage(merged.number));
      } catch (e) {
        notify?.("error", archiveFailedMessage(e instanceof Error ? e.message : String(e)));
      }
    })();
  }, []);
}
