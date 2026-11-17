import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = new URL("../../../", import.meta.url);
const here = new URL("./", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = JSON.parse(readFileSync(new URL("source.json", here), "utf8"));
for (const span of source.spans) {
  assert.equal(hash(Buffer.from(span.text)), span.sha256, span.name);
  assert.equal(Buffer.byteLength(span.text), span.end_byte - span.start_byte, span.name);
}
for (const [asset, name, literal] of source.joins) {
  assert.ok(source.spans.find((span) => span.asset === asset && span.name === name)?.text.includes(literal), name);
}
for (const file of source.fresh_files) {
  assert.equal(hash(execFileSync("git", ["show", `${source.checked_main}:${file.path}`], { cwd: root })), file.sha256, file.path);
}
for (const [path, literal] of source.fresh_joins) {
  assert.ok(execFileSync("git", ["show", `${source.checked_main}:${path}`], { cwd: root, encoding: "utf8" }).includes(literal), path);
}
let verifiedParents = 0;
for (const [asset, env] of [["renderer", "OC_RETAINED_RENDERER"], ["index", "OC_RETAINED_INDEX"]]) {
  if (!process.env[env]) continue;
  const bytes = readFileSync(process.env[env]);
  assert.equal(hash(bytes), source.parents[asset].sha256, asset);
  assert.equal(bytes.length, source.parents[asset].bytes, asset);
  for (const span of source.spans.filter((span) => span.asset === asset)) {
    assert.equal(hash(bytes.subarray(span.start_byte, span.end_byte)), span.sha256, span.name);
    assert.equal(bytes.subarray(span.start_byte, span.end_byte).toString("utf8"), span.text, span.name);
  }
  verifiedParents++;
}
assert.equal(hash(read("src/features/chat/todoWriteHeader.test.ts")), source.frozen_test_sha256);
assert.equal(hash(read("src/features/chat/todoWriteHeader.inputs.json")), source.frozen_inputs_sha256);
const archive = (file) => readFileSync(new URL(`baseline/${file}.txt`, here));
const oldMixed = archive("todoMixedRows.test.ts").toString("utf8");
const newMixed = read("src/features/chat/todoMixedRows.test.ts").toString("utf8");
assert.equal(newMixed, oldMixed.replace(
  'assert.equal(text(headers(mounted)[0]!).includes("Todo started"), false);',
  'assert.equal(text(headers(mounted)[0]!).includes("Todo started"), name === "only active");',
));
const oldInputs = JSON.parse(archive("todoReadHeader.inputs.json").toString("utf8"));
const newInputs = JSON.parse(read("src/features/chat/todoReadHeader.inputs.json").toString("utf8"));
assert.equal(oldInputs.cases.length, 20);
for (const entry of oldInputs.cases) {
  if (entry.id === "control-write-active") entry.expected_headers = [{ left: "Todo started", right: "1. Unchanged write" }];
  if (entry.id === "control-write-all-completed") entry.expected_headers = [{ left: "Todo list completed", right: "1 todo" }];
}
assert.deepEqual(newInputs, oldInputs, "only two TodoWrite expected-header fields may change; inputs/IDs/TodoRead/mixed controls stay frozen");
const oldReadTest = archive("todoReadHeader.test.ts").toString("utf8");
const oldReadHash = hash(archive("todoReadHeader.inputs.json"));
const newReadHash = hash(read("src/features/chat/todoReadHeader.inputs.json"));
assert.equal(read("src/features/chat/todoReadHeader.test.ts").toString("utf8"), oldReadTest.replace(oldReadHash, newReadHash));
const oldProduct = execFileSync("git", ["show", `${source.checked_main}:src/features/chat/ToolRows.tsx`], { cwd: root, encoding: "utf8" });
const expectedProduct = oldProduct
  .replace('const nonmixedRead = name === "TodoRead" && todos.length > 0 && !(active && done > 0 && done < todos.length);', 'const stateHeader = (name === "TodoWrite" || todos.length > 0) && !(active && done > 0 && done < todos.length);')
  .replace('const label = nonmixedRead', 'const label = stateHeader')
  .replace('? active ? "Todo started" : done === todos.length ?', '? todos.length === 0 ? "Todo list created" : active ? "Todo started" : done === todos.length ?')
  .replace('const summary = nonmixedRead', 'const summary = stateHeader');
assert.equal(read("src/features/chat/ToolRows.tsx").toString("utf8"), expectedProduct, "production delta is exactly the nonmixed header seam");
console.log(JSON.stringify({
  source_spans: source.spans.length, reference_joins: source.joins.length,
  checked_main: source.checked_main, fresh_files: source.fresh_files.length, fresh_joins: source.fresh_joins.length,
  original_parents_verified: verifiedParents, frozen_new_files: 2,
  refreshed_legacy_expectations: 3, integrity_digest_updates: 1,
  assertion_counts_inputs_and_unrelated_controls_preserved: true, product_scope_exact: true,
}));
