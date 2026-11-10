import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const split = readFileSync(new URL("./kit.tsx", import.meta.url), "utf8").split("export function OpenInSplit(")[1]!;

test("the live Settings app menu offers Copy path after its application items", () => {
  assert.match(split, /role="menuitem"[^>]*onClick=\{copyPath\}/);
  assert.match(split, /<CopyIcon[^>]*\/>\s*Copy path/);
  assert.ok(split.indexOf("Copy path") > split.indexOf("list.map("));
});

test("the live Settings menu can copy a known path without installed applications", () => {
  const chevron = split.match(/<button[^>]*className="agk-split-chevron"[^>]*>/)?.[0];
  assert.ok(chevron);
  assert.match(chevron, /disabled=\{!path\}/);
});
