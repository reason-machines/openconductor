import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidence = join(root, "evidence/settings/full-disk-access");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const cases = ["initial-pending", "granted", "not-granted", "query-error-fallback", "poll-after-not-granted", "window-focus-recheck", "open-system-settings"];
const redCases = new Set(["granted", "not-granted", "query-error-fallback", "poll-after-not-granted", "window-focus-recheck"]);

function replay(baseline: boolean) {
  const env: NodeJS.ProcessEnv = { ...process.env, FDA_BASELINE: baseline ? "1" : "0" };
  delete env.NODE_TEST_CONTEXT;
  delete env.FDA_OPENER_EDGE;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "evidence/settings/full-disk-access/replay.cjs"], {
    cwd: root, encoding: "utf8", env, timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stdout + result.stderr);
  assert.equal(result.status, baseline ? 1 : 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 7\b/);
  assert.match(result.stdout, new RegExp(`# pass ${baseline ? 2 : 7}\\b`));
  assert.match(result.stdout, new RegExp(`# fail ${baseline ? 5 : 0}\\b`));
  assert.match(result.stdout, /# skipped 0\b/);
  for (const name of cases) {
    const status = baseline && redCases.has(name) ? "not ok" : "ok";
    assert.match(result.stdout, new RegExp(`^${status} \\d+ - FDA fixture: ${name}$`, "m"));
  }
  if (baseline) {
    assert.equal((result.stdout.match(/code: 'ERR_ASSERTION'/g) ?? []).length, 5, result.stdout);
    assert.doesNotMatch(result.stdout, /ReferenceError|TypeError|MODULE_NOT_FOUND|Unexpected FDA dependency|Forbidden boundary/);
  }
  console.log(`${baseline ? "BASELINE" : "CANDIDATE"}\n${result.stdout}`);
  return result.stdout;
}

test("Full Disk Access verifier protects the notification boundary after denial feedback", () => {
  const result = spawnSync("python3", ["evidence/settings/full-disk-access/notification_guard_test.py"], {
    cwd: root, encoding: "utf8", timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 9 tests\b/);
  assert.match(result.stderr, /\bOK\b/);
});

test("Full Disk Access: frozen seven-case fresh-main baseline and candidate", () => {
  const verified = spawnSync("python3", ["evidence/settings/full-disk-access/verify.py"], { cwd: root, encoding: "utf8", timeout: 15_000 });
  assert.ifError(verified.error);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.equal(sha256(join(evidence, "fixture.json")), "1480a537fd6b946ba99b5e3a0e30a9f7ccee94cd619d78095c4897390f6e68af");
  assert.equal(sha256(join(evidence, "baseline/GeneralPage.tsx")), "28c970954afb645658f5be693189e3a49f2e52efc8510c309f419a0a3dad21e8");
  const baseline = replay(true);
  const candidate = replay(false);
  const output = join(process.env.RUNNER_TEMP ?? tmpdir(), "full-disk-access-replay");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "baseline.tap"), baseline);
  writeFileSync(join(output, "candidate.tap"), candidate);
  writeFileSync(join(output, "receipt.json"), JSON.stringify({
    sourceSha: process.env.GITHUB_SHA ?? null,
    baselineSha: "f73d7c30489bd09fbdeb78a812bc10a6bcfad21a",
    fixtureSha256: sha256(join(evidence, "fixture.json")),
    baselineSha256: sha256(join(evidence, "baseline/GeneralPage.tsx")),
    harnessSha256: sha256(join(evidence, "replay.cjs")),
    baseline: { tests: 7, pass: 2, fail: 5, reason: "source presentation/query assertions" },
    candidate: { tests: 7, pass: 7, fail: 0 },
    nativeProbe: "NOT_RUN", visualParity: "NOT_RUN",
  }, null, 2) + "\n");
});

test("Full Disk Access: source-backed opener rejection message", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, FDA_BASELINE: "0", FDA_OPENER_EDGE: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "evidence/settings/full-disk-access/replay.cjs"], {
    cwd: root, encoding: "utf8", env, timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ok 8 - FDA opener rejection keeps manual recovery message/);
  assert.match(result.stdout, /# pass 8\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test("Full Disk Access verifier permits only the exact Sync notification capture", () => {
  const result = spawnSync("python3", ["evidence/settings/full-disk-access/config_sync_guard_test.py"], {
    cwd: root, encoding: "utf8", timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 6 tests\b/);
  assert.match(result.stderr, /\bOK\b/);
});
