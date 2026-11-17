// Parse retained source as inert data. Never execute vendor JavaScript.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname,'../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'source.json'),'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let checks = 0;
function check(value,message) { assert.ok(value,message); checks++; }
function read(file) { return fs.readFileSync(path.join(root,file)); }
const parent = process.argv[2] ? fs.readFileSync(process.argv[2]) : null;
if (parent) {
  check(parent.length === manifest.parent.bytes,'whole parent byte count');
  check(hash(parent) === manifest.parent.sha256,'whole parent hash');
}
const text = {};
for (const record of manifest.records) {
  const bytes = fs.readFileSync(path.join(__dirname,record.path));
  check(bytes.length === record.bytes,`${record.path} byte count`);
  check(hash(bytes) === record.sha256,`${record.path} hash`);
  if (parent) check(bytes.equals(parent.subarray(...record.range)),`${record.path} exact UTF-8 span`);
  const source = ts.createSourceFile(record.path,(record.parsePrefix??'')+bytes.toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  check(source.parseDiagnostics.length === 0,`${record.path} complete parseable declaration/initializer`);
  text[record.path] = bytes.toString();
}
for (const [file,patterns] of Object.entries({
  'Jba.txt': ['[o,a]=$.useState("")','value:o,onValueChange:a','value:z.id,keywords:[z.name],disabled:z.id===m','value:"new-section",keywords:["create","new","section"]','m!==void 0&&p.jsxs($o,{value:"remove-from-section",keywords:["remove","from","section"]','p.jsxs(KV,{loop:!0,filter:wUi','onSelect:E','onSelect:x'],
  'KV.txt': ['p.jsx(P6,{ref:e,className:o,...r})'],
  'P6.txt': ['P6=Object.assign(Xyi','Item:M5s','Group:j5s','Separator:F5s','Input:B5s'],
  'Xyi.txt': ['de.filter)!=null?ue:L5s','pe(ce,n.current.search,ae)','keywords:de','ve=B(he,ge)','ve>0&&pe++','be=Math.max(ge,be)','ae.sort((ue,pe)=>pe[1]-ue[1])','ce.get(ve))!=null?be:0)-','n.current.filtered.groups.add(be)','K().sort','querySelectorAll(_Bn)'],
  'selectors.txt': ['_Bn=`${qyi}:not([aria-disabled="true"])`'],
  'M5s.txt': ['Zyi(r,o,[t.value,t.children,o],t.keywords)','D.search?D.filtered.items.get(r)>0:!0','if(!_)return null','t.disabled','onClick:w?void 0:v'],
  'j5s.txt': ['_.search?_.filtered.groups.has(a):!0','Qyi.Provider'],
  'Zyi.txt': ['return h.trim()','u=i.map(d=>d.trim())','o.value(t,c,u)'],
  'ff.txt': ['p.jsx(P6.Group,{ref:e,className:o,...r})'],
  'item-wrapper.txt': ['p.jsx(P6.Item,{ref:e,className:o,...r})'],
  'exi.txt': ['p.jsx(P6.Separator,{ref:e,className:o,...r})'],
  'F5s.txt': ['o=QH(a=>!a.search)','return!n&&!o?null:'],
  'filter.txt': ['const Hba=.2','iRi({value:t,search:e,keywords:n})','return i>Hba?i:0'],
  'scorer.txt': ['function hRt(','function _qn(','function pSo(','function iRi(','`${t} ${n.join(" ")}`','return pSo(t,e,n)'],
})) for(const pattern of patterns) check(text[file].includes(pattern),`${file} join ${pattern}`);
check(hash(read(manifest.fixture.path))===manifest.fixture.sha256,'unchanged frozen17');
const baseline = zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'MoveToSection-before.tsx.gz')));
check(hash(baseline)===manifest.baselinePins['src/palette/MoveToSection.tsx'],'exact baseline production');
const loaderChanges = fs.existsSync(path.join(__dirname,'loader-changes.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname,'loader-changes.json'),'utf8')) : {};
const integration = JSON.parse(fs.readFileSync(path.join(__dirname,'integration.json'),'utf8'));
function testAndAssertionAst(file,source) {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const printer=ts.createPrinter();
  const calls=[];
  function visit(node) {
    if(ts.isCallExpression(node)) {
      const expression=node.expression.getText(ast);
      if(expression==='test'||expression.startsWith('assert.')) calls.push(printer.printNode(ts.EmitHint.Unspecified,node,ast));
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  return calls;
}
for (const [file,originalPin] of Object.entries({...manifest.baselinePins,...integration.loaderPins})) {
  if (file==='src/palette/MoveToSection.tsx') continue;
  let pin=originalPin;
  const upstream=integration.protectedUpstream[file];
  if (upstream) {
    const original=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,upstream.originalArchive)));
    check(hash(original)===originalPin,`${file} original pre-integration identity retained`);
    pin=upstream.sha256;
  }
  let bytes=read(file);
  if(loaderChanges[file]) {
    const original=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'loader-before',path.basename(file)+'.gz')));
    check(hash(original)===pin,`${file} archived original identity`);
    const beforeCalls=testAndAssertionAst(file,original.toString());
    const afterCalls=testAndAssertionAst(file,bytes.toString());
    check(beforeCalls.length===afterCalls.length,`${file} test/assertion AST count unchanged`);
    check(JSON.stringify(beforeCalls)===JSON.stringify(afterCalls),`${file} test/assertion AST unchanged`);
    let source=bytes.toString();
    for(const addition of loaderChanges[file]) {
      check(source.split(addition).length===2,`${file} unique loader-only addition`);
      source=source.replace(addition,'');
    }
    bytes=Buffer.from(source);
  }
  check(hash(bytes)===pin,`${file} unchanged after removing documented loader additions`);
}
const ranking=fs.readFileSync(path.join(__dirname,'ranking-controls.test.cjs'));
check(hash(ranking)==='1c750d60b60adfece14604e83ae25e915cb58625a1f0195d4456adc142bc77ba','unchanged supplemental ranking3');
const deliveryPath=path.join(__dirname,'delivery.json');
if(fs.existsSync(deliveryPath)) {
  const delivery=JSON.parse(fs.readFileSync(deliveryPath,'utf8'));
  check(hash(read('src/palette/MoveToSection.tsx'))===delivery.productionAfterSha256,'exact product identity');
}
const red=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'red.tap.gz'))).toString();
check((red.match(/code: 'ERR_ASSERTION'/g)||[]).length===10,'ten intended baseline assertion failures');
for(const summary of ['# tests 17','# pass 7','# fail 10','# skipped 0','# cancelled 0']) check(red.includes(summary),summary);
for(const manifestPath of ['log-identities.json','integration/log-identities.json']) {
  const logsPath=path.join(__dirname,manifestPath);
  if(fs.existsSync(logsPath)) for(const [file,identity] of Object.entries(JSON.parse(fs.readFileSync(logsPath,'utf8')))) {
    const compressed=fs.readFileSync(path.join(__dirname,file));
    const raw=zlib.gunzipSync(compressed);
    check(hash(compressed)===identity.compressedSha256,`${file} compressed identity`);
    check(hash(raw)===identity.rawSha256&&raw.length===identity.rawBytes,`${file} lossless log identity`);
  }
}
console.log(`PASS ${checks} source/AST/join/freeze/preservation checks; whole-parent verification ${parent?'PASS':'NOT_RUN'}`);
