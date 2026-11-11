import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSidebarSort, sortSidebarWorkspaces } from "./sidebarSort.ts";

test("sort preference defaults to Updated and only accepts Created", () => {
  for (const value of [undefined, null, "", "updated", "unknown", 1]) assert.equal(parseSidebarSort(value), "updated");
  assert.equal(parseSidebarSort("created"), "created");
});

test("Created ignores later activity; Updated falls back to creation and preserves equal-time order", () => {
  const rows = [{ id: "older", createdAt: 1, updatedAt: 30 }, { id: "newer", createdAt: 20 }, { id: "tie", createdAt: 20 }];
  assert.deepEqual(sortSidebarWorkspaces(rows).map((r) => r.id), ["older", "newer", "tie"]);
  assert.deepEqual(sortSidebarWorkspaces(rows, "created").map((r) => r.id), ["newer", "tie", "older"]);
  assert.deepEqual(rows.map((r) => r.id), ["older", "newer", "tie"]);
});
