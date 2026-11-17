import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const out = resolve('.ara-state/quick-open-primary-6013');
const publicDir = resolve(out, 'public');
mkdirSync(publicDir, { recursive: true });
const component = resolve('src/components/QuickOpenDialog.tsx');
const io = resolve(out, 'io.ts');
const original = readFileSync('evidence/dialogs/quick-open-primary-override/baseline/src/components/QuickOpenDialog.tsx', 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const records = [];
for (const version of ['baseline', 'treatment']) {
  const contents = version === 'baseline' ? original : readFileSync(component, 'utf8');
  const result = await build({ entryPoints: [resolve(out, 'entry.tsx')], bundle: true,
    outfile: resolve(publicDir, version + '.js'), platform: 'browser', format: 'iife', jsx: 'automatic', metafile: true,
    define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'inert-quick-open-only', setup(b) {
      b.onResolve({ filter: /^\.\.\/backend$/ }, args => args.importer === component ? { path: io } : undefined);
      b.onLoad({ filter: /QuickOpenDialog\.tsx$/ }, args => args.path === component ? { contents, loader: 'tsx', resolveDir: dirname(component) } : undefined);
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs).sort();
  for (const input of inputs) if (input.startsWith('src/') && /backend|workspace\/api|tauri|App\.tsx|agent\//.test(input)) throw Error('Unexpected runtime boundary: ' + input);
  writeFileSync(resolve(publicDir, version + '.html'), `<!doctype html><html data-build="${version}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; form-action 'none'; img-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'"><title>Quick open shortcut witness</title><link rel="stylesheet" href="${version}.css"></head><body><div id="root"></div><script src="${version}.js"></script></body></html>`);
  records.push({version, componentSha256: sha(contents), inputCount: inputs.length, inputs,
    served: Object.fromEntries(['.js', '.css', '.html'].map(ext => [version + ext, sha(readFileSync(resolve(publicDir, version + ext)))])),
  });
}
if (JSON.stringify(records[0].inputs) !== JSON.stringify(records[1].inputs)) throw Error('Baseline/treatment graph differs');
const result = {head: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), records,
  fixture: Object.fromEntries(['entry.tsx','io.ts','build.mjs','fixture.css'].map(p => [p,sha(readFileSync(resolve(out,p)))])),
  isolation:'Only synthetic backend stub; no App/native/provider/real backend module; CSP connect/form none'};
writeFileSync(resolve(out, 'bundle.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({result:'PASS',inputCounts:records.map(r=>r.inputCount),components:records.map(r=>r.componentSha256),isolation:result.isolation},null,2));
