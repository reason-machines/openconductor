// parity:pr.review-actions:logic
// A workspace's target branch: the branch its work merges into. Reference:
// Conductor 0.87.6 `index-BGEQ8YjU.js` @ ~3,321,350 (`changeTargetBranch`)
// and `T$` (the effective target: an open PR's base, else the workspace's
// `intended_target_branch`), `renderApp-D_fmY7hW.js` @ ~2,934,300 (`sxi`, the
// picker: disabled for archived workspaces) (evidence/pr/NOTES.md). Pure.

interface PrBase {
  number: number;
  baseRefName: string;
  isMerged: boolean;
}

/** An open PR's base wins; otherwise the workspace's saved target, then the repository default. */
export function effectiveTargetBranch(pr: PrBase | null, intended: string | null | undefined, repoDefault: string): string {
  if (pr && !pr.isMerged && pr.baseRefName) return pr.baseRefName;
  return intended?.trim() || repoDefault;
}

export const ARCHIVED_TARGET_MESSAGE = "Target branch cannot be changed for archived workspaces";

export type TargetChangePlan =
  | { kind: "refuse"; message: string }
  | { kind: "noop" }
  /** Save `branch`; retarget PR `retarget` first when it is set. */
  | { kind: "change"; branch: string; retarget: number | null };

export interface TargetChangeInput {
  archived: boolean;
  pr: PrBase | null;
  intended: string | null | undefined;
  repoDefault: string;
}

/**
 * As Conductor: archived workspaces refuse; an open, unmerged PR whose base
 * differs is retargeted, then the branch is saved on the workspace.
 */
export function planTargetChange({ archived, pr, intended, repoDefault }: TargetChangeInput, next: string): TargetChangePlan {
  if (archived) return { kind: "refuse", message: ARCHIVED_TARGET_MESSAGE };
  const branch = next.trim();
  if (!branch) return { kind: "noop" };
  const open = pr && !pr.isMerged ? pr : null;
  const current = open ? open.baseRefName : (intended?.trim() || repoDefault);
  const retarget = open && open.baseRefName !== branch ? open.number : null;
  if (current === branch && (intended?.trim() || null) === branch) return { kind: "noop" };
  return { kind: "change", branch, retarget };
}

/** The PR moved but the workspace kept its old target. */
export function savedAfterRetargetFailed(prNumber: number, branch: string, err: unknown): string {
  return `PR #${prNumber} now targets ${branch}, but saving the workspace's target branch failed: ${err instanceof Error ? err.message : String(err)}`;
}
