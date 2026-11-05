// Demo PR data for the browser preview (no Tauri). Pick a scenario with
// localStorage["openconductor.pr.demo"]: "create" (default), "ready", "merged".
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
