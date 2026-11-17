const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve, join } = require('node:path');
const ts = require('typescript');
const { gunzipSync } = require('node:zlib');
const root = __dirname;
const repo = resolve(root, '../../..');
const manifest = JSON.parse(readFileSync(join(root, 'source.json'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
for (const record of manifest.records) {
  const bytes = readFileSync(join(root, record.path));
  check(bytes.length === record.bytes && sha(bytes) === record.sha256, record.path);
}
if (process.argv[2]) {
  const parent = readFileSync(process.argv[2]);
  check(parent.length === manifest.parent.bytes && sha(parent) === manifest.parent.sha256, 'retained parent identity');
  for (const record of manifest.records) {
    check(parent.subarray(...record.range).equals(readFileSync(join(root, record.path))), `raw range ${record.path}`);
  }
}
function declaration(name, file) {
  const text = readFileSync(join(root, file), 'utf8');
  const ast = ts.createSourceFile(file + '.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  check(ast.parseDiagnostics.length === 0, `${name}: valid complete syntax, never evaluated`);
  check(ast.statements.length === 1 && ts.isFunctionDeclaration(ast.statements[0]) && ast.statements[0].name.text === name && ast.statements[0].end === text.length, `${name}: exactly one complete declaration`);
  return text;
}
const main = declaration('m_a', 'm_a.txt');
const section = declaration('Jba', 'section-Jba.txt');
check(main.includes('[c,u]=$.useState("")') && main.includes('[d,h]=$.useState(r?.initialSectionWorkspaceId)'), 'regular query c/u and section target d/h are separate parent hooks');
check(main.includes('if(Gn==="move-to-section"&&Hn){h(jn);return}'), 'entering section picker writes only target, not the regular query');
check(main.includes('y5=()=>{h(void 0)}') && main.includes('const x5=y5'), 'back clears only section target');
check(main.includes('p.jsx(Jba,{localWorkspaceId:d,sectionKey:hn,onBack:x5})'), 'conditional section child gets target and back callback, not parent query');
check(main.includes('p.jsx(kI,{placeholder:F6,value:c,onValueChange:u,'), 'regular input remains controlled by retained parent c/u');
check(section.includes('[o,a]=$.useState("")') && section.includes('p.jsx(kI,{placeholder:"Search sections…",value:o,onValueChange:a,'), 'section child owns independent blank query and setter');
check(section.includes('z.key==="Backspace"&&o===""&&(z.preventDefault(),z.stopPropagation(),r())'), 'empty Backspace returns through unchanged back callback');
check(section.includes('z.key==="Escape"&&(z.preventDefault(),z.stopPropagation(),r())'), 'Escape returns through same back callback');
check(section.includes('"aria-label":"Back to commands",onClick:r'), 'back button returns through same back callback');
check(section.includes('query:o,text:z.name'), 'only independent section query highlights section rows');
check(sha(readFileSync(join(repo, manifest.frozenFixture.fixture))) === manifest.frozenFixture.fixture_sha256, 'final fixture remains byte-identical');
for (const [path, hash] of Object.entries(manifest.protected)) {
  check(sha(readFileSync(join(repo, path))) === hash, `unchanged existing fixture or adjacent production ${path}`);
}
const before = gunzipSync(readFileSync(join(root, 'command-palette-before.ts.gz')));
check(sha(before) === manifest.production.baseline_sha256, 'lossless baseline production');
const after = readFileSync(join(repo, manifest.production.path));
check(sha(after) === manifest.production.treatment_sha256, 'tested treatment production identity');
const expected = before.toString('utf8')
  .replace('  const [query, setQuery] = useState("");', '  const [commandQuery, setCommandQuery] = useState("");\n  const [sectionQuery, setSectionQuery] = useState("");')
  .replace('    moveToSection !== undefined;\n  const sectionFlatItems', '    moveToSection !== undefined;\n  // The section picker has its own search lifetime; Back restores commands.\n  const query = inSectionMode ? sectionQuery : commandQuery;\n  const setQuery = inSectionMode ? setSectionQuery : setCommandQuery;\n  const sectionFlatItems')
  .replace('    if (item.kind === "action" && item.action.id === "move-to-section") {\n      setQuery("");', '    if (item.kind === "action" && item.action.id === "move-to-section") {\n      setSectionQuery("");');
check(after.toString('utf8') === expected, 'only the three scoped query-lifetime edits occurred');
for (const log of JSON.parse(readFileSync(join(root, 'log-identities.json'), 'utf8'))) {
  const compressed = readFileSync(join(root, log.compressed));
  const raw = gunzipSync(compressed);
  check(compressed.length === log.compressedBytes && sha(compressed) === log.compressedSha256, `compressed log ${log.compressed}`);
  check(raw.length === log.bytes && sha(raw) === log.sha256, `raw log ${log.raw}`);
}
console.log(JSON.stringify({ result: 'PASS', checks, retainedSpans: manifest.records.length, protectedPins: Object.keys(manifest.protected).length, fixture: manifest.frozenFixture.fixture_sha256, browser_native_package: 'NOT_RUN' }));
