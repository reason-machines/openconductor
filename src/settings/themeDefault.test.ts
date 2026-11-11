import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidence = join(root, "evidence/settings/theme-default");
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const cases = [
  "missing preference starts dark",
  "explicit light is retained",
  "explicit dark is retained",
  "explicit system is retained",
  "selecting a mode does not mutate defaults",
];

function replay(baseline: boolean): string {
  const env: NodeJS.ProcessEnv = { ...process.env, THEME_DEFAULT_BASELINE: baseline ? "1" : "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "evidence/settings/theme-default/replay.mjs"], {
    cwd: root, env, encoding: "utf8", timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stdout + result.stderr);
  assert.equal(result.status, baseline ? 1 : 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 5\b/);
  assert.match(result.stdout, new RegExp(`# pass ${baseline ? 4 : 5}\\b`));
  assert.match(result.stdout, new RegExp(`# fail ${baseline ? 1 : 0}\\b`));
  assert.match(result.stdout, /# skipped 0\b/);
  for (const [index, name] of cases.entries()) {
    const status = baseline && index === 0 ? "not ok" : "ok";
    assert.match(result.stdout, new RegExp(`^${status} \\d+ - Theme default: ${name}$`, "m"));
  }
  if (baseline) {
    assert.equal((result.stdout.match(/code: 'ERR_ASSERTION'/g) ?? []).length, 1, result.stdout);
    assert.doesNotMatch(result.stdout, /ReferenceError|TypeError|MODULE_NOT_FOUND|SyntaxError/);
  }
  console.log(`${baseline ? "BASELINE" : "CANDIDATE"}\n${result.stdout}`);
  return result.stdout;
}

test("Theme default: unchanged fixture rejects the old default and preserves explicit modes", () => {
  const verified = spawnSync("python3", ["evidence/settings/theme-default/verify.py"], {
    cwd: root, encoding: "utf8", timeout: 15_000,
  });
  assert.ifError(verified.error);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  const baseline = replay(true);
  const candidate = replay(false);
  const output = join(process.env.RUNNER_TEMP ?? tmpdir(), "theme-default-replay");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "baseline.tap"), baseline);
  writeFileSync(join(output, "candidate.tap"), candidate);
  writeFileSync(join(output, "receipt.json"), JSON.stringify({
    sourceSha: process.env.GITHUB_SHA ?? null,
    baselineSha: "9a237404bc19caefe3f8473b9aae7ab4bc2439a5",
    baselineSha256: hash(join(evidence, "baseline/types.ts")),
    fixtureSha256: hash(join(evidence, "fixture.json")),
    replaySha256: hash(join(evidence, "replay.mjs")),
    baseline: { tests: 5, pass: 4, fail: 1, reason: "fresh theme is system instead of dark" },
    candidate: { tests: 5, pass: 5, fail: 0 },
    nativeBehavior: "NOT_RUN", visualParity: "NOT_RUN",
  }, null, 2) + "\n");
});
