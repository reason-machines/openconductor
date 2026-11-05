// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { COPIED_LINK, COPY_LINK_FAILED, copyWorkspaceLink, workspaceLink } from "./link.ts";

test("a local workspace link is <scheme>://workspace?id=<id>, as Conductor's $$ builds it", () => {
  assert.equal(workspaceLink("8f2c1e6a-1b2c"), "openconductor://workspace?id=8f2c1e6a-1b2c");
  assert.equal(workspaceLink("w1", "s9"), "openconductor://workspace?id=w1&session=s9");
});

test("the id is query-encoded", () => {
  assert.equal(workspaceLink("a b&c"), "openconductor://workspace?id=a+b%26c");
});

test("copying writes the link and reports Copied link", async () => {
  const written: string[] = [];
  const result = await copyWorkspaceLink("w1", { writeText: async (t) => void written.push(t) });
  assert.deepEqual(written, ["openconductor://workspace?id=w1"]);
  assert.deepEqual(result, { kind: "info", message: COPIED_LINK });
});

test("a refused or missing clipboard reports Failed to copy link", async () => {
  const refused = await copyWorkspaceLink("w1", { writeText: () => Promise.reject(new Error("denied")) });
  assert.deepEqual(refused, { kind: "error", message: COPY_LINK_FAILED });
  assert.deepEqual(await copyWorkspaceLink("w1", undefined), { kind: "error", message: COPY_LINK_FAILED });
});
