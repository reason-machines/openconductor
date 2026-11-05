import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_SCENARIOS } from "./demo.ts";
import { canMerge, commitShortcutApplies, createShortcutApplies, mergeShortcutApplies } from "./shortcuts.ts";
import type { PrInfo, PrStatus } from "./types.ts";

const base = (DEMO_SCENARIOS.ready().lookup.lookup as { kind: "found"; info: PrInfo }).info;
const withStatus = (patch: Partial<PrStatus>, info: Partial<PrInfo> = {}): PrInfo => ({ ...base, ...info, status: { ...base.status!, ...patch } });
const failing = { ...base.status!.checks, failing: [{ conclusion: "FAILURE", status: "COMPLETED", name: "lint", workflowName: null, detailsUrl: null, startedAt: null, completedAt: null, state: null, context: null, targetUrl: null }] };

test("canMerge matches merge_eligibility::can_merge", () => {
  assert.equal(canMerge(base, false), true);
  assert.equal(canMerge(withStatus({}, { isDraft: true }), false), false);
  assert.equal(canMerge(withStatus({}, { isMerged: true }), false), false);
  assert.equal(canMerge(withStatus({}, { viewerCanMerge: false }), false), false);
  assert.equal(canMerge(withStatus({}, { viewerCanMerge: null }), false), true, "unknown permission still merges");
  assert.equal(canMerge({ ...base, status: null }, false), false);
  for (const mergeState of ["DIRTY", "BEHIND", "BLOCKED", "UNKNOWN", "HAS_HOOKS", "DRAFT"] as const) {
    assert.equal(canMerge(withStatus({ mergeState }), false), false, mergeState);
  }
  const unstable = withStatus({ mergeState: "UNSTABLE", checks: failing });
  assert.equal(canMerge(unstable, false), true);
  assert.equal(canMerge(unstable, true), false, "optional failures block when the setting is on");
});

test("the merge shortcut skips queued PRs and a merge already running", () => {
  assert.equal(mergeShortcutApplies(base, false, false), true);
  assert.equal(mergeShortcutApplies(null, false, false), false);
  assert.equal(mergeShortcutApplies(base, false, true), false);
  const queued = { ...base, mergeQueue: { state: "QUEUED" as const, position: 1, enqueuedAt: "", estimatedTimeToMerge: null } };
  assert.equal(mergeShortcutApplies(queued, false, false), false);
});

test("the create shortcut acts only while Create PR is offered", () => {
  assert.equal(createShortcutApplies({ tone: "no_pr", action: { type: "create_pr" } }, false), true);
  assert.equal(createShortcutApplies({ tone: "no_pr", action: { type: "create_pr" } }, true), false);
  assert.equal(createShortcutApplies({ tone: "in_sync", action: { type: "ready_to_merge", optionalFailed: 0 } }, false), false);
  assert.equal(createShortcutApplies(null, false), false);
});

test("git.commitAndPush acts only while the header offers Commit and push", () => {
  assert.equal(commitShortcutApplies({ tone: "out_of_sync", action: { type: "commit_and_push" } }, false), true);
  assert.equal(commitShortcutApplies({ tone: "out_of_sync", action: { type: "commit_and_push" } }, true), false, "not while another PR action runs");
  assert.equal(commitShortcutApplies({ tone: "no_pr", action: { type: "create_pr" } }, false), false);
  assert.equal(commitShortcutApplies(null, false), false);
});

test("canMerge agrees with the Rust can_merge on every shared case", async () => {
  const { readFile } = await import("node:fs/promises");
  const table = JSON.parse(await readFile(new URL("../../../src-tauri/src/pr/fixtures/can_merge_cases.json", import.meta.url), "utf8")) as {
    base: PrInfo;
    cases: { name: string; patch: Partial<PrInfo>; optionalChecksBlock: boolean; canMerge: boolean }[];
  };
  assert.ok(table.cases.length >= 15, "the shared table lost cases");
  for (const c of table.cases) {
    assert.equal(canMerge({ ...table.base, ...c.patch }, c.optionalChecksBlock), c.canMerge, c.name);
  }
});
