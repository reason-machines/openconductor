import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("../../../evidence/settings/agent-tab-label/agentTabLabel.dom.test.mjs", import.meta.url));
const expectedCases = [
  "provider tabs have nonempty distinct DOM IDs",
  "the active Claude panel is labelled by its selected tab",
  "click selection updates the panel label without changing tab IDs",
  "keyboard selection updates the panel label without changing tab IDs",
  "external route selection updates the panel label and preserves tab IDs",
  "separate mounted Agents pages have disjoint tab IDs and their own panel labels",
  "existing panel labels and URL fields survive each route selection",
  "K1 focus activation and modified-key ownership remain unchanged"
];

test("Agents panels reference stable selected tab IDs", { timeout: 120_000 }, (context) => {
  assert.equal(createHash("sha256").update(readFileSync(fixture)).digest("hex"), "1b71c9d3a01ff6661914b6867f4dc1e5f2a269d7e898ec82c652f427c29cca87");
  const domPrefix = process.env.ONBOARDING_DOM_DEPS;
  assert.ok(domPrefix, "Agents panel tests require the existing isolated jsdom@26.1.0 prefix; no fallback or skip is permitted");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", fixture], {
    cwd: root,
    env: {
      ...env,
      NODE_ENV: "development",
      NODE_OPTIONS: "--max-old-space-size=768",
      ONBOARDING_DOM_DEPS: domPrefix,
      AGENT_TABS_SOURCE_ROOT: root,
    },
    encoding: "utf8",
    timeout: 115_000,
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const [name, expected] of Object.entries({ tests: 8, pass: 8, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...result.stdout.matchAll(new RegExp("^# " + name + " (\\d+)$", "gm"))];
    assert.equal(matches.length, 1, "Missing or ambiguous TAP summary for " + name);
    assert.equal(Number(matches[0][1]), expected);
  }
  assert.match(result.stdout, /^1\.\.8$/m);
  assert.deepEqual([...result.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1]), expectedCases);
  assert.doesNotMatch(result.stdout, /^(?:not )?ok\b[^\n]*#\s*(?:SKIP|TODO)\b/im);
  assert.doesNotMatch(result.stdout, /^not ok /m);
  context.diagnostic(result.stdout);
});
