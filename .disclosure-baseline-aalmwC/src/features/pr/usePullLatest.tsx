// "Pull latest from <target>", shared by the Changes panel's button and the
// `git.pull` shortcut (⌘⇧L). Conductor runs one `gitPullLatestFromTarget`
// mutation per workspace for both and counts it as pulling while it runs
// (renderApp `Y4s` / `LFt`, index `sVt`); see pullLatest.ts for the rules.
import { useCallback, useRef, useState } from "react";
import { ArrowDownIcon } from "../../components/Icons.tsx";
import { pullLatestFromTarget } from "./api.ts";
import { pullButton, pullEffect, pullFailedToast, pullLabel, pullShortcutTarget, type PullLatestInputs } from "./pullLatest.ts";
import type { PullRequest } from "./usePullRequest.ts";

type Notify = (kind: "info" | "error", message: string) => void;

export interface PullLatestArgs {
  pullRequest: PullRequest;
  worktree: string | null;
  targetBranch: string;
  readOnly: boolean;
  sendToAgent: (text: string) => void;
  /** Re-read the workspace's changes once the pull is done. */
  refreshChanges: () => void;
  notify?: Notify;
}

export interface PullLatest {
  pulling: boolean;
  /** Pull `target` into the workspace branch. */
  pull: (target: string) => Promise<void>;
  /** The rule inputs (without `agentWorking`) for pullButton / pullShortcutTarget. */
  inputs: PullLatestInputs;
  /** `git.pull`: pull when the shortcut applies; false passes the key on. */
  shortcut: () => boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function usePullLatest({ pullRequest, worktree, targetBranch, readOnly, sendToAgent, refreshChanges, notify }: PullLatestArgs): PullLatest {
  const { pr, git, refresh } = pullRequest;
  const [pulling, setPulling] = useState(false);
  const pullingRef = useRef(false);

  const pull = useCallback(
    async (target: string) => {
      if (pullingRef.current) return;
      if (!worktree) {
        notify?.("error", "Workspace path not found");
        return;
      }
      pullingRef.current = true;
      setPulling(true);
      try {
        const outcome = await pullLatestFromTarget(worktree, git?.hasRemote ? (git.remote ?? null) : null, target);
        const effect = pullEffect(outcome, target);
        if (effect.kind === "toast") notify?.(effect.level, effect.message);
        else if (effect.kind === "agent") sendToAgent(effect.message);
        refreshChanges();
      } catch (e) {
        notify?.("error", pullFailedToast(message(e)));
      } finally {
        pullingRef.current = false;
        setPulling(false);
        await refresh();
      }
    },
    [worktree, git?.hasRemote, git?.remote, notify, sendToAgent, refreshChanges, refresh],
  );

  const inputs: PullLatestInputs = { pr, git, targetBranch, readOnly, pulling };
  const shortcut = () => {
    const target = pullShortcutTarget({ ...inputs, pulling: pullingRef.current });
    if (target === null) return false;
    void pull(target);
    return true;
  };
  return { pulling, pull, inputs, shortcut };
}

/** The Changes panel's button (Conductor's text variant): arrow, then muted label. */
export function PullLatestButton({ pullLatest, agentWorking }: { pullLatest: PullLatest; agentWorking: boolean }) {
  const button = pullButton({ ...pullLatest.inputs, agentWorking });
  if (!button) return null;
  const { pulling } = pullLatest;
  return (
    <button type="button" className="oc-pull-latest" disabled={button.disabled} onClick={() => void pullLatest.pull(button.target)}>
      {pulling ? <span className="clone-spinner oc-pull-latest-spinner" aria-hidden /> : <ArrowDownIcon size={12} />}
      <span>{pullLabel(button, pulling)}</span>
    </button>
  );
}
