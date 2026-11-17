#!/usr/bin/env node
// Static parsing and byte comparisons only; no retained JavaScript is evaluated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const zlib = require('node:zlib');
const here = __dirname;
const root = path.resolve(here, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'source.json'), 'utf8'));
const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const parents = Object.fromEntries(['renderer', 'index'].map((name, i) => {
  const raw = fs.readFileSync(process.argv[i + 2]);
  assert.equal(raw.length, manifest.parents[name].bytes);
  assert.equal(hash(raw), manifest.parents[name].sha256);
  return [name, raw];
}));
const records = Object.fromEntries(manifest.records.map((record) => {
  const raw = fs.readFileSync(path.join(here, record.path));
  assert.deepEqual(raw, parents[record.parent].subarray(...record.range), record.path);
  assert.equal(raw.length, record.bytes, record.path);
  assert.equal(hash(raw), record.sha256, record.path);
  return [record.path, raw.toString()];
}));
assert.equal(manifest.records.length, 21);
const joins = {
  'h_a-palette-caller.txt': ['p.jsx(qZ,', 'p.jsx(m_a,'],
  'qZ-dialog.txt': ['p.jsx(Y5s,'],
  'Y5s-content.txt': ['p.jsx(KV,{loop:!0', '...i,children:n', 'I.key==="Escape"'],
  'KV-wrapper.txt': ['p.jsx(P6,{ref:e,className:o,...r})'],
  'P6-alias.txt': ['Object.assign(Xyi', 'Input:B5s'],
  'input-wrapper-kI.txt': ['p.jsx(P6.Input,{ref:e,className:u,...r})'],
  'input-B5s.txt': ['$.createElement(D6.input,{ref:e,...i,', 'role:"combobox"'],
  'm_a.txt': ['p.jsx(kI,{placeholder:F6,value:c,onValueChange:u,', 'oi("commandPalette.nextTab",w5,Pei)', 'oi("commandPalette.previousTab",S5,Pei)'],
  'Xyi-root.txt': ['E.onKeyDown', 'ce.defaultPrevented||de', 'ce.nativeEvent.isComposing||ce.keyCode===229', 'case"ArrowDown":{Z(ce);break}', 'case"ArrowUp":{se(ce);break}', 'case"Home":{ce.preventDefault(),X(0);break}', 'case"End":{ce.preventDefault(),te();break}', 'ce.metaKey?te():ce.altKey?J(1):Q(1)', 'ce.metaKey?X(0):ce.altKey?J(-1):Q(-1)'],
  'registration-oi.txt': ['for(const x of ZOt(t,{overrides:o}))g(x,v,t)', 'enableOnDialogIds:[a]', 'const v={...h,..._.when,...n}'],
  'section-Jba.txt': ['z.key==="Backspace"&&o===""', 'z.key==="Escape"', 'p.jsx(kI,{placeholder:"Search sections…",value:o,onValueChange:a,onKeyDown:O,', 'p.jsxs(KV,{loop:!0,filter:wUi,onKeyDown:I,', 'disabled:z.id===m'],
  'capture-dispatch.txt': ['P0i({event:u,phase:"keydown"})||hNn(u)||e(u)', 'window.addEventListener("keydown",r,!0)', 't.preventDefault(),t.stopImmediatePropagation()', 'GOt(_.shortcut,n)&&qOt(_.shortcut,n)', 'g.length===0)return!1', 'n.preventDefault(),n.stopImmediatePropagation()'],
  'renderer-import-bZ.txt': ['bZ as GOt'], 'renderer-import-b_.txt': ['b_ as qOt'],
  'index-export-Hfe.txt': ['Hfe as bZ'], 'index-export-_Ut.txt': ['_Ut as b_'],
  'shortcut-matchers.txt': ['const Hfe=(t,e)=>', 'function _Ut(t,e){return Eg.every', 'case"shift":return e.shiftKey', '[...n].length===1'],
};
for (const [name, tokens] of Object.entries(joins)) for (const token of tokens) assert.ok(records[name].includes(token), `${name}: ${token}`);
for (const name of ['m_a.txt', 'input-wrapper-kI.txt', 'input-B5s.txt']) assert.ok(!records[name].includes('onKeyDown'), `${name} has no replacing key handler`);
assert.ok(!records['Xyi-root.txt'].includes('shiftKey'), 'complete root leaves Shift unfiltered');
// Parse the whole retained default registry into an AST, never execute it.
const parse = (text) => ts.createSourceFile('retained.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const modifiers = new Map();
const constTree = parse(records['modifier-constants.txt'] + ';');
function walk(node, visitor) { visitor(node); ts.forEachChild(node, (child) => walk(child, visitor)); }
walk(constTree, (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ts.isArrayLiteralExpression(node.initializer)) modifiers.set(node.name.text, node.initializer.elements.map((entry) => { assert.ok(ts.isStringLiteral(entry)); return entry.text; }));
});
const registry = parse('const ' + records['default-registry.txt'] + ';');
const declaration = registry.statements[0].declarationList.declarations[0];
assert.equal(declaration.initializer.properties.length, 165);
const candidates = [];
walk(registry, (node) => {
  if (!ts.isCallExpression(node) || !['he', 'pn'].includes(node.expression.getText(registry))) return;
  const arg = node.arguments[0]; assert.ok(ts.isObjectLiteralExpression(arg));
  const props = Object.fromEntries(arg.properties.map((prop) => [prop.name.text, prop.initializer]));
  const key = props.key ?? props.code; assert.ok(ts.isStringLiteral(key));
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key.text)) return;
  const mods = props.modifiers ? modifiers.get(props.modifiers.text) : [];
  assert.ok(mods, 'candidate modifiers must resolve statically');
  candidates.push({ key: key.text, modifiers: mods });
});
assert.equal(candidates.length, 5);
assert.ok(candidates.every((entry) => entry.modifiers.join(',') !== 'shift'), 'no default shifted-navigation shortcut preempts root');
const logIdentities = JSON.parse(fs.readFileSync(path.join(here, 'log-identities.json'), 'utf8'));
for (const [name, pin] of Object.entries(logIdentities)) {
  const packed = fs.readFileSync(path.join(here, name)); const raw = zlib.gunzipSync(packed);
  assert.equal(hash(packed), pin.gzipSha256, name); assert.equal(hash(raw), pin.rawSha256, name); assert.equal(raw.length, pin.rawBytes, name);
}
assert.equal(hash(fs.readFileSync(path.join(root, manifest.fixture.path))), manifest.fixture.sha256);
const migration = JSON.parse(fs.readFileSync(path.join(here, 'test-migration.json'), 'utf8'));
const oldFixture = zlib.gunzipSync(fs.readFileSync(path.join(here, migration.beforeArchive)));
const currentFixture = fs.readFileSync(path.join(root, migration.path));
assert.equal(hash(oldFixture), migration.beforeSha256);
assert.equal(hash(oldFixture), manifest.protectedFixtures[migration.path]);
assert.equal(hash(currentFixture), migration.afterSha256);
assert.equal(oldFixture.toString().split(migration.oldText).length, 2);
assert.equal(oldFixture.toString().replace(migration.oldText, migration.newText), currentFixture.toString(), 'only approved expectation migration');
for (const [file, expected] of Object.entries(manifest.protectedFixtures)) {
  if (file === migration.path) continue; // Checked exactly above, including its archived old bytes.
  assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, file);
}
if (process.argv.includes('--baseline')) for (const [file, expected] of Object.entries(manifest.protectedProduction)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, file);
const readArchive = (name) => zlib.gunzipSync(fs.readFileSync(path.join(here, name))).toString();
const red = readArchive('red.tap.gz');
for (const [key, count] of Object.entries({ tests: 31, pass: 11, fail: 20, skipped: 0 })) assert.match(red, new RegExp(`^# ${key} ${count}$`, 'm'));
assert.equal((red.match(/code: 'ERR_ASSERTION'/g) || []).length, 20);
assert.ok(!red.includes('TypeError') && !red.includes('ERR_MODULE_NOT_FOUND'));
assert.equal(hash(fs.readFileSync(path.join(root, manifest.sectionFixture.path))), manifest.sectionFixture.sha256);
const sectionRed = readArchive('section-red.tap.gz');
for (const [key, count] of Object.entries({ tests: 12, pass: 4, fail: 8, skipped: 0 })) assert.match(sectionRed, new RegExp(`^# ${key} ${count}$`, 'm'));
assert.equal((sectionRed.match(/code: 'ERR_ASSERTION'/g) || []).length, 8);
assert.ok(!sectionRed.includes('TypeError') && !sectionRed.includes('ERR_MODULE_NOT_FOUND'));
const delivery = JSON.parse(fs.readFileSync(path.join(here, 'delivery.json'), 'utf8'));
const before = zlib.gunzipSync(fs.readFileSync(path.join(here, delivery.production.beforeArchive)));
const current = fs.readFileSync(path.join(root, delivery.production.path));
assert.equal(hash(before), manifest.protectedProduction[delivery.production.path]);
assert.equal(hash(before), delivery.production.beforeSha256); assert.equal(hash(current), delivery.production.afterSha256);
const oldNavigation = '      // Keep existing explicit bindings ahead of the new Option-arrow fallback.\n';
const newNavigation = '      // Explicit bindings take priority over cmdk\'s built-in navigation.\n' +
  '      if (plain && e.shiftKey) {\n' +
  '        if (e.key === "ArrowDown") return "next-item";\n' +
  '        if (e.key === "ArrowUp") return "prev-item";\n' +
  '        if (e.key === "Home") return "first-item";\n' +
  '        if (e.key === "End") return "last-item";\n' +
  '      }\n';
assert.equal(before.toString().replace(oldNavigation, newNavigation), current.toString(), 'only approved resolver fallback');
for (const [file, expected] of Object.entries(delivery.unchangedProduction)) {
  assert.equal(expected, manifest.protectedProduction[file]); assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, file);
}
for (const [name, counts] of [['fresh-main-red.tap.gz', { tests: 43, pass: 15, fail: 28 }], ['green.tap.gz', { tests: 43, pass: 43, fail: 0 }], ['final-affected.tap.gz', { tests: 521, pass: 521, fail: 0 }], ['old-harness-baseline.tap.gz', { tests: 23, pass: 16, fail: 7 }]]) {
  const text = readArchive(name);
  for (const [key, count] of Object.entries({ ...counts, skipped: 0 })) assert.match(text, new RegExp(`^# ${key} ${count}$`, 'm'), name);
}
assert.equal((readArchive('old-harness-baseline.tap.gz').match(/name: 'ReferenceError'/g) || []).length, 7);
assert.ok(readArchive('final-typecheck.log.gz').includes('tsc --noEmit'));
const build = readArchive('final-build.log.gz'); assert.ok(build.includes('check:branding') && build.includes('tsc --noEmit') && build.includes('built in'));
console.log('PASS: complete retained parents, 21 records and regular/section/capture/override closure; static165 registry; frozen31+12 unchanged; 41 other fixtures unchanged + exact archived assertion migration; fresh RED15/28 → GREEN43/43, affected521/521, typecheck/build; separate old optional7 ReferenceErrors retained');
