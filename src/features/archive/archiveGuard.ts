// Archive is refused while a git operation is in progress in the workspace
// checkout. Conductor 0.87.6 archives through one routine that saves a
// checkpoint first and throws "can't safely archive ... a Git operation is in
// progress" when the save reports a merge or rebase (`index-BGEQ8YjU.js`
// @ ~970,807, error class @ ~667,799); archive on merge reports the same
// failure as "Merged PR, but failed to archive workspace: ..." (@ ~668,515).
// We probe the checkout with `workspace_git_operation` (the same check order
// as `git-busy-check.sh`) before marking the workspace archived. The wording
// is our own.
import { invoke, isTauri } from "@tauri-apps/api/core";

/** `workspace_git_operation`'s answer: the operation in progress, or null. */
export type GitOperation = "rebase" | "merge" | "squash-merge" | "cherry-pick" | "revert";

const OPERATION_TEXT: Record<GitOperation, string> = {
  rebase: "a rebase",
  merge: "a merge",
  "squash-merge": "a squash merge with conflicts",
  "cherry-pick": "a cherry-pick",
  revert: "a revert",
};

export function archiveBlockedMessage(op: GitOperation): string {
  return `Can't archive this workspace while ${OPERATION_TEXT[op] ?? "a Git operation"} is in progress. Finish or abort it first.`;
}

export async function readGitOperation(worktree: string): Promise<GitOperation | null> {
  if (!isTauri()) return null;
  return invoke<GitOperation | null>("workspace_git_operation", { worktree });
}

/**
 * Why archive is refused now, or null when it may go ahead. A workspace with
 * no checkout has nothing to protect; a checkout that cannot be read (deleted,
 * not a git directory) is let through, so a broken workspace can still be
 * archived.
 */
export async function archiveBlocker(worktree: string | null, read: (worktree: string) => Promise<GitOperation | null> = readGitOperation): Promise<string | null> {
  if (!worktree) return null;
  let op: GitOperation | null;
  try {
    op = await read(worktree);
  } catch (e) {
    console.warn("archive: couldn't read the checkout's git state", e);
    return null;
  }
  return op ? archiveBlockedMessage(op) : null;
}
