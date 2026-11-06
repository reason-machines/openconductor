// parity:pr.archive-on-merge:data
// Archive on merge (`git.archive_on_merge`): when a workspace's PR is seen
// turning merged, archive the workspace. Reference: Conductor 0.87.6
// `index-BGEQ8YjU.js` @ ~668,500 (gGe/mGe), see evidence/pr/NOTES.md. It
// fires on the PR lookup transition, not on the merge button, so a merge done
// on GitHub archives it too; an in-app merge gets there through the refresh
// that follows it. As in Conductor's PR service (index @ ~768,300, where every
// fetched PR runs `gGe`), it covers every workspace: the open one through its
// own lookup, the others through the background watcher
// (useArchiveOnMergeWatcher). Both report to one tracker, so a merge is acted
// on once whichever lookup sees it first.
import type { Action } from "../../state/store";
import type { Repo, Workspace } from "../../state/types";
import type { PrLookup } from "./types";

/** The same PR number went from open to merged between two lookups. */
export function mergedTransition(next: PrLookup, previous: PrLookup | null): { number: number; url: string } | null {
  if (next.kind !== "found" || previous?.kind !== "found") return null;
  const [now, before] = [next.info, previous.info];
  if (now.number !== before.number || before.isMerged || !now.isMerged) return null;
  return { number: now.number, url: now.url };
}

/** Last lookup seen per workspace, from either source. */
const lastLookup = new Map<string, PrLookup>();

/** Record a lookup; the merge it reveals, if this is the first lookup to see it. */
export function observeLookup(workspaceId: string, next: PrLookup): { number: number; url: string } | null {
  const previous = lastLookup.get(workspaceId) ?? null;
  lastLookup.set(workspaceId, next);
  return mergedTransition(next, previous);
}

/** The PR number last seen for a workspace, so the next lookup asks for that PR. */
export function lastPrNumber(workspaceId: string): number | null {
  const last = lastLookup.get(workspaceId);
  return last?.kind === "found" ? last.info.number : null;
}

/** The workspaces the watcher looks up: live, with a worktree, not the open one. */
export function watchedWorkspaces(repo: Repo, openWorkspaceId: string | null): Workspace[] {
  return repo.workspaces.filter((w) => w.path && w.status !== "archived" && w.id !== openWorkspaceId);
}

/** Forget a workspace (tests, or a workspace that is gone). */
export function forgetLookup(workspaceId?: string): void {
  if (workspaceId === undefined) lastLookup.clear();
  else lastLookup.delete(workspaceId);
}

/**
 * `getSettingForRepo("archive_on_merge")`: a repository's settings files win
 * over the user setting (repo_archive_on_merge returns null when they leave it).
 */
export const archiveOnMergeEnabled = (user: boolean, repoOverride: boolean | null) => repoOverride ?? user;

export type ArchiveDecision = "archive" | "off" | "already-archived" | "agent-running";

/**
 * What to do once a merge was seen. Every workspace here is local, so the
 * reference's "skip cloud workspaces" rule never applies.
 */
export function archiveDecision(args: { enabled: boolean; archived: boolean; agentWorking: boolean }): ArchiveDecision {
  if (!args.enabled) return "off";
  if (args.archived) return "already-archived";
  if (args.agentWorking) return "agent-running";
  return "archive";
}

export const archivedMessage = (number: number) => `PR #${number} merged and workspace archived`;
export const AGENT_RUNNING_MESSAGE = "Merged PR, but workspace was not archived because agents are still running";
export const archiveFailedMessage = (detail: string) => `Merged PR, but failed to archive workspace: ${detail}`;

/** What the toast's Unarchive dispatches: the store's one unarchive, so a deleted or moved branch opens "Restore to new branch?". */
export function unarchiveOnMergeAction(repoId: string, workspaceId: string): Extract<Action, { type: "unarchiveWorkspace" }> {
  return { type: "unarchiveWorkspace", repoId, workspaceId };
}

/** Toast buttons after an archive on merge: "Open PR" when the URL is known, then "Unarchive". */
export function archivedToastActions(merged: { number: number; url: string }): { action?: "open-pr"; secondary: "unarchive" } {
  return merged.url && merged.number ? { action: "open-pr", secondary: "unarchive" } : { secondary: "unarchive" };
}
