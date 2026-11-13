import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("Notification denial reports an error without persisting an enabled preference", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--test", "--test-reporter=tap", "evidence/settings/notification-permission/denial-feedback/replay.test.cjs",
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...env,
      NOTIFICATION_DEPS: process.env.NOTIFICATION_TEST_DEPS ?? root,
      NOTIFICATION_SOURCE_ROOT: root,
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 8\b/);
  assert.match(result.stdout, /# pass 8\b/);
  assert.match(result.stdout, /# fail 0\b/);
  assert.match(result.stdout, /# skipped 0\b/);
});
