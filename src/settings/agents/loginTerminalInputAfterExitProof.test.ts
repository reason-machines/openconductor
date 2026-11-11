import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./loginTerminalInputAfterExit.test.ts", import.meta.url));
const completion = fileURLToPath(new URL("./loginTerminal.test.ts", import.meta.url));
const baseline = fileURLToPath(new URL("../../../evidence/settings/login-terminal-input-after-exit/baseline-parts.tsx.txt", import.meta.url));
const failures = [
  "exited login shells do not dispatch further input",
  "a completed login shell stops dispatching input after its later exit",
];
const controls = [
  "running login shells still dispatch input to their own PTY",
  "completed but live login shells remain writable",
  "a foreign PTY exit cannot disable this login shell's input",
  "dismissed logins ignore stale matching exit callbacks",
];

function replay(source: string | undefined) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (source) env.LOGIN_TERMINAL_INPUT_SOURCE_FILE = source;
  else delete env.LOGIN_TERMINAL_INPUT_SOURCE_FILE;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], {
    env, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
}

function qualify(tap: string, expectedFailures: readonly string[]) {
  for (const [name, expected] of Object.entries({ tests: 6, pass: 6 - expectedFailures.length, fail: expectedFailures.length, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    assert.equal(matches.length, 1, `Missing or ambiguous TAP summary for ${name}`);
    assert.equal(Number(matches[0][1]), expected);
  }
  assert.deepEqual([...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]), expectedFailures);
  const passes = [...tap.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(passes, [...failures, ...controls].filter((name) => !expectedFailures.includes(name)));
  assert.match(tap, /^1\.\.6$/m);
}

test("login input replays the unchanged post-exit fixture RED then GREEN", (context) => {
  for (const [path, expected] of [
    [fixture, "64d426e2f94d8fc9541b43b8c45dffe9b47b7e71661e7b728bf9fe434cc35318"],
    [completion, "b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7"],
    [baseline, "2c362c341f5467ade0a32b1bd0ad50cce02528c767d6e200bd6ffb043f0999d4"],
  ]) assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), expected);

  const red = replay(baseline);
  assert.ifError(red.error);
  assert.equal(red.signal, null);
  assert.equal(red.status, 1, red.stdout + red.stderr);
  qualify(red.stdout, failures);
  for (const signature of [
    "Exited login shells must not dispatch stdin to a dead PTY",
    "Command completion must not keep an exited PTY writable",
  ]) assert.ok(red.stdout.includes(signature), `Missing intended baseline assertion: ${signature}`);
  assert.equal([...red.stdout.matchAll(/^  code: 'ERR_ASSERTION'$/gm)].length, 2);
  context.diagnostic(`Qualified post-exit baseline RED\n${red.stdout}`);

  const green = replay(undefined);
  assert.ifError(green.error);
  assert.equal(green.signal, null);
  assert.equal(green.status, 0, green.stdout + green.stderr);
  qualify(green.stdout, []);
  context.diagnostic(`Qualified post-exit candidate GREEN\n${green.stdout}`);
});
