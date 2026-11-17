import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source=readFileSync('tests/settings/support/caffeinateHost.mjs','utf8');
const startSource=source.slice(source.indexOf('export async function startHost()')).replace('export async function','async function');
for(const stage of ['navigate','initialize','toggle-visible','hydrate','statuses','disk-access']) {
 test('setup diagnostic identifies original '+stage+' failure',async()=>{
  const sentinel=new Error('INERT_SETUP_FAILURE_AT_'+stage);
  const cleanup=[];
  let waits=0;
  const page={
   on(){},async addInitScript(){},
   async goto(){if(stage==='navigate')throw sentinel;},
   async evaluate(fn){
    if(String(fn).includes('?.snapshot'))return {unexpected:[],calls:[],sessions:[]};
    if(stage==='initialize')throw sentinel;
   },
   getByRole(){return {async waitFor(){if(stage==='toggle-visible')throw sentinel;},async isChecked(){if(stage==='hydrate')throw sentinel;return false;}};},
   async waitForFunction(){waits++;if(stage==='statuses'&&waits===1||stage==='disk-access'&&waits===2)throw sentinel;},
  };
  const context={async newPage(){return page;},async route(){},async close(){cleanup.push('context');}};
  const browser={async newContext(){return context;},async close(){cleanup.push('browser');}};
  const startHost=runInNewContext(startSource+';startHost;',{
   assert,existsSync:()=>true,process:{env:{CHROME_PATH:'/inert/not-an-executable'}},
   chromium:{async launch(){return browser;}},
   async startViteFixture(){return {base:'http://127.0.0.1:1',async close(){cleanup.push('server');}};},
   nativeBoundary(){throw new Error('must not invoke boundary');},
   session:(chatId)=>({chatId}),BATTERY:{eleven:'inert'},SWITCH_NAME:'inert',
  });
  const host=await startHost();
  let failure;
  try{await host.fixture();assert.fail('must fail');}catch(error){failure=error;}finally{await host.close();}
  assert.equal(failure.cause,sentinel,'retain original error cause');
  assert.deepEqual(cleanup,['context','browser','server'],'all synthetic resources close');
  assert.match(failure.message,new RegExp(sentinel.message),'top-level setup diagnostic must expose original stage-specific failure');
 });
}
