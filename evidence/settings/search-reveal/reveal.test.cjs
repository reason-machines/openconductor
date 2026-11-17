// SEARCH-REVEAL-49 frozen actual-module/actual-mounted-callback qualification.
// Retained originals are inert expectations; no original JS is executed.
// Frozen before baseline execution. Original reference JavaScript is never executed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const React=require('react');
const {create,act}=require('react-test-renderer');
const ts=require('typescript');
const ROOT=path.resolve(process.env.SETTINGS_SOURCE_ROOT||'.');
const clone=x=>JSON.parse(JSON.stringify(x));
const repos=[{id:'alpha',name:'Alpha'},{id:'beta',name:'Beta'}];
async function mount(options={}){
 const initial={scope:'user',page:'general'},initialRepos=repos;
 const cache=new Map(),navigations=[],scrolls=[],frames=[];let renderer,setLocation,setRepos,current;
 const nulls=new Proxy({}, {get:()=>()=>null});
 const document={addEventListener(){},removeEventListener(){},querySelectorAll(selector){assert.equal(selector,'.settings-page [data-settings-row]');return options.rows?.()||[];}};
 const provider={useKeybindings(){},useKeybindingOverrides(){return{overrides:{}};}};
 function load(relative){
  let filename=path.resolve(ROOT,relative);if(!path.extname(filename))filename=['.ts','.tsx'].map(x=>filename+x).find(fs.existsSync)||filename;
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const src=fs.readFileSync(filename,'utf8');
  const js=ts.transpileModule(src,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const req=name=>{
   if(name==='react'||name==='react/jsx-runtime'||name==='fuzzysort')return require(name);
   if(name.endsWith('.css'))return{};
   if(name.includes('KeybindingsProvider'))return provider;
   if(name==='./useSettings')return{useSettings:()=>({settings:load('src/settings/types.ts').DEFAULT_SETTINGS,error:null,save:async()=>true,reload(){}})};
   if(name==='../org/useOrganization')return{useOrganization:()=>({active:undefined})};
   if(name==='./cloud/useCloudSetup')return{useCloudSetup:()=>({setup:null})};
   if(name==='./cloud/cloudSetup')return{REASON_PLAN_URL:'https://example.invalid/plan'};
   if(name==='./cloud/CloudSetupPage')return{CloudSetupPage:()=>null,CloudCogIcon:()=>null};
   if(name==='./org/OrgPages')return{ORG_HEADERS:{},OrgPage:()=>null};
   if(name==='./providerTab')return{selectProviderTab(){}};
   if(name==='../backend')return{openUrl:async()=>{assert.fail('external navigation outside scope');}};
   if(name==='./agents/kitModel')return{AGENTS_TABS:['claude','codex','reason'],AGENTS_TAB_LABEL:{claude:'Claude Code',codex:'Codex',reason:'Reason'},agentsTabFrom:x=>x};
   if(name==='../components/ui/Tooltip')return{Tooltip:({children})=>children};
   if(name==='../components/Icons'||name==='./icons'||name==='../components/ConductorIcon')return nulls;
   if(name==='../components/AccountMenu'||name==='../components/PopoverMenu')return nulls;
   if(/^\.\/(Account|Advanced|Agents|Appearance|DefaultModels|Environment|General|Git|KeyBindings|BigTerminal|Experimental|RepoSettings)Page$/.test(name))return nulls;
   if(name.startsWith('.'))return load(path.relative(ROOT,path.resolve(path.dirname(filename),name)));
   assert.fail('Unexpected dependency '+filename+' -> '+name);
  };
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console,document,Node:class{},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}},{filename})(req,module,module.exports);
  return module.exports;
 }
 const {SettingsView,scrollToRow}=load('src/settings/SettingsView.tsx');
 function Harness(){
  const[location,updateLocation]=React.useState(clone(initial));const[items,updateRepos]=React.useState(clone(initialRepos));
  setLocation=updateLocation;setRepos=updateRepos;current=location;
  return React.createElement(SettingsView,{location,repos:items,onNavigate:next=>{navigations.push(clone(next));updateLocation(next);},onClose(){},miscActions:{notify(){}},onLaunchCloudWorkspace(){}});
 }
 await act(async()=>{renderer=create(React.createElement(Harness),{createNodeMock:element=>({getBoundingClientRect:()=>({left:0,bottom:30,width:200}),contains:()=>false,querySelector:()=>({scrollIntoView:opts=>scrolls.push(opts)}),focus(){}})});});
 const input=()=>renderer.root.findByProps({placeholder:'Search settings'});
 const doAct=async fn=>{await act(async()=>fn());};
 return{
  navigations,current:()=>clone(current),
  reveal:(label,tries)=>scrollToRow(label,tries),
  frames:()=>frames.length,
  flush(){let n=0;while(frames.length){assert.ok(n++<100,'frame retry is bounded');frames.shift()();options.afterFrame?.(n);}return n;},
  async navUser(){const button=renderer.root.findAllByType('button').find(n=>n.findAllByType('span').some(s=>s.children.join('')==='General'));assert.ok(button);await doAct(()=>button.props.onClick());},
  async location(value){await doAct(()=>setLocation(value));},
  async repos(value){await doAct(()=>setRepos(clone(value)));},
  async pick(label,keyboard=false){
   await doAct(()=>input().props.onChange({target:{value:label}}));
   const opts=renderer.root.findAllByProps({role:'option'});
   const index=opts.findIndex(n=>n.findAllByProps({className:'settings-search-result-label'}).some(x=>x.findAllByType('span').map(y=>y.children.filter(z=>typeof z==='string').join('')).join('')===label));
   assert.ok(index>=0,'result '+label+' exists');
   if(keyboard){for(let i=0;i<index;i++)await doAct(()=>input().props.onKeyDown({key:'ArrowDown',preventDefault(){}}));await doAct(()=>input().props.onKeyDown({key:'Enter',preventDefault(){}}));}
   else await doAct(()=>opts[index].props.onClick());
   assert.equal(input().props.value,'','activation clears search after onPick');
  },
  async close(){await act(async()=>renderer.unmount());}
 };
}

const expectedFrames=[
 {outline:'2px solid var(--ring)',outlineOffset:'8px',offset:0},
 {outline:'2px solid var(--ring)',outlineOffset:'8px',offset:.55},
 {outline:'2px solid transparent',outlineOffset:'8px'},
];
const expectedOptions={duration:1400,easing:'ease-out'};
function row(label,{frame=false,animatable=true}={}){
 const r={scrolls:[],animations:[],frameAnimations:[],selectors:[]};
 const capture=target=>(frames,options)=>{target.push([clone(frames),clone(options)]);return{cancel(){assert.fail('no source-backed cancellation contract');}};};
 const child=frame?{animate:animatable?capture(r.frameAnimations):undefined}:null;
 r.node={
  querySelectorAll(selector){assert.equal(selector,'.settings-row-label, h2, h3, label, strong');return[{textContent:label}];},
  querySelector(selector){r.selectors.push(selector);assert.equal(selector,':scope > [data-reveal-frame]');return child;},
  scrollIntoView(options){r.scrolls.push(clone(options));},
  animate:animatable?capture(r.animations):undefined,
 };
 return r;
}
function centered(r){assert.deepEqual(r.scrolls,[{block:'center'}]);}
function animated(calls){assert.deepEqual(calls,[[expectedFrames,expectedOptions]]);}
test('actual helper centers its exact matched row',async()=>{
 const r=row('Follow-up behavior');const f=await mount({rows:()=>[r.node]});try{f.reveal('Follow-up behavior');assert.equal(f.flush(),1);centered(r);}finally{await f.close();}
});
test('actual helper animates the direct reveal frame, not its outer row',async()=>{
 const r=row('Follow-up behavior',{frame:true});const f=await mount({rows:()=>[r.node]});try{f.reveal('Follow-up behavior');f.flush();animated(r.frameAnimations);assert.deepEqual(r.animations,[]);assert.deepEqual(r.selectors,[':scope > [data-reveal-frame]']);}finally{await f.close();}
});
test('actual helper falls back to animating the row when no reveal frame exists',async()=>{
 const r=row('Follow-up behavior');const f=await mount({rows:()=>[r.node]});try{f.reveal('Follow-up behavior');f.flush();animated(r.animations);assert.deepEqual(r.frameAnimations,[]);}finally{await f.close();}
});
test('without Web Animations support, revealing a row does not throw',async()=>{
 const r=row('Follow-up behavior',{animatable:false});const f=await mount({rows:()=>[r.node]});try{f.reveal('Follow-up behavior');assert.doesNotThrow(()=>f.flush());assert.equal(r.scrolls.length,1);assert.deepEqual(r.animations,[]);}finally{await f.close();}
});
for(const keyboard of[false,true])test(`mounted actual SettingsSearch activation reveals the target (${keyboard?'Enter':'click'})`,async()=>{
 const r=row('Follow-up behavior');const f=await mount({rows:()=>[r.node]});try{await f.pick('Follow-up behavior',keyboard);assert.deepEqual(f.current(),{scope:'user',page:'general'});assert.equal(f.frames(),1);f.flush();centered(r);animated(r.animations);}finally{await f.close();}
});
test('a mounted page result with no row schedules no reveal',async()=>{
 const r=row('Appearance');const f=await mount({rows:()=>[r.node]});try{await f.pick('Appearance');assert.deepEqual(f.current(),{scope:'user',page:'appearance'});assert.equal(f.frames(),0);assert.deepEqual(r.scrolls,[]);assert.deepEqual(r.animations,[]);}finally{await f.close();}
});
test('existing delayed-row retry still reveals the target exactly once when it appears',async()=>{
 const r=row('Follow-up behavior');let visible=false;const f=await mount({rows:()=>visible?[r.node]:[],afterFrame:()=>{visible=true;}});try{f.reveal('Follow-up behavior');assert.equal(f.flush(),2);centered(r);animated(r.animations);}finally{await f.close();}
});
test('an absent row remains a bounded harmless no-op',async()=>{
 const f=await mount();try{f.reveal('Absent',2);assert.equal(f.flush(),3);assert.equal(f.frames(),0);}finally{await f.close();}
});
test('first exact match is still selected, not an unrelated or later duplicate row',async()=>{
 const other=row('Other'),first=row('Follow-up behavior'),second=row('Follow-up behavior');const f=await mount({rows:()=>[other.node,first.node,second.node]});try{f.reveal('Follow-up behavior');f.flush();centered(first);assert.deepEqual(other.scrolls,[]);assert.deepEqual(second.scrolls,[]);}finally{await f.close();}
});
