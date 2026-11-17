const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const read = (name) => readFileSync(join(__dirname, 'reference', name + '.txt'), 'utf8');
const parent = (name) => readFileSync(join(__dirname, '../reference', name + '.txt'), 'utf8');
const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(write) {
  let registration;
  let active;
  const errors = [];
  const writes = [];
  class Subscription {
    constructor() { this.listeners = new Set(); }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    hasListeners() { return this.listeners.size > 0; }
  }
  class GarbageCollection {
    updateGcTime() {}
    scheduleGc() {}
    clearGcTimeout() {}
  }
  const context = vm.createContext({
    mh: Subscription, Bte: GarbageCollection,
    nn: { batch: (fn) => fn(), batchCalls: (fn) => fn },
    pA: { isFocused: () => true }, D0: { isOnline: () => true }, Nd: true,
    setTimeout, clearTimeout,
    O0: (a, b) => a === b,
    $d: JSON.stringify,
    lS: (mutation) => mutation.options.scope?.id,
    Ir: () => {}, Dte: (value) => Boolean(value),
    z: { c: () => active.cache },
    $e: {
      useState: (init) => {
        if (!active.observer) active.observer = init();
        return [active.observer];
      },
      useEffect: (fn) => fn(),
      useCallback: (fn) => fn,
      useSyncExternalStore: (subscribe, snapshot) => {
        if (!active.unsubscribe) active.unsubscribe = subscribe(() => {});
        return snapshot();
      },
    },
    ir: (row) => { registration = row; },
    p: { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    HDt: () => ({ data: true }), Iri: () => ({ data: 'steering' }),
    Z5e: 'fixture-select-row', Ss: 'fixture-shortcut',
    ee: { updateSetting: (key, value) => { writes.push({ key, value }); return write(value); } },
    iU: 'default_message_send_mode',
  });
  vm.runInContext([
    read('promise'), read('retry-environment'), read('cancellation'), read('delay'), read('retryer'),
    read('initial-state'), read('mutation'), read('mutation-cache'), read('observer'),
    parent('Be').split('const c5e=')[0], parent('zQt'), read('writer'), parent('JUt'),
  ].join(';\n'), context, { timeout: 1000 });
  const cache = new context.Hte({ onError: (error) => errors.push(error) });
  const client = {
    defaultMutationOptions: (options) => ({ networkMode: 'always', ...options }),
    getMutationCache: () => cache,
  };
  context.rr = () => client;
  vm.runInContext('var W9r = zQt;' + parent('registration'), context, { timeout: 1000 });
  function instance() {
    const hook = { cache: Array(2).fill(Symbol.for('react.memo_cache_sentinel')) };
    const render = () => {
      active = hook;
      return registration.render(registration);
    };
    return {
      render,
      choose: (value) => render().props.onValueChange(value),
      state: () => hook.observer.getCurrentResult(),
      close: () => hook.unsubscribe?.(),
    };
  }
  return { instance, writes, errors };
}

for (const outcome of ['saved', 'refused', 'rejected']) {
  test(`retained W9r disables during ${outcome} write and unlocks after settlement`, async () => {
    const save = deferred();
    const view = fixture(() => save.promise);
    const row = view.instance();
    try {
      assert.equal(row.render().props.disabled, false);
      row.choose('queued');
      await flush();
      assert.equal(row.render().props.disabled, true);
      assert.deepEqual(view.writes, [{ key: 'default_message_send_mode', value: 'queued' }]);
      if (outcome === 'rejected') save.reject(new Error('fixture write rejected'));
      else save.resolve(outcome === 'saved');
      await flush();
      assert.equal(row.render().props.disabled, false);
      assert.equal(row.state().status, outcome === 'rejected' ? 'error' : 'success');
      assert.equal(view.errors.length, outcome === 'rejected' ? 1 : 0);
    } finally { row.close(); }
  });
}

test('retained W9r observers with the same mutation key own separate pending state', async () => {
  const save = deferred();
  const view = fixture(() => save.promise);
  const first = view.instance();
  const second = view.instance();
  try {
    first.render(); second.render();
    first.choose('queued');
    await flush();
    assert.equal(first.render().props.disabled, true);
    assert.equal(second.render().props.disabled, false);
    save.resolve(true);
    await flush();
    assert.equal(first.render().props.disabled, false);
  } finally { first.close(); second.close(); }
});

test('retained W9r accepts another selection after a rejected write', async () => {
  const saves = [deferred(), deferred()];
  let index = 0;
  const view = fixture(() => saves[index++].promise);
  const row = view.instance();
  try {
    row.choose('queued');
    await flush();
    saves[0].reject(new Error('fixture write rejected'));
    await flush();
    assert.equal(row.render().props.disabled, false);
    row.choose('steering');
    await flush();
    assert.equal(row.render().props.disabled, true);
    saves[1].resolve(true);
    await flush();
    assert.equal(row.render().props.disabled, false);
    assert.equal(row.state().status, 'success');
    assert.deepEqual(view.writes.map((write) => write.value), ['queued', 'steering']);
  } finally { row.close(); }
});

test('retained Follow-up registration ignores an invalid value', async () => {
  const view = fixture(() => assert.fail('Invalid value reached writer'));
  const row = view.instance();
  try {
    row.choose('invalid');
    await flush();
    assert.deepEqual(view.writes, []);
    assert.equal(row.render().props.disabled, false);
  } finally { row.close(); }
});
