// Demo PR data for the browser preview (no Tauri). Pick a scenario with
// localStorage["openconductor.pr.demo"]: "create" (default), "ready", "draft",
// "approve", "pending", "merged", "uncommitted", "conflicts", "changes".
import type { GitState, HeaderState, LookupResult, PrInfo } from "./types.ts";

interface Demo {
  lookup: LookupResult;
  git: GitState;
  header: HeaderState | null;
}

const GIT: GitState = { hasUncommitted: false, hasChanges: true, hasRemote: true, canCreatePr: true, remote: "origin", upstream: { branchExists: true, diverged: false, ahead: 0, behind: 0 } };

function demoPr(patch: Partial<PrInfo>): PrInfo {
  return {
    number: 42, url: "https://github.com/acme/web/pull/42", title: "Add the PR control to the workspace header", body: "",
    authorLogin: "you", baseRefName: "main", baseRefOid: null, headRefName: "demo", headRefOid: "0000000",
    viewerDidAuthor: true, viewerLatestReview: null, viewerCanMerge: true, isDraft: false, isMerged: false,
    isAutoMergeEnabled: false, mergeQueue: null,
    status: { mergeState: "CLEAN", reviewDecision: null, numReviewRequests: 0, checks: { status: "passing", numPending: 0, numChecks: 0, failing: [], checks: [], vercelUrl: null } },
    ...patch,
  };
}

export const DEMO_SCENARIOS: Record<string, () => Demo> = {
  create: () => ({ lookup: { lookup: { kind: "none" }, derivedStatus: "in-progress" }, git: GIT, header: { tone: "no_pr", action: { type: "create_pr" } } }),
  ready: () => ({ lookup: { lookup: { kind: "found", info: demoPr({}) }, derivedStatus: "in-review" }, git: GIT, header: { tone: "in_sync", action: { type: "ready_to_merge", optionalFailed: 0 } } }),
  draft: () => ({ lookup: { lookup: { kind: "found", info: demoPr({ isDraft: true, status: { mergeState: "DRAFT", reviewDecision: null, numReviewRequests: 0, checks: { status: "passing", numPending: 0, numChecks: 0, failing: [], checks: [], vercelUrl: null } } }) }, derivedStatus: "in-review" }, git: GIT, header: { tone: "out_of_sync", action: { type: "draft_pr" } } }),
  approve: () => ({ lookup: { lookup: { kind: "found", info: demoPr({ viewerDidAuthor: false, authorLogin: "teammate", status: { mergeState: "BLOCKED", reviewDecision: "REVIEW_REQUIRED", numReviewRequests: 1, checks: { status: "passing", numPending: 0, numChecks: 0, failing: [], checks: [], vercelUrl: null } } }) }, derivedStatus: "in-review" }, git: GIT, header: { tone: "out_of_sync", action: { type: "approve_pr" } } }),
  pending: () => ({ lookup: { lookup: { kind: "found", info: demoPr({ status: { mergeState: "BLOCKED", reviewDecision: null, numReviewRequests: 0, checks: { status: "pending", numPending: 2, numChecks: 5, failing: [], checks: [], vercelUrl: null } } }) }, derivedStatus: "in-review" }, git: GIT, header: { tone: "out_of_sync", action: { type: "checks_pending", pending: 2 } } }),
  uncommitted: () => ({ lookup: { lookup: { kind: "found", info: demoPr({}) }, derivedStatus: "in-review" }, git: { ...GIT, hasUncommitted: true }, header: { tone: "out_of_sync", action: { type: "commit_and_push" } } }),
  conflicts: () => ({ lookup: { lookup: { kind: "found", info: demoPr({ status: { mergeState: "DIRTY", reviewDecision: null, numReviewRequests: 0, checks: { status: "passing", numPending: 0, numChecks: 0, failing: [], checks: [], vercelUrl: null } } }) }, derivedStatus: "in-review" }, git: GIT, header: { tone: "out_of_sync", action: { type: "merge_conflicts" } } }),
  changes: () => ({ lookup: { lookup: { kind: "found", info: demoPr({ status: { mergeState: "BLOCKED", reviewDecision: "CHANGES_REQUESTED", numReviewRequests: 0, checks: { status: "passing", numPending: 0, numChecks: 0, failing: [], checks: [], vercelUrl: null } } }) }, derivedStatus: "in-review" }, git: GIT, header: { tone: "out_of_sync", action: { type: "changes_requested", hasPendingComments: false } } }),
  merged: () => ({ lookup: { lookup: { kind: "found", info: demoPr({ isMerged: true, status: null }) }, derivedStatus: "done" }, git: GIT, header: { tone: "merged", action: { type: "merged" } } }),
};

export function demo(): Demo {
  let name = "create";
  try {
    name = localStorage.getItem("openconductor.pr.demo") ?? name;
  } catch {
    // no storage: default scenario
  }
  return (DEMO_SCENARIOS[name] ?? DEMO_SCENARIOS.create)();
}
