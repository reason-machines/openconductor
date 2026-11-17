const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');

const root = resolve(process.env.RESTART_IDLE_SOURCE_ROOT ?? process.cwd());
const source = (path) => resolve(root, 'src', path);
const inert = () => {};

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function remainsPending(promise) {
  let settled = false;
  void promise.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'unacknowledged work must keep the barrier pending');
}

function environment(mocks = new Map(), globals = {}) {
  const cache = new Map();
  function load(filename) {
    if (mocks.has(filename)) return mocks.get(filename);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const javascript = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(javascript, {
      exports, console, URLSearchParams, setTimeout, clearTimeout, ...globals,
      require(specifier) {
        if (specifier === 'react') return React;
        if (specifier === 'react/jsx-runtime') return require(specifier);
        if (mocks.has(specifier)) return mocks.get(specifier);
        assert.ok(specifier.startsWith('.'), `Unexpected external dependency ${specifier}`);
        const base = resolve(dirname(filename), specifier);
        const target = [base, base + '.ts', base + '.tsx'].find((path) => mocks.has(path) || existsSync(path));
        assert.ok(target, `Missing production dependency ${specifier}`);
        return load(target);
      },
    });
    return exports;
  }
  return load;
}

const ready = (status = 'idle') => ({ kind: 'ready', sessionStatuses: [status], workspaceStates: ['ready'], setupRunning: false });

for (const status of ['needs_plan_response', 'needs_user_permission', 'needs_user_input', 'unrecognized']) {
  for (const transition of ['before-install', 'after-install', 'after-drain']) {
    test(`${status} blocks restart ${transition}`, async () => {
      const { createIdleRestart } = environment()(source('features/updates/restartWhenIdle.ts'));
      let readiness = transition === 'before-install' ? ready(status) : ready();
      const events = [];
      const restart = createIdleRestart({
        readiness: () => readiness,
        async flush() { events.push('flush'); if (transition === 'after-drain') readiness = ready(status); },
        async restart() { events.push('restart'); },
        notify: inert,
      });
      await restart.downloaded({ version: 'fixture', async install() { events.push('install'); if (transition === 'after-install') readiness = ready(status); } }, true);
      await restart.observe();
      assert.equal(events.includes('restart'), false);
      if (transition === 'before-install') assert.equal(events.includes('install'), false);
      if (transition === 'after-install') assert.equal(events.includes('flush'), false);
      restart.dispose();
    });
  }
}

test('an unrecognized workspace state cannot establish idle readiness', () => {
  const { isIdle } = environment()(source('features/updates/restartWhenIdle.ts'));
  assert.equal(isIdle({ ...ready(), workspaceStates: ['unrecognized'] }), false);
});

test('real registry invalidates its receipt synchronously when an owner becomes dirty', async () => {
  const load = environment();
  const { createPersistenceRegistry } = load(source('lib/persistence/restartPersistence.ts'));
  const { WriteBarrier } = load(source('lib/persistence/owner.ts'));
  const registry = createPersistenceRegistry();
  const owner = new WriteBarrier();
  registry.registerProducer(owner);
  const receipt = await registry.drain();
  assert.equal(registry.isCurrent(receipt), true);
  const writing = owner.begin();
  assert.equal(registry.isCurrent(receipt), false);
  const drain = registry.drain();
  await remainsPending(drain);
  writing.succeed();
  const next = await drain;
  assert.equal(registry.isCurrent(next), true);
  assert.equal(registry.isCurrent(receipt), false);
});

test('real registry retains a dirty owner after unmount until its acknowledgment arrives', async () => {
  const load = environment();
  const { createPersistenceRegistry } = load(source('lib/persistence/restartPersistence.ts'));
  const { WriteBarrier } = load(source('lib/persistence/owner.ts'));
  const registry = createPersistenceRegistry();
  const owner = new WriteBarrier();
  const release = registry.registerProducer(owner);
  const writing = owner.begin();
  release();
  const drain = registry.drain();
  await remainsPending(drain);
  writing.succeed();
  const receipt = await drain;
  assert.equal(registry.isCurrent(receipt), true);
});

test('real barrier does not erase a newer failure when an older write succeeds', async () => {
  const { WriteBarrier } = environment()(source('lib/persistence/owner.ts'));
  const owner = new WriteBarrier();
  const older = owner.begin();
  const newer = owner.begin();
  newer.fail(new Error('newer failure'));
  older.succeed();
  await assert.rejects(owner.drain(), /newer failure/);
  owner.begin().succeed();
  await owner.drain();
});

test('real editor drain submits the latest debounce value and waits for the save', async () => {
  const { PendingEdit } = environment()(source('lib/persistence/producer.ts'));
  const saving = deferred();
  const values = [];
  let cancelled = 0;
  const editor = new PendingEdit(async (value) => { values.push(value); return saving.promise; }, () => { cancelled++; });
  editor.change('first');
  editor.change('latest');
  const drain = editor.writes.drain();
  await remainsPending(drain);
  assert.deepEqual(values, ['latest']);
  assert.ok(cancelled > 0);
  saving.resolve(true);
  await drain;
});

test('real editor unmount cannot discard an unsaved obligation', async () => {
  const { PendingEdit } = environment()(source('lib/persistence/producer.ts'));
  const editor = new PendingEdit(async () => assert.fail('abandoned edit must not silently save'), inert);
  editor.change('unsaved');
  editor.abandon();
  await assert.rejects(editor.writes.drain(), /unmounted/);
});

async function readinessFixture() {
  let statusReady = false;
  let rows = [{ id: 'outside-sidebar', repositoryId: 'repo', state: 'setting_up' }];
  let query;
  let scripts;
  let scriptListener;
  const mocks = new Map([
    ['@tauri-apps/api/core', { async invoke(command) { assert.equal(command, 'db_list_workspaces'); return query ? query.promise : rows; } }],
    [source('settings/appPrefs.ts'), { appPrefsReady: () => true }],
    [source('features/chat/chatRuntime.ts'), { chatStatusesReady: () => statusReady, chatStatuses: () => new Map(), subscribeChatStatuses: () => inert }],
    [source('scripts/api.ts'), {
      async setupStatus(id) { assert.equal(id, 'outside-sidebar'); return scripts ? scripts.promise : { state: 'idle' }; },
      async onScriptEvent(listener) { scriptListener = listener; return inert; },
    }],
  ]);
  const { useIdleReadiness } = environment(mocks)(source('features/updates/useIdleReadiness.ts'));
  const repos = [{ id: 'repo', path: '/synthetic/not-opened', workspaces: [] }];
  let readiness;
  function Probe() { readiness = useIdleReadiness(repos, 'ready'); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  return {
    get readiness() { return readiness; },
    ready() { statusReady = true; },
    rows(value) { rows = value; },
    query(value) { query = value; },
    scripts(value) { scripts = value; },
    changed() { scriptListener({ type: 'output', kind: 'setup' }); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test('real readiness remains unknown until chat hydration succeeds and reads workspaces outside the rendered sidebar', async () => {
  const view = await readinessFixture();
  try {
    await view.readiness.refresh();
    assert.equal(view.readiness.read().kind, 'unknown');
    view.ready();
    await view.readiness.refresh();
    const snapshot = view.readiness.read();
    assert.equal(snapshot.kind, 'ready');
    assert.deepEqual(Array.from(snapshot.workspaceStates), ['setting_up']);
  } finally { await view.close(); }
});

test('real readiness rejects inventory invalidated while setup status is in flight', async () => {
  const view = await readinessFixture();
  const scripts = deferred();
  try {
    view.ready();
    view.scripts(scripts);
    const refresh = view.readiness.refresh();
    await Promise.resolve();
    view.changed();
    scripts.resolve({ state: 'idle' });
    await refresh;
    assert.equal(view.readiness.read().kind, 'unknown');
  } finally { scripts.resolve({ state: 'idle' }); await view.close(); }
});

test('real readiness rejects a refresh completed after disposal', async () => {
  const view = await readinessFixture();
  const query = deferred();
  view.ready();
  view.query(query);
  const refresh = view.readiness.refresh();
  await view.close();
  query.resolve([]);
  await refresh;
  assert.equal(view.readiness.read().kind, 'unknown');
});

test('real toast dismissal calls the updater cancellation exactly once', async () => {
  const mocks = new Map([
    [source('components/Icons.tsx'), {}],
    [source('components/toastTiming.ts'), {}],
    [source('components/sidebarMotion.tsx'), {}],
  ]);
  const { useToasts } = environment(mocks)(source('components/Toast.tsx'));
  let toasts;
  let cancelled = 0;
  function Probe() { toasts = useToasts(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  try {
    await act(async () => { toasts.show('info', 'Update ready', { onDismiss: () => { cancelled++; } }); });
    const id = toasts.toasts[0].id;
    await act(async () => { toasts.dismiss(id); toasts.dismiss(id); });
    assert.equal(cancelled, 1);
    assert.equal(toasts.toasts.length, 0);
  } finally { await act(async () => renderer.unmount()); }
});

async function storeFixture(options = {}) {
  const calls = [];
  const writes = options.write ?? deferred();
  const reread = options.reread ?? deferred();
  let sectionReads = 0;
  const mocks = new Map([
    ['@tauri-apps/api/core', { async invoke(command, args) {
      calls.push({ command, args });
      if (command === 'db_list_repos' || command === 'db_list_workspaces') return [];
      if (command === 'db_read_navigation_sections') {
        sectionReads++;
        if (sectionReads > 1 && options.reconcile) return reread.promise;
        return { sections: [], updatedAt: 1 };
      }
      if (command === 'db_write_navigation_sections') return writes.promise;
      if (command === 'db_set_workspace_pinned') return options.unpin.promise;
      throw new Error(`Unexpected store command ${command}`);
    } }],
    [source('backend.ts'), { inTauri: () => true }],
    [source('settings/appPrefs.ts'), { useAppPrefs: () => ({}) }],
    [source('state/workspaceStatus.ts'), { isWorkspaceStatus: () => false }],
    [source('home/sidebarGroupBy.ts'), { parseStatusCollapsed: () => undefined }],
    [source('state/openChat.ts'), { restoreChatTabs: inert }],
  ]);
  for (const path of ['state/names.ts', 'state/repoOrder.ts', 'state/sidebarOrder.ts', 'state/nextUnread.ts', 'state/chatUnread.ts', 'state/addRepo.ts', 'workspace/archive.ts', 'scripts/api.ts', 'scripts/model.ts', 'workspace/setupWatch.ts']) mocks.set(source(path), {});
  const storage = new Map();
  const window = Object.assign(new EventTarget(), { location: { pathname: '/', search: '' } });
  const load = environment(mocks, { window, localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  const { useAppStore } = load(source('state/store.ts'));
  const { restartPersistence } = load(source('lib/persistence/restartPersistence.ts'));
  let snapshot;
  function Probe() { snapshot = useAppStore(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  assert.equal(snapshot[2], 'ready');
  return {
    calls, writes, reread, registry: restartPersistence(),
    get state() { return snapshot[0]; },
    dispatch(action) { snapshot[1](action); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test('real store dirties the registry before React commits its dispatch', async () => {
  const view = await storeFixture();
  try {
    const receipt = await view.registry.drain();
    await act(async () => {
      view.dispatch({ type: 'setSidebarVisible', visible: false });
      assert.equal(view.registry.isCurrent(receipt), false, 'dispatch must invalidate before passive persistence effects');
    });
    const next = await view.registry.drain();
    assert.equal(view.state.sidebarVisible, false);
    assert.equal(view.registry.isCurrent(next), true);
  } finally { view.writes.resolve(true); await view.close(); }
});

test('real store drain includes section writes and their dependent workspace unpins', async () => {
  const unpin = deferred();
  const view = await storeFixture({ unpin });
  try {
    await act(async () => { view.dispatch({ type: 'createSection', section: { id: 'fixture', name: 'Fixture', workspaceIds: ['workspace'] } }); });
    const drain = view.registry.drain();
    await remainsPending(drain);
    await act(async () => { view.writes.resolve(true); });
    assert.equal(view.calls.some((call) => call.command === 'db_set_workspace_pinned'), true);
    await remainsPending(drain);
    unpin.resolve();
    await drain;
  } finally { view.writes.resolve(true); unpin.resolve(); await view.close(); }
});

test('real store drain waits for declined-layout reconciliation and the correlated React commit', async () => {
  const view = await storeFixture({ reconcile: true });
  try {
    await act(async () => { view.dispatch({ type: 'createSection', section: { id: 'fixture', name: 'Fixture', workspaceIds: [] } }); });
    const drain = view.registry.drain();
    await act(async () => { view.writes.resolve(false); });
    await remainsPending(drain);
    await act(async () => { view.reread.resolve({ sections: [{ id: 'stored', name: 'Stored elsewhere', workspaceIds: [] }], updatedAt: Date.now() + 1 }); });
    const receipt = await drain;
    assert.equal(view.state.sections[0].id, 'stored');
    assert.equal(view.registry.isCurrent(receipt), true);
  } finally { view.writes.resolve(false); view.reread.resolve({ sections: [], updatedAt: 1 }); await view.close(); }
});

async function panelFixture() {
  const reading = deferred();
  const saving = deferred();
  let value = true;
  const writes = [];
  const mocks = new Map([
    [source('backend.ts'), { inTauri: () => true }],
    [source('settings/appPrefs.ts'), {
      loadAppPrefs: () => reading.promise,
      getAppPrefs: () => ({ left_panel_visible: value }),
      async setAppPref(write) { writes.push(write); await saving.promise; value = write.value; },
    }],
  ]);
  const load = environment(mocks);
  const { useSidebarVisiblePref } = load(source('components/panelPrefs.tsx'));
  const { restartPersistence } = load(source('lib/persistence/restartPersistence.ts'));
  let change;
  function Probe() {
    const [visible, setVisible] = React.useState(true);
    change = setVisible;
    const dispatch = React.useCallback((action) => setVisible(action.visible), []);
    useSidebarVisiblePref(visible, dispatch);
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  return { reading, saving, writes, registry: restartPersistence(), async change(value) { await act(async () => change(value)); }, async close() { await act(async () => renderer.unmount()); } };
}

test('real panel preference drain remains pending through hydration and the deferred visibility save', async () => {
  const view = await panelFixture();
  try {
    const initial = view.registry.drain();
    await remainsPending(initial);
    await act(async () => { view.reading.resolve({ left_panel_visible: true }); });
    const receipt = await initial;
    await view.change(false);
    assert.equal(view.registry.isCurrent(receipt), false);
    const drain = view.registry.drain();
    await remainsPending(drain);
    assert.equal(view.writes[0].value, false);
    view.saving.resolve();
    await drain;
  } finally { view.reading.resolve({ left_panel_visible: true }); view.saving.resolve(); await view.close(); }
});

test('real panel preference read failure cannot become a successful drain', async () => {
  const view = await panelFixture();
  try {
    const drain = view.registry.drain();
    const rejection = assert.rejects(drain, /fixture read failed/);
    await act(async () => { view.reading.reject(new Error('fixture read failed')); });
    await rejection;
  } finally { view.saving.resolve(); await view.close(); }
});
