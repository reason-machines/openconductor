// Mounted DOM qualification. Own app and installed Base UI only; vendor REA bytes are never evaluated.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const rootPath = path.resolve(process.env.OC_ROOT || process.cwd());
const dependencies = createRequire(path.join(rootPath, 'package.json'));
const domDependencies = createRequire(path.resolve(process.env.DOM_DEPS || '.ara-state/archive-dom/package.json'));
const { JSDOM } = domDependencies('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'http://home-fixture.test', pretendToBeVisual:true });
for (const name of ['window','document','HTMLElement','Element','Node','Event','MouseEvent','KeyboardEvent','MutationObserver','DocumentFragment']) global[name] = name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name];
Object.defineProperty(global,'navigator',{configurable:true,value:dom.window.navigator});
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
global.IS_REACT_ACT_ENVIRONMENT = true;
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = dom.window.ResizeObserver = ResizeObserver;
dom.window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
HTMLElement.prototype.scrollIntoView = function () {};
const React = dependencies('react');
const { createRoot } = dependencies('react-dom/client');
const { act } = React;
const userEvent = domDependencies('@testing-library/user-event').default;
const { getByRole, queryByRole, getAllByRole } = domDependencies('@testing-library/dom');
const ts = dependencies('typescript');
const FILTERS_KEY = 'openconductor.home.filters.v1';
const inert = () => null;
const modules = new Set(['src/components/AllWorkspaces.tsx','src/home/allWorkspaces.ts','src/components/sidebarLabel.ts','src/state/workspaceNumber.ts','src/components/home/ArchiveFilter.tsx']);
function appModule() {
 const cache = new Map();
 const common = {
  useBoolPref:()=>false,useStatusMatrix:()=>false,useWorkspaceAgentStatus:()=> 'idle',
  useKeybindingOverrides:()=>({overrides:{}}),effectiveShortcuts:()=>[],glyphs:()=>'',
  listArchivedWorkspaces:async()=>[],onArchiveEvent:()=>inert,
  Tooltip:({children})=>children,homeStatus:()=> 'idle',rowStatusLabel:()=> 'Idle',showsActivityStatus:()=>false,
  rowGitStatus:()=>undefined,isWorkspaceUnread:()=>false,
 };
 function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file,exports);
  const source = readFileSync(path.join(rootPath,file),'utf8');
  const tree = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const mocked = new Map();
  for (const statement of tree.statements) {
   if (!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||statement.importClause?.isTypeOnly) continue;
   const names = {};
   const bindings = statement.importClause?.namedBindings;
   if (bindings&&ts.isNamedImports(bindings)) for (const item of bindings.elements) {
    if (item.isTypeOnly) continue;
    const name = item.propertyName?.text??item.name.text;
    names[name] = name in common ? common[name] : /^[A-Z]/.test(name) ? inert : ()=>assert.fail(`Unexpected adapter ${statement.moduleSpecifier.text}.${name}`);
   }
   mocked.set(statement.moduleSpecifier.text,names);
  }
  const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(javascript,{
   exports,console,window,document,HTMLElement,Element,Event,MouseEvent,KeyboardEvent,localStorage:window.localStorage,Date,setTimeout,clearTimeout,
   require(specifier) {
    if (['react','react/jsx-runtime','@base-ui/react/select'].includes(specifier)) return dependencies(specifier);
    if (specifier.startsWith('.')) {
     const relative=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
     const found=[relative,relative+'.ts',relative+'.tsx'].find(name=>modules.has(name));
     if(found) return load(found);
    }
    assert.ok(mocked.has(specifier),`Unexpected module ${specifier}`); return mocked.get(specifier);
   }
  },{filename:file});
  return exports;
 }
 return load('src/components/AllWorkspaces.tsx').AllWorkspaces;
}
async function fixture({archiveFilter='active',projects=[]}={}) {
 document.body.innerHTML='<div id="root"></div>';
 window.localStorage.clear(); window.localStorage.setItem(FILTERS_KEY,JSON.stringify({projects,archiveFilter}));
 const actions=[]; const user=userEvent.setup({document});
 const workspace=(id,status)=>({id,name:id,branch:id,userSetWorkspaceName:true,status,diff:{added:0,removed:0},createdAt:Date.now()});
 const repos=['Alpha','Beta'].map(name=>({id:name.toLowerCase(),name,path:'/fixture/'+name,defaultBranch:'main',workspaces:[workspace(name+' active','idle'),workspace(name+' archived','archived')]}));
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(appModule(),{repos,sidebarVisible:true,dispatch:action=>actions.push(action),onCreateWorkspace:inert}));});
 const trigger=()=>document.querySelector('[aria-label="Archived workspaces"]');
 const item=(label)=>[...document.querySelectorAll('.allws-menu-item')].find(node=>node.textContent.replace(/✓/g,'').trim()===label);
 const saved=()=>JSON.parse(window.localStorage.getItem(FILTERS_KEY));
 const step=async(callback)=>act(async()=>{await callback();});
 return {actions,saved,trigger,item,
  open:()=>trigger().getAttribute('aria-expanded')==='true',
  focused:()=>document.activeElement.textContent.replace(/✓/g,'').trim(),
  async focusTrigger(){await step(()=>trigger().focus());},
  async key(key){await step(()=>user.keyboard(key));},
  async clickTrigger(){await step(()=>user.click(trigger()));},
  async focusItem(label){const option=item(label);assert.ok(option,'reachable option '+label);await step(()=>option.focus());},
  async choose(label){const option=item(label);assert.ok(option,'reachable option '+label);await step(()=>user.click(option));},
  async clickProject(label){const option=getByRole(document.body,'menuitemcheckbox',{name:label});await step(()=>user.click(option));},
  async openProjects(){await step(()=>user.click(getByRole(document.body,'button',{name:'Projects'})));},
  rowLabels:()=>getAllByRole(getByRole(document.body,'listbox',{name:'Workspaces'}),'option').map(node=>node.textContent),
  async close(){await act(async()=>{root.unmount();});document.body.innerHTML='';}
 };
}
for(const key of ['{ArrowDown}','{ArrowUp}']) test('Archive '+key+' opens on selected Showing all',async()=>{
 const view=await fixture({archiveFilter:'all'});try{await view.focusTrigger();await view.key(key);assert.equal(view.open(),true,'archive arrow opens select');assert.equal(view.focused(),'Showing all');assert.equal(view.saved().archiveFilter,'all');assert.deepEqual(view.actions,[]);}finally{await view.close();}
});
for(const [from,key] of [['Hiding archived','{ArrowUp}'],['Only archived','{ArrowDown}']]) test('Archive clamps '+key+' at '+from,async()=>{
 const view=await fixture();try{await view.clickTrigger();await view.focusItem(from);await view.key(key);assert.equal(view.focused(),from);assert.equal(view.saved().archiveFilter,'active');}finally{await view.close();}
});
test('Archive moves ArrowDown and ArrowUp without committing',async()=>{
 const view=await fixture();try{await view.clickTrigger();await view.focusItem('Hiding archived');await view.key('{ArrowDown}');assert.equal(view.focused(),'Showing all');await view.key('{ArrowUp}');assert.equal(view.focused(),'Hiding archived');assert.equal(view.saved().archiveFilter,'active');}finally{await view.close();}
});
test('Archive Home and End move focus without committing',async()=>{
 const view=await fixture({archiveFilter:'all'});try{await view.clickTrigger();await view.focusItem('Showing all');await view.key('{End}');assert.equal(view.focused(),'Only archived');await view.key('{Home}');assert.equal(view.focused(),'Hiding archived');assert.equal(view.saved().archiveFilter,'all');}finally{await view.close();}
});
test('Archive open typeahead highlights without changing filter',async()=>{
 const view=await fixture();try{await view.clickTrigger();await view.focusItem('Hiding archived');await view.key('o');assert.equal(view.focused(),'Only archived');assert.equal(view.saved().archiveFilter,'active');assert.equal(view.open(),true);}finally{await view.close();}
});
test('Archive closed typeahead commits single select without opening',async()=>{
 const view=await fixture();try{await view.focusTrigger();await view.key('o');assert.equal(view.open(),false);assert.equal(view.saved().archiveFilter,'archived');assert.equal(view.trigger().textContent,'Only archived');}finally{await view.close();}
});
test('Archive Enter commits focused option, closes and preserves projects',async()=>{
 const view=await fixture({projects:['alpha']});try{await view.clickTrigger();await view.focusItem('Hiding archived');await view.key('{End}{Enter}');assert.equal(view.open(),false);assert.equal(view.saved().archiveFilter,'archived');assert.deepEqual(view.saved().projects,['alpha']);assert.equal(view.rowLabels().length,1);assert.match(view.rowLabels()[0],/Alpha archived/);assert.deepEqual(view.actions,[]);}finally{await view.close();}
});
test('Archive Space commits one focused option',async()=>{
 const view=await fixture();try{await view.clickTrigger();await view.focusItem('Showing all');await view.key(' ');assert.equal(view.open(),false);assert.equal(view.saved().archiveFilter,'all');assert.equal(view.rowLabels().length,4);}finally{await view.close();}
});
test('Archive Escape dismisses without commit and restores trigger focus',async()=>{
 const view=await fixture();try{await view.clickTrigger();await view.focusItem('Only archived');await view.key('{Escape}');assert.equal(view.open(),false);assert.equal(view.saved().archiveFilter,'active');assert.equal(document.activeElement,view.trigger());}finally{await view.close();}
});
test('Archive pointer choice remains a closing single select',async()=>{
 const view=await fixture();try{await view.clickTrigger();await view.choose('Showing all');assert.equal(view.open(),false);assert.equal(view.saved().archiveFilter,'all');assert.equal(view.rowLabels().length,4);assert.deepEqual(view.actions,[]);}finally{await view.close();}
});
test('Projects stays multi-select while Archive preserves its selections',async()=>{
 const view=await fixture();try{await view.openProjects();await view.clickProject('Alpha');await view.clickProject('Beta');assert.deepEqual(view.saved().projects,['alpha','beta']);assert.ok(queryByRole(document.body,'menu'),'Projects stays open');await view.key('{Escape}');await view.clickTrigger();await view.choose('Only archived');assert.deepEqual(view.saved().projects,['alpha','beta']);assert.equal(view.rowLabels().length,2);assert.deepEqual(view.actions,[]);}finally{await view.close();}
});
test('Archive exposes combobox/listbox/option selection semantics',async()=>{
 const view=await fixture({archiveFilter:'all'});try{assert.equal(view.trigger().getAttribute('role'),'combobox');assert.equal(view.trigger().getAttribute('aria-haspopup'),'listbox');await view.clickTrigger();const list=getByRole(document.body,'listbox',{name:''});assert.equal(getAllByRole(list,'option').length,3);assert.equal(getByRole(list,'option',{name:'Showing all'}).getAttribute('aria-selected'),'true');}finally{await view.close();}
});
test.after(()=>dom.window.close());
