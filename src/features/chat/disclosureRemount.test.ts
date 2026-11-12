import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("tool disclosure remount: unchanged five-case baseline RED and candidate GREEN", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const loader = join(root, "tests/chat-disclosure/proof-loader.mjs");
  const out = mkdtempSync(join(tmpdir(), "openconductor-disclosure-remount-"));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE;
  delete env.DISCLOSURE_BASELINE_RECEIPT;
  try {
    for (const stage of ["baseline", "candidate"] as const) {
      const stageEnv = stage === "baseline"
        ? { ...env, DISCLOSURE_TRANSCRIPT_SOURCE_FILE: join(root, "evidence/chat/tool-disclosure-remount/baseline-Transcript.tsx.txt") }
        : { ...env, DISCLOSURE_BASELINE_RECEIPT: join(out, "baseline.json") };
      const result = spawnSync(process.execPath, [loader, stage, root, out], {
        cwd: root, env: stageEnv, encoding: "utf8", timeout: 150000, maxBuffer: 16 * 1024 * 1024,
      });
      assert.equal(result.error, undefined, `${stage}: ${String(result.error)}`);
      assert.equal(result.signal, null, `${stage} replay must finish`);
      assert.equal(result.status, 0, `${stage} replay was not qualified:\n${result.stdout}\n${result.stderr}`);
      console.log(`${stage} disclosure receipt: ${readFileSync(join(out, `${stage}.json`), "utf8")}`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
