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

function mount(c) {
  const calls = { pluginChecks: 0, requests: 0, writes: [], boundaries: [] };
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
    '../backend': { openUrl: forbidden('openUrl') },
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
        calls.pluginChecks++;
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
      assert.ok(target, `Unexpected notification dependency: ${name}`);
      return load(target);
    };
    vm.runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
      window, Notification, console,
    }, { filename })(requireSource, module, module.exports);
    return module.exports;
  }
  const { DEFAULT_SETTINGS } = load('src/settings/types.ts');
  const { GeneralPage } = load('src/settings/GeneralPage.tsx');
  let persisted = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  persisted.general.send_native_notification = !c.toggle;
  persisted.general.sound_type = 'none';
  persisted.general.notification_fixture_unknown = 'preserve';
  const initial = JSON.parse(JSON.stringify(persisted));
  let renderer;
  const props = () => ({ settings: persisted, save(next) {
    calls.writes.push(JSON.parse(JSON.stringify(next)));
    persisted = JSON.parse(JSON.stringify(next));
    renderer.update(React.createElement(GeneralPage, props()));
    return Promise.resolve(true);
  } });
  act(() => { renderer = create(React.createElement(GeneralPage, props())); });
  return {
    calls, initial,
    replaceSettings(next) {
      persisted = JSON.parse(JSON.stringify(next));
      renderer.update(React.createElement(GeneralPage, props()));
    },
    toggle() {
      renderer.root.findByProps({ type: 'checkbox', 'aria-label': 'Agent notifications' })
        .props.onChange({ target: { checked: c.toggle } });
    },
    settle() { assert.ok(settleRequest); settleRequest(c.resolve_request); },
    checked() { return renderer.root.findByProps({ type: 'checkbox', 'aria-label': 'Agent notifications' }).props.checked; },
    close() { act(() => renderer.unmount()); },
  };
}


test('pending notification grant preserves an intervening parent settings update', async () => {
  const app = mount({
    toggle: true,
    browser_permission: 'default',
    native_is_granted: false,
    request_pending: true,
    resolve_request: 'granted',
  });
  try {
    await act(async () => app.toggle());
    assert.equal(app.calls.pluginChecks, 1);
    assert.equal(app.calls.requests, 1);
    assert.deepEqual(app.calls.writes, []);
    assert.equal(app.checked(), false);

    const changed = JSON.parse(JSON.stringify(app.initial));
    changed.general.sound_type = 'default';
    changed.general.notification_fixture_unknown = 'changed-during-permission-prompt';
    changed.notification_concurrent_unknown = { preserve: true };
    await act(async () => app.replaceSettings(changed));
    assert.deepEqual(app.calls.writes, [], 'a parent prop update must not save the pending notification');
    assert.equal(app.checked(), false);

    await act(async () => app.settle());
    const expected = JSON.parse(JSON.stringify(changed));
    expected.general.send_native_notification = true;
    assert.deepEqual(app.calls.writes, [expected], 'permission completion must use the latest settings, not the pre-prompt snapshot');
    assert.equal(app.checked(), true);
    assert.equal(app.calls.pluginChecks, 1);
    assert.equal(app.calls.requests, 1);
    assert.deepEqual(app.calls.boundaries, []);
  } finally {
    app.close();
  }
});
