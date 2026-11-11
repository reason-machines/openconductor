import { test } from "node:test";
import assert from "node:assert/strict";
import { configSyncItems, configSyncKey, parseConfigSyncDiff, parseConfigSyncResult } from "./configSync.ts";

test("local diff response admits names only and isolates a failed category", () => {
  const diff = parseConfigSyncDiff({
    mcpServers: { ccToCodex: [], codexToCc: [], error: "Couldn't read local MCP definitions." },
    slashCommands: { ccToCodex: ["nested/one"], codexToCc: [], error: null },
    skills: { ccToCodex: ["same::name"], codexToCc: ["other"], error: null },
  });
  assert.deepEqual(configSyncItems(diff), [
    { category: "slashCommands", direction: "ccToCodex", name: "nested/one" },
    { category: "skills", direction: "ccToCodex", name: "same::name" },
    { category: "skills", direction: "codexToCc", name: "other" },
  ]);
  assert.notEqual(configSyncKey({ category: "skills", direction: "ccToCodex", name: "same" }), configSyncKey({ category: "skills", direction: "codexToCc", name: "same" }));
});

test("IPC rejects malformed diffs and mutation responses instead of claiming a copy", () => {
  const empty = { ccToCodex: [], codexToCc: [], error: null };
  for (const value of [null, {}, { mcpServers: empty, slashCommands: empty, skills: { ...empty, ccToCodex: [42] } }]) {
    assert.throws(() => parseConfigSyncDiff(value), /Invalid local config sync response/);
  }
  for (const value of [null, {}, { successes: -1, failures: [], unsupportedMcp: [] }, { successes: 0, failures: [{ category: "unknown", name: "x", reason: "x" }], unsupportedMcp: [] }, { successes: 0, failures: [], unsupportedMcp: [42] }]) {
    assert.throws(() => parseConfigSyncResult(value), /Invalid local config sync response/);
  }
  assert.deepEqual(parseConfigSyncResult({ successes: 1, failures: [{ category: "skills", name: "synthetic", reason: "Destination exists." }], unsupportedMcp: ["unsupported"] }), {
    successes: 1, failures: [{ category: "skills", name: "synthetic", reason: "Destination exists." }], unsupportedMcp: ["unsupported"],
  });
});
