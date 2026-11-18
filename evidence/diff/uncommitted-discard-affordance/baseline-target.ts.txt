// parity:diff.changes-list:data parity:diff.discard:data
// Which ref "All changes" is compared against, which base a discard uses and
// what workspace.showUncommittedChanges (Cmd+Alt+U) does. Read from Conductor
// 0.87.6 on sven m5 max (evidence/diff/target-ref.md); described in our own
// words, nothing copied.
import type { DiffScope } from "./types.ts";

/** Remote whose `refs/remotes/<remote>/<branch>` is the target ref. Our repos are cloned with git's default name. */
export const TARGET_REMOTE = "origin";

/** What "All changes" is diffed against: a branch name, resolved on the Rust side to `refs/remotes/<remote>/<branch>` when that ref exists. */
export interface DiffTarget {
  branch: string;
  remote: string | null;
}

export interface TargetInputs {
  /** Base branch of the workspace's pull request, when it has one. */
  prBase: string | null;
  /** Whether that pull request is merged (a merged PR no longer decides the target). */
  prMerged: boolean;
  /** `workspaces.intended_target_branch`. */
  intended: string | null | undefined;
  /** Used when the workspace has no target stored (Conductor falls back to "main"; we use the repo's default branch). */
  fallback: string;
}

/**
 * The workspace's target branch, as Conductor picks it: the base of its open
 * (unmerged) pull request, else the workspace's intended target branch.
 * Conductor also lets a Graphite stack parent win; we have no stacks.
 */
export function targetBranch({ prBase, prMerged, intended, fallback }: TargetInputs): string {
  if (prBase && !prMerged) return prBase;
  return intended?.trim() || fallback;
}

/** The `scope` of a `diff_workspace` / `diff_discard_file` request (Rust `diff::git::Scope`). */
export type ScopeRequest = { kind: "all"; base: string; remote: string | null } | { kind: "uncommitted" } | { kind: "commit"; hash: string };

export function scopeRequest(scope: DiffScope, target: DiffTarget): ScopeRequest {
  if (typeof scope === "object") return { kind: "commit", hash: scope.commitHash };
  return scope === "all" ? { kind: "all", base: target.branch, remote: target.remote } : { kind: "uncommitted" };
}

/** Where a discard was asked from: the file's context menu, or the revert icon in the list or file header. */
export type DiscardSource = "menu" | "view";

/**
 * Scope a discard restores from, or null when it is not offered. The context
 * menu always discards against the "All changes" base, in every view (turn
 * view included: Conductor opens that menu with hasChanges set for every
 * changed file). The revert icons use the view's own scope and are hidden in
 * the per-turn view.
 */
export function discardScope(source: DiscardSource, view: DiffScope, inTurn: boolean): DiffScope | null {
  if (source === "menu") return "all";
  return inTurn || typeof view === "object" ? null : view;
}

/** Right-panel tab and changes scope after Cmd+Alt+U: Uncommitted, or back to All changes if already there. */
export function showUncommittedChanges(tab: string, scope: DiffScope, inTurn: boolean): { tab: "changes"; scope: DiffScope } {
  const showingUncommitted = tab === "changes" && scope === "uncommitted" && !inTurn;
  return { tab: "changes", scope: showingUncommitted ? "all" : "uncommitted" };
}
