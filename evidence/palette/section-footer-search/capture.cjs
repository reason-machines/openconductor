// Inert extraction only: never import or evaluate the retained vendor asset.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding:'utf8'}).trim();
const out = __dirname;
// Qualification-time capture only; refuse to re-freeze treatment as baseline.
assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'2ada6e3e186391695cae1ce5694ac251a6323079');
const asset = fs.readFileSync(process.argv[2]);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
assert.equal(asset.length,11600457);
assert.equal(hash(asset),'5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde');
const marker = text => {const i = asset.indexOf(text); assert.ok(i >= 0,text); return i;};
const records = [];
function retain(name,start,end,parsePrefix='') {
  const bytes = asset.subarray(start,end);
  fs.writeFileSync(path.join(out,name),bytes);
  records.push({path:name,range:[start,end],bytes:bytes.length,sha256:hash(bytes),parsePrefix});
}
retain('Jba.txt',10877545,10880908);
retain('KV.txt',2913899,2914244);
retain('P6.txt',2912384,2912492,'const ');
retain('Xyi.txt',2903072,2908580,'const ');
retain('selectors.txt',marker('var Eve='),asset.indexOf(';',marker('var Eve=')));
retain('M5s.txt',marker('M5s=$.forwardRef'),marker(',j5s=$.forwardRef'),'const ');
retain('j5s.txt',marker('j5s=$.forwardRef'),marker(',F5s=$.forwardRef'),'const ');
retain('F5s.txt',marker('F5s=$.forwardRef'),marker(',B5s=$.forwardRef'),'const ');
retain('B5s.txt',2910380,2910953,'const ');
retain('Zyi.txt',2913001,2913356);
retain('ff.txt',marker('const ff=$.forwardRef'),marker(';ff.displayName='));
retain('exi.txt',marker('const exi=$.forwardRef'),marker(';exi.displayName='));
retain('item-wrapper.txt',marker('const $o=$.forwardRef'),marker(';$o.displayName='));
retain('filter.txt',10872078,10872171);
retain('scorer.txt',8457894,8458998);
retain('kI.txt',2916816,2917726);
const fixture='src/palette/sectionFooterSearch.test.ts';
const pins={};
for (const file of cp.execFileSync('git',['ls-files','src/palette','src/keybindings','evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts','evidence/palette/shift-navigation/section-controls.test.ts','evidence/palette/group-navigation/binding-controls.test.ts','evidence/palette/section-auto-scroll/pointer-controls.test.ts'],{encoding:'utf8'}).trim().split('\n')) {
  if (file.endsWith('.test.ts') || ['src/palette/MoveToSection.tsx','src/palette/PaletteHost.tsx','src/palette/CommandPalette.tsx','src/palette/search/score.ts','src/palette/state.ts'].includes(file)) pins[file]=hash(fs.readFileSync(path.join(root,file)));
}
const manifest={
  owner:'Conductor Rebuild / SAME15',unit:'SECTION-FOOTER-SEARCH-SAME15',
  baseMain:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  parent:{name:'renderApp-D_fmY7hW.js',bytes:asset.length,sha256:hash(asset),retained_REA_artifact_id:'ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5'},
  offsetConvention:'zero-based half-open UTF-8 bytes',records,
  fixture:{path:fixture,sha256:hash(fs.readFileSync(path.join(root,fixture)))},
  baselinePins:pins,
  observedBaseline:{tests:17,pass:7,intendedAssertionFailures:10,skipped:0},
  limits:['Retained REA bytes; no vendor JavaScript evaluation or fresh acquisition','Mounted synthetic source callbacks only; browser/native/package acceptance NOT_RUN','Existing optional #1442 historical VM failures separate, not a full-suite PASS']
};
fs.writeFileSync(path.join(out,'source.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(out,'MoveToSection-before.tsx.gz'),require('node:zlib').gzipSync(fs.readFileSync(path.join(root,'src/palette/MoveToSection.tsx'))));
console.log(`Retained ${records.length} complete declarations/initializers; froze ${Object.keys(pins).length} existing source/test identities and fixture ${manifest.fixture.sha256}`);
