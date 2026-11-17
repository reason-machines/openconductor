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
async function mount(initial={scope:'user',page:'general'},initialRepos=repos){
 const cache=new Map(),navigations=[],scrolls=[],frames=[];let renderer,setLocation,setRepos,current;
 const nulls=new Proxy({}, {get:()=>()=>null});
 const document={addEventListener(){},removeEventListener(){},querySelectorAll(){return[];}};
 const provider={useKeybindings(){},useKeybindingOverrides(){return{overrides:{}};}};
 function load(relative){
  let filename=path.resolve(ROOT,relative);if(!path.extname(filename))filename=['.ts','.tsx'].map(x=>filename+x).find(fs.existsSync)||filename;
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const src=fs.readFileSync(filename,'utf8');
  const js=ts.transpileModule(src,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
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
 const {SettingsView}=load('src/settings/SettingsView.tsx');
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
// Source-derived expectations from L9a's remembered se -> bUi -> de -> I9a/a9a/wGt.
for(const [label,section]of[['Scripts','scripts'],['Actions','actions'],['Misc','misc']]){
 test(`clicking ${label} from personal settings preserves last visited Beta`,async()=>{
  const f=await mount({scope:'repo',repoId:'beta',section:'environment'});try{await f.navUser();await f.pick(label);assert.deepEqual(f.current(),{scope:'repo',repoId:'beta',section});}finally{await f.close();}
 });
}
test('Enter activation uses the same remembered repository as click',async()=>{
 const f=await mount({scope:'repo',repoId:'beta',section:'git'});try{await f.navUser();await f.pick('Scripts',true);assert.deepEqual(f.current(),{scope:'repo',repoId:'beta',section:'scripts'});}finally{await f.close();}
});
test('without repo history, search uses the first selectable repository',async()=>{
 const f=await mount();try{await f.pick('Scripts');assert.deepEqual(f.current(),{scope:'repo',repoId:'alpha',section:'scripts'});}finally{await f.close();}
});
test('while viewing Beta, a repo result stays in Beta',async()=>{
 const f=await mount({scope:'repo',repoId:'beta',section:'git'});try{await f.pick('Actions');assert.deepEqual(f.current(),{scope:'repo',repoId:'beta',section:'actions'});}finally{await f.close();}
});
test('removing the remembered repo falls back to the first remaining repo',async()=>{
 const f=await mount({scope:'repo',repoId:'beta',section:'git'});try{await f.navUser();await f.repos([repos[0]]);await f.pick('Scripts');assert.deepEqual(f.current(),{scope:'repo',repoId:'alpha',section:'scripts'});}finally{await f.close();}
});
test('the most recently viewed repo replaces previous history',async()=>{
 const f=await mount({scope:'repo',repoId:'alpha',section:'git'});try{await f.location({scope:'repo',repoId:'beta',section:'git'});await f.navUser();await f.pick('Misc');assert.deepEqual(f.current(),{scope:'repo',repoId:'beta',section:'misc'});}finally{await f.close();}
});
test('personal page results remain personal after remembering Beta',async()=>{
 const f=await mount({scope:'repo',repoId:'beta',section:'git'});try{await f.navUser();await f.pick('Appearance');assert.deepEqual(f.current(),{scope:'user',page:'appearance'});}finally{await f.close();}
});
