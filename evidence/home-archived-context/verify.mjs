import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
const dir='evidence/home-archived-context';
if (!process.argv[2] || !process.argv[3]) throw new Error('usage: node verify.mjs <retained-index> <retained-renderer>');
const index=fs.readFileSync(process.argv[2]);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(index.length!==3493297||hash(index)!=='b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3') throw new Error('parent identity');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
let checks=1;
for(const span of manifest){
 const raw=fs.readFileSync(`${dir}/${span.file}`);const[a,z]=span.utf8_span;
 if(z-a!==span.bytes||raw.length!==span.bytes||hash(raw)!==span.sha256||!raw.equals(index.subarray(a,z))) throw new Error(span.name);
 checks++;
}
const renderer=fs.readFileSync(process.argv[3]);
if(renderer.length!==11600457||hash(renderer)!=='5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde') throw new Error('renderer identity');
checks++;
const reference=JSON.parse(fs.readFileSync('evidence/home-context-menu/reference.json'));
const contract=['_Jo','EJo','D9e','Aao'];
for(const symbol of contract){const s=reference.spans.find(s=>s.symbol===symbol);const[a,z]=s.utf8_span;const raw=renderer.subarray(a,z);if(hash(raw)!==s.sha256||!raw.equals(Buffer.from(s.source_text)))throw new Error(symbol);checks++;}
const prior=`${dir}/permission-status`;
const priorManifest=JSON.parse(fs.readFileSync(`${prior}/manifest.json`));
for(const s of priorManifest.index_spans){const[a,z]=s.utf8_span;const raw=fs.readFileSync(`${prior}/${s.file}`);if(!raw.equals(index.subarray(a,z))||hash(raw)!==s.sha256) throw new Error(`prior ${s.name}`);checks++;}
const bindings={Ms:'aJ',N6:'fh',BYe:'hG',SDt:'hH',wDt:'hF'};
const source=index.toString();const ast=ts.createSourceFile('index.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(ast.parseDiagnostics.length)throw new Error('index syntax');
for(const [local,exported] of Object.entries(bindings)){
 const needle=Buffer.from(`${exported} as ${local}`);
 if(renderer.indexOf(needle)===-1) throw new Error(`import ${local}`);
 const decl=ast.statements.filter(ts.isExportDeclaration).flatMap(s=>s.exportClause&&ts.isNamedExports(s.exportClause)?s.exportClause.elements:[]).find(e=>e.name.text===exported);
 if(!decl) throw new Error(`export ${exported}`);
 checks++;
}
const fixtures={
 'src/components/homeArchivedContextMenu.test.ts':'828088deea49b09aee131f138cb4436fc7fbc788c7d1351c8342151a8225557a',
 'src/components/homeContextMenu.test.ts':'000a0ac3eefce9da250cb31dcc535bd6965c192fd0a764b5debb18a42edb3818',
 'src/components/homeContextMenuIntegration.test.ts':'406685142fdf946f9c06182da6e756f16256c187d90dcc0f396242e26e53a7bf',
};
for(const [file,expected] of Object.entries(fixtures)){if(hash(fs.readFileSync(file))!==expected)throw new Error(`fixture drift ${file}`);checks++;}
console.log(JSON.stringify({author:'Conductor Rebuild',checks,full_index_bytes:index.length,full_index_sha256:hash(index),full_renderer_bytes:renderer.length,full_renderer_sha256:hash(renderer),spans:manifest.length,prior_permission_status_spans:priorManifest.index_spans.length,named_import_export_bindings:bindings,vendor_execution:false,behavioral_tests:'NOT_RUN_BY_THIS_SOURCE_COMMAND',provider_population:'NOT_QUALIFIED',native_browser_package:'NOT_RUN'},null,2));
