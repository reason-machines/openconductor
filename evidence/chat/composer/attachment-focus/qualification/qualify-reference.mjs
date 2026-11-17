import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const dir='.qa/composer-refill-1514';
const parentPath='.qa/create-suggestions-135/retained/renderApp-D_fmY7hW.js';
const bytes=fs.readFileSync(parentPath),source=bytes.toString('utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes),'5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde');
fs.mkdirSync(path.join(dir,'reference'),{recursive:true});
const spans=[];
function save(name,text,start,kind){
  const utf8Start=Buffer.byteLength(source.slice(0,start));
  assert.equal(bytes.subarray(utf8Start,utf8Start+Buffer.byteLength(text)).toString('utf8'),text);
  const file=`reference/renderer-${name}.txt`;
  fs.writeFileSync(path.join(dir,file),text);
  spans.push({name,file,kind,utf16:[start,start+text.length],utf8:[utf8Start,utf8Start+Buffer.byteLength(text)],sha256:hash(text),bytes:Buffer.byteLength(text),completeSyntax:true});
}
for(const name of ['PNi','IIr','SIr','a7i','lHt','n4o']){
  const marker=`function ${name}(`;let start=source.indexOf(marker);
  assert.ok(start>=0,name);assert.equal(source.indexOf(marker,start+marker.length),-1);
  if(source.slice(start-6,start)==='async ')start-=6;
  const window=source.slice(start,start+250000);
  const ast=ts.createSourceFile(name+'.js',window,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),node=ast.statements[0];
  assert.ok(ts.isFunctionDeclaration(node)&&node.name.text===name);
  assert.equal(ast.parseDiagnostics.filter(d=>d.start<node.end).length,0);
  save(name,window.slice(0,node.end),start,'function');
}
for(const [name,marker,kind]of [['ITo','ITo=$.memo(function(','expression'],['t4o','t4o=class ','class-expression'],['Yoi','Yoi=SIr(','expression']]){
  const start=source.indexOf(marker);assert.ok(start>=0);
  const window=source.slice(start,start+250000),ast=ts.createSourceFile(name+'.js','const '+window,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const node=ast.statements[0].declarationList.declarations[0];assert.equal(node.name.text,name);
  assert.equal(ast.parseDiagnostics.filter(d=>d.start<node.end).length,0);
  if(kind==='class-expression')assert.ok(ts.isClassExpression(node.initializer));
  save(name,window.slice(0,node.end-6),start,kind);
}
const get=n=>fs.readFileSync(path.join(dir,`reference/renderer-${n}.txt`),'utf8');
const ours=fs.readFileSync(path.join(dir,'src/components/WorkspaceView.tsx'),'utf8');
const composer=fs.readFileSync(path.join(dir,'src/features/chat/Composer.tsx'),'utf8');
const session=fs.readFileSync(path.join(dir,'src/features/chat/composerSession.ts'),'utf8');
const bindings={
 originalHasCapturedEditorState:get('ITo').includes('[B,F]=$.useState(null)'),
 originalEditorReadyToState:get('ITo').includes('E5=$.useCallback(ln=>{F(ln)},[])')&&get('ITo').includes('onEditorReady:E5'),
 originalLiveFocusGate:get('ITo').includes('de=$.useCallback(()=>{B?.isDestroyed||B?.commands.focus()},[B])'),
 originalPickerToMutationToFocus:get('ITo').includes('W9=async()=>{if(c==="all")return;const ln=await PNi();ln.length!==0&&(await n0(ln),de())}'),
 originalButtonUsesActualPicker:get('ITo').includes('onAddAttachment:()=>W9().fireAndForget()'),
 originalShortcutUsesSamePicker:get('ITo').includes('oi("chat.addAttachment",()=>{W9().fireAndForget()})'),
 originalMutationHookBound:get('ITo').includes('wd=IIr(')&&get('ITo').includes('{mutateAsync:n0}=wd'),
 originalPickerMultipleAndEmpty:get('PNi').includes('await t.pickFiles({multiple:!0})')&&get('PNi').includes('??[]'),
 originalMutationConvertsInput:get('IIr').includes('await RPt(u)')&&get('IIr').includes('IPt({inputs:d,agentType:o})'),
 originalLocalMutationDoesNotAwaitProcessing:get('IIr').includes('return Yoi({localWorkspaceId:r,sessionId:i,filesToWrite:m,onAttachmentPathsReserved:a,onAttachmentPathsFailed:c}),Promise.resolve()'),
 originalManagedEditor:get('lHt').includes('ue=n4o(')&&get('lHt').includes('ue&&g(ue)'),
 originalLifetimeCleanup:get('n4o').includes('$.useEffect(i.onRender(e))')&&get('t4o').includes('this.isComponentMounted=!1,this.scheduleDestroy()')&&get('t4o').includes('!n.isDestroyed&&(n.destroy()'),
 actualOnAttachBinding:ours.includes('onAttachFiles={(files) => void attachFiles(files)}'),
 actualComposerRejectsEmptyInput:composer.includes('if (!onAttachFiles || files.length === 0) return false;')&&composer.includes('onAttachFiles(files);'),
 actualParentAwait:ours.includes('async function attachFiles(files: File[]) {\n    await session.attach(files,'),
 actualSessionPreservesReadError:session.includes('Failed to attach ${file.name}:')&&session.includes('} finally {\n      this.pendingFiles--;'),
 actualEditorDetachesThenDestroys:fs.readFileSync(path.join(dir,'src/features/chat/ComposerEditor.tsx'),'utf8').includes('Object.assign(current.current.inputRef, { current: null });\n      editor.destroy();'),
};
for(const[name,passed]of Object.entries(bindings))assert.equal(passed,true,name);
const fixture='src/features/chat/composerAttachmentFocus.test.ts';
const currentFiles=['src/components/WorkspaceView.tsx','src/features/chat/Composer.tsx','src/features/chat/ComposerEditor.tsx','src/features/chat/composerSession.ts'].map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(dir,file)))}));
const result={candidate:'COMPOSER-ATTACH-FOCUS-135',classification:'SOURCE_QUALIFICATION_ONLY',baseline:'217498aae38dfd63b97919b1a0ab4097462c691e',parent:{path:parentPath,bytes:bytes.length,sha256:hash(bytes)},spans,bindings,currentFiles,fixture:{path:fixture,sha256:hash(fs.readFileSync(path.join(dir,fixture)))},limits:['Actual parent callback extracted without mounting full WorkspaceView','Real ComposerSession with inert local file-read, memory-storage and editor ports','Original local IIr resolves after launching processing, not proof of native staging success or its timing','Error control does not invent native write-error focus policy','No native picker, IPC, real focus, browser, provider or package acceptance','Original vendor code is inert data, never executed']};
fs.writeFileSync(path.join(dir,'qualification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:true,declarations:spans.length,bindings:Object.keys(bindings).length,fixture:result.fixture,baseline:result.baseline},null,2));
