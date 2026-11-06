// "Pull latest from <target>": when Conductor offers it and what it does with
// the result (REA on the shipped bundle, strings read as data):
// - the `git.pull` shortcut (⌘⇧L, priority HIGH): renderApp `Wds` @ ~2,299,746;
// - the button: renderApp `Y4s` @ ~2,818,200, drawn in the Changes panel's
//   empty state (All changes scope) @ ~2,821,988;
// - the mutation: index `aNt` / `iNt` @ ~3,207,400 (src-tauri/src/pr/pull_latest.rs).
import type { GitState, PrInfo, PullOutcome } from "./types.ts";

export interface PullLatestInputs {
  pr: PrInfo | null;
  git: GitState | null;
  /** The workspace's intended target branch. */
  targetBranch: string;
  /** Archived workspaces are read-only. */
  readOnly: boolean;
  /** A pull is already running for this workspace. */
  pulling: boolean;
}

/** The branch to pull: the PR's base, else the workspace's target. */
export const pullTarget = (pr: PrInfo | null, targetBranch: string): string => pr?.baseRefName || targetBranch;

/**
 * `git.pull`: the branch to pull, or null to pass the key on. Like the
 * reference it does not look at a running agent or the remote branch; it
 * stops on read-only, a pull in flight, no target, a merged PR, a conflicting
 * PR, or a target with nothing new. The git state must have loaded, since the
 * remote comes from it.
 */
export function pullShortcutTarget({ pr, git, targetBranch, readOnly, pulling }: PullLatestInputs): string | null {
  if (readOnly || pulling || !targetBranch || !git) return null;
  if (pr?.isMerged || pr?.status?.mergeState === "DIRTY") return null;
  if (git.targetBehind === 0) return null;
  return pullTarget(pr, targetBranch);
}

export interface PullButton {
  target: string;
  behind: number;
  disabled: boolean;
}

/**
 * The Changes panel's "Pull latest from <target> (<n> commits)" button, or
 * null when it is hidden: no target, detached HEAD, merged or conflicting
 * PR, nothing new on the target, the agent working, or the remote branch
 * having commits this workspace lacks (the header's Pull status covers that).
 */
export function pullButton({ pr, git, targetBranch, readOnly, pulling, agentWorking }: PullLatestInputs & { agentWorking: boolean }): PullButton | null {
  if (!targetBranch || !git || git.detached || agentWorking) return null;
  if (pr?.isMerged || pr?.status?.mergeState === "DIRTY") return null;
  if (!git.targetBehind) return null;
  if (git.upstream?.branchExists && git.upstream.behind > 0) return null;
  return { target: pullTarget(pr, targetBranch), behind: git.targetBehind, disabled: readOnly || pulling };
}

export const pullLabel = (b: Pick<PullButton, "target" | "behind">, pulling: boolean): string =>
  pulling ? "Pulling latest..." : `Pull latest from ${b.target} (${b.behind} commits)`;

export const PULLED_TOAST = "Pulled latest changes. You're up to date!";
export const pullFailedToast = (message: string) => `Pulling latest from remote failed: ${message}`;
export const targetMissingToast = (target: string) => `Target branch ${target} does not exist`;

export type PullEffect = { kind: "none" } | { kind: "toast"; level: "info" | "error"; message: string } | { kind: "agent"; message: string };

/** What the app does with the command's outcome. */
export function pullEffect(outcome: PullOutcome, target: string): PullEffect {
  switch (outcome.kind) {
    case "upToDate":
      return { kind: "none" };
    case "pulled":
      return { kind: "toast", level: "info", message: PULLED_TOAST };
    case "agent":
      return { kind: "agent", message: outcome.message };
    case "targetMissing":
      return { kind: "toast", level: "error", message: targetMissingToast(target) };
  }
}
