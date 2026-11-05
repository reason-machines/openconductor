import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveDecision, archivedMessage, mergedTransition } from "./archiveOnMerge.ts";
import type { PrInfo, PrLookup } from "./types.ts";

function found(number: number, isMerged: boolean): PrLookup {
  const info = { number, url: `https://github.com/o/r/pull/${number}`, isMerged } as PrInfo;
  return { kind: "found", info };
}

test("only the same PR going from open to merged counts as a merge", () => {
  assert.deepEqual(mergedTransition(found(7, true), found(7, false)), { number: 7, url: "https://github.com/o/r/pull/7" });
  assert.equal(mergedTransition(found(7, true), found(7, true)), null, "already merged before");
  assert.equal(mergedTransition(found(7, true), null), null, "first lookup of a merged PR (workspace opened later)");
  assert.equal(mergedTransition(found(8, true), found(7, false)), null, "a different PR");
  assert.equal(mergedTransition(found(7, true), { kind: "none" }), null);
  assert.equal(mergedTransition({ kind: "closed" }, found(7, false)), null);
});

test("archive only when the setting is on, the workspace is live and no agent runs", () => {
  assert.equal(archiveDecision({ enabled: true, archived: false, agentWorking: false }), "archive");
  assert.equal(archiveDecision({ enabled: false, archived: false, agentWorking: false }), "off");
  assert.equal(archiveDecision({ enabled: true, archived: true, agentWorking: false }), "already-archived");
  assert.equal(archiveDecision({ enabled: true, archived: false, agentWorking: true }), "agent-running");
  assert.equal(archivedMessage(12), "PR #12 merged and workspace archived");
});
