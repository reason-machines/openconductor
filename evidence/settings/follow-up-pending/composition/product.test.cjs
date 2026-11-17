const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test, after } = require('node:test');
const { runInThisContext } = require('node:vm');
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');

const root = resolve(__dirname, '../../../..');
const sourcePath = process.env.FOLLOW_UP_SOURCE
  ? resolve(process.env.FOLLOW_UP_SOURCE)
  : resolve(__dirname, 'candidate/GeneralPage.tsx.txt');

function load(path, modules = {}) {
  const javascript = ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path.replace(/\.txt$/, ''),
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  return runInThisContext(`(function(require, exports) {\n${javascript}\nreturn exports;\n})`, { filename: path })(
    (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    }, {},
  );
}

const prefs = load(resolve(root, 'src/settings/prefs.ts'));
const { DEFAULT_SETTINGS } = load(resolve(root, 'src/settings/types.ts'));
const previousWindow = globalThis.window;
const events = [];
globalThis.window = { dispatchEvent: (event) => { events.push(event.type); return true; } };
after(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function mount(save) {
  const inert = () => null;
  const forbidden = () => assert.fail('Unrelated native/settings boundary invoked');
  const notifications = [];
  const modules = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    './ConfigSyncDialog': { ConfigSyncDialog: inert },
    '../backend': { checkFullDiskAccess: forbidden, openUrl: forbidden },
    '../keybindings/KeybindingsProvider': { useKeybindingOverrides: () => ({ overrides: {} }) },
    '../keybindings/overrides': { currentSendKeyMode: () => 'enter', effectiveShortcuts: () => ['fixture-shortcut'] },
    '../keybindings/shortcut': { glyphs: () => '⇧ Enter' },
    './controls': {},
    './icons': { SyncIcon: inert, VolumeIcon: inert },
    './appearance': { SETTINGS_CHANGED: 'fixture-settings-changed' },
    './appPrefs': { setAppPref: forbidden },
    './composerSettings': { chooseSendKey: async () => false },
    './model': { withField: forbidden },
    './notificationPermission': { notificationPermissionGranted: forbidden },
    './prefs': prefs,
    './rows/AppPrefRows': { GeneralAppPrefRows: inert },
    './sound': { playCompletionSound: forbidden, SOUND_OPTIONS: [] },
    './useSettingsOverrideStore': { useSettingsOverrideStore: () => ({ updateMany: forbidden }) },
  };
  const page = load(sourcePath, modules);
  Object.assign(modules['./controls'], load(resolve(root, 'src/settings/controls.tsx'), {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    './GeneralPage': page, './prefs': prefs,
  }));
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(page.GeneralPage, {
      settings: DEFAULT_SETTINGS, save,
      notify: (kind, message) => notifications.push({ kind, message }),
    }));
  });
  const select = (label = 'Follow-up behavior') => renderer.root.findAllByType('select').find((node) => node.props['aria-label'] === label);
  let operation;
  return {
    notifications, select,
    begin: (value = 'queued') => act(() => { operation = select().props.onChange({ target: { value } }); }),
    settle: (callback) => act(async () => { callback(); await operation; await Promise.resolve(); }),
    reject: (callback) => act(async () => { callback(); await assert.rejects(operation, /fixture save rejected/); }),
    close: () => act(() => renderer.unmount()),
  };
}

test('Follow-up is enabled before a save', async () => {
  const view = await mount(() => assert.fail('No initial write'));
  try { assert.equal(Boolean(view.select().props.disabled), false); }
  finally { view.close(); }
});

test('Follow-up is disabled while its own save is pending', async () => {
  const save = deferred();
  const writes = [];
  const view = await mount((next) => { writes.push(next); return save.promise; });
  try {
    await view.begin();
    assert.equal(writes.length, 1);
    assert.equal(prefs.enumPref(writes[0], 'default_message_send_mode'), 'queued');
    assert.equal(view.select().props.disabled, true);
    assert.equal(Boolean(view.select('Completion sound').props.disabled), false);
    assert.equal(Boolean(view.select('Send messages with').props.disabled), false);
  } finally { await view.settle(() => save.resolve(true)); view.close(); }
});

for (const result of [true, false]) {
  test(`Follow-up unlocks after a resolved ${result} save without changing refresh policy`, async () => {
    events.length = 0;
    const save = deferred();
    const view = await mount(() => save.promise);
    try {
      await view.begin();
      assert.equal(view.select().props.disabled, true);
      await view.settle(() => save.resolve(result));
      assert.equal(view.select().props.disabled, false);
      assert.deepEqual(events, result ? ['fixture-settings-changed'] : []);
      assert.deepEqual(view.notifications, []);
    } finally { view.close(); }
  });
}

test('Follow-up unlocks after a rejected save and preserves rejection', async () => {
  events.length = 0;
  const save = deferred();
  const view = await mount(() => save.promise);
  try {
    await view.begin();
    assert.equal(view.select().props.disabled, true);
    await view.reject(() => save.reject(new Error('fixture save rejected')));
    assert.equal(view.select().props.disabled, false);
    assert.deepEqual(events, []);
    assert.deepEqual(view.notifications, []);
  } finally { view.close(); }
});

test('Follow-up unlocks after a synchronous save throw', async () => {
  events.length = 0;
  const view = await mount(() => { throw new Error('fixture save rejected'); });
  try {
    await act(async () => { await assert.rejects(view.select().props.onChange({ target: { value: 'queued' } }), /fixture save rejected/); });
    assert.equal(view.select().props.disabled, false);
    assert.deepEqual(events, []);
  } finally { view.close(); }
});

test('Follow-up accepts a later selection after a refused save', async () => {
  const saves = [deferred(), deferred()];
  const writes = [];
  const view = await mount((next) => { writes.push(next); return saves[writes.length - 1].promise; });
  try {
    await view.begin();
    await view.settle(() => saves[0].resolve(false));
    await view.begin('steering');
    assert.equal(view.select().props.disabled, true);
    assert.equal(prefs.enumPref(writes[1], 'default_message_send_mode'), 'steering');
    await view.settle(() => saves[1].resolve(true));
    assert.equal(view.select().props.disabled, false);
  } finally { view.close(); }
});

test('Send-key failure feedback is preserved while Follow-up is pending', async () => {
  const save = deferred();
  const view = await mount(() => save.promise);
  try {
    await view.begin();
    await act(async () => { view.select('Send messages with').props.onChange({ target: { value: 'cmd-enter' } }); });
    assert.deepEqual(view.notifications, [{ kind: 'error', message: 'Failed to update message send key' }]);
    assert.equal(view.select().props.disabled, true);
  } finally { await view.settle(() => save.resolve(true)); view.close(); }
});

test('Another mounted Follow-up control does not inherit this save pending state', async () => {
  const save = deferred();
  const first = await mount(() => save.promise);
  const second = await mount(() => assert.fail('No second write'));
  try {
    await first.begin();
    assert.equal(first.select().props.disabled, true);
    assert.equal(Boolean(second.select().props.disabled), false);
  } finally { await first.settle(() => save.resolve(true)); first.close(); second.close(); }
});
