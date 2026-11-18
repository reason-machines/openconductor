import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const dir = '.qa/composer-distinct-135';
const manifest = JSON.parse(fs.readFileSync(path.join(dir,'reference.json'),'utf8'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const parent = fs.readFileSync(manifest.parentPath);
const parentText = parent.toString('utf8');
const checks=[];
function check(name,passed){ checks.push({name,passed:!!passed}); }
check('held original renderer parent identity',sha256(parent)===manifest.parentSha256);
check('six complete source declarations retained',manifest.manifest.length===6);
const sources={};
for(const span of manifest.manifest){
 const bytes=fs.readFileSync(path.join(dir,span.file));
 const text=bytes.toString('utf8'); sources[span.name]=text;
 check(`${span.name} UTF8 exact range`,bytes.equals(parent.subarray(...span.utf8)));
 check(`${span.name} UTF16 exact range`,text===parentText.slice(...span.utf16));
 check(`${span.name} SHA256`,sha256(bytes)===span.sha256);
 const parsed=ts.createSourceFile(span.file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 check(`${span.name} standalone syntax complete`,parsed.parseDiagnostics.length===0);
}
check('fCe resolves current webview through VHt',sources.fCe.includes('new VHt(BO(),window.__TAURI_INTERNALS__.metadata.currentWebview.label,{skip:!0})'));
check('original native enter forwards original path list without a nonempty filter',sources.VHt.includes('type:"enter",paths:a.payload.paths'));
check('original native subscription is asynchronous',sources.VHt.includes('async onDragDropEvent(e)'));
check('original native handle disposes every event listener',sources.VHt.includes('return()=>{n(),r(),i(),o()}'));
check('original hook derives enter state from nonempty paths',sources.LNi.includes('h.payload.type==="enter"?o(h.payload.paths.length>0)'));
check('original hook clears enter state on leave',sources.LNi.includes('h.payload.type==="leave"?o(!1)'));
check('original hook clears drop state and ignores empty path lists',sources.LNi.includes('h.payload.type==="drop"&&(o(!1),h.payload.paths.length>0&&i(h.payload.paths))'));
check('original hook cleanup awaits pending subscription',sources.LNi.includes('return()=>{d.then(dTo).fireAndForget()}'));
check('original cleanup invokes resolved unlisten',sources.dTo==='function dTo(t){return t()}');
check('original caller connects real composer to hook',sources.ITo.includes('const vF=$.useCallback(ln=>PS(ln).fireAndForget(),[PS]),{isDragOver:dh}=LNi({enabled:Jc,onDropPaths:vF})'));
check('original caller admission is explicit',sources.ITo.includes('Jc=c!=="all"&&!Ac&&!FI'));
check('original returned state reaches visible overlay',sources.ITo.includes('p.jsx(c7i,{visible:dh||se})'));
check('original overlay gates on visible',sources.c7i.includes('{visible:n}=t;if(!n)return null'));
const main=fs.readFileSync(path.join(dir,'main.sha'),'utf8').trim();
for(const file of ['src/features/chat/useWindowDragDrop.ts','src/components/WorkspaceView.tsx']){
 const snapshot=fs.readFileSync(path.join(dir,'main',file));
 const canonical=execFileSync('git',['show',`${main}:${file}`]);
 check(`fresh-main exact ${file}`,snapshot.equals(canonical));
}
const hook=fs.readFileSync(path.join(dir,'main/src/features/chat/useWindowDragDrop.ts'),'utf8');
const view=fs.readFileSync(path.join(dir,'main/src/components/WorkspaceView.tsx'),'utf8');
check('current hook is imported by live WorkspaceView',view.includes('import { nativePathToFile, useWindowDragDrop } from "../features/chat/useWindowDragDrop.ts"'));
check('current hook returned state controls active window overlay',view.includes('const isDroppingOnWindow = useWindowDragDrop(attachDroppedPaths) && interactionActive')&&view.includes('{isDroppingOnWindow && ('));
check('current callback remains concrete and guards inactive/archived',view.includes('if (!interactionActive || workspace.status === "archived") return')&&view.includes('paths.map(nativePathToFile)'));
check('current hook enter ignores native path count',/if \(type === "enter"\) \{\s*setIsDragging\(true\)/.test(hook));
check('current cleanup misses a still-pending handle',hook.includes('return () => cleanup?.()'));
const frozen=fs.readFileSync(path.join(dir,'frozen-before-run.sha256'),'utf8').trim().split('\n');
for(const line of frozen){ const [expected,file]=line.split(/\s+/,2); check(`frozen unchanged ${path.basename(file)}`,sha256(fs.readFileSync(file))===expected); }
const result={unit:'COMPOSER-EMPTY-DROP-135',classification:'QUALIFIED_RED_NO_PRODUCT_LEASE',main,originalParentSha256:manifest.parentSha256,sourceSpanCount:manifest.manifest.length,checks,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,limitations:['Source and inert hook callback proof only','No native app, OS event delivery, browser, provider, package or release proof','Retained original JavaScript never executed','No production files changed']};
fs.writeFileSync(path.join(dir,'qualification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`${result.passed}/${checks.length} static source and frozen-input checks passed; ${result.failed} failed`);
if(result.failed){console.log(JSON.stringify(checks.filter(x=>!x.passed)));process.exitCode=1;}
