const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const dependencies = createRequire(resolve(process.env.NOTIFICATION_DEPS, 'package.json'));
const React = dependencies('react');
const { act, create } = dependencies('react-test-renderer');
const ts = dependencies('typescript');
const sourceRoot = resolve(process.env.NOTIFICATION_SOURCE_ROOT);
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixture.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

function mount(c) {
  const calls = { checks: 0, requests: 0, writes: [], errors: [], boundaries: [] };
  const modules = new Map();
  let settleRequest;
  const requestResult = c.request_pending
    ? new Promise((resolveRequest) => { settleRequest = resolveRequest; })
    : Promise.resolve(c.request_result);
  const Notification = {
    permission: c.browser_permission,
    requestPermission() { calls.requests++; return requestResult; },
  };
  const window = { Notification };
  const inert = () => null;
  const forbidden = (name) => (...args) => {
    calls.boundaries.push({ name, args });
    throw new Error(`Forbidden boundary: ${name}`);
  };
  const stubs = {
    './ConfigSyncDialog': { ConfigSyncDialog: inert },
    '../backend': { openUrl: forbidden('openUrl'), checkFullDiskAccess: forbidden('checkFullDiskAccess') },
    '../keybindings/KeybindingsProvider': { useKeybindingOverrides: () => ({ overrides: {} }) },
    '../keybindings/overrides': { currentSendKeyMode: () => 'enter', effectiveShortcuts: () => [] },
    '../keybindings/shortcut': { glyphs: () => '' },
    './icons': { SyncIcon: inert, VolumeIcon: inert },
    './appearance': { SETTINGS_CHANGED: 'settings-changed' },
    './appPrefs': { setAppPref: forbidden('setAppPref') },
    './composerSettings': { chooseSendKey: forbidden('chooseSendKey') },
    './rows/AppPrefRows': { GeneralAppPrefRows: inert },
    './sound': { SOUND_OPTIONS: [{ value: 'none', label: 'None' }], playCompletionSound: forbidden('playCompletionSound') },
    './SoundSelect': { SoundSelect: inert },
    './useSettingsOverrideStore': { useSettingsOverrideStore: () => ({ updateMany: forbidden('updateMany') }) },
    '@tauri-apps/api/core': {
      async invoke(command) {
        assert.equal(command, 'plugin:notification|is_permission_granted');
        calls.checks++;
        return c.native_is_granted;
      },
    },
  };
  const allowed = [
    'src/settings/GeneralPage.tsx', 'src/settings/controls.tsx', 'src/settings/model.ts',
    'src/settings/types.ts', 'src/settings/prefs.ts', 'src/workspace/naming.ts',
    'src/settings/notificationPermission.ts',
  ];
  function load(path) {
    const filename = resolve(sourceRoot, path);
    if (modules.has(filename)) return modules.get(filename).exports;
    const javascript = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    modules.set(filename, module);
    const requireSource = (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return dependencies(name);
      if (Object.hasOwn(stubs, name)) return stubs[name];
      const base = resolve(dirname(filename), name.replace(/\.tsx?$/, ''));
      const target = allowed.find((candidate) => resolve(sourceRoot, candidate).replace(/\.tsx?$/, '') === base);
      assert.ok(target, `Unexpected mention notification dependency: ${name}`);
      return load(target);
    };
    vm.runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
      window, Notification, console,
    }, { filename })(requireSource, module, module.exports);
    return module.exports;
  }
  const { DEFAULT_SETTINGS } = load('src/settings/types.ts');
  const { GeneralPage } = load('src/settings/GeneralPage.tsx');
  let persisted = clone(DEFAULT_SETTINGS);
  persisted.general.mention_notifications_enabled = !c.toggle;
  persisted.general.sound_type = 'none';
  persisted.general.notification_fixture_unknown = 'preserve';
  const initial = clone(persisted);
  let renderer;
  const props = () => ({
    settings: persisted,
    notify: (kind, message) => calls.errors.push([kind, message]),
    save(next) {
      calls.writes.push(clone(next));
      persisted = clone(next);
      renderer.update(React.createElement(GeneralPage, props()));
      return Promise.resolve(true);
    },
  });
  act(() => { renderer = create(React.createElement(GeneralPage, props())); });
  const checkbox = () => renderer.root.findByProps({ type: 'checkbox', 'aria-label': '@ notifications' });
  return {
    calls, initial,
    toggle() { checkbox().props.onChange({ target: { checked: c.toggle } }); },
    settle() { assert.ok(settleRequest); settleRequest(c.request_result); },
    replaceSettings(next) {
      persisted = clone(next);
      renderer.update(React.createElement(GeneralPage, props()));
    },
    checked() { return checkbox().props.checked; },
    close() { act(() => renderer.unmount()); },
  };
}

for (const c of fixture) {
  test(`mounted mention notification permission: ${c.id}`, async () => {
    const app = mount(c);
    try {
      let latest = clone(app.initial);
      await act(async () => app.toggle());
      if (c.request_pending) {
        assert.deepEqual(app.calls.errors, [], 'no feedback before permission settles');
        assert.deepEqual(app.calls.writes, [], 'no writes before permission settles');
        assert.equal(app.checked(), false, 'pending checkbox remains unchecked');
        if (c.concurrent_update) {
          latest.general.sound_type = 'default';
          latest.general.send_native_notification = false;
          latest.general.notification_fixture_unknown = 'changed-while-pending';
          latest.notification_concurrent_unknown = { preserve: true };
          await act(async () => app.replaceSettings(latest));
          assert.deepEqual(app.calls.errors, [], 'parent update produces no feedback');
          assert.deepEqual(app.calls.writes, [], 'parent update does not save');
        }
        await act(async () => app.settle());
      }
      assert.equal(app.calls.checks, c.expected_checks, 'fake permission query count');
      assert.equal(app.calls.requests, c.expected_requests, 'fake permission request count');
      assert.deepEqual(app.calls.writes.map((s) => s.general.mention_notifications_enabled), c.expected_writes);
      for (const saved of app.calls.writes) {
        const expected = clone(latest);
        expected.general.mention_notifications_enabled = c.toggle;
        assert.deepEqual(saved, expected, 'save preserves latest unrelated and unknown settings');
      }
      assert.equal(app.checked(), app.calls.writes.length ? c.toggle : !c.toggle, 'checkbox follows persistence');
      assert.deepEqual(app.calls.boundaries, [], 'no unrelated or real native operations');
      assert.deepEqual(app.calls.errors, c.expected_errors, 'exact denial feedback');
    } finally {
      app.close();
    }
  });
}
