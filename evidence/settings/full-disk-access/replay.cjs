const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = resolve(__dirname, '../../..');
const dependencies = createRequire(join(root, 'package.json'));
const React = dependencies('react');
const { act, create } = dependencies('react-test-renderer');
const ts = dependencies('typescript');
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixture.json'), 'utf8'));
const pageSource = process.env.FDA_BASELINE === '1'
  ? join(__dirname, 'baseline/GeneralPage.tsx')
  : join(root, 'src/settings/GeneralPage.tsx');

function mount(c, { rejectOpen = false } = {}) {
  const calls = { queries: 0, opens: [], writes: [], errors: [], notifications: [], forbidden: [] };
  const modules = new Map();
  const timers = new Map();
  const listeners = new Map();
  let timerId = 0;
  const responses = Array.isArray(c.boundary) ? [...c.boundary] : [Object.hasOwn(c, 'boundary') ? c.boundary : true];
  const window = {
    addEventListener(name, callback) { assert.equal(name, 'focus'); listeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const inert = () => null;
  const forbidden = (name) => (...args) => {
    calls.forbidden.push({ name, args });
    throw new Error(`Forbidden boundary: ${name}`);
  };
  const stubs = {
    './ConfigSyncDialog': { ConfigSyncDialog: inert },
    '../backend': {
      async checkFullDiskAccess(...args) {
        assert.deepEqual(args, [], 'status query takes no arguments');
        calls.queries++;
        const response = responses.shift();
        assert.notEqual(response, undefined, 'unexpected extra query');
        if (response === 'pending') return new Promise(() => {});
        if (response === 'reject') throw new Error('injected status rejection');
        assert.equal(typeof response, 'boolean');
        return response;
      },
      async openUrl(url) { calls.opens.push(url); if (rejectOpen) throw new Error('injected opener rejection'); },
    },
    '../keybindings/KeybindingsProvider': { useKeybindingOverrides: () => ({ overrides: {} }) },
    '../keybindings/overrides': { currentSendKeyMode: () => 'enter', effectiveShortcuts: () => [] },
    '../keybindings/shortcut': { glyphs: () => '' },
    './icons': { SyncIcon: inert, VolumeIcon: inert },
    './appearance': { SETTINGS_CHANGED: 'settings-changed' },
    './appPrefs': { setAppPref: forbidden('setAppPref') },
    './composerSettings': { chooseSendKey: forbidden('chooseSendKey') },
    './notificationPermission': { notificationPermissionGranted: forbidden('notificationPermissionGranted') },
    './rows/AppPrefRows': { GeneralAppPrefRows: inert },
    './sound': { SOUND_OPTIONS: [{ value: 'none', label: 'None' }], playCompletionSound: forbidden('playCompletionSound') },
    './useSettingsOverrideStore': { useSettingsOverrideStore: () => ({ updateMany: forbidden('updateMany') }) },
  };
  const allowed = ['src/settings/GeneralPage.tsx', 'src/settings/controls.tsx', 'src/settings/model.ts',
    'src/settings/types.ts', 'src/settings/prefs.ts', 'src/workspace/naming.ts'];
  function load(relative) {
    const filename = resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const javascript = ts.transpileModule(readFileSync(relative === 'src/settings/GeneralPage.tsx' ? pageSource : filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    modules.set(filename, module);
    const requireSource = (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return dependencies(name);
      if (Object.hasOwn(stubs, name)) return stubs[name];
      const base = resolve(dirname(filename), name.replace(/\.tsx?$/, ''));
      const target = allowed.find((path) => resolve(root, path).replace(/\.tsx?$/, '') === base);
      assert.ok(target, `Unexpected FDA dependency: ${name}`);
      return load(target);
    };
    vm.runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
      window, console: { ...console, error: (...args) => calls.errors.push(args) },
    }, { filename })(requireSource, module, module.exports);
    return module.exports;
  }
  const { DEFAULT_SETTINGS } = load('src/settings/types.ts');
  const { GeneralPage } = load('src/settings/GeneralPage.tsx');
  let renderer;
  act(() => { renderer = create(React.createElement(GeneralPage, {
    settings: structuredClone(DEFAULT_SETTINGS),
    save: (next) => calls.writes.push(next),
    notify: (...args) => calls.notifications.push(args),
  })); });
  return {
    calls,
    labels: () => renderer.root.findAll((node) => node.type === 'span' && node.children.includes('Granted')).length,
    interval: () => { assert.ok(timers.size <= 1, 'at most one pending poll'); return [...timers.values()][0]?.ms ?? false; },
    poll() {
      assert.equal(timers.size, 1, 'a false response schedules a poll');
      const [id, timer] = [...timers][0];
      assert.equal(timer.ms, 5000);
      timers.delete(id);
      timer.callback();
    },
    focus() { assert.ok(listeners.has('focus'), 'focus listener registered'); listeners.get('focus')(); },
    open() {
      const buttons = renderer.root.findAll((node) => node.type === 'button' && node.children.includes('Open System Settings'));
      assert.equal(buttons.length, 1);
      buttons[0].props.onClick();
    },
    close() {
      act(() => renderer.unmount());
      assert.equal(timers.size, 0, 'unmount cancels polling');
      assert.equal(listeners.size, 0, 'unmount removes focus listener');
    },
  };
}

for (const c of fixture) {
  test(`FDA fixture: ${c.id}`, async () => {
    let app;
    await act(async () => { app = mount(c); });
    try {
      if (Object.hasOwn(c, 'expected_granted_labels')) assert.equal(app.labels(), c.expected_granted_labels, 'rendered Granted label count');
      if (Object.hasOwn(c, 'expected_poll_interval_ms')) assert.equal(app.interval(), c.expected_poll_interval_ms, 'poll only after false');
      if (c.expected_granted_label_counts) {
        assert.equal(app.labels(), c.expected_granted_label_counts[0], 'first rendered Granted label count');
        await act(async () => c.id === 'poll-after-not-granted' ? app.poll() : app.focus());
        assert.equal(app.labels(), c.expected_granted_label_counts[1], 'refetched Granted label count');
        assert.equal(app.calls.queries, 2, 'exactly one refetch');
        assert.equal(app.interval(), c.boundary[1] === false ? 5000 : false, 'poll follows latest status');
      }
      if (c.action === 'click-button') {
        await act(async () => app.open());
        assert.deepEqual(app.calls.opens, [c.expected_url], 'unchanged System Settings URL');
        assert.equal(app.calls.writes.length, c.expected_settings_writes);
      }
      if (c.boundary === 'reject') {
        assert.equal(app.calls.errors.length, 1, 'query rejection logged');
        assert.equal(app.calls.errors[0][0], 'check_full_disk_access failed:');
      }
      assert.deepEqual(app.calls.writes, [], 'status query never persists a preference');
      assert.deepEqual(app.calls.forbidden, [], 'no native/provider/notification boundary');
    } finally {
      app.close();
    }
  });
}

if (process.env.FDA_OPENER_EDGE === '1') {
  test('FDA opener rejection keeps manual recovery message', async () => {
    let app;
    await act(async () => { app = mount({ boundary: true }, { rejectOpen: true }); });
    try {
      await act(async () => app.open());
      assert.deepEqual(app.calls.notifications, [['error', "Couldn't open System Settings. Go to Privacy & Security > Full Disk Access to grant it manually."]]);
    } finally {
      app.close();
    }
  });
}
