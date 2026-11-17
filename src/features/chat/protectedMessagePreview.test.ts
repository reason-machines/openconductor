// Keep the source-qualified 10-case regression byte-identical to its RED.
// Only our fixture and product modules execute; retained vendor literals do not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { groupParts, type KeyedPart } from "./toolGroups.ts";

const fixture = new URL("../../../evidence/chat/final-message-preview/frozen-regression.mjs.txt", import.meta.url);
const fixtureSha256 = "3a9bca3c929b42cd6064e459fd0836b04c36b22999d6a29604fbd7956daeb705";

test("whole-message preview grouping passes the unchanged source-qualified 10-case fixture", () => {
  const bytes = readFileSync(fixture);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), fixtureSha256);
  const root = mkdtempSync(join(tmpdir(), "openconductor-protected-preview-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    writeFileSync(join(root, "protected-message-preview.test.mjs"), bytes);
    for (const name of ["toolGroups.ts", "types.ts"]) {
      copyFileSync(new URL(name, import.meta.url), join(root, name));
    }
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-concurrency=1",
      join(root, "protected-message-preview.test.mjs"),
    ], { encoding: "utf8", env, timeout: 120_000 });
    assert.ifError(result.error);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /^# tests 10$/m);
    assert.match(output, /^# pass 10$/m);
    assert.match(output, /^# fail 0$/m);
    assert.match(output, /^# skipped 0$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("whole-message selection does not expose hidden tools or mutate its input", () => {
  const parts: KeyedPart[] = [
    { key: "final:0", messageKey: "final", part: { kind: "text", text: "before", streaming: false } },
    {
      key: "final:1", messageKey: "final",
      part: {
        kind: "tool", hidden: true,
        call: { id: "wait", name: "collab__wait", input: {}, tool: { name: "collab__wait", input: {} }, status: "done" },
      },
    },
    { key: "final:2", messageKey: "final", part: { kind: "text", text: "after", streaming: false } },
  ];
  const original = JSON.stringify(parts);
  const grouped = groupParts(parts, "turn");
  assert.deepEqual(grouped.map((item) => item.kind === "part" ? [item.key, item.preview] : item.kind), [
    ["final:0", true], ["final:2", true],
  ]);
  assert.equal(JSON.stringify(parts), original);
});
