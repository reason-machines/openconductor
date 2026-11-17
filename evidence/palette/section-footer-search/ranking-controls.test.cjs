const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const root=path.resolve(__dirname,'../../..');
const score=require(path.join(root,'src/palette/search/score.ts'));
const source=process.env.SECTION_SEARCH_BASELINE
  ? zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'MoveToSection-before.tsx.gz'))).toString()
  : fs.readFileSync(path.join(root,'src/palette/MoveToSection.tsx'),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:exportsObject,require(name){
    if(name==='react'||name==='react/jsx-runtime')return require(name);
    if(name==='../components/ConductorIcon')return {ConductorIcon:()=>null};
    if(name==='./search/score.ts')return score;
    throw new Error(`Unexpected section ranking dependency ${name}`);
  },
});
const {sectionItems}=exportsObject;
const labels=items=>Array.from(items,item=>item.kind==='section'?item.section.name:item.kind);
// These are supplemental pure-production model controls, not mounted/browser tests.
test('matched disabled row stays ahead of sorted enabled rows in its group',()=>{
  const items=sectionItems([
    {id:'a',name:'Alpha',workspaceIds:[]},
    {id:'b',name:'Alpha backlog',workspaceIds:['workspace']},
  ],'workspace','Alpha');
  assert.deepEqual(labels(items),['Alpha backlog','Alpha']);
});
test('a disabled match contributes to its group rank without becoming actionable',()=>{
  const items=sectionItems([
    {id:'section',name:'Current',workspaceIds:['workspace']},
    {id:'bucket',name:'Section work',workspaceIds:[]},
  ],'workspace','section');
  assert.deepEqual(labels(items),['Current','Section work','new','remove']);
});
test('equal-score section rows keep their original registration order',()=>{
  const items=sectionItems([
    {id:'a',name:'Alpha',workspaceIds:[]},
    {id:'b',name:'Alpha',workspaceIds:[]},
  ],'workspace','Alpha');
  assert.deepEqual(Array.from(items,item=>item.section.id),['a','b']);
});
