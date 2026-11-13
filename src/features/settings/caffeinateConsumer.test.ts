import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = join(root, "tests/settings/caffeinateConsumer.dom.test.mjs");
const baseline = join(root, "evidence/settings/caffeinate-consumer/baseline");
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const controlName = "whole-main disabled preference never starts an inhibitor for a stored working session";
const regressionName = "whole-main General switch commits preference and starts working-session inhibitor";
const currentNames = [
  controlName,
  regressionName,
  "whole-main waiting session independently starts an inhibitor",
  "whole-main unrelated needs statuses do not outrank a working session",
  "whole-main needs statuses alone do not hold an inhibitor",
  "whole-main battery 9 percent blocks an otherwise working session",
  "whole-main battery 10 percent blocks an otherwise working session",
  "whole-main battery 11 percent allows an otherwise working session",
  "whole-main AC at 10 percent allows an otherwise working session",
  "whole-main unknown battery output allows an otherwise working session",
  "whole-main battery polling honors 59999/60000 and stops then restarts across threshold",
  "whole-main disabling preference stops the pending inhibitor",
  "whole-main becoming idle stops the pending inhibitor",
  "whole-main stop intent survives false cancellation before late native registration",
  "whole-main stop intent finishes when pending invocation exits before registration",
  "whole-main initially hidden working session remains globally eligible",
  "whole-main initially hidden waiting session remains globally eligible",
  "whole-main null-workspace stored session remains globally eligible",
  "whole-main repeated native status callbacks do not duplicate the inhibitor",
];

function runGraph(cwd: string, mode: "baseline" | "current") {
  const env: NodeJS.ProcessEnv = { ...process.env, CAFFEINATE_REPLAY_MODE: mode, TEST_VITE_PORT: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], {
    cwd, env, encoding: "utf8", timeout: 600000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.signal, null, result.stdout + result.stderr);
  return result;
}

function assertTap(output: string, names: string[], failures: number): void {
  const rows = output.match(/^(?:not )?ok \d+ - .+$/gm) ?? [];
  assert.deepEqual(rows.map(row => row.replace(/^(?:not )?ok \d+ - /, "").trimEnd()), names, output);
  assert.match(output, new RegExp(`^1\\.\\.${names.length}\\r?$`, "m"));
  for (const [key, value] of [["tests", names.length], ["pass", names.length - failures], ["fail", failures], ["cancelled", 0], ["skipped", 0], ["todo", 0]]) {
    assert.match(output, new RegExp(`^# ${key} ${value}\\r?$`, "m"), output);
  }
  assert.equal(rows.filter(row => row.startsWith("not ok")).length, failures, output);
  assert.doesNotMatch(output, /# (?:SKIP|TODO)\b|ERR_MODULE_NOT_FOUND|SyntaxError|Whole-main host failed before product assertion/, output);
}

function parseManifest() {
  const value: unknown = JSON.parse(readFileSync(join(baseline, "manifest.json"), "utf8"));
  assert.ok(value && typeof value === "object" && "commit" in value && "archive" in value && "sha256" in value && "files" in value);
  assert.equal(value.commit, "bbdca3e984f5b80183703daa9f9bb27bbaf0f47c");
  assert.equal(value.archive, "graph.tar.gz");
  assert.ok(typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256));
  assert.ok(value.files && typeof value.files === "object" && !Array.isArray(value.files));
  const files = new Map<string, string>();
  for (const [path, hash] of Object.entries(value.files)) {
    assert.ok(typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash));
    assert.ok(!path.startsWith("/") && !path.split("/").some(part => part === ".." || part === "." || part === ""));
    files.set(path, hash);
  }
  for (const path of ["index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "src/main.tsx", "src/App.tsx"]) assert.ok(files.has(path), `Frozen graph missing ${path}`);
  assert.ok(files.size > 100, "historical qualification requires a complete graph, not selected live-source overlays");
  return { archive: value.archive, sha256: value.sha256, files };
}

function extractedFiles(folder: string, base = folder): string[] {
  return readdirSync(folder).flatMap(name => {
    const path = join(folder, name);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `Frozen graph contains symlink ${path}`);
    return stat.isDirectory() ? extractedFiles(path, base) : [relative(base, path).replaceAll("\\", "/")];
  });
}

test("frozen whole-main graph qualifies semantic Caffeinate missing-effect RED with an off control", () => {
  const manifest = parseManifest();
  const archive = join(baseline, manifest.archive);
  assert.equal(basename(archive), manifest.archive);
  assert.equal(sha256(readFileSync(archive)), manifest.sha256, "immutable historical graph archive hash");
  const folder = mkdtempSync(join(tmpdir(), "openconductor-caffeinate-baseline-"));
  try {
    const listed = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    const paths = listed.stdout.split(/\r?\n/).filter(path => path && !path.endsWith("/"));
    assert.deepEqual(paths.sort(), [...manifest.files.keys()].sort(), "archive must contain exactly the recorded graph");
    const extraction = spawnSync("tar", ["-xzf", archive, "-C", folder], { encoding: "utf8" });
    assert.equal(extraction.status, 0, extraction.stderr);
    assert.deepEqual(extractedFiles(folder).sort(), [...manifest.files.keys()].sort());
    for (const [path, hash] of manifest.files) assert.equal(sha256(readFileSync(join(folder, path))), hash, `historical bytes ${path}`);
    for (const path of ["package.json", "package-lock.json"]) {
      assert.equal(sha256(readFileSync(join(root, path))), manifest.files.get(path), `Fixture setup failure: dependency drift in ${path}; never classify as product RED`);
    }
    symlinkSync(join(root, "node_modules"), join(folder, "node_modules"), "dir");
    const result = runGraph(folder, "baseline");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assertTap(result.stdout, [controlName, regressionName], 1);
    assert.match(result.stdout, new RegExp(`^not ok 2 - ${regressionName}$`, "m"));
    assert.match(result.stdout, /CAFFEINATE_MISSING_EFFECT_WORKING: expected inhibitor 1/);
    assert.match(result.stdout, /expected: 1\r?\n\s+actual: 0\r?\n/);
    console.log(result.stdout.trim());
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("actual current whole-main graph passes every Caffeinate browser control without skips", () => {
  const result = runGraph(root, "current");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assertTap(result.stdout, currentNames, 0);
  console.log(result.stdout.trim());
});
