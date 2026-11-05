// parity:sidebar.ws-status
// PR lookups for sidebar rows that are on screen but not open, so their status
// icon shows the PR (merged, checks failing, ready to merge, ...) after a
// restart and without opening them. Conductor keeps PR info in memory and
// re-reads it on this schedule (src/state/sidebarPrPoll.ts); conductor.db
// keeps only the PR's title and body and the derived status, which this poll
// stores through `pr_sync_workspace` as the open workspace does.
import { useEffect, useRef, type Dispatch } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Action } from "../../state/store";
import type { Workspace } from "../../state/types";
import { PrPollScheduler, prPollable, type PrPollSub } from "../../state/sidebarPrPoll.ts";
import { syncWorkspace } from "./api.ts";
import { rowPrOf } from "./rowPr.ts";
import { derivedStatusChange } from "./workspaceSync.ts";
import type { LookupRequest, LookupResult } from "./types.ts";

interface RowSub extends PrPollSub {
  request: LookupRequest;
  onResult: (r: LookupResult) => void;
}

const scheduler = new PrPollScheduler<RowSub>(
  async (repoPath, subs) => {
    const results = await invoke<LookupResult[]>("pr_lookup", { repoPath, requests: subs.map((s) => s.request) });
    subs.forEach((s, i) => {
      const r = results[i];
      if (r) s.onResult(r);
    });
  },
  { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
);

/** Show a lookup on the row and store what conductor.db keeps of it. */
export function applyRowLookup(dispatch: Dispatch<Action>, repoId: string, ws: Workspace, result: LookupResult, optionalChecksBlock: boolean): void {
  const lookup = result.lookup;
  if (!lookup) return;
  const info = lookup.kind === "found" ? lookup.info : null;
  if (info) dispatch({ type: "setWorkspacePr", repoId, workspaceId: ws.id, prTitle: info.title, prDescription: info.body ?? null, pr: rowPrOf(info, optionalChecksBlock) });
  else dispatch({ type: "setWorkspacePr", repoId, workspaceId: ws.id, prTitle: ws.prTitle ?? null, pr: null });
  const status = result.derivedStatus;
  if (!status) return;
  const textChanged = info !== null && (info.title !== (ws.prTitle ?? null) || (info.body ?? null) !== (ws.prDescription ?? null));
  if (!derivedStatusChange(ws.derivedStatus, status) && !textChanged) return;
  const apply = () => dispatch({ type: "setWorkspaceDerivedStatus", repoId, workspaceId: ws.id, status });
  syncWorkspace(ws.id, status, info?.title ?? null, info?.body ?? null).then(
    (r) => r.statusChanged && apply(),
    (e: unknown) => console.warn("Couldn't store the workspace's PR status:", e),
  );
}

interface RowPollArgs {
  ws: Workspace;
  repoPath: string | undefined;
  onScreen: boolean;
  active: boolean;
  onResult: (r: LookupResult) => void;
}

/** Poll the row's PR every 5 minutes while it is on screen and not the open workspace (desktop app only). */
export function useRowPrPoll({ ws, repoPath, onScreen, active, onResult }: RowPollArgs): void {
  const latest = useRef(onResult);
  latest.current = onResult;
  const enabled = isTauri() && !active && onScreen && Boolean(repoPath) && Boolean(ws.path) && prPollable(ws.state);
  const prNumber = ws.pr?.number ?? null;
  useEffect(() => {
    if (!enabled || !repoPath || !ws.path) return;
    const request: LookupRequest = { workspacePath: ws.path, localBranch: ws.branch, workspaceBranch: ws.branch, prNumber };
    return scheduler.subscribe({ workspaceId: ws.id, repoPath, request, onResult: (r) => latest.current(r) });
  }, [enabled, repoPath, ws.id, ws.path, ws.branch, prNumber]);
  // The open workspace reads its PR every 30 s itself; leaving it should not refetch at once.
  useEffect(() => {
    if (!active) return;
    scheduler.markFresh(ws.id);
    return () => scheduler.markFresh(ws.id);
  }, [active, ws.id]);
}
