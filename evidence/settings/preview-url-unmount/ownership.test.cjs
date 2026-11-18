// Existing ownership contracts, reproduced before the cancellation treatment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
function environment() {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(js, { module, exports: module.exports, console, require(name) {
      if (name === 'react') return require(name);
      assert.ok(name.startsWith('.'), 'no external runtime dependency');
      const base = path.resolve(path.dirname(filename), name);
      return load([base, base + '.ts'].find(x => fs.existsSync(x)));
    } });
    return module.exports;
  }
  const from = name => load(path.resolve('src/lib/persistence', name + '.ts'));
  return { ...from('producer'), ...from('owner'), ...from('restartPersistence') };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };

// Mirrors the owning real-registry retired-owner contract without broad App replay.
test('retired abandoned editor remains a failed obligation, not a silent save', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry();
  const edit = new PendingEdit(async () => assert.fail('abandoned edit must not save'), () => {});
  const release = registry.registerProducer(edit.writes);
  edit.change('unsaved'); edit.abandon(); release();
  assert.equal(edit.writes.ready(), false);
  await assert.rejects(registry.drain(), /Unsaved editor was unmounted/);
});

test('restart drain submits the latest active draft once and waits for acknowledgment', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry(), saving = deferred(), values = [];
  const edit = new PendingEdit(async value => { values.push(value); return saving.promise; }, () => {});
  const release = registry.registerProducer(edit.writes);
  edit.change('first'); edit.change('latest');
  let settled = false; const draining = registry.drain().then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(values, ['latest']); assert.equal(settled, false);
  saving.resolve(true); await draining;
  assert.equal(edit.writes.ready(), true); release();
});

test('retired in-flight owner still waits for actual acknowledgment', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry(), saving = deferred();
  const edit = new PendingEdit(async () => saving.promise, () => {});
  const release = registry.registerProducer(edit.writes);
  edit.change('sent'); edit.flush(); release();
  let settled = false; const draining = registry.drain().then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false); saving.resolve(true); await draining;
  assert.equal(edit.writes.ready(), true);
});

test('failure remains visible when a retired in-flight save rejects', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry(), saving = deferred();
  const edit = new PendingEdit(async () => saving.promise, () => {});
  const release = registry.registerProducer(edit.writes);
  edit.change('sent'); edit.flush(); release();
  const draining = registry.drain(); saving.reject(new Error('synthetic write failed'));
  await assert.rejects(draining, /synthetic write failed/);
  assert.equal(edit.writes.ready(), false);
});
