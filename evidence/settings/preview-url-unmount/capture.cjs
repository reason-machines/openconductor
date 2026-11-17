// Retained REA asset inspection only. Original JavaScript is never evaluated.
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const crypto = require('node:crypto');
const path = require('node:path');
const out = __dirname;
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const inputs = {
  renderer: ['.oc-tmp/settings-loader-reference/renderApp-D_fmY7hW.js', 11600457, '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde'],
  index: ['.oc-tmp/settings-coverage-current/index-BGEQ8YjU.js', 3493297, 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3'],
};
const assets = {}, strings = {}, spans = [];
for (const [key, [file, bytes, sha256]] of Object.entries(inputs)) {
  const b = fs.readFileSync(file);
  if (b.length !== bytes || hash(b) !== sha256) throw Error(`Asset mismatch: ${key}`);
  assets[key] = { path: file, bytes, sha256 };
  strings[key] = b.toString('utf8');
}
function add(asset, label, start, end) {
  const s = strings[asset], text = s.slice(start, end), b = Buffer.from(text);
  const begin = Buffer.byteLength(s.slice(0, start));
  spans.push({ asset, label, utf8_half_open: [begin, begin + b.length], bytes: b.length, sha256: hash(b), text });
}
function statement(asset, label, marker, name) {
  const s = strings[asset], at = s.indexOf(marker);
  if (at < 0 || s.indexOf(marker, at + 1) >= 0) throw Error(`Nonunique marker ${marker}`);
  // Parse only a bounded suffix as syntax, never execute it or parse the whole application.
  const sf = ts.createSourceFile(label + '.js', s.slice(at, at + 32768), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let n = sf.statements[0];
  if (name) {
    if (!ts.isVariableStatement(n)) throw Error('Expected variable declaration');
    n = n.declarationList.declarations.find(d => d.name.getText(sf) === name);
  }
  if (!n) throw Error(`Missing declaration ${label}`);
  const text = n.getText(sf);
  const check = ts.createSourceFile('check.js', name ? 'const ' + text + ';' : text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (check.parseDiagnostics.length) throw Error(`Incomplete declaration ${label}`);
  add(asset, label, at + n.getStart(sf), at + n.end);
}
for (const name of ['X3a', 'ezt', 'xJs', 'wJs', 'aD', 'mos']) statement('renderer', name, 'function ' + name + '(');
statement('renderer', 'Sba', 'const Sba=', 'Sba');
statement('renderer', '_Js', 'const _Js=', '_Js');
statement('renderer', 'vJs', 'const _Js=', 'vJs');
statement('renderer', 'pos', 'const hos=[1,2,3],pos=', 'pos');
statement('renderer', 'kos', 'var kos=class', 'kos');
for (const name of ['dzt', '$Be', 'sLe', 'ZJ', 'nLe', 'rLe', 'iLe', 'oLe', 'lLe', 'BLe']) statement('index', name, 'function ' + name + '(');
statement('index', 'G6t', 'async function G6t(');
for (const [local, imported] of [['PYe', 'gQ'], ['p8r', 'sf']]) {
  const marker = imported + ' as ' + local;
  const at = strings.renderer.indexOf(marker);
  if (at < 0) throw Error(marker);
  add('renderer', 'import:' + local, at, at + marker.length);
}
const exportAt = strings.index.lastIndexOf('export{');
if (exportAt < 0) throw Error('No index exports');
const exportEnd = strings.index.indexOf('};', exportAt) + 2;
if (exportEnd <= exportAt) throw Error('Incomplete exports');
add('index', 'export:complete', exportAt, exportEnd);
const snapshots = {};
const owners = [
  'src/settings/rows/RepoMiscRows.tsx', 'src/settings/repoMisc.ts', 'src/settings/repoMisc.test.ts',
  'src/settings/RepoSettingsPage.tsx', 'src/settings/useRepoSettings.ts', 'src/settings/repoSettings.ts',
  'src/lib/persistence/producer.ts', 'src/lib/persistence/owner.ts', 'src/lib/persistence/restartPersistence.ts',
  'crates/scripts/src/config/effective.rs',
  'src/settings/rows/PromptRows.tsx', 'src/settings/rows/rowModel.ts', 'src/settings/rows/rowModel.test.ts',
  'src/settings/actionResetOverride.test.ts', 'crates/scripts/src/config/effective_tests.rs',
];
for (const file of owners) {
  const b = fs.readFileSync(file);
  const main = cp.execFileSync('git', ['show', 'origin/main:' + file], { maxBuffer: 4 * 1024 * 1024 });
  if (!b.equals(main)) throw Error('Current owner differs from inspected main: ' + file);
  snapshots[file] = { bytes: b.length, sha256: hash(b), main_blob: cp.execFileSync('git', ['rev-parse', 'origin/main:' + file], { encoding: 'utf8' }).trim() };
  const dest = path.join(out, 'snapshots', file);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, b);
}
const packet = {
  author: 'Conductor Rebuild', qualifier: 'PREVIEW-URLS-ROW-49', source: 'Retained real-app REA assets; no new acquisition',
  main: cp.execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim(), assets, spans, snapshots,
  source_difference: 'Original aD defaults to cancel on unmount; current useDebounced passes flushOnUnmount=true, introduced by #1188. No fully resolved normal provider/default context or mounted transition is claimed here. Do not label a parity defect from this packet alone.',
  not_run: ['original JavaScript execution', 'mounted React/app/browser runtime', 'Cargo/typecheck/build', 'native/REA acquisition', 'filesystem persistence transport', 'provider/package/installation'],
};
fs.writeFileSync(path.join(out, 'reference.json'), JSON.stringify(packet, null, 2) + '\n');
console.log(JSON.stringify({ main: packet.main, assets: Object.keys(assets).length, complete_spans: spans.length, current_main_snapshots: owners.length, original_executed: false }, null, 2));
