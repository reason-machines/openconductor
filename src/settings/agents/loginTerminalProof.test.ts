import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./loginTerminal.test.ts", import.meta.url));
const baseline = fileURLToPath(new URL("../../../evidence/settings/login-terminal-completion/baseline-parts.tsx.txt", import.meta.url));
const failures = [
  "login bootstrap keeps the shell alive and marks command completion",
  "command completion enables Done while shell input remains usable",
  "shell exit before completion reports the premature exit",
  "login waits for terminal observation before spawning",
  "spawn resolution cannot erase a fast command completion",
];

function replay(source: string | undefined) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (source) env.LOGIN_TERMINAL_SOURCE_FILE = source;
  else delete env.LOGIN_TERMINAL_SOURCE_FILE;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], {
    env, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
}

function qualify(tap: string, expectedFailures: readonly string[]) {
  for (const [name, expected] of Object.entries({ tests: 10, pass: 10 - expectedFailures.length, fail: expectedFailures.length, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    assert.equal(matches.length, 1, `Missing or ambiguous TAP summary for ${name}`);
    assert.equal(Number(matches[0][1]), expected);
  }
  assert.deepEqual([...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]), expectedFailures);
  assert.equal([...tap.matchAll(/^ok \d+ - /gm)].length, 10 - expectedFailures.length);
  assert.match(tap, /^1\.\.10$/m);
}

test("login terminal replays the unchanged mounted fixture RED then GREEN", (context) => {
  assert.equal(createHash("sha256").update(readFileSync(fixture)).digest("hex"), "b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7");
  assert.equal(createHash("sha256").update(readFileSync(baseline)).digest("hex"), "21e4f365407020b2d7e6da3c75b4605948cf04e89315ee2220cd9771a4218348");
  const red = replay(baseline);
  assert.ifError(red.error);
  assert.equal(red.signal, null);
  assert.equal(red.status, 1, red.stdout + red.stderr);
  qualify(red.stdout, failures);
  for (const signature of [
    "Login must not force the interactive shell to exit",
    "Command completion must enable Done without a PTY exit",
    "PTY exit alone must not claim the command completed",
    "Login must register the PTY listener before spawning",
    "Spawn resolution must preserve an observed command completion",
  ]) assert.ok(red.stdout.includes(signature), `Missing intended baseline assertion: ${signature}`);
  context.diagnostic(`Qualified baseline RED\n${red.stdout}`);

  const green = replay(undefined);
  assert.ifError(green.error);
  assert.equal(green.signal, null);
  assert.equal(green.status, 0, green.stdout + green.stderr);
  qualify(green.stdout, []);
  context.diagnostic(`Qualified candidate GREEN\n${green.stdout}`);
});
