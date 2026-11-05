// parity:pr.archive-on-merge:ui
// React side of archive on merge (see archiveOnMerge.ts). `archiveAfterMerge`
// is Conductor's `mGe` (index-BGEQ8YjU.js @ ~668,515): read the setting for
// the repository, refuse while an agent runs, archive, then toast
// "PR #N merged and workspace archived" with Open PR and Unarchive.
// `useArchiveOnMerge` feeds the open workspace's lookups; the watcher polls
// every other workspace of every repository.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, type Dispatch } from "react";
import { openUrl } from "../../backend";
import { chatSnapshot } from "../chat/reasonChat";
import type { ToastAction } from "../../components/toastTiming";
import type { Action } from "../../state/store";
import type { Repo, Workspace } from "../../state/types";
import { getSettings } from "../../settings/api";
import { AGENT_RUNNING_MESSAGE, archiveDecision, archivedMessage, archivedToastActions, archiveFailedMessage, archiveOnMergeEnabled, lastPrNumber, observeLookup, watchedWorkspaces } from "./archiveOnMerge";
import type { LookupRequest, LookupResult, PrLookup } from "./types";

export type ArchiveNotify = (kind: "info" | "error", message: string, opts?: { action?: ToastAction; secondaryAction?: ToastAction }) => void;

const readUserSetting = async () => (await getSettings()).git.archive_on_merge === true;

/** What the repository's settings files set for `git.archive_on_merge`; null leaves it to the user setting. */
async function repoArchiveOnMerge(repoId: string): Promise<boolean | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<boolean | null>("repo_archive_on_merge", { repoId });
  } catch (e) {
    // A repository missing from conductor.db has no settings files of its own.
    console.warn("archive on merge: no repository setting", e);
    return null;
  }
}

type AfterMerge = {
  repo: Repo;
  workspace: Workspace;
  merged: { number: number; url: string };
  dispatch: Dispatch<Action>;
  agentWorking: boolean;
  notify?: ArchiveNotify;
  /** Reads `git.archive_on_merge` from the user settings; the settings file by default. */
  readSetting?: () => Promise<boolean>;
} & ArchiveCalls;

/**
 * The app's archive flow (src/workspace/useArchiveFlow.tsx): `archive`
 * checkpoints and removes the worktree through the backend and rejects on
 * failure; `unarchive` restores it. Without them only the store changes.
 */
export interface ArchiveCalls {
  archive?: (target: { repoId: string; workspaceId: string }) => Promise<void>;
  unarchive?: (workspaceId: string) => void | Promise<void>;
}

export async function archiveAfterMerge({ repo, workspace, merged, dispatch, agentWorking, notify, readSetting = readUserSetting, archive, unarchive }: AfterMerge): Promise<void> {
  try {
    const [user, override] = await Promise.all([readSetting(), repoArchiveOnMerge(repo.id)]);
    const decision = archiveDecision({ enabled: archiveOnMergeEnabled(user, override), archived: workspace.status === "archived", agentWorking });
    if (decision === "agent-running") notify?.("error", AGENT_RUNNING_MESSAGE);
    if (decision !== "archive") return;
    const target = { repoId: repo.id, workspaceId: workspace.id };
    if (archive) await archive(target);
    else dispatch({ type: "archiveWorkspace", ...target });
    const buttons = archivedToastActions(merged);
    notify?.("info", archivedMessage(merged.number), {
      action: buttons.action ? { label: "Open PR", onClick: () => void openUrl(merged.url) } : undefined,
      secondaryAction: {
        label: "Unarchive",
        onClick: () => (unarchive ? void unarchive(workspace.id) : dispatch({ type: "restoreWorkspace", repoId: repo.id, workspace })),
      },
    });
  } catch (e) {
    notify?.("error", archiveFailedMessage(e instanceof Error ? e.message : String(e)));
  }
}

export interface ArchiveOnMergeArgs extends ArchiveCalls {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  agentWorking: boolean;
  notify?: ArchiveNotify;
  readSetting?: () => Promise<boolean>;
}

/** The `onLookup` callback for `usePullRequest` (the open workspace). */
export function useArchiveOnMerge(args: ArchiveOnMergeArgs): (next: PrLookup, previous: PrLookup | null) => void {
  const latest = useRef(args);
  latest.current = args;
  return useCallback((next: PrLookup) => {
    const merged = observeLookup(latest.current.workspace.id, next);
    if (merged) void archiveAfterMerge({ ...latest.current, merged });
  }, []);
}

/** How often the watcher looks up the PRs of workspaces that are not open. */
export const WATCH_INTERVAL_MS = 60_000;

interface WatcherArgs extends ArchiveCalls {
  repos: Repo[];
  /** The open workspace; its own lookup reports to the tracker. */
  openWorkspaceId: string | null;
  dispatch: Dispatch<Action>;
  notify: ArchiveNotify;
}

/** Archive on merge for every workspace of every repository, in the desktop app. */
export function useArchiveOnMergeWatcher(args: WatcherArgs): void {
  const latest = useRef(args);
  latest.current = args;
  useEffect(() => {
    if (!isTauri()) return;
    let stopped = false;
    const pass = async () => {
      const user = await readUserSetting().catch(() => false);
      for (const repo of latest.current.repos) {
        if (stopped) return;
        const workspaces = watchedWorkspaces(repo, latest.current.openWorkspaceId);
        if (workspaces.length === 0) continue;
        if (!archiveOnMergeEnabled(user, await repoArchiveOnMerge(repo.id))) continue;
        const requests: LookupRequest[] = workspaces.map((w) => ({
          workspacePath: w.path as string,
          localBranch: w.branch,
          workspaceBranch: w.branch,
          prNumber: lastPrNumber(w.id),
        }));
        let results: LookupResult[];
        try {
          results = await invoke<LookupResult[]>("pr_lookup", { repoPath: repo.path, requests });
        } catch (e) {
          console.warn("archive on merge: PR lookup failed", repo.name, e);
          continue;
        }
        workspaces.forEach((workspace, i) => {
          const lookup = results[i]?.lookup;
          if (!lookup) return;
          const merged = observeLookup(workspace.id, lookup);
          if (!merged) return;
          const { dispatch, notify, archive, unarchive } = latest.current;
          const agentWorking = chatSnapshot(workspace.id).transcript.activeTurn !== null;
          void archiveAfterMerge({ repo, workspace, merged, dispatch, agentWorking, notify, archive, unarchive });
        });
      }
    };
    const first = setTimeout(() => void pass(), 5_000);
    const id = setInterval(() => void pass(), WATCH_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
}
