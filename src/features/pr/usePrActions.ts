// parity:pr.create:ui parity:pr.merge:ui parity:pr.review-actions:ui
// The workspace PR actions shared by the header control and the keyboard
// shortcuts: Create PR (an agent message), Merge, Ready for review, Approve
// and Open on GitHub. Each one refreshes the PR afterwards, as the reference
// does after every PR write (index @ ~715,300, ~719,500, ~724,300).
import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "../../backend.ts";
import { approvePr, createPrPrompt, markReady, mergeMethod, mergePr, setAutoMerge } from "./api.ts";
import type { PullRequest } from "./usePullRequest.ts";
import type { MergeMethod } from "./types.ts";

export type Busy = null | "creating" | "merging" | "marking-ready" | "approving" | "automerge";
type Notify = (kind: "info" | "error", message: string) => void;

export interface PrActionsArgs {
  pullRequest: PullRequest;
  worktree: string | null;
  branch: string;
  targetBranch: string;
  sendToAgent: (text: string) => void;
  notify?: Notify;
}

export interface PrActions {
  busy: Busy;
  /** The repository's merge method, once known (for the Merge tooltip). */
  method: MergeMethod | null;
  create: (draft: boolean) => Promise<void>;
  merge: () => Promise<void>;
  markReady: () => Promise<void>;
  approve: () => Promise<void>;
  /** Turn GitHub auto-merge on (repository method) or off. */
  automerge: (enabled: boolean) => Promise<void>;
  openOnGitHub: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function usePrActions({ pullRequest, worktree, branch, targetBranch, sendToAgent, notify }: PrActionsArgs): PrActions {
  const { pr, git, header, refresh } = pullRequest;
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);
  busyRef.current = busy;
  const [method, setMethod] = useState<MergeMethod | null>(null);

  // Only a PR that may be merged needs the method; it is cached per repository in Rust.
  const wantsMethod = header?.action.type === "ready_to_merge";
  useEffect(() => {
    if (!wantsMethod || !worktree) return;
    let live = true;
    mergeMethod(worktree).then(
      (m) => live && setMethod(m),
      () => live && setMethod(null),
    );
    return () => {
      live = false;
    };
  }, [wantsMethod, worktree]);

  const run = useCallback(
    async (kind: Exclude<Busy, null>, action: () => Promise<void>, failure: string) => {
      if (busyRef.current) return;
      busyRef.current = kind;
      setBusy(kind);
      try {
        await action();
      } catch (e) {
        notify?.("error", `${failure}: ${message(e)}`);
      } finally {
        busyRef.current = null;
        setBusy(null);
        await refresh();
      }
    },
    [notify, refresh],
  );

  const create = useCallback(
    (draft: boolean) =>
      run(
        "creating",
        async () => sendToAgent(await createPrPrompt({ branch, remote: git?.remote ?? "origin", targetBranch, draft })),
        "Couldn't start the PR",
      ),
    [run, sendToAgent, branch, git?.remote, targetBranch],
  );

  const merge = useCallback(async () => {
    if (!pr || !worktree) return;
    await run(
      "merging",
      async () => {
        await mergePr(worktree, pr.number);
        notify?.("info", `Merged PR #${pr.number}`);
      },
      "Merge failed",
    );
  }, [pr, worktree, run, notify]);

  const ready = useCallback(async () => {
    if (!pr || !worktree) return;
    await run(
      "marking-ready",
      async () => {
        await markReady(worktree, pr.number);
        notify?.("info", `PR #${pr.number} is ready for review`);
      },
      "Couldn't mark the PR ready",
    );
  }, [pr, worktree, run, notify]);

  const approve = useCallback(async () => {
    if (!pr || !worktree) return;
    await run(
      "approving",
      async () => {
        await approvePr(worktree, pr.number, pr.headRefOid);
        notify?.("info", `Approved PR #${pr.number}`);
      },
      "Approve failed",
    );
  }, [pr, worktree, run, notify]);

  const automerge = useCallback(
    async (enabled: boolean) => {
      if (!pr || !worktree) return;
      await run(
        "automerge",
        async () => {
          await setAutoMerge(worktree, pr.number, enabled);
          notify?.("info", enabled ? `PR #${pr.number} will merge once its checks pass` : `Automerge cancelled for PR #${pr.number}`);
        },
        enabled ? "Couldn't turn on automerge" : "Couldn't cancel automerge",
      );
    },
    [pr, worktree, run, notify],
  );

  const openOnGitHub = useCallback(() => {
    if (pr?.url) void openUrl(pr.url);
  }, [pr?.url]);

  return { busy, method, create, merge, markReady: ready, approve, automerge, openOnGitHub };
}
