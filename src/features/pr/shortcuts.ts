// parity:pr.merge:keybinding parity:pr.create:keybinding parity:pr.commit-push:keybinding
// When the workspace's PR shortcuts act (reference: renderApp @ ~2,299,100
// to ~2,300,500). Merge mirrors `merge_eligibility::can_merge` plus the
// reference's extra guards (no merge-queue entry, no merge already running).
import type { HeaderState, PrInfo } from "./types.ts";

/** Same rule as `merge_eligibility::can_merge` (Rust). */
export function canMerge(pr: PrInfo, optionalChecksBlock: boolean): boolean {
  const status = pr.status;
  if (!status || pr.isMerged || pr.isDraft || pr.viewerCanMerge === false) return false;
  if (status.mergeState === "CLEAN") return true;
  if (status.mergeState === "UNSTABLE") return !(optionalChecksBlock && status.checks.failing.length > 0);
  return false;
}

/** git.mergePR: a mergeable open PR, not queued, with no merge in flight. */
export function mergeShortcutApplies(pr: PrInfo | null, optionalChecksBlock: boolean, merging: boolean): pr is PrInfo {
  return pr !== null && !merging && pr.mergeQueue === null && canMerge(pr, optionalChecksBlock);
}

/** git.createPR: only while the header offers Create PR (no PR yet, branch has changes). */
export function createShortcutApplies(header: HeaderState | null, busy: boolean): boolean {
  return !busy && header?.action.type === "create_pr";
}

/** git.commitAndPush: only while the header offers Commit and push (reference renderApp @ ~2,299,300). */
export function commitShortcutApplies(header: HeaderState | null, busy: boolean): boolean {
  return !busy && header?.action.type === "commit_and_push";
}
