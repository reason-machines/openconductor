// Checks tab logic: order, labels, durations and the re-run rules.
// Reference: Conductor 0.87.6 `renderApp-D_fmY7hW.js` @ ~2,452,000 to
// ~2,460,300 and `index-BGEQ8YjU.js` @ ~3,220,100 (evidence/pr/NOTES.md).
import type { Check, ChecksSummary } from "../types";

const PENDING_STATUS = ["IN_PROGRESS", "QUEUED", "EXPECTED"];
const PENDING_STATE = ["PENDING", "EXPECTED"];
const FAILING_CONCLUSION = ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"];
const FAILING_STATE = ["FAILURE", "ERROR", "STARTUP_FAILURE"];
const has = (list: string[], v: string | null) => v !== null && list.includes(v);

export const isPending = (c: Check) => has(PENDING_STATUS, c.status) || has(PENDING_STATE, c.state);
export const isFailing = (c: Check) => has(FAILING_CONCLUSION, c.conclusion) || has(FAILING_STATE, c.state);

export type CheckState = "running" | "failed" | "passed" | "skipped" | "neutral" | "pending";

export function checkState(c: Check): CheckState {
  if (isPending(c)) return "running";
  if (isFailing(c)) return "failed";
  if (c.conclusion === "SKIPPED") return "skipped";
  if (c.conclusion === "NEUTRAL") return "neutral";
  if (c.conclusion === "SUCCESS" || c.state === "SUCCESS") return "passed";
  return "pending";
}

export const STATE_LABEL: Record<CheckState, string> = {
  running: "Running",
  failed: "Failed",
  passed: "Passed",
  skipped: "Skipped",
  neutral: "Neutral",
  pending: "Pending",
};

export const checkName = (c: Check) => c.name ?? c.context ?? "Unknown check";
export const checkLink = (c: Check) => c.detailsUrl ?? c.targetUrl;

/** Failing first, then running; otherwise the rollup's order. */
export function sortChecks(checks: Check[]): Check[] {
  const rank = (c: Check) => (isFailing(c) ? 0 : isPending(c) ? 1 : 2);
  return checks.map((c, i) => [c, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
}

/** `<1m` / `Nm` while running; `Hh Mm`, `Nm` or `Ns` once done. */
export function formatDuration(ms: number, running: boolean): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (running) return m < 1 ? "<1m" : `${m}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return m > 0 ? `${m}m` : `${s}s`;
}

/** Elapsed time of a check, `null` when it has not started or has no end yet. */
export function checkDuration(c: Check, now: number): string | null {
  if (!c.startedAt) return null;
  const running = isPending(c);
  const end = running ? now : c.completedAt ? Date.parse(c.completedAt) : NaN;
  const ms = end - Date.parse(c.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? formatDuration(ms, running) : null;
}

const ACTIONS_JOB = /github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+\/job\/\d+/;
export const isActionsJob = (c: Check) => ACTIONS_JOB.test(c.detailsUrl ?? "");

/** Re-run is offered when a failing check is a GitHub Actions job. */
export const canRerun = (failing: Check[]) => failing.some(isActionsJob);

/** Details URLs of the failing Actions jobs, the input to `pr_rerun_failed_checks`. */
export const rerunUrls = (failing: Check[]) => failing.filter(isActionsJob).map((c) => c.detailsUrl as string);

/**
 * The summary right after a re-run was requested: the re-run jobs show as
 * running until the next lookup, and the counts follow (the reference's
 * optimistic update).
 */
export function markRerunning(summary: ChecksSummary, urls: string[]): ChecksSummary {
  if (!summary.checks) return summary;
  const rerun = new Set(urls);
  const checks = summary.checks.map((c) => (c.detailsUrl && rerun.has(c.detailsUrl) ? { ...c, conclusion: null, status: "IN_PROGRESS" } : c));
  const failing = checks.filter(isFailing);
  const pending = checks.filter(isPending);
  const status = failing.length > 0 ? "failing" : pending.length > 0 ? "pending" : "passing";
  return { ...summary, checks, failing, numPending: pending.length, status };
}
