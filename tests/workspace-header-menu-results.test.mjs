import { test } from "node:test";
import assert from "node:assert/strict";
import { CASE_IDS } from "./e2e/workspace-header-menu-cases.mjs";
import { verifyHeaderMenuResults } from "./e2e/workspace-header-menu-results.mjs";

const missingMenu = "locator.waitFor: Timeout 3000ms exceeded.\nCall log:\n  - waiting for getByRole('menu', { name: 'Workspace actions', exact: true }) to be visible";
const candidate = () => CASE_IDS.map((id) => ({ id, phase: "behavior", status: "passed" }));
const baseline = () => candidate().map((result, index) => index < 2 ? result : { ...result, status: "failed", error: missingMenu });

test("candidate requires eight ordered passing behavioral results", () => {
  verifyHeaderMenuResults(candidate(), CASE_IDS, "candidate");
  const failed = candidate();
  failed[2].status = "failed";
  assert.throws(() => verifyHeaderMenuResults(failed, CASE_IDS, "candidate"));
  assert.throws(() => verifyHeaderMenuResults(candidate().slice(1), CASE_IDS, "candidate"));
});

test("baseline requires both controls and all six attributed menu failures", () => {
  verifyHeaderMenuResults(baseline(), CASE_IDS, "baseline");
  assert.throws(() => verifyHeaderMenuResults(candidate(), CASE_IDS, "baseline"));
  const brokenControl = baseline();
  brokenControl[0].status = "failed";
  assert.throws(() => verifyHeaderMenuResults(brokenControl, CASE_IDS, "baseline"));
});

test("setup, navigation and unrelated timeouts never count as RED", () => {
  for (const replacement of [
    { phase: "setup" },
    { error: "page.goto: net::ERR_CONNECTION_REFUSED" },
    { error: "locator.waitFor: Timeout 3000ms exceeded. waiting for getByRole('dialog') to be visible" },
  ]) {
    const results = baseline();
    Object.assign(results[2], replacement);
    assert.throws(() => verifyHeaderMenuResults(results, CASE_IDS, "baseline"));
  }
});

test("reordered, duplicated and unrun cases fail closed", () => {
  const reordered = baseline();
  [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
  assert.throws(() => verifyHeaderMenuResults(reordered, CASE_IDS, "baseline"));
  const duplicated = baseline();
  duplicated[3] = duplicated[2];
  assert.throws(() => verifyHeaderMenuResults(duplicated, CASE_IDS, "baseline"));
  const unrun = baseline();
  unrun[2].status = "not-run";
  assert.throws(() => verifyHeaderMenuResults(unrun, CASE_IDS, "baseline"));
});
