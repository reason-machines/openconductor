import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("four frozen Send-readiness controls execute against the actual ComposerSession", () => {
  const source = readFileSync(new URL("../../../evidence/chat/send-readiness/service-controls-v1.mjs", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), "eb5cd51e6e8451870c2bdd255c32b49a66a70086e1e5a719b775f83ef4bf6a09");
  const oldImport = "'./current/src/features/chat/composerSession.ts'";
  assert.equal(source.split(oldImport).length - 1, 1);
  const folder = mkdtempSync(join(tmpdir(), "openconductor-send-readiness-"));
  try {
    const path = join(folder, "controls.test.mjs");
    writeFileSync(path, source.replace(oldImport, JSON.stringify(new URL("./composerSession.ts", import.meta.url).href)));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-reporter=tap", path], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((result.stdout.match(/^ok \d+ - /gm) ?? []).length, 4, result.stdout);
    assert.match(result.stdout, /# pass 4\r?\n/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
