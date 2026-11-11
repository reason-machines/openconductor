import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./loginTerminalAck.test.ts", import.meta.url));
const completion = fileURLToPath(new URL("./loginTerminal.test.ts", import.meta.url));
const baseline = fileURLToPath(new URL("../../../evidence/settings/login-terminal-output-ack/baseline-parts.tsx.txt", import.meta.url));
const failures = [
  "login acknowledges raw chunk bytes only after xterm consumes them",
  "login acknowledges output before the spawn promise resolves",
  "rendered login output releases flow credit beyond the high watermark",
  "rejected login acknowledgements do not interrupt completion or cleanup",
  "completed login shells keep acknowledging output until Done",
];
const controls = [
  "login ignores foreign, pre-spawn, lifecycle and empty output for byte credit",
  "dismissed login output cannot acknowledge a late xterm callback",
];

function replay(source: string | undefined) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (source) env.LOGIN_TERMINAL_ACK_SOURCE_FILE = source;
  else delete env.LOGIN_TERMINAL_ACK_SOURCE_FILE;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], {
    env, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
}

function qualify(tap: string, expectedFailures: readonly string[]) {
  for (const [name, expected] of Object.entries({ tests: 7, pass: 7 - expectedFailures.length, fail: expectedFailures.length, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    assert.equal(matches.length, 1, `Missing or ambiguous TAP summary for ${name}`);
    assert.equal(Number(matches[0][1]), expected);
  }
  assert.deepEqual([...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]), expectedFailures);
  const passes = [...tap.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1]);
  assert.equal(passes.length, 7 - expectedFailures.length);
  for (const name of controls) assert.ok(passes.includes(name), `Control did not pass: ${name}`);
  assert.match(tap, /^1\.\.7$/m);
}

test("login output replays the unchanged ACK fixture RED then GREEN", (context) => {
  for (const [path, expected] of [
    [fixture, "5821ea8f116268a176b3b3ad042dada17658024efdf3e754fc6e882d859afb09"],
    [completion, "b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7"],
    [baseline, "624389bd708832a56fdaddb80e2ac567c2b0901002be3e9ca5501de91f73e778"],
  ]) assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), expected);

  const red = replay(baseline);
  assert.ifError(red.error);
  assert.equal(red.signal, null);
  assert.equal(red.status, 1, red.stdout + red.stderr);
  qualify(red.stdout, failures);
  for (const signature of [
    "Rendered output must acknowledge raw bytes, not decoded text or backing-buffer size",
    "Fast rendered output must acknowledge the reserved terminal identity",
    "Rendered login output must release flow credit before the next chunk is blocked",
    "Rendered output must attempt acknowledgement even when the bridge rejects it",
    "A completed but usable login shell must keep acknowledging rendered output",
  ]) assert.ok(red.stdout.includes(signature), `Missing intended baseline assertion: ${signature}`);
  context.diagnostic(`Qualified ACK baseline RED\n${red.stdout}`);

  const green = replay(undefined);
  assert.ifError(green.error);
  assert.equal(green.signal, null);
  assert.equal(green.status, 0, green.stdout + green.stderr);
  qualify(green.stdout, []);
  context.diagnostic(`Qualified ACK candidate GREEN\n${green.stdout}`);
});
