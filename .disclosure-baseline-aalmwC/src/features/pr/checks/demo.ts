// Checks for the browser preview: with localStorage["openconductor.pr.demo"]
// set to "checks", the Checks tab shows these instead of the demo PR's.
import type { ChecksSummary, PrInfo } from "../types";

const job = (n: number) => `https://github.com/acme/web/actions/runs/1234/job/${n}`;
const t = (min: number, sec = 0) => new Date(Date.UTC(2026, 10, 5, 14, min, sec)).toISOString();

export const DEMO_CHECKS: ChecksSummary = {
  status: "failing",
  numPending: 1,
  numChecks: 5,
  failing: [
    { name: "unit tests", workflowName: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: job(1), startedAt: t(0), completedAt: t(2, 41), state: null, context: null, targetUrl: null },
  ],
  checks: [
    { name: "lint", workflowName: "CI", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: job(2), startedAt: t(0), completedAt: t(0, 48), state: null, context: null, targetUrl: null },
    { name: "unit tests", workflowName: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: job(1), startedAt: t(0), completedAt: t(2, 41), state: null, context: null, targetUrl: null },
    { name: "e2e (macos)", workflowName: "E2E", status: "IN_PROGRESS", conclusion: null, detailsUrl: job(3), startedAt: t(1), completedAt: null, state: null, context: null, targetUrl: null },
    { name: "docs preview", workflowName: "Docs", status: "COMPLETED", conclusion: "SKIPPED", detailsUrl: job(4), startedAt: null, completedAt: null, state: null, context: null, targetUrl: null },
    { name: null, workflowName: null, status: null, conclusion: null, detailsUrl: null, startedAt: null, completedAt: null, state: "SUCCESS", context: "vercel", targetUrl: "https://vercel.com/acme/web/deploy" },
  ],
  vercelUrl: null,
};

export const DEMO_LOG = [
  "2026-11-05T14:02:31.0000000Z > web@1.0.0 test",
  "2026-11-05T14:02:31.0000000Z > node --test src/**/*.test.ts",
  "2026-11-05T14:02:38.0000000Z not ok 14 - checkout total includes tax",
  "2026-11-05T14:02:38.0000000Z   expected: 108.25",
  "2026-11-05T14:02:38.0000000Z   actual:   100",
  "2026-11-05T14:02:39.0000000Z # tests 52, pass 51, fail 1",
  "2026-11-05T14:02:40.0000000Z ##[error]Process completed with exit code 1.",
].join("\n");

export function demoChecksEnabled(): boolean {
  try {
    return localStorage.getItem("openconductor.pr.demo") === "checks";
  } catch {
    return false;
  }
}

/** The PR the demo Checks tab's header shows. */
export const DEMO_PR: PrInfo = {
  number: 42,
  url: "https://github.com/acme/web/pull/42",
  title: "Add the Checks tab",
  body: "Lists the PR's CI checks, failing first, with job logs and re-run.",
  authorLogin: "octocat",
  baseRefName: "main",
  baseRefOid: null,
  headRefName: "acme/checks-tab",
  headRefOid: "0000000",
  viewerDidAuthor: true,
  viewerLatestReview: null,
  viewerCanMerge: true,
  isDraft: false,
  isMerged: false,
  isAutoMergeEnabled: false,
  mergeQueue: null,
  status: { mergeState: "BLOCKED", checks: DEMO_CHECKS, reviewDecision: null, numReviewRequests: 0 },
};
