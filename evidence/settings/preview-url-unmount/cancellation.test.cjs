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

test('neutral cancellation settles once, advances revision, and is not success or failure', async () => {
  const { WriteBarrier } = environment();
  const owner = new WriteBarrier(), ack = owner.begin();
  assert.equal(owner.ready(), false);
  const before = owner.revision; ack.cancel();
  assert.equal(owner.revision, before + 1);
  assert.equal(owner.ready(), true);
  ack.cancel(); ack.succeed(); ack.fail(new Error('late failure'));
  assert.equal(owner.revision, before + 1);
  await owner.drain();
});

test('cancelled newer acknowledgment does not erase an older recorded failure', async () => {
  const { WriteBarrier } = environment();
  const owner = new WriteBarrier();
  owner.begin().fail(new Error('older actual write failed'));
  owner.begin().cancel();
  await assert.rejects(owner.drain(), /older actual write failed/);
});

test('cancelled newer acknowledgment does not hide an older failure arriving later', async () => {
  const { WriteBarrier } = environment();
  const owner = new WriteBarrier(), old = owner.begin();
  owner.begin().cancel(); old.fail(new Error('older late failure'));
  await assert.rejects(owner.drain(), /older late failure/);
});

test('cancellation after settled success cannot change the acknowledgment or revision', async () => {
  const { WriteBarrier } = environment();
  const owner = new WriteBarrier(), ack = owner.begin(); ack.succeed();
  const before = owner.revision; ack.cancel();
  assert.equal(owner.ready(), true); assert.equal(owner.revision, before);
  await owner.drain();
});

test('a later actual successful write still supersedes an older failure', async () => {
  const { WriteBarrier } = environment();
  const owner = new WriteBarrier();
  owner.begin().fail(new Error('older failure'));
  owner.begin().cancel(); owner.begin().succeed();
  assert.equal(owner.ready(), true); await owner.drain();
});

test('discard only cancels the queued draft and remains safe to repeat', async () => {
  const { PendingEdit } = environment();
  const values = []; let cancelled = 0;
  const edit = new PendingEdit(async value => values.push(value), () => { cancelled++; });
  edit.change('discard'); edit.discard(); edit.discard();
  await edit.writes.drain();
  assert.deepEqual(values, []); assert.ok(cancelled >= 2);
  edit.change('keep'); await edit.writes.drain();
  assert.deepEqual(values, ['keep']);
});

test('discarding a newer unsent draft retains an in-flight failed write after retirement', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry(), saving = deferred(), values = [];
  const edit = new PendingEdit(async value => { values.push(value); return saving.promise; }, () => {});
  const release = registry.registerProducer(edit.writes);
  edit.change('actual write'); edit.flush(); await Promise.resolve();
  edit.change('discarded draft'); edit.discard(); release();
  const draining = registry.drain(); saving.reject(new Error('actual write failed'));
  await assert.rejects(draining, /actual write failed/);
  assert.deepEqual(values, ['actual write']); assert.equal(edit.writes.ready(), false);
});

test('discarding a newer unsent draft retains an in-flight acknowledgment after retirement', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry(), saving = deferred(), values = [];
  const edit = new PendingEdit(async value => { values.push(value); return saving.promise; }, () => {});
  const release = registry.registerProducer(edit.writes);
  edit.change('actual write'); edit.flush(); await Promise.resolve();
  edit.change('discarded draft'); edit.discard(); release();
  let settled = false; const draining = registry.drain().then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false); saving.resolve(true); await draining;
  assert.deepEqual(values, ['actual write']); assert.equal(edit.writes.ready(), true);
});

test('discard cannot acknowledge a prior refused save', async () => {
  const { PendingEdit } = environment();
  const edit = new PendingEdit(async () => false, () => {});
  edit.change('refused'); await assert.rejects(edit.writes.drain(), /refused/);
  edit.change('discarded'); edit.discard();
  await assert.rejects(edit.writes.drain(), /refused/);
});

test('cancellation invalidates a previously issued persistence receipt', async () => {
  const { PendingEdit, createPersistenceRegistry } = environment();
  const registry = createPersistenceRegistry();
  const edit = new PendingEdit(async () => assert.fail('discarded draft must not save'), () => {});
  const release = registry.registerProducer(edit.writes), before = await registry.drain();
  edit.change('discard'); edit.discard();
  assert.equal(registry.isCurrent(before), false);
  const after = await registry.drain(); assert.equal(registry.isCurrent(after), true); release();
});
