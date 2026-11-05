// parity:pr.archive-on-merge:data
// Archive on merge (`git.archive_on_merge`): when a workspace's PR is seen
// turning merged, archive the workspace. Reference: Conductor 0.87.6
// `index-BGEQ8YjU.js` @ ~668,500 (gGe/mGe), see evidence/pr/NOTES.md. It
// fires on the PR lookup transition, not on the merge button, so a merge done
// on GitHub while the workspace is open archives it too; an in-app merge gets
// there through the refresh that follows it.
import type { PrLookup } from "./types";

/** The same PR number went from open to merged between two lookups. */
export function mergedTransition(next: PrLookup, previous: PrLookup | null): { number: number; url: string } | null {
  if (next.kind !== "found" || previous?.kind !== "found") return null;
  const [now, before] = [next.info, previous.info];
  if (now.number !== before.number || before.isMerged || !now.isMerged) return null;
  return { number: now.number, url: now.url };
}

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
