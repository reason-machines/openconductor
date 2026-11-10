import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const directory = process.argv[2] ?? '.rea-work/dist/assets';
const retained = JSON.parse(gunzipSync(readFileSync('evidence/frontend/rea-analyze-javascript-application.json.gz')));
const identities = {
  'renderApp-D_fmY7hW.js': '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde',
  'index-BGEQ8YjU.js': 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3',
};
const files = Object.fromEntries(Object.entries(identities).map(([name, expected]) => {
  const bytes = readFileSync(path.join(directory, name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, expected, `${name}: wrong reference artifact`);
  assert.ok(retained.normalized_result.graph.nodes.some((node) => node.identity?.sha256 === sha256 || node.identity?.artifact_sha256 === sha256), `${name}: absent from retained REA graph`);
  return [name, bytes.toString('utf8')];
}));
const renderer = 'renderApp-D_fmY7hW.js';
const index = 'index-BGEQ8YjU.js';
const aliases = [
  { rendererName: 'QO', exportName: 'aP', indexName: 'cs' },
  { rendererName: 'ZTn', exportName: 'h8', indexName: 'pOe' },
  { rendererName: 'yDt', exportName: 'h7', indexName: 'aVt' },
];
for (const { rendererName, exportName, indexName } of aliases) {
  assert.ok(files[renderer].includes(`${exportName} as ${rendererName}`), `missing renderer import ${rendererName}`);
  const exports = files[index].slice(files[index].lastIndexOf('export{'));
  assert.ok(exports.includes(`${indexName} as ${exportName}`), `missing index export ${exportName}`);
}
const excerpts = [[renderer, 'ACi'], [renderer, 'yoo'], [renderer, 'bro'], [index, 'cs'], [index, 'pOe'], [index, 'aVt'], [index, 'wNt'], [index, 'SNt']].map(([file, name]) => {
  const source = files[file];
  const needle = `function ${name}(`;
  const offset = source.indexOf(needle);
  assert.ok(offset >= 0, `missing ${name}`);
  const next = /(?:async )?function [\w$]+\(/g;
  next.lastIndex = offset + needle.length;
  const end = next.exec(source)?.index;
  assert.ok(end > offset, `missing boundary after ${name}`);
  return { file, name, utf16Offset: offset, utf8Offset: Buffer.byteLength(source.slice(0, offset)), excerpt: source.slice(offset, end) };
});
console.log(JSON.stringify({
  reaEvidenceId: retained.evidence_id,
  analysis: 'retained REA-extracted shipped JavaScript; inert text only, never evaluated',
  artifacts: identities,
  aliases,
  excerpts,
  conclusion: 'ACi renders the static yoo span for an archived local workspace, without branch edit or menu handlers. The non-archived bro header supports inline rename and a Copy/Rename context menu; rename sanitizes the full branch and uses the existing user-initiated branch mutation.',
  gaps: ['No browser or native branch-edit scenario was run.', 'Static control flow does not establish successful Git mutation or native clipboard behavior.', 'No new REA analysis was attempted; the retained REA graph and matching decoded artifacts supply bounded provenance.'],
}, null, 2));
