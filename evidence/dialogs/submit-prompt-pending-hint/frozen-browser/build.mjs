import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const fixture = resolve('evidence/dialogs/submit-prompt-pending-hint/frozen-browser');
const out = resolve('.ara-state/submit-prompt-pending-hint-6013/public');
mkdirSync(out, { recursive: true });
const component = resolve('src/components/SubmitPromptDialog.tsx');
const original = gunzipSync(readFileSync('evidence/dialogs/submit-prompt-pending-hint/baseline/SubmitPromptDialog.tsx.gz')).toString();
const sha = raw => createHash('sha256').update(raw).digest('hex');
const records = [];
for (const version of ['baseline', 'treatment']) {
  const contents = version === 'baseline' ? original : readFileSync(component, 'utf8');
  const result = await build({ entryPoints: [resolve(fixture, 'entry.tsx')], bundle: true,
    outfile: resolve(out, version + '.js'), platform: 'browser', format: 'iife', jsx: 'automatic', metafile: true,
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'inert-submit-prompt-only', setup(b) {
      b.onResolve({ filter: /^\.\.\/backend$/ }, args => args.importer === component ? { path: resolve(fixture, 'io.ts') } : undefined);
      b.onLoad({ filter: /SubmitPromptDialog\.tsx$/ }, args => args.path === component ? { contents, loader: 'tsx', resolveDir: dirname(component) } : undefined);
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs).sort();
  for (const input of inputs) if (input.startsWith('src/') && /backend|workspace\/api|tauri|App\.tsx|agent\//.test(input)) throw Error('Unexpected runtime boundary: ' + input);
  writeFileSync(resolve(out, version + '.html'), `<!doctype html><html data-build="${version}" data-theme="dark" data-color-palette="stone"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; form-action 'none'; img-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'"><title>Submit prompt pending hint witness</title><link rel="stylesheet" href="${version}.css"></head><body><div id="root"></div><script src="${version}.js"></script></body></html>`);
  records.push({ version, componentSha256: sha(contents), inputCount: inputs.length,
    inputs: Object.fromEntries(inputs.map(path => [path, sha(path === component || resolve(path) === component ? contents : readFileSync(path))])),
    served: Object.fromEntries(['.js','.css','.html'].map(ext => [version + ext, sha(readFileSync(resolve(out, version + ext)))])),
  });
}
if (JSON.stringify(Object.keys(records[0].inputs)) !== JSON.stringify(Object.keys(records[1].inputs))) throw Error('Baseline/treatment graphs differ');
for (const path of Object.keys(records[0].inputs)) if (resolve(path) !== component && records[0].inputs[path] !== records[1].inputs[path]) throw Error('Non-component input differs: ' + path);
const result = { head: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), records,
  fixture: Object.fromEntries(['entry.tsx','io.ts','fixture.css','build.mjs','PLAN.md'].map(path => [path,sha(readFileSync(resolve(fixture,path)))])),
  isolation: 'Actual component/KeybindingsProvider/motion/styles; only backend import replaced with synthetic deferred opener; no full App/native/real backend/provider IO; CSP connect/form none',
};
writeFileSync(resolve(fixture,'../bundle.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',inputCounts:records.map(r=>r.inputCount),components:records.map(r=>r.componentSha256),isolation:result.isolation},null,2));
