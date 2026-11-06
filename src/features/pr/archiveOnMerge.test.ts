import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveDecision, archivedMessage, archivedToastActions, archiveOnMergeEnabled, forgetLookup, lastPrNumber, mergedTransition, observeLookup, watchedWorkspaces } from "./archiveOnMerge.ts";
import type { Repo, Workspace } from "../../state/types.ts";
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

test("the tracker reports a merge once, whichever lookup sees it first", () => {
  forgetLookup();
  assert.equal(observeLookup("w1", found(7, false)), null, "first lookup");
  assert.deepEqual(observeLookup("w1", found(7, true)), { number: 7, url: "https://github.com/o/r/pull/7" });
  assert.equal(observeLookup("w1", found(7, true)), null, "the other source sees it merged again");
  assert.equal(observeLookup("w2", found(9, true)), null, "another workspace first seen merged");
  forgetLookup("w1");
  assert.equal(observeLookup("w1", found(7, true)), null, "forgotten");
});

test("a repository's settings win over the user setting", () => {
  assert.equal(archiveOnMergeEnabled(false, null), false);
  assert.equal(archiveOnMergeEnabled(true, null), true);
  assert.equal(archiveOnMergeEnabled(false, true), true);
  assert.equal(archiveOnMergeEnabled(true, false), false);
});

test("the archived toast offers Open PR and Unarchive", () => {
  assert.deepEqual(archivedToastActions({ number: 7, url: "https://github.com/o/r/pull/7" }), { action: "open-pr", secondary: "unarchive" });
  assert.deepEqual(archivedToastActions({ number: 7, url: "" }), { secondary: "unarchive" });
});

test("the watcher looks up live workspaces with a worktree, not the open one, asking for the PR it last saw", () => {
  const w = (id: string, over: Partial<Workspace> = {}): Workspace => ({ id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: `/w/${id}`, ...over });
  const repo = { id: "r", name: "r", path: "/r", defaultBranch: "main", workspaces: [w("a"), w("b"), w("c", { path: undefined }), w("d", { status: "archived" })] } as Repo;
  assert.deepEqual(watchedWorkspaces(repo, "b").map((x) => x.id), ["a"]);
  assert.deepEqual(watchedWorkspaces(repo, null).map((x) => x.id), ["a", "b"]);
  forgetLookup();
  assert.equal(lastPrNumber("a"), null);
  observeLookup("a", found(5, false));
  assert.equal(lastPrNumber("a"), 5);
  observeLookup("a", { kind: "none" });
  assert.equal(lastPrNumber("a"), null);
});
