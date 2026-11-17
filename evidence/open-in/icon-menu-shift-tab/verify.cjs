// Conductor Rebuild: retained JavaScript is parsed as inert syntax, never executed.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const ts = require('typescript');
const here = __dirname;
const root = path.resolve(here, '../../..');
const doc = JSON.parse(fs.readFileSync(path.join(here, 'source.json'), 'utf8'));
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const raw = fs.readFileSync(process.argv[2]);
eq(raw.length, doc.asset.bytes, 'whole parent bytes');
eq(hash(raw), doc.asset.sha256, 'whole parent hash');
const ast = ts.createSourceFile('retained.js', raw.toString('utf8'), 99, true, ts.ScriptKind.JS);
eq(ast.parseDiagnostics.length, 0, 'whole parent parses');
const spans = new Map();
for (const item of doc.spans) {
  const bytes = fs.readFileSync(path.join(here, item.path));
  eq(bytes.length, item.bytes, `${item.symbol} length`);
  eq(hash(bytes), item.sha256, `${item.symbol} hash`);
  eq(bytes, raw.subarray(item.start_utf8_byte, item.end_utf8_byte), `${item.symbol} original-parent equality`);
  const parsed = ts.createSourceFile(`${item.symbol}.js`, bytes.toString('utf8'), 99, true, ts.ScriptKind.JS);
  eq(parsed.parseDiagnostics.length, 0, `${item.symbol} complete syntax`);
  spans.set(item.symbol, bytes.toString('utf8'));
}
const joins = [
  ['P9', 'I==="icon"'], ['P9', 'p.jsxs(h2,{onOpenChange:i'], ['P9', 'p.jsx(Tm,{align:"end",children:p.jsx(cFn,'],
  ['h2', 'p.jsx(oF,'], ['oF', 'xe=Oli({popupStore:D'], ['oF', 'ze=SLt(xe,'],
  ['oF', 'enabled:!X,listRef:D.context.itemDomElements'], ['oF', 'ze.floating,je.floating'], ['oF', 'popupProps:Ue'],
  ['Oli', 'treatPopupAsFloatingElement:n=!1'], ['Oli', 'e.useState(n?"popupElement":"positionerElement")'],
  ['SLt', 'virtual:m=!1'], ['SLt', 'U=LVe(B)'], ['SLt', 'G=Op(U)'], ['LVe', 't.querySelector(`[${l8t}]`)||t'],
  ['l8t', '"data-base-ui-focusable"'], ['SLt', 'Ue.key==="Tab"&&Ue.shiftKey&&L&&!m'],
  ['SLt', 'const We=jf(Ue.nativeEvent);if(We&&!oo(G.current,We))return;'],
  ['SLt', 'Z_(Ue),P.setOpen(!1,Ys(Lj,Ue.nativeEvent)),sh(F)&&F.focus();return'],
  ['jf', '"composedPath"in t?t.composedPath()[0]:t.target'], ['oo', 'if(t.contains(e))return!0'],
  ['oo', 'i=i.parentNode||i.host'], ['Cce', 't instanceof ShadowRoot||t instanceof mf(t).ShadowRoot'],
  ['sh', 't instanceof HTMLElement||t instanceof mf(t).HTMLElement'], ['mQe', 'typeof window<"u"'],
  ['mf', 'defaultView)||window'], ['Z_', 't.preventDefault(),t.stopPropagation()'], ['Lj', '"focus-out"'],
  ['Tm', 'p.jsx(m2,'], ['Tm', 'de.key!=="Escape"&&de.target instanceof Node&&!de.currentTarget.contains(de.target)'],
  ['Tm', 'de.preventBaseUIHandler();return'], ['m2', 'v=u.useState("popupProps")'], ['m2', 'props:[v,'],
  ['m2', 'ref:[n,u.context.popupRef,U]'], ['b2', 'positionerElement'],
  ['cFn', 'p.jsxs(Yc,'], ['Yc', 'p.jsx(Pu,'], ['Pu', 'eXe({closeOnClick:d'],
  ['r0i', '_.key===" "&&a?.current&&_.preventDefault()'],
  ['pDr', 'o.baseUIHandlerPrevented||t?.(...n)'], ['BVe', 't.baseUIHandlerPrevented=!0'],
  ['Es', 'mDr(e,n)'], ['mDr', 'gDr(c)'], ['gDr', 'dDr(t)'], ['dDr', 'B6e(e,t[n])'],
  ['r_', 'B6e(o,e)'], ['B6e', 'hDr(t,e)'], ['hDr', 'pDr(t[n],i)'],
];
for (const [name, needle] of joins) ok(spans.get(name)?.includes(needle), `route/guard ${name}: ${needle}`);
const fixture = fs.readFileSync(path.join(root, doc.fixture.path));
eq(hash(fixture), doc.fixture.sha256, 'unchanged frozen17');
const original = fs.readFileSync(path.join(here, 'OpenInButton-before.tsx.txt'));
eq(hash(original), doc.baseline_sha256, 'baseline hash');
eq(original, cp.execFileSync('git', ['show', `${doc.main_checked}:src/features/openIn/OpenInButton.tsx`], { cwd: root }), 'actual fresh-main baseline');
const red = zlib.gunzipSync(fs.readFileSync(path.join(here, 'red.tap.gz'))).toString('utf8');
for (const line of ['# tests 17\n', '# pass 9\n', '# fail 8\n', '# cancelled 0\n', '# skipped 0\n']) ok(red.includes(line), `frozen RED ${line.trim()}`);
eq((red.match(/^not ok /gm) || []).length, 8, 'eight target failures');
eq((red.match(/code: 'ERR_ASSERTION'/g) || []).length, 8, 'only assertion failures');
const adjacent = zlib.gunzipSync(fs.readFileSync(path.join(here, 'adjacent-baseline.tap.gz'))).toString('utf8');
for (const line of ['# tests 107\n', '# pass 107\n', '# fail 0\n', '# cancelled 0\n', '# skipped 0\n']) ok(adjacent.includes(line), `selected adjacent ${line.trim()}`);
const integration = JSON.parse(fs.readFileSync(path.join(here, 'integration.json'), 'utf8'));
eq(original, cp.execFileSync('git', ['show', `${integration.fresh_main}:src/features/openIn/OpenInButton.tsx`], { cwd: root }), 'integration baseline production unchanged');
for (const [file, count] of [['green.tap.gz', 17], ['adjacent-green.tap.gz', 124]]) {
  const log = zlib.gunzipSync(fs.readFileSync(path.join(here, file))).toString('utf8');
  for (const line of [`# tests ${count}\n`, `# pass ${count}\n`, '# fail 0\n', '# cancelled 0\n', '# skipped 0\n']) ok(log.includes(line), `${file}: ${line.trim()}`);
}
const existing = cp.execFileSync('git', ['ls-tree', '-r', '--name-only', doc.main_checked, 'src/features/openIn', 'src/dragRegion.test.ts'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
for (const file of existing) if (file !== 'src/features/openIn/OpenInButton.tsx') {
  eq(fs.readFileSync(path.join(root, file)), cp.execFileSync('git', ['show', `${doc.main_checked}:${file}`], { cwd: root }), `unchanged existing source/test: ${file}`);
}
const product = fs.readFileSync(path.join(root, 'src/features/openIn/OpenInButton.tsx'), 'utf8');
eq(ts.createSourceFile('OpenInButton.tsx', product, 99, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0, 'product treatment parses');
cp.execFileSync('git', ['diff', '--check'], { cwd: root }); checks++;
console.log(JSON.stringify({ status: 'PASS_SOURCE_AND_FROZEN_REGRESSION_INTEGRITY', checks, spans: doc.spans.length, main_checked: doc.main_checked, fixture_sha256: hash(fixture), browser_native_package: 'NOT_RUN' }, null, 2));
