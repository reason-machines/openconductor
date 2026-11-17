import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const [stage, checkout, output] = process.argv.slice(2);
assert.ok(["baseline", "candidate"].includes(stage), "Use baseline or candidate; baseline must be qualified before any product repair");
assert.ok(checkout && output, "Usage: node proof-loader.mjs <baseline|candidate> <clean-checkout> <evidence-directory>");
const receipt = JSON.parse(readFileSync(resolve(here, "fixture-freeze.json"), "utf8"));
for (const [path, expected] of Object.entries(receipt.files)) {
  const actual = createHash("sha256").update(readFileSync(resolve(here, path))).digest("hex");
  assert.equal(actual, expected, `Frozen fixture bytes changed: ${path}`);
}
const root = resolve(checkout);
const out = resolve(output);
mkdirSync(out, { recursive: true });
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
assert.equal(head.status, 0, head.stderr);
if (stage === "baseline") {
  const sourcePolicy = JSON.parse(readFileSync(resolve(here, "static-import-closure.json"), "utf8"));
  assert.equal(sourcePolicy.main, receipt.baseline_main);
  for (const [path, expected] of Object.entries(sourcePolicy.sources)) {
    const sourceFile = path === "src/features/chat/Transcript.tsx" && process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE
      ? resolve(process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE)
      : resolve(root, path);
    const actual = createHash("sha256").update(readFileSync(sourceFile)).digest("hex");
    assert.equal(actual, expected, `Baseline source drifted: ${path}; rebind before freezing, not after RED`);
  }
}
if (stage === "candidate") {
  assert.equal(process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE, undefined, "Candidate GREEN must use its real current Transcript, not a baseline override");
  assert.ok(process.env.DISCLOSURE_BASELINE_RECEIPT, "Candidate needs the qualified baseline JSON, not an assumption of RED");
  const baseline = JSON.parse(readFileSync(process.env.DISCLOSURE_BASELINE_RECEIPT, "utf8"));
  assert.equal(baseline.stage, "baseline");
  assert.equal(baseline.verdict, "QUALIFIED_INTENDED_RED");
  assert.equal(baseline.fixture_freeze_sha256, createHash("sha256").update(readFileSync(resolve(here, "fixture-freeze.json"))).digest("hex"));
}
const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", resolve(here, "disclosureRemount.component.test.mjs")], {
  cwd: root, env: { ...process.env, OPENCONDUCTOR_SOURCE_ROOT: root }, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024,
});
writeFileSync(resolve(out, `${stage}.tap`), result.stdout ?? "");
writeFileSync(resolve(out, `${stage}.stderr.txt`), result.stderr ?? "");
assert.equal(result.signal, null, "Terminated fixture is not behavioral evidence");
assert.equal(result.error, undefined, "Fixture process failure is not a qualified assertion failure");
const cases = [...result.stdout.matchAll(/^(not ok|ok)\s+\d+\s+-\s+([^\r\n]+)$/gm)].map((m) => ({ passed: m[1] === "ok", title: m[2] }));
assert.equal(cases.length, receipt.cases.length, "Every frozen case must execute, without a file-level loader failure");
for (let index = 0; index < receipt.cases.length; index++) {
  const expected = receipt.cases[index];
  const actual = cases[index];
  assert.ok(actual.title.startsWith(`${expected.id}: `), `Frozen case ordering/name changed: ${actual.title}`);
  const shouldPass = stage === "candidate" || expected.role !== "INTENDED_RED";
  assert.equal(actual.passed, shouldPass, `${stage}: ${expected.id} did not have its intended result`);
}
if (stage === "baseline") {
  assert.equal(result.status, 1, "Baseline must fail the two named assertions, not pass or crash");
  for (const code of receipt.intended_failure_assertions) assert.ok(result.stdout.includes(code), `Missing exact intended assertion ${code}`);
} else assert.equal(result.status, 0, "Candidate must pass all five unchanged cases");
const summary = {
  stage, source_head: head.stdout.trim(), fixture_freeze_sha256: createHash("sha256").update(readFileSync(resolve(here, "fixture-freeze.json"))).digest("hex"),
  verdict: stage === "baseline" ? "QUALIFIED_INTENDED_RED" : "FIVE_CASE_GREEN", cases,
  transcript_source_mode: process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE ? "whole-module frozen baseline snapshot" : "current production module",
  transcript_override_sha256: process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE ? createHash("sha256").update(readFileSync(process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE)).digest("hex") : null,
  limits: ["Mounted mocked-native-transport React evidence only", "Not original native execution, database proof, real provider or native macOS acceptance"],
};
writeFileSync(resolve(out, `${stage}.json`), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
