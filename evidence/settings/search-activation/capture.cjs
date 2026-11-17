// Original source is inert reference data. Never evaluate it.
const fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto'),cp=require('node:child_process');
const dir='.oc-tmp/settings-search-activation';fs.mkdirSync(dir,{recursive:true});
const path='.oc-tmp/settings-loader-reference/renderApp-D_fmY7hW.js',bytes=fs.readFileSync(path),text=bytes.toString();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(bytes.length!==11600457||hash(bytes)!=='5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde')throw Error('renderer identity');
const sf=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),spans=[];
const wanted=['a9a','wGt','I9a','bUi','$9a','gUi','Tet','k1e','M9a','F9a','l9a','pUi','Dba','mSa','gSa','_5','Eki','xUi'];
function span(label,node){const start=node.getStart(sf),s=text.slice(start,node.end),b=Buffer.from(s);spans.push({label,utf8_half_open:[Buffer.byteLength(text.slice(0,start)),Buffer.byteLength(text.slice(0,node.end))],bytes:b.length,sha256:hash(b),text:s});}
for(const n of sf.statements){if(ts.isFunctionDeclaration(n)&&n.name&&wanted.includes(n.name.text))span(n.name.text,n);if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)if(['L9a','BCe','oYe','iCa'].includes(d.name.getText(sf)))span(d.name.getText(sf),d);}
for(const name of [...wanted,'L9a','BCe','oYe','iCa'])if(!spans.some(s=>s.label===name))throw Error('missing '+name);
const main=cp.execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim();
const paths=['src/settings/SettingsView.tsx','src/settings/SettingsSearch.tsx','src/settings/searchIndex.ts','src/settings/pages.ts','src/settings/routes.ts','src/settings/searchRows.generated.ts'];
const production=paths.map(path=>{const b=fs.readFileSync(path),p=cp.execFileSync('git',['show',main+':'+path]);if(!b.equals(p))throw Error('current mismatch '+path);return{path,bytes:b.length,sha256:hash(b),blob:cp.execFileSync('git',['rev-parse',main+':'+path],{encoding:'utf8'}).trim()};});
fs.writeFileSync(dir+'/reference.json',JSON.stringify({author:'Conductor Rebuild',main,asset:{path,bytes:bytes.length,sha256:hash(bytes)},spans,production,contract:'Within a mounted local Settings shell, visiting repo B remembers B. After navigating to a personal page, activating a repo-section search result targets B while it remains selectable; no history or a removed remembered repo falls back to the first selectable repo. Source: L9a -> bUi -> I9a -> a9a -> wGt. Row identity is propagated separately to _5 -> gSa -> mSa -> Eki. No original JS evaluated.'},null,2)+'\n');
console.log(JSON.stringify({main,spans:spans.map(s=>({label:s.label,bytes:s.bytes,sha256:s.sha256})),production:production.length},null,2));
