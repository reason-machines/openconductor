import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const read = path => readFileSync(resolve(here, path), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const baseline = "2ada6e3e186391695cae1ce5694ac251a6323079";
const original = JSON.parse(read("qualification/retained-source-v1.json"));
assert.equal(original.records.length, 20);
const references = {};
for (const record of original.records) {
  const bytes = readFileSync(resolve(here, record.file));
  assert.equal(bytes.length, record.bytes, record.name);
  assert.equal(sha(bytes), record.sha256, record.name);
  references[record.name] = bytes.toString();
}
if (process.argv[2]) {
  const assets = {
    renderer: readFileSync(resolve(process.argv[2], "renderApp-D_fmY7hW.js")),
    index: readFileSync(resolve(process.argv[2], "index-BGEQ8YjU.js")),
  };
  for (const [key, bytes] of Object.entries(assets)) assert.equal(sha(bytes), original.asset_sha256[key], key);
  for (const record of original.records) {
    const [start, end] = record.utf8_half_open;
    assert.equal(sha(assets[record.asset].subarray(start, end)), record.sha256, record.name);
  }
}
assert.equal(references.Qh, "ca as Qh");
assert.equal(references.ca, "TQt as ca");
assert.ok(references["los-complete"].includes('Qh("dialog.primaryAction",Se.nativeEvent)&&!E.isPending&&i&&o'));
assert.ok(references["nd-content"].includes('Qh("dialog.primaryAction",ge.nativeEvent)'));
assert.ok(!/p\.jsxs?\("form"/.test(references["los-complete"]));
assert.ok(references.Rde.includes('Es("div",e'));
assert.ok(references.V_.includes('key:he({key:"Enter",modifiers:Qe})'));
assert.ok(references["modifier-constants"].includes('const Qe=["meta"]'));

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `Unique exact replacement: ${before}`);
  return source.replace(before, after);
}
const component = "src/components/CloneGitHubRepoDialog.tsx";
let expected = execFileSync("git", ["show", `${baseline}:${component}`], { cwd: root, encoding: "utf8" });
const productEdits = [
  ['import { useEffect, useState, type FormEvent } from "react";', 'import { useEffect, useState } from "react";'],
  ['  async function submit(e?: FormEvent) {\n    e?.preventDefault();', '  async function submit() {'],
  ['      <form onSubmit={submit} className="modal-body clone-dialog">', '      <div className="modal-body clone-dialog">'],
  ['          <button type="submit" className="btn btn-primary" data-primary-action disabled={!canClone(url.trim(), location.trim(), pending)}>', '          <button type="button" className="btn btn-primary" data-primary-action onClick={() => void submit()} disabled={!canClone(url.trim(), location.trim(), pending)}>'],
  ['      </form>\n    </DialogFrame>', '      </div>\n    </DialogFrame>'],
];
for (const edit of productEdits) expected = replaceOnce(expected, ...edit);
assert.equal(readFileSync(resolve(root, component), "utf8"), expected, "Only the five leased product replacements");

const testNames = ["clonePendingInputs", "cloneRecentPendingSelection", "cloneUrlTextCorrection"];
for (const name of testNames) {
  let expected = read(`qualification/original-tests/${name}.test.ts`);
  expected = replaceOnce(expected,
    'void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });',
    'void renderer.root.findByProps({ "data-primary-action": true }).props.onClick();');
  // The primary selector occurs twice, once inside an unchanged disabled assertion.
  assert.equal(expected.split('renderer.root.findByProps({ type: "submit" })').length - 1, 2);
  expected = expected.replaceAll('renderer.root.findByProps({ type: "submit" })', 'renderer.root.findByProps({ "data-primary-action": true })');
  if (name === "cloneUrlTextCorrection") expected = replaceOnce(expected,
    'renderer.root.findByType("form").findAllByType("input")',
    'renderer.root.findByProps({ className: "modal-body clone-dialog" }).findAllByType("input")');
  assert.equal(readFileSync(resolve(root, `src/components/${name}.test.ts`), "utf8"), expected,
    `${name}: only activation transport and exact selectors differ; every assertion API/value/flow retained`);
}
assert.equal(sha(readFileSync(resolve(root, "src/components/cloneImplicitEnter.test.ts"))),
  "15bd3668d4548b44110c2add89067a0e7e4e7e5c212c84abea3f233b1f74ed0c", "Frozen dedicated test");
const graph = JSON.parse(read("qualification/browser-baseline-bundle.json"));
for (const [path, hash] of Object.entries(graph.sourceHashes)) {
  if (path !== component) assert.equal(sha(readFileSync(resolve(root, path))), hash, `${path} remains unchanged`);
}
const allowed = new Set([component, "src/components/cloneImplicitEnter.test.ts", ...testNames.map(name => `src/components/${name}.test.ts`)]);
for (const path of execFileSync("git", ["diff", "--name-only", baseline, "--", "src"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean)) {
  assert.ok(allowed.has(path), `Outside source lease: ${path}`);
}
for (const [file, passes, failures] of [["qualification/mounted-red.tap", 4, 2], ["mounted-green.tap", 25, 0]]) {
  const tap = read(file);
  assert.ok(tap.includes(`# pass ${passes}\n`), file);
  assert.ok(tap.includes(`# fail ${failures}\n`), file);
  assert.ok(tap.includes("# skipped 0\n"), file);
  assert.ok(tap.includes("# cancelled 0\n"), file);
}
for (const [file, calls, submits] of [["Cloning_.json", 1, 0], ["actual-location-enter.json", 1, 0],
  ["actual-url-meta-enter.json", 1, 0], ["actual-location-meta-enter.json", 1, 0], ["actual-primary-click.json", 1, 0],
  ["actual-blank.json", 0, 0], ["pendingFinal.json", 1, 0], ["capabilitySubmits_3.json", 0, 3]]) {
  let value = JSON.parse(read(`browser-baseline/${file}`)).result.result.value;
  if (typeof value === "string") value = JSON.parse(value);
  const witness = value.witness ?? value.pendingFinal ?? value;
  assert.equal(witness.calls.length, calls, file);
  assert.equal(witness.capabilitySubmits, submits, file);
  assert.deepEqual(witness.errors, [], file);
  for (const event of witness.events.filter(event => event.type === "keydown")) assert.equal(event.trusted, true, file);
}
for (const [name, calls, submits] of [["url-enter", 0, 0], ["location-enter", 0, 0], ["url-meta-enter", 1, 0],
  ["location-meta-enter", 1, 0], ["primary-click", 1, 0], ["blank", 0, 0], ["pending-final", 1, 0], ["capability", 0, 3]]) {
  const value = JSON.parse(read(`browser-treatment/treatment-${name}.json`)).result.result.value;
  assert.equal(value.witness.calls.length, calls, name);
  assert.equal(value.witness.capabilitySubmits, submits, name);
  assert.deepEqual(value.witness.errors, [], name);
  for (const event of value.witness.events.filter(event => event.type === "keydown")) assert.equal(event.trusted, true, name);
  if (name.endsWith("-enter") && !name.includes("meta")) {
    assert.equal(value.disabled, false, name);
    assert.ok(!value.witness.events.some(event => event.type === "submit" || event.type === "click"), name);
  }
}
const treatmentGraph = JSON.parse(read("qualification/browser-treatment-bundle.json"));
assert.deepEqual(treatmentGraph.inputs, graph.inputs, "Same 183-module fixture graph");
assert.equal(treatmentGraph.sourceHashes[component], sha(readFileSync(resolve(root, component))));
for (const name of ["entry.tsx", "io.ts", "build.mjs", "fixture.css", "PLAN.md"]) {
  const line = read("qualification/browser-frozen-v1.sha256").split("\n").find(line => line.endsWith(`/${name}`));
  assert.ok(line, name);
  assert.equal(sha(readFileSync(resolve(here, "qualification", name))), line.split("  ")[0], `Frozen archived browser fixture source: ${name}`);
}
console.log(JSON.stringify({status:"PASS", referenceRecords:20, fullParentsRehashed:!!process.argv[2],
  productReplacements:5, archivedTestHarnesses:3, frozenMountedTest:true, baseline:[4,2], mountedTreatment:[25,0],
  browserBaselineRecords:8, browserTreatmentRecords:8, fixtureInputs:183, frozenBrowserSources:5}, null, 2));
