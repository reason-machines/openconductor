import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const packet = resolve(root, "evidence/chat/auth-retry-multiple");
const fixture = resolve(packet, "fixture/authRetryMultiple.test.mjs");
const cases = [
  "one signed-out message resumes once after a connected notification",
  "two signed-out messages both resume after pairing without a manual second retry",
];

test("the frozen sign-in continuation regression delivers every failed message once", () => {
  assert.equal(createHash("sha256").update(readFileSync(fixture)).digest("hex"), "9b3d03de095956357d3e81e0290e2f4b214b849b5620dedc60f42d3bf245efcc");
  const env: typeof process.env = { ...process.env, RETRY_PACKET: packet, RETRY_REACT_DEPS: root };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--max-old-space-size=384", "--test", "--test-concurrency=1", "--test-reporter=tap", fixture,
  ], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 45_000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assert.equal(result.error, undefined, output);
  assert.equal(result.signal, null, output);
  assert.equal(result.status, 0, output);
  assert.equal(result.stdout.split("\n")[0], "TAP version 13", output);
  assert.doesNotMatch(result.stdout, /^Bail out!/m, output);
  assert.deepEqual([...result.stdout.matchAll(/^1\.\.(\d+)$/gm)].map((match) => match[1]), ["2"], output);
  assert.deepEqual([...result.stdout.matchAll(/^(ok|not ok) (\d+) - (.+)$/gm)].map((match) => match.slice(1)), cases.map((name, index) => ["ok", String(index + 1), name]), output);
  for (const [key, value] of Object.entries({ tests: 2, suites: 0, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    assert.deepEqual([...result.stdout.matchAll(new RegExp(`^# ${key} (\\d+)$`, "gm"))].map((match) => match[1]), [String(value)], output);
  }
});
