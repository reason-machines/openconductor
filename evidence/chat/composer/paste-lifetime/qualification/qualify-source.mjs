import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const dir='.qa/composer-refill-1500';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const parentPath='.qa/create-suggestions-135/retained/renderApp-D_fmY7hW.js';
const bytes=fs.readFileSync(parentPath),source=bytes.toString('utf8');
assert.equal(hash(bytes),'5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde');
fs.mkdirSync(path.join(dir,'reference'),{recursive:true});
const spans=[];
function save(name,text,start) {
 const utf8Start=Buffer.byteLength(source.slice(0,start));
 assert.equal(bytes.subarray(utf8Start,utf8Start+Buffer.byteLength(text)).toString('utf8'),text);
 const file=`reference/renderer-${name}.txt`;
 fs.writeFileSync(path.join(dir,file),text);
 spans.push({name,file,utf16:[start,start+text.length],utf8:[utf8Start,utf8Start+Buffer.byteLength(text)],sha256:hash(text),bytes:Buffer.byteLength(text),completeSyntax:true});
}
for(const name of ['DNi','bwo','aRt','vwo','XQ','lHt','n4o']) {
 const marker=`function ${name}(`;let start=source.indexOf(marker);
 assert.ok(start>=0,name);assert.equal(source.indexOf(marker,start+marker.length),-1);
 if(source.slice(start-6,start)==='async ')start-=6;
 const window=source.slice(start,start+250000);
 const ast=ts.createSourceFile(name+'.js',window,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const node=ast.statements[0];assert.ok(ts.isFunctionDeclaration(node)&&node.name.text===name);
 assert.equal(ast.parseDiagnostics.filter(d=>d.start<node.end).length,0);
 save(name,window.slice(0,node.end),start);
}
for(const name of ['t4o']) {
 const marker=`${name}=class `;const start=source.indexOf(marker);assert.ok(start>=0);
 const window=source.slice(start,start+250000),ast=ts.createSourceFile(name+'.js','const '+window,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const node=ast.statements[0].declarationList.declarations[0];assert.ok(ts.isClassExpression(node.initializer));assert.equal(ast.parseDiagnostics.filter(d=>d.start<node.end).length,0);save(name,window.slice(0,node.end-6),start);
}
{
 const start=source.indexOf('ITo=$.memo(function(');assert.ok(start>=0);
 const window=source.slice(start,start+250000),ast=ts.createSourceFile('ITo.js','const '+window,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const node=ast.statements[0].declarationList.declarations[0];assert.equal(ast.parseDiagnostics.filter(d=>d.start<node.end).length,0);save('ITo',window.slice(0,node.end-6),start);
}
const get=n=>fs.readFileSync(path.join(dir,`reference/renderer-${n}.txt`),'utf8');
const bindings={
 composerCapturesEditor:get('ITo').includes('[B,F]=$.useState(null)')&&get('ITo').includes('E5=$.useCallback(ln=>{F(ln)},[])'),
 composerPassesEditorToPaste:get('ITo').includes('DNi({autoConvertLongText:$1,compressPastedDirectories:!fo,editor:B,attachFiles:M6'),
 composerInstallsCapture:get('ITo').includes('onPasteCapture:bi,onKeyDownCapture:yo'),
 composerReadyCallback:get('ITo').includes('onEditorReady:E5'),
 hookCallsAsyncHandler:get('DNi').includes('bwo({event:g,editor:n}).fireAndForget()'),
 shortcutAndRepeatGate:get('bwo').includes('Qh("chat.composer.pasteFilePaths",t.nativeEvent)')&&get('bwo').includes('t.nativeEvent.repeat'),
 delayedProducer:get('bwo').includes('const n=await aRt()??await vwo()'),
 destroyedGuardAtInsertion:get('bwo').includes('e.isDestroyed||XQ({view:e.view,text:n})'),
 textInsertionMutatesSelection:get('XQ').includes('r.replaceSelection(a)')&&get('XQ').includes('t.dispatch('),
 editorReadyRegistration:get('lHt').includes('ue&&g(ue)'),
 editorCreatedByManagedHook:get('lHt').includes('ue=n4o('),
 hookRegistersLifetime:get('n4o').includes('new t4o(n)')&&get('n4o').includes('$.useEffect(i.onRender(e))'),
 ownerCleanupSchedulesDestroy:get('t4o').includes('this.isComponentMounted=!1,this.scheduleDestroy()'),
 scheduledDestroyChecksLifetime:get('t4o').includes('this.isComponentMounted')&&get('t4o').includes('!n.isDestroyed&&(n.destroy()'),
 currentEditorDetachesThenDestroys:fs.readFileSync(path.join(dir,'main/src/features/chat/ComposerEditor.tsx'),'utf8').includes('Object.assign(current.current.inputRef, { current: null });\n      editor.destroy();'),
};
for(const [name,ok]of Object.entries(bindings))assert.equal(ok,true,name);
const baseline='217498aae38dfd63b97919b1a0ab4097462c691e';
const currentFiles=['Composer.tsx','ComposerEditor.tsx','composerPasteFilePaths.ts'].map(name=>({path:'src/features/chat/'+name,sha256:hash(fs.readFileSync(path.join(dir,'main/src/features/chat',name)))}));
const fixture='worktree/src/features/chat/composerPasteLifetime.test.ts';
const out={candidate:'COMPOSER-PASTE-LIFETIME-135',baseline,parent:{path:parentPath,bytes:bytes.length,sha256:hash(bytes)},spans,bindings,currentFiles,fixture:{path:fixture,sha256:hash(fs.readFileSync(path.join(dir,fixture)))},regression:{passed:6,intendedFailures:1,total:7},limits:['Static source closure, no vendor execution','Mounted actual Composer with inert editor and deferred clipboard adapter','No OS clipboard, native shell, provider, package or installed-app acceptance','No assertion about clipboard normalization, native reader implementation or final agent input']};
fs.writeFileSync(path.join(dir,'qualification.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({declarations:spans.length,bindings:Object.keys(bindings).length,baseline,fixture:out.fixture,pass:true},null,2));
