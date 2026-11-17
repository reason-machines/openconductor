const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture } = require('./lifecycle-harness.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };

// Integration controls use the actual row, API, PendingEdit and registry; only
// external IPC, timers and unrelated presentation/import hosts are synthetic.
test('restart drain flushes the active URL draft before normal unmount', async () => {
  const view = await fixture();
  await view.edit();
  assert.equal(view.writes.length, 0);
  const receipt = await view.registry.drain();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].value[0].url, 'https://localhost:4321');
  assert.equal(view.registry.isCurrent(receipt), true);
  await view.close();
  await view.registry.drain();
  assert.equal(view.writes.length, 1, 'unmount cannot duplicate a drained save');
});

test('normal cancellation releases the row without poisoning the restart registry', async () => {
  const view = await fixture();
  await view.edit(); await view.close();
  const receipt = await view.registry.drain();
  assert.equal(view.registry.isCurrent(receipt), true);
  assert.deepEqual(view.writes, []);
});

test('an already-started URL save is retained across unmount until its acknowledgment', async () => {
  const saving = deferred();
  const view = await fixture({ saving });
  await view.edit(); await view.tick();
  assert.equal(view.writes.length, 1);
  await view.close();
  let settled = false; const draining = view.registry.drain().then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false);
  saving.resolve(true); await draining;
  assert.equal(view.writes.length, 1);
});

test('clearing URLs after the normal debounce still deletes the override', async () => {
  const view = await fixture();
  await view.empty(); await view.tick();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].key, 'preview_urls');
  assert.equal(view.writes[0].value, null);
  await view.close();
  assert.equal(view.writes.length, 1);
});
