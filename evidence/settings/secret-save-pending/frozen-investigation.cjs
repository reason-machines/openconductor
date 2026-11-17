const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const deps = createRequire(process.cwd() + '/package.json');
const React = deps('react');
const { act, create } = deps('react-test-renderer');
const ts = deps('typescript');
const main = 'bcb3ce4f0c0cf92f6a238c1cc6e4d0d54856a24f';
const source = execFileSync('git', ['show', main + ':src/settings/agents/kit.tsx'], {encoding:'utf8'});
console.log('CHECKED_MAIN=' + main);
console.log('KIT_SHA256=' + createHash('sha256').update(source).digest('hex'));
const kit = {};
const forbidden = [];
const deny = (name) => () => { forbidden.push(name); throw new Error('Forbidden boundary: ' + name); };
runInNewContext(ts.transpileModule(source, {
  fileName:'kit.tsx', compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText, {
  exports:kit, Error,
  require(name) {
    if (name === 'react' || name === 'react/jsx-runtime') return deps(name);
    if (name.endsWith('.css')) return {};
    if (name === './kitModel') return {maskedSecret:()=>'fixture-mask'};
    if (name === './icons') return new Proxy({}, {get:()=>()=>null});
    if (name === '../../backend') return {openUrl:deny('openUrl')};
    if (['../../components/Icons','../../components/Toast','../../features/openIn/OpenInButton','../../features/openIn/apps','../appPrefs','./parts','../rows/AgentOptionRows'].includes(name)) return new Proxy({}, {get:(_,key)=>deny(String(key))});
    throw new Error('Unexpected import: ' + name);
  }
});
assert.equal(typeof kit.SecretRow, 'function');
function fixture(label) {
  let fulfill, reject;
  const promise = new Promise((yes,no)=>{fulfill=yes;reject=no;});
  const calls = [];
  let renderer;
  act(()=>{renderer=create(React.createElement(kit.SecretRow, {
    label, configured:true, hint:'fixture-hint',
    onSave:(value)=>{calls.push(value);return promise;},
    onDelete:deny('onDelete'), reveal:deny('reveal')
  }));});
  act(()=>{renderer.root.findByProps({'aria-label':'Edit ' + label}).props.onClick();});
  const input=()=>renderer.root.findByType('input');
  const save=()=>renderer.root.findByProps({type:'submit'});
  const cancel=()=>renderer.root.findAllByType('button').find(n=>n.children.join('')==='Cancel');
  const form=()=>renderer.root.findByType('form');
  return {
    renderer,calls,input,save,cancel,
    async begin() {
      act(()=>{input().props.onChange({target:{value:'  fixture-only-not-a-key  '}});});
      await act(async()=>{form().props.onSubmit({preventDefault(){}});});
    },
    pendingGraphics() {
      return save().findAll(n=>typeof n.type==='string' && (n.type==='svg'||n.type==='img'||n.props.role==='progressbar'||n.props['aria-hidden']===true||n.props['aria-hidden']==='true'));
    },
    async settle(outcome) {
      await act(async()=>{if(outcome==='reject') reject(new Error('synthetic save failure'));else fulfill();});
    },
    async close() {
      await act(async()=>{fulfill();await promise.catch(()=>{});});
      act(()=>renderer.unmount());
    }
  };
}
for (const label of ['Anthropic API key','OpenAI API key']) {
  for (const outcome of ['resolve','reject']) {
    test(label + ' Save exposes working feedback until ' + outcome,async()=>{
      const view=fixture(label);
      try {
        assert.equal(view.save().children.join(''),'Save');
        assert.equal(view.pendingGraphics().length,0);
        await view.begin();
        assert.deepEqual(view.calls,['fixture-only-not-a-key']);
        assert.equal(view.input().props.disabled,true);
        assert.equal(view.save().props.disabled,true);
        assert.equal(view.cancel().props.disabled,true);
        const graphicCount=view.pendingGraphics().length;
        await view.settle(outcome);
        if (outcome==='reject') {
          assert.equal(view.save().children.join(''),'Save');
          assert.equal(view.input().props.disabled,false);
          assert.equal(view.renderer.root.findByProps({className:'ag-error'}).children.join(''),'Failed to save ' + label + ': synthetic save failure');
        } else {
          assert.equal(view.renderer.root.findAllByType('input').length,0);
        }
        assert.equal(graphicCount,1,'pending Save needs its working indicator, not only Saving text');
      } finally {await view.close();}
    });
  }
  test(label + ' blank/duplicate submission controls stay intact',async()=>{
    const view=fixture(label);
    try {
      const form=()=>view.renderer.root.findByType('form');
      act(()=>{view.input().props.onChange({target:{value:'  '}});});
      assert.equal(view.save().props.disabled,true);
      act(()=>{form().props.onSubmit({preventDefault(){}});});
      assert.deepEqual(view.calls,[]);
      await view.begin();
      act(()=>{form().props.onSubmit({preventDefault(){}});});
      assert.deepEqual(view.calls,['fixture-only-not-a-key']);
      await view.settle('reject');
      assert.equal(view.input().props.value,'  fixture-only-not-a-key  ');
      assert.equal(view.save().props.disabled,false);
      assert.equal(view.cancel().props.disabled,false);
      assert.deepEqual(forbidden,[]);
    } finally {await view.close();}
  });
}
