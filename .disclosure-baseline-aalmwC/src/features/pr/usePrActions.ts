// parity:pr.create:ui parity:pr.merge:ui parity:pr.review-actions:ui parity:pr.commit-push:ui parity:pr.resolve-conflicts:ui
// The workspace PR actions shared by the header control and the keyboard
// shortcuts: Create PR, Commit and push and Resolve (merge conflicts), each
// an agent message, then Merge, Ready for review, Approve and Open on GitHub. Each one refreshes the PR afterwards, as the reference
// does after every PR write (index @ ~715,300, ~719,500, ~724,300).
import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "../../backend.ts";
import { approvePr, commitAndPushPrompt, createPrPrompt, markReady, mergeMethod, mergePr, repoPrompt, resolveConflictsPrompt, setAutoMerge } from "./api.ts";
import { createPrRequest } from "./createPr.ts";
import type { PullRequest } from "./usePullRequest.ts";
import type { MergeMethod } from "./types.ts";

export type Busy = null | "creating" | "committing" | "resolving" | "merging" | "marking-ready" | "approving" | "automerge";
type Notify = (kind: "info" | "error", message: string) => void;

export interface PrActionsArgs {
  pullRequest: PullRequest;
  /** Repository id in conductor.db, for its custom prompts. */
  repoId: string;
  /** The repository's main checkout, for the settings-file Create PR prompt. */
  repoPath?: string | null;
  worktree: string | null;
  branch: string;
  targetBranch: string;
  /** The workspace's stored PR title and description (`pr_title`, `pr_description`); Create PR uses them verbatim. */
  prTitle?: string | null;
  prDescription?: string | null;
  sendToAgent: (text: string) => void;
  /** Put the diff's unsent comments into the chat composer (the review comments' "Add all to chat"). */
  addCommentsToChat?: () => void;
  notify?: Notify;
}

export interface PrActions {
  busy: Busy;
  /** The repository's merge method, once known (for the Merge tooltip). */
  method: MergeMethod | null;
  create: (draft: boolean) => Promise<void>;
  /** Ask the agent to commit and push all changes. */
  commitAndPush: () => Promise<void>;
  /** Ask the agent to resolve the PR's merge conflicts with its base branch. */
  resolveConflicts: () => Promise<void>;
  merge: () => Promise<void>;
  markReady: () => Promise<void>;
  approve: () => Promise<void>;
  /** Turn GitHub auto-merge on (repository method) or off. */
  automerge: (enabled: boolean) => Promise<void>;
  /** Changes requested: put the diff's unsent comments into the chat. */
  addCommentsToChat: () => void;
  openOnGitHub: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function usePrActions({ pullRequest, repoId, repoPath = null, worktree, branch, targetBranch, prTitle, prDescription, sendToAgent, addCommentsToChat, notify }: PrActionsArgs): PrActions {
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
        async () => {
          const request = await createPrRequest({ branch, remote: git?.remote ?? "origin", targetBranch, draft, worktree, repoId, repoPath, title: prTitle, description: prDescription });
          sendToAgent(await createPrPrompt(request));
        },
        "Couldn't start the PR",
      ),
    [run, sendToAgent, branch, git?.remote, targetBranch, worktree, repoId, repoPath, prTitle, prDescription],
  );

  const commitAndPush = useCallback(
    () => run("committing", async () => sendToAgent(await commitAndPushPrompt()), "Couldn't ask the agent to commit and push"),
    [run, sendToAgent],
  );

  // As in the reference: the PR's base branch, else the workspace's target.
  const conflictTarget = pr?.baseRefName || targetBranch;
  const resolveConflicts = useCallback(async () => {
    if (!worktree) return;
    await run(
      "resolving",
      async () => sendToAgent(await resolveConflictsPrompt(worktree, conflictTarget, await repoPrompt(repoId, "resolveMergeConflicts"))),
      "Couldn't ask the agent to resolve the conflicts",
    );
  }, [run, sendToAgent, worktree, conflictTarget, repoId]);

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

  const addComments = useCallback(() => addCommentsToChat?.(), [addCommentsToChat]);

  return { busy, method, create, commitAndPush, resolveConflicts, merge, markReady: ready, approve, automerge, addCommentsToChat: addComments, openOnGitHub };
}
