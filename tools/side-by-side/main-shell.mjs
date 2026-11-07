// Start through preview_start. Conductor uses conductor.localhost:4682; OpenConductor uses localhost:4682.
// --check runs the browser regression; --capture records both roots and repository action menus with REA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const ref = path.resolve(process.env.DIST_REF ?? path.join(root, '.rea-work/dist'));
const oc = path.join(root, 'dist');
const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff':'font/woff', '.woff2':'font/woff2', '.wasm':'application/wasm', '.sql':'text/plain', '.mp4':'video/mp4'};
const mock = Object.fromEntries(['fixtures.js','seed-data.js','seed.js','org-fixtures.js','tauri-mock.js'].map(f=>['/__mock/'+f,path.join(root,'tools/screens',f)]));
for(const f of ['sql-wasm.js','sql-wasm.wasm']) mock['/__mock/'+f] = path.join(root,'tools/screens/node_modules/sql.js/dist',f);
for(const f of ['conductor.schema.sql','cache.schema.sql']) mock['/__mock/'+f] = path.join(root,'evidence/sqlite',f);
mock["/__mock/sidebar-sort-fixture.js"] = path.join(root, "tools/side-by-side/sidebar-sort-fixture.js");
const sidebarSortFixture = fs.readFileSync(mock["/__mock/sidebar-sort-fixture.js"], "utf8");
const seed = fs.readFileSync(path.join(root,'tools/sidebar-screens/seed.js'),'utf8');
const extra = `(() => {
 const theme = new URLSearchParams(location.search).get('oc_theme') || 'dark';
 localStorage.setItem('openconductor.settings.preview',JSON.stringify({general:{theme,send_native_notification:true,sound_type:'default'},appearance:{color_palette:'stone',zoom_level_v2:1,low_contrast_dark_mode:false,terminal_font_size:12}}));
 const raw=localStorage.getItem('openconductor.shell.v1');
 if(raw){const s=JSON.parse(raw);s.selection={kind:'root'};localStorage.setItem('openconductor.shell.v1',JSON.stringify(s));}
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}}, transformCallback:()=>0,async invoke(cmd){
 if(cmd==='local_account') return {name:'Ada Demo',email:'ada@example.com',computerName:"Ada Demo's Mac",avatarUrl:null};
 if(cmd==='app_info') return {name:'OpenConductor',version:'0.1.0',platform:'macos'};
 if(cmd==='execute_shell_command_cancellable'||cmd==='execute_shell_command') return {stdout:'',stderr:'',exitCode:0,signal:null,cancelled:false,truncated:false};
 throw new Error('not mocked: '+cmd);
 }};
 window.__OC_SORT_FIXTURE__?.();
})();`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const reference=req.headers.host?.startsWith('conductor.localhost');
 const dir=reference?ref:oc;
 if(url.pathname==='/__health'){res.end('ok');return;}
 if(url.pathname==='/__mock/log'){res.writeHead(204);res.end();return;}
 let file=reference&&mock[url.pathname]||path.join(dir,decodeURIComponent(url.pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dir,'index.html');
 let body=fs.readFileSync(file);
 if(file.endsWith('index.html')){
  const inject=reference?`<meta http-equiv="Content-Security-Policy" content="connect-src 'self' data: blob:"><script>window.__OC_SCENARIO__=${JSON.stringify(url.searchParams.get('oc_scenario')||'signed-in')};</script>`+['sql-wasm.js','seed-data.js','seed.js','fixtures.js','org-fixtures.js','sidebar-sort-fixture.js','tauri-mock.js'].map(f=>`<script src="/__mock/${f}"></script>`).join(''):`<script>${seed}</script><script>${sidebarSortFixture}</script><script>${extra}</script>`;
  body=body.toString().replace('<head>','<head>'+inject);
 }
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
}).listen(4682,'0.0.0.0',async()=>{
 console.log('Shell comparison preview on 4682');
 if(process.argv.includes('--check')) {
  try { await import('./sidebar-actions.check.mjs'); } catch(e) { console.error(e); return; }
 }
 if(process.argv.includes('--home-check')) {
  try { await import('./home-details.check.mjs'); } catch(e) { console.error(e); return; }
 }
 if(process.argv.includes('--sort-check')) {
  try { await import('./sidebar-sort.check.mjs'); } catch(e) { console.error(e); process.exitCode = 1; return; }
 }
 if(process.argv.includes('--passport-check')) {
  try { await import('./passport.check.mjs'); } catch(e) { console.error(e); return; }
 }
 if(process.argv.includes('--capture')) await import('./main-shell-capture.mjs');
});
