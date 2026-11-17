// Frozen before production implementation: real source registrations + pure OC controller.
// No reference JS, provider, PTY, native runtime or React tree is executed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { createDispatcher } from '../../keybindings/dispatcher.ts';
import { bindCommands } from '../../keybindings/bind.ts';
const ref=process.env.SOURCE_REF;
function source(path) { return ref ? execFileSync('git',['show',`${ref}:${path}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}) : readFileSync(path,'utf8'); }
const view=source('src/components/WorkspaceView.tsx');
let model;
try {
 const javascript=stripTypeScriptTypes(source('src/features/workspace/centerPanelLayout.ts'));
 model=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
} catch(error) { if(!ref) throw error; }
function registrationAt(index) {
 const start=view.lastIndexOf('useKeybindings(',index);
 assert.ok(start>=0,'actual source registration found');
 let depth=1,quote=null,end=start+'useKeybindings('.length;
 for(;end<view.length&&depth;end++) {
  const c=view[end];
  if(quote) {if(c==='\\') end++;else if(c===quote) quote=null;}
  else if(c==='"'||c==="'"||c==='`') quote=c;
  else if(c==='(') depth++;
  else if(c===')') depth--;
 }
 assert.equal(depth,0,'complete actual source registration');
 return view.slice(start,end)+';';
}
const ordinary=registrationAt(view.indexOf('"view.toggleTerminalPanel"'));
const splitIndex=view.indexOf('"nav.splitTab"');
const split=splitIndex<0?null:registrationAt(splitIndex);
function fixture(options={}) {
 const {tabs=['chat','terminal:t1'],selectedTab='terminal:t1',overrides={},typing=false,inTerminal=false,activeDialogId=null,storage}=options;
 const enabled=Object.hasOwn(options,'enabled')?options.enabled:true;
 let id=0;
 const centerPanel=model?.createCenterPanelController({workspaceId:'one',enabled,tabs,selectedTab,storage,createGroupId:()=>`group:new${++id}`});
 const dispatcher=createDispatcher(),effects=[];
 const context={centerPanel,PRIORITY:{HIGH:100},
  useKeybindings(handlers,options={}) {bindCommands(dispatcher,handlers,{overrides},options);},
  stepTab(direction){effects.push(direction);},prActions:{openOnGitHub(){}}
 };
 runInNewContext(ordinary,context);
 if(split&&split!==ordinary) runInNewContext(split,context);
 return {centerPanel,effects,press(key='d',modifiers={metaKey:true}) {
  return dispatcher.dispatch({key,code:key==='d'?'KeyD':'Tab',metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,repeat:false,...modifiers},{typing,inTerminal,activeDialogId});
 }};
}
for(const enabled of [false,undefined]) test(`ordinary ${String(enabled)}: Cmd+D passes, tab order remains intact`,()=>{
 const f=fixture({enabled});assert.equal(f.press().kind,'pass');assert.deepEqual(f.effects,[]);
 assert.equal(f.press('Tab',{ctrlKey:true}).kind,'ran');assert.deepEqual(f.effects,[1]);
});
test('control: next and previous tab remain bound',()=>{
 const f=fixture();assert.equal(f.press('Tab',{ctrlKey:true}).kind,'ran');assert.equal(f.press('Tab',{ctrlKey:true,shiftKey:true}).kind,'ran');assert.deepEqual(f.effects,[1,-1]);
});
test('control: plain typing and active dialogs pass split key',()=>{
 assert.equal(fixture({typing:true}).press('d',{}).kind,'pass');
 assert.equal(fixture({activeDialogId:'modal'}).press().kind,'pass');
});
for(const focusedTerminal of [false,true]) test(`enabled Cmd+D moves existing active tab; terminal=${focusedTerminal}`,()=>{
 const f=fixture({typing:focusedTerminal,inTerminal:focusedTerminal});
 assert.equal(f.press().kind,'ran');
 const layout=f.centerPanel.snapshot();
 assert.equal(layout.root.type,'split');assert.equal(layout.root.orientation,'horizontal');assert.equal(layout.root.firstSize,50);
 assert.deepEqual(layout.root.first.tabs,['chat']);assert.deepEqual(layout.root.second.tabs,['terminal:t1']);
 assert.equal(layout.root.second.activeTab,'terminal:t1');assert.equal(layout.activeGroupId,layout.root.second.id);
});
test('enabled configured shortcut dispatches split, old key passes',()=>{
 const overrides={'nav.splitTab':[{key:{kind:'logical',value:'F12'},modifiers:['meta','alt']}]};
 const f=fixture({overrides});assert.equal(f.press().kind,'pass');
 const result=f.press('F12',{metaKey:true,altKey:true});assert.equal(result.kind,'ran');assert.equal(result.commandId,'nav.splitTab');
 assert.equal(f.centerPanel.snapshot().root.type,'split');
});
test('enabled one-tab guard consumes key without manufacturing another tab',()=>{
 const f=fixture({tabs:['chat'],selectedTab:'chat'});assert.equal(f.press().kind,'ran');
 assert.equal(f.centerPanel.snapshot().root.type,'group');assert.deepEqual(f.centerPanel.snapshot().root.tabs,['chat']);
});
