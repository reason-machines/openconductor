// Run with Node's type stripping and the retained Conductor 0.87.6 renderer path.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildRows } from "../../src/features/chat/view.ts";

const path = process.argv[2];
assert.ok(path, "Pass the retained renderApp-D_fmY7hW.js path");
const bytes = readFileSync(path);
const sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256, "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde");
const source = bytes.toString("utf8");
const footerStart = source.indexOf("const TDo=");
const predicate = source.match(/function RDo\(t\)\{return t\.model\}/)?.[0];
const expression = source.slice(footerStart).match(/Qe=(i\.find\(RDo\)\?\.model\?\?r\.model);/)?.[1];
assert.ok(predicate && expression, "The pinned reference attribution expression must be present");
const select = vm.runInNewContext(`${predicate}; (i, r) => (${expression})`, {}, { timeout: 1000 });
const cases = [
  { name: "first assistant wins", user: "requested", assistants: ["", "reported-first", "reported-last"], expected: "reported-first" },
  { name: "user snapshot fallback", user: "original", assistants: [undefined, ""], expected: "original" },
  { name: "unknown remains unknown", user: undefined, assistants: [undefined, ""], expected: undefined },
];
for (const c of cases) {
  const user = { id: "u", role: "user", model: c.user };
  const assistants = c.assistants.map((model, i) => ({ id: `a${i}`, role: "assistant", model }));
  const messages = [user, ...assistants].map((m) => ({
    ...m, sessionId: "synthetic", turnId: "t", createdAt: "2026-11-08T00:00:00.000Z", blocks: [],
  }));
  const reference = select(assistants, user);
  const row = buildRows({ sessionId: "synthetic", messages, turns: {}, activeTurn: null }).find((r) => r.kind === "turn_end");
  assert.equal(reference, c.expected, c.name);
  assert.equal(row?.model, reference, c.name);
}
console.log(JSON.stringify({ result: "PASS", cases: cases.length, sha256, footerByteOffset: Buffer.byteLength(source.slice(0, footerStart)), predicateByteOffset: Buffer.byteLength(source.slice(0, source.indexOf(predicate))), limitation: "Extracted pure attribution only; no app, provider or UI executed." }, null, 2));
