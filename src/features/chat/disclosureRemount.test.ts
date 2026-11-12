import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = join(root, "tests/chat-disclosure");

function sourceRoots(checkout: string) {
  const policy = JSON.parse(readFileSync(join(fixture, "static-import-closure.json"), "utf8"));
  const resolver = JSON.parse(readFileSync(join(fixture, "baseline-resolver-files.json"), "utf8"));
  const archive = readFileSync(join(fixture, "baseline-sources.json.gz"));
  const snapshot = JSON.parse(gunzipSync(archive).toString("utf8"));
  assert.equal(resolver.main, policy.main);
  assert.equal(snapshot.main, policy.main);
  for (const path of Object.keys(resolver.resolver_files)) assert.equal(path in policy.sources, false);
  const files = { ...policy.sources, ...resolver.resolver_files };
  assert.deepEqual(Object.keys(snapshot.sources).sort(), Object.keys(files).sort());
  const baseline = mkdtempSync(join(checkout, ".disclosure-baseline-"));
  try {
    for (const [path, expected] of Object.entries(files)) {
      assert.ok(path.startsWith("src/") && !path.includes("\\") && path.split("/").every((part) => part && part !== "." && part !== ".."), `Historical path must stay inside src: ${path}`);
      const text: unknown = snapshot.sources[path];
      assert.ok(typeof text === "string", `Missing historical source: ${path}`);
      assert.equal(createHash("sha256").update(text).digest("hex"), expected, `Historical source drifted: ${path}`);
      mkdirSync(dirname(join(baseline, path)), { recursive: true });
      writeFileSync(join(baseline, path), text);
    }
    return {
      baseline, candidate: checkout,
      provenance: {
        historical_source_commit: policy.main,
        archive_sha256: createHash("sha256").update(archive).digest("hex"),
        frozen_policy_sha256: createHash("sha256").update(readFileSync(join(fixture, "static-import-closure.json"))).digest("hex"),
        resolver_manifest_sha256: createHash("sha256").update(readFileSync(join(fixture, "baseline-resolver-files.json"))).digest("hex"),
        historical_source_files: Object.keys(files).length,
        receipt_source_head: "enclosing current runner checkout, not the historical source commit",
      },
    };
  } catch (error) {
    rmSync(baseline, { recursive: true, force: true });
    throw error;
  }
}

function verifyCandidateSources(checkout: string) {
  const result = spawnSync("git", ["ls-tree", "-rz", "HEAD", "--", "src"], { cwd: checkout, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const blobs: Record<string, string> = {};
  for (const entry of result.stdout.split("\0").filter(Boolean)) {
    const [metadata, path] = entry.split("\t");
    const [mode, kind, expected] = metadata.split(" ");
    assert.equal(kind, "blob");
    assert.ok(mode === "100644" || mode === "100755", `Candidate source must be a regular file: ${path}`);
    const bytes = readFileSync(join(checkout, path));
    const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(actual, expected, `Candidate source differs from current Git blob: ${path}`);
    blobs[path] = expected;
  }
  assert.ok(Object.keys(blobs).length > 0);
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "--", "src"], { cwd: checkout, encoding: "utf8" });
  assert.equal(untracked.status, 0, untracked.stderr);
  assert.equal(untracked.stdout, "", "Candidate cannot load untracked source modules");
  return blobs;
}

test("tool disclosure source roots: live dependency changes leave the historical baseline untouched", () => {
  const checkout = mkdtempSync(join(tmpdir(), "openconductor-disclosure-roots-"));
  try {
    const roots = sourceRoots(checkout);
    const dependency = "src/features/openIn/apps.ts";
    const historical = readFileSync(join(roots.baseline, dependency));
    mkdirSync(dirname(join(checkout, dependency)), { recursive: true });
    for (const value of ["first live revision", "second live revision"]) {
      writeFileSync(join(checkout, dependency), JSON.stringify(value));
      assert.deepEqual(readFileSync(join(roots.baseline, dependency)), historical);
      assert.equal(roots.candidate, checkout);
      assert.equal(runInNewContext(readFileSync(join(roots.candidate, dependency), "utf8")), value);
    }
    rmSync(join(checkout, dependency));
    assert.deepEqual(readFileSync(join(roots.baseline, dependency)), historical);
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
});

test("tool disclosure remount: unchanged five-case baseline RED and candidate GREEN", () => {
  const loader = join(fixture, "proof-loader.mjs");
  const out = mkdtempSync(join(tmpdir(), "openconductor-disclosure-remount-"));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE;
  delete env.DISCLOSURE_BASELINE_RECEIPT;
  const roots = sourceRoots(root);
  try {
    const candidateBlobs = verifyCandidateSources(roots.candidate);
    console.log(`candidate disclosure source blobs: ${JSON.stringify(candidateBlobs)}`);
    console.log(`baseline disclosure source provenance: ${JSON.stringify(roots.provenance)}`);
    for (const stage of ["baseline", "candidate"] as const) {
      const stageEnv = stage === "baseline"
        ? { ...env, DISCLOSURE_TRANSCRIPT_SOURCE_FILE: join(roots.baseline, "src/features/chat/Transcript.tsx") }
        : { ...env, DISCLOSURE_BASELINE_RECEIPT: join(out, "baseline.json") };
      const result = spawnSync(process.execPath, [loader, stage, roots[stage], out], {
        cwd: root, env: stageEnv, encoding: "utf8", timeout: 150000, maxBuffer: 16 * 1024 * 1024,
      });
      if (result.status !== 0) {
        for (const suffix of ["tap", "stderr.txt"]) {
          const diagnostic = join(out, `${stage}.${suffix}`);
          if (existsSync(diagnostic)) console.log(`${stage} disclosure ${suffix}:\n${readFileSync(diagnostic, "utf8")}`);
        }
      }
      assert.equal(result.error, undefined, `${stage}: ${String(result.error)}`);
      assert.equal(result.signal, null, `${stage} replay must finish`);
      assert.equal(result.status, 0, `${stage} replay was not qualified:\n${result.stdout}\n${result.stderr}`);
      console.log(`${stage} disclosure receipt: ${readFileSync(join(out, `${stage}.json`), "utf8")}`);
    }
  } finally {
    rmSync(roots.baseline, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
