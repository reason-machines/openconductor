import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./secretEditorKeyLink.test.ts", import.meta.url));
const baseline = fileURLToPath(new URL("../../../evidence/settings/secret-editor-key-link/baseline-kit.tsx.txt", import.meta.url));
const expectedFailures = [
  "editing a configured Anthropic API key retains Get key",
  "editing a configured OpenAI API key retains Get key",
];

function replay(source: string | undefined) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (source) env.SECRET_EDITOR_SOURCE_FILE = source;
  else delete env.SECRET_EDITOR_SOURCE_FILE;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], {
    env, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
}

function summary(tap: string, name: string): number {
  const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
  assert.equal(matches.length, 1, `Missing or ambiguous TAP summary for ${name}`);
  return Number(matches[0][1]);
}

function qualify(tap: string, failures: readonly string[]) {
  assert.equal(summary(tap, "tests"), 4);
  assert.equal(summary(tap, "pass"), 4 - failures.length);
  assert.equal(summary(tap, "fail"), failures.length);
  for (const name of ["cancelled", "skipped", "todo"]) assert.equal(summary(tap, name), 0);
  const failed = [...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(failed, failures);
}

test("provider key links replay the unchanged editor fixture RED then GREEN", (context) => {
  assert.equal(createHash("sha256").update(readFileSync(fixture)).digest("hex"), "37a6e0de84b4ecacfa31ff59467158eacc01f4c23ce75957f2d47676fe053686");
  const red = replay(baseline);
  assert.ifError(red.error);
  assert.equal(red.signal, null);
  assert.equal(red.status, 1, red.stdout + red.stderr);
  qualify(red.stdout, expectedFailures);
  const errors = [...red.stdout.matchAll(/^\s+Replacing a configured key must retain its provider key link$/gm)];
  assert.equal(errors.length, 2, "Baseline must fail at the two missing-link assertions, not setup");
  context.diagnostic(`Qualified baseline RED\n${red.stdout}`);

  const green = replay(undefined);
  assert.ifError(green.error);
  assert.equal(green.signal, null);
  assert.equal(green.status, 0, green.stdout + green.stderr);
  qualify(green.stdout, []);
  context.diagnostic(`Qualified candidate GREEN\n${green.stdout}`);
});
