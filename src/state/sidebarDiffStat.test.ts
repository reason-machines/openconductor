import { test } from "node:test";
import assert from "node:assert/strict";
import { compactCount, isLockfile, sumDiffStat } from "./sidebarDiffStat.ts";

test("lockfiles are matched by basename, anywhere in the tree", () => {
  assert.equal(isLockfile("package-lock.json"), true);
  assert.equal(isLockfile("web/pnpm-lock.yaml"), true);
  assert.equal(isLockfile("src-tauri/Cargo.lock"), true);
  assert.equal(isLockfile("src/lock.ts"), false);
  assert.equal(isLockfile("Cargo.toml"), false);
});

test("the row's totals skip lockfiles", () => {
  const files = [
    { path: "src/a.ts", additions: 10, deletions: 2 },
    { path: "package-lock.json", additions: 900, deletions: 400 },
    { path: "go.sum", additions: 30, deletions: 0 },
    { path: "README.md", additions: 1, deletions: 5 },
  ];
  assert.deepEqual(sumDiffStat(files), { added: 11, removed: 7 });
  assert.deepEqual(sumDiffStat([]), { added: 0, removed: 0 });
});

test("counts are compact the way Conductor's sidebar shows them", () => {
  assert.equal(compactCount(0), "0");
  assert.equal(compactCount(999), "999");
  assert.equal(compactCount(1000), "1k");
  assert.equal(compactCount(1250), "1.3k");
  assert.equal(compactCount(9999), "10k");
  assert.equal(compactCount(10_000), "10k");
  assert.equal(compactCount(12_600), "13k");
  assert.equal(compactCount(99_000), "99k");
  assert.equal(compactCount(99_001), "✱✱");
});
