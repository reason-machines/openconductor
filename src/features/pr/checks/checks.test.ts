import { test } from "node:test";
import assert from "node:assert/strict";
import { canRerun, checkDuration, checkLink, checkName, checkState, formatDuration, markRerunning, rerunUrls, sortChecks } from "./checks.ts";
import type { Check, ChecksSummary } from "../types.ts";

const JOB = (run: number, job: number) => `https://github.com/o/r/actions/runs/${run}/job/${job}`;

function check(over: Partial<Check>): Check {
  return {
    conclusion: null, status: null, name: null, workflowName: null, detailsUrl: null,
    startedAt: null, completedAt: null, state: null, context: null, targetUrl: null, ...over,
  };
}

const passed = check({ name: "lint", status: "COMPLETED", conclusion: "SUCCESS" });
const failed = check({ name: "test", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: JOB(1, 2) });
const running = check({ name: "build", status: "IN_PROGRESS" });
const legacy = check({ context: "ci/legacy", state: "ERROR", targetUrl: "https://ci.example.com/9" });

test("states follow the check-run and status-context vocabularies", () => {
  assert.equal(checkState(passed), "passed");
  assert.equal(checkState(failed), "failed");
  assert.equal(checkState(running), "running");
  assert.equal(checkState(legacy), "failed");
  assert.equal(checkState(check({ conclusion: "SKIPPED" })), "skipped");
  assert.equal(checkState(check({ conclusion: "NEUTRAL" })), "neutral");
  assert.equal(checkState(check({ state: "SUCCESS" })), "passed");
  assert.equal(checkState(check({})), "pending");
});

test("names and links fall back from check runs to status contexts", () => {
  assert.equal(checkName(legacy), "ci/legacy");
  assert.equal(checkName(check({})), "Unknown check");
  assert.equal(checkLink(legacy), "https://ci.example.com/9");
  assert.equal(checkLink(failed), JOB(1, 2));
});

test("failing checks come first, then running ones, otherwise rollup order", () => {
  assert.deepEqual(sortChecks([passed, running, legacy, failed]).map(checkName), ["ci/legacy", "test", "build", "lint"]);
});

test("durations round like the reference", () => {
  assert.equal(formatDuration(30_000, true), "<1m");
  assert.equal(formatDuration(150_000, true), "2m");
  assert.equal(formatDuration(45_000, false), "45s");
  assert.equal(formatDuration(150_000, false), "2m");
  assert.equal(formatDuration(3_900_000, false), "1h 5m");
  const done = check({ startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:01:05Z", conclusion: "SUCCESS" });
  assert.equal(checkDuration(done, 0), "1m");
  assert.equal(checkDuration(check({ conclusion: "SUCCESS" }), 0), null, "never started");
  const live = check({ startedAt: "2026-01-01T00:00:00Z", status: "IN_PROGRESS" });
  assert.equal(checkDuration(live, Date.parse("2026-01-01T00:03:10Z")), "3m");
});

test("re-run needs a failing GitHub Actions job and sends only those URLs", () => {
  assert.equal(canRerun([legacy]), false);
  assert.equal(canRerun([legacy, failed]), true);
  assert.deepEqual(rerunUrls([legacy, failed]), [JOB(1, 2)]);
});

test("a requested re-run shows the jobs running until the next lookup", () => {
  const summary: ChecksSummary = {
    status: "failing", numPending: 0, numChecks: 3, failing: [failed, legacy], checks: [passed, failed, legacy], vercelUrl: null,
  };
  const next = markRerunning(summary, [JOB(1, 2)]);
  assert.equal(next.status, "failing", "the status context still fails");
  assert.equal(next.numPending, 1);
  assert.deepEqual(next.failing.map(checkName), ["ci/legacy"]);
  const allRerun = markRerunning({ ...summary, checks: [passed, failed], failing: [failed] }, [JOB(1, 2)]);
  assert.equal(allRerun.status, "pending");
});
