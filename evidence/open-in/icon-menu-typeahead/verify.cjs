// Retained vendor JavaScript is parsed as syntax, never executed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const zlib = require('node:zlib');
const ts = require('typescript');
const here = __dirname;
const root = path.resolve(here, '../../..');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const hash = raw => crypto.createHash('sha256').update(raw).digest('hex');
const doc = JSON.parse(fs.readFileSync(path.join(here,'source.json'),'utf8'));
const raw = fs.readFileSync(process.argv[2]);
eq(raw.length,doc.asset.bytes,'full retained parent size');
eq(hash(raw),doc.asset.sha256,'full retained parent hash');
const source = raw.toString('utf8');
const ast = ts.createSourceFile('retained.js',source,99,true,ts.ScriptKind.JS);
eq(ast.parseDiagnostics.length,0,'retained full parent parses');
const map = new Map();
for(const span of doc.spans) {
 const bytes=fs.readFileSync(path.join(here,span.path));
 eq(bytes.length,span.bytes,'span byte length '+span.symbol);
 eq(hash(bytes),span.sha256,'span hash '+span.symbol);
 eq(bytes,raw.subarray(span.start_utf8_byte,span.end_utf8_byte),'span parent equality '+span.symbol);
 const parsed=ts.createSourceFile(span.symbol+'.js',bytes.toString('utf8'),99,true,ts.ScriptKind.JS);
 eq(parsed.parseDiagnostics.length,0,'complete span syntax '+span.symbol);
 map.set(span.symbol,bytes.toString('utf8'));
}
const joins = [
 ['P9','p.jsxs(h2,'], ['P9','p.jsx(cFn,'], ['h2','p.jsx(oF,'], ['oF','Ze=$li(xe,'],
 ['oF','listRef:D.context.itemLabels'], ['oF','elementsRef:D.context.itemDomElements'],
 ['oF','resetMs:yDr'], ['yDr','yDr=500'], ['oF','U&&it!==te&&D.set("activeIndex",it)'],
 ['oF','Ze.floating,ze.floating,je.floating'], ['oF','popupProps:Ue'], ['Tm','p.jsx(m2,'],
 ['m2','u.useState("popupProps")'], ['m2','props:[v,'], ['Tm','p.jsx(b2,'], ['b2','p.jsx(Sde,'],
 ['b2','labelsRef:I.context.itemLabels'], ['cFn','children:w.name'], ['cFn','p.jsxs(Yc,'],
 ['Yc','p.jsx(Pu,'], ['Yc','label:g'], ['Pu','wD({guess:!0,label:a})'], ['wD','label:n,textRef:r'],
 ['Sde','P.registration.textRef?.current?.textContent??P.element.textContent'],
 ['Sde','P.registration.label!==void 0?P.registration.label'], ['Sde','i$r(u)'],
 ['i$r','i.sort((o,a)=>h0i(o.element,a.element))'], ['h0i','Node.DOCUMENT_POSITION_FOLLOWING'],
 ['$li','R.key.length!==1||R.ctrlKey||R.metaKey||R.altKey'], ['$li','G[Z]?.toLowerCase().startsWith(J)'],
 ['$li','v.current===R.key'], ['$li','G[0]?.toLowerCase()!==G[1]?.toLowerCase()'],
 ['$li','_.start(d,()=>{v.current=""'], ['$li','x.current=w.current'], ['$li','R.relatedTarget'],
 ['$li','oo(D,O)||oo(P,O)||(_.clear(),v.current=""'], ['$li','O(G)'], ['$li','K&&!xQe(K)||K?.matches(":disabled")'],
 ['$li','onKeyDown:E,onBlur:k'], ['Z_','t.preventDefault(),t.stopPropagation()'],
 ['b0','hQe(t.disposeEffect)'], ['bS','setTimeout('], ['bS','clearTimeout('],
 ['SLt','const We=n.current[J.current]'], ['SLt','We&&Ue(We)'], ['SLt','ke()'],
 ['r0i','_.key===" "&&a?.current&&_.preventDefault()'], ['oF','D.context.typingRef.current=it'],
 ['pDr','o.baseUIHandlerPrevented||t?.(...n)'], ['BVe','t.baseUIHandlerPrevented=!0'],
 ['Tm','de.preventBaseUIHandler()'], ['r_','B6e(o,e)'], ['B6e','hDr(t,e)'], ['hDr','pDr(t[n],i)'],
 ['gDr','dDr(t)'], ['mDr','gDr(c)'], ['Es','mDr(e,n)'],
];
for(const [name,needle] of joins) ok(map.get(name)?.includes(needle),'reference join '+name+' '+needle);
const fixture=fs.readFileSync(path.join(root,'src/features/openIn/iconMenuTypeahead.test.ts'));
eq(hash(fixture),'5de8fc5655468b118cd6efda351fa486a27913a694b7ea330dd3b5895129784a','unchanged frozen27');
const original=fs.readFileSync(path.join(here,'OpenInButton-before.tsx.txt'));
eq(original,cp.execFileSync('git',['show',doc.main_checked+':src/features/openIn/OpenInButton.tsx'],{cwd:root}),'pinned actual-main baseline');
const red=zlib.gunzipSync(fs.readFileSync(path.join(here,'red.tap.gz'))).toString('utf8');
ok(red.includes('# tests 27\n')&&red.includes('# pass 13\n')&&red.includes('# fail 14\n'),'frozen RED counts');
eq((red.match(/^not ok /gm)||[]).length,14,'fourteen target failures');
eq((red.match(/code: 'ERR_ASSERTION'/g)||[]).length,14,'fourteen assertion failures, not setup');
ok(red.includes('# cancelled 0\n')&&red.includes('# skipped 0\n'),'no cancelled/skipped baseline');
const integration=JSON.parse(fs.readFileSync(path.join(here,'integration.json'),'utf8'));
eq(original,cp.execFileSync('git',['show',integration.fresh_main+':src/features/openIn/OpenInButton.tsx'],{cwd:root}),'fresh actual-main baseline remains byte-identical');
eq(hash(original),integration.baseline_sha256,'fresh baseline integration hash');
eq(integration.actual_1454_squash,integration.fresh_main,'separate successor based on actual #1454 merge');
const freshRed=zlib.gunzipSync(fs.readFileSync(path.join(here,'fresh-acd-red.tap.gz'))).toString('utf8');
ok(freshRed.includes('# tests 27\n')&&freshRed.includes('# pass 13\n')&&freshRed.includes('# fail 14\n'),'fresh-main frozen RED counts');
eq((freshRed.match(/code: 'ERR_ASSERTION'/g)||[]).length,14,'fresh RED only intended assertion failures');
ok(freshRed.includes('# cancelled 0\n')&&freshRed.includes('# skipped 0\n'),'fresh RED no cancelled/skipped');
for(const [filename,count] of [['green.tap.gz',27],['adjacent.tap.gz',107]]) {
 const log=zlib.gunzipSync(fs.readFileSync(path.join(here,filename))).toString('utf8');
 ok(log.includes('# fail 0\n')&&log.includes('# cancelled 0\n')&&log.includes('# skipped 0\n'),filename+' no failures/cancellations/skips');
 ok(log.includes('# tests '+count+'\n')&&log.includes('# pass '+count+'\n'),filename+' exact test counts');
}
const files=cp.execFileSync('git',['ls-tree','-r','--name-only',integration.fresh_main,'src/features/openIn','src/keybindings'],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const name of files) {
 if(name==='src/features/openIn/OpenInButton.tsx')continue;
 eq(fs.readFileSync(path.join(root,name)),cp.execFileSync('git',['show',integration.fresh_main+':'+name],{cwd:root}),'unchanged existing adjacent source/test '+name);
}
const changed=cp.execFileSync('git',['diff',integration.fresh_main,'--name-only','--','src'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
eq(changed.sort(),['src/features/openIn/OpenInButton.tsx','src/features/openIn/iconMenuTypeahead.test.ts'],'only leased production and frozen new fixture differ');
const treatment=ts.createSourceFile('OpenInButton.tsx',fs.readFileSync(path.join(root,'src/features/openIn/OpenInButton.tsx'),'utf8'),99,true,ts.ScriptKind.TSX);
eq(treatment.parseDiagnostics.length,0,'production treatment syntax');
cp.execFileSync('git',['diff','--check'],{cwd:root}); checks++;
console.log(JSON.stringify({status:'PASS_SOURCE_AND_FIXTURE_INTEGRITY',checks,retained_spans:doc.spans.length,main_checked:doc.main_checked,frozen_sha256:hash(fixture),browser_native_package:'NOT_RUN'},null,2));
