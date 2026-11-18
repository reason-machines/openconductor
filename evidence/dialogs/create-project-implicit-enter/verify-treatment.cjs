const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'qualification-original.json')));
const current = JSON.parse(fs.readFileSync(path.join(__dirname, 'current-source.json')));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const readHere = file => fs.readFileSync(path.join(__dirname, file));
const assetsDir = process.argv[2] || path.join(root, '.rea-work/dlg-pr-title-cancel-focus-retained');
const assets = Object.fromEntries(Object.entries({ renderer: 'renderApp-D_fmY7hW.js', index: 'index-BGEQ8YjU.js' }).map(([key, file]) => [key, fs.readFileSync(path.join(assetsDir, file))]));
for (const [key, raw] of Object.entries(assets)) assert.equal(sha(raw), manifest.asset_sha256[key], key);
for (const span of manifest.spans) {
  const raw = assets[span.asset].subarray(...span.utf8_half_open);
  assert.equal(sha(raw), span.sha256, span.name);
  assert.deepEqual(raw, readHere(span.file));
}
for (const item of manifest.frozen_fixture) assert.equal(sha(readHere(`frozen/${item.path}`)), item.sha256, item.path);
assert.deepEqual(fs.readFileSync(path.join(root, 'src/components/createProjectImplicitEnter.test.ts')), readHere('frozen/createProjectImplicitEnter.test.ts.txt'));
const product = 'src/components/CreateProjectDialog.tsx';
const harness = 'src/components/createProjectPendingControls.test.ts';
const ports = {
  [product]: [
    ['import { useEffect, useState, type FormEvent } from "react";', 'import { useEffect, useState } from "react";'],
    ['  async function submit(e?: FormEvent) {\n    e?.preventDefault();', '  async function submit() {'],
    ['      <form onSubmit={submit} className="create-project-dialog">', '      <div className="create-project-dialog">'],
    ['          <button type="submit" className="btn btn-primary" data-primary-action disabled={!canCreate(slug, parent.trim(), pending)}>', '          <button type="button" className="btn btn-primary" data-primary-action onClick={() => void submit()} disabled={!canCreate(slug, parent.trim(), pending)}>'],
    ['      </form>', '      </div>'],
  ],
  [harness]: [
    ['  const primary = (): Host => renderer.root.findByProps({ type: "submit" });', '  const primary = (): Host => renderer.root.findByProps({ "data-primary-action": true });'],
    ['    await act(async () => { void send(renderer.root.findByType("form"), "onSubmit", { preventDefault() {} }); });', '    await act(async () => { void send(primary(), "onClick"); });'],
  ],
};
for (const record of manifest.current_sources) {
  const before = readHere(`baseline/${record.path}`);
  assert.equal(sha(before), record.sha256, record.path);
  assert.deepEqual(execFileSync('git', ['show', `${current.main}:${record.path}`], { cwd: root }), before);
  let expected = before.toString();
  for (const [from, to] of ports[record.path] || []) {
    assert.equal(expected.split(from).length, 2, `Unique port: ${from}`);
    expected = expected.replace(from, to);
  }
  assert.equal(read(record.path), expected, `Only approved changes: ${record.path}`);
}
function calls(source) {
  const file = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  const assertions = [], tests = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      if (name.startsWith('assert.')) assertions.push(node.getText(file));
      if (name === 'test') tests.push(node.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { assertions, tests };
}
const before = calls(readHere(`baseline/${harness}`).toString());
const after = calls(read(harness));
assert.deepEqual(after, before, 'Every legacy assertion and complete test invocation must remain byte-identical');
console.log(JSON.stringify({ result: 'PASS', main: current.main, assets: Object.keys(assets).length, retainedBindings: manifest.spans.length, frozenFixtureFiles: manifest.frozen_fixture.length, baselineSourcePins: manifest.current_sources.length, productReplacements: ports[product].length, legacyTransportSelectorPorts: ports[harness].length, unchangedLegacyAssertionCalls: after.assertions.length, unchangedLegacyTestInvocations: after.tests.length, frozenNode6Sha256: sha(fs.readFileSync(path.join(root, 'src/components/createProjectImplicitEnter.test.ts'))) }, null, 2));
