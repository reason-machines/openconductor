import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const directory = process.argv[2] ?? '.rea-work/dist/assets';
const retained = JSON.parse(gunzipSync(readFileSync('evidence/frontend/rea-analyze-javascript-application.json.gz')));
const inputs = [
  ['renderApp-D_fmY7hW.js', '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde'],
  ['index-BGEQ8YjU.js', 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3'],
];
const files = Object.fromEntries(inputs.map(([name, expected]) => {
  const bytes = readFileSync(path.join(directory, name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, expected, `${name} differs from the retained REA artifact`);
  assert.ok(retained.normalized_result.graph.nodes.some((node) => node.identity?.sha256 === sha256 || node.identity?.artifact_sha256 === sha256), `${name} absent from REA graph`);
  return [name, { sha256, source: bytes.toString('utf8') }];
}));
const renderer = 'renderApp-D_fmY7hW.js';
const index = 'index-BGEQ8YjU.js';
const selections = [
  [renderer, 'custom-section-key', 'const v=Iea(_),x=Cea(n.id);', ',I=rZe()'],
  [renderer, 'pinned-key', 'x={defaultCollapsed:!1},e[9]=x):x=e[9];const[w,E]=aW("navigation-section-pinned",', '),k=kFi()'],
  [renderer, 'main-key', 'h={defaultCollapsed:!1},e[0]=h):h=e[0];const[m,g]=aW("navigation-section-main",', ');let _'],
  [renderer, 'collapse-route', 'const ZFi=IX(vo(),hSe()),gWt=', ';function Oia'],
  [renderer, 'collapse-hook', 'function aW(', 'function tBi'],
  [renderer, 'route-store', 'const DGe=bf()', 'function Gde'],
  [renderer, 'route-hook', 'function Gde(', 'function Ivs'],
  [renderer, 'storage-identities', 'Evs=Jh({routeStates:', ';function Z7t'],
  [index, 'persist-hydration', 'const GM=t=>e=>', ';function jM'],
  [index, 'backend-adapter', 'function i2({subsystem:t,sizeLimit:e})', 'const U8t'],
];
const excerpts = selections.map(([name, role, needle, until]) => {
  const source = files[name].source;
  const offset = source.indexOf(needle);
  assert.ok(offset >= 0, `missing ${role}`);
  const end = source.indexOf(until, offset + needle.length);
  assert.ok(end > offset, `missing end of ${role}`);
  return { role, file: name, utf16Offset: offset, utf8Offset: Buffer.byteLength(source.slice(0, offset)), excerpt: source.slice(offset, end) };
});
console.log(JSON.stringify({
  reaEvidenceId: retained.evidence_id,
  analysis: 'retained-static-artifact; target JavaScript never evaluated',
  artifacts: Object.fromEntries(inputs.map(([name]) => [name, files[name].sha256])),
  excerpts,
  conclusion: 'Custom sections and built-in navigation-section-pinned/main keys use the same serialized routeStates store, loaded and merged during persisted-store initialization.',
  gaps: ['No custom-section or built-in collapse/reload native scenario was exercised.', 'Static control flow does not prove successful backend I/O or hydration ordering on a running app.', 'REA MCP operations unavailable in this Session; reused the retained REA graph and matching decoded artifacts.'],
}, null, 2));
