import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS_TABS, agentsTabFrom, maskedSecret } from "./kitModel.ts";

test("tabs are Reason, Claude Code, Codex in that order", () => {
  assert.deepEqual(AGENTS_TABS, ["reason", "claude", "codex"]);
});

test("providerTab picks a known tab and falls back to the first", () => {
  assert.equal(agentsTabFrom("codex"), "codex");
  assert.equal(agentsTabFrom("claude"), "claude");
  assert.equal(agentsTabFrom("cursor"), "reason");
  assert.equal(agentsTabFrom(null), "reason");
});

test("the mask carries only the hint", () => {
  assert.equal(maskedSecret("bAAA"), "••••••••bAAA");
  assert.equal(maskedSecret(null), "••••••••");
});
