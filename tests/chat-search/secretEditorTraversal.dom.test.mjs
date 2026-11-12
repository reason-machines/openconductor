import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { after, test } from 'node:test';
import { runInNewContext } from 'node:vm';

const deps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS ?? '.', 'package.json'));
const { JSDOM } = deps('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'MutationObserver', 'MouseEvent', 'KeyboardEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = deps('react');
const { act } = React;
const { createRoot } = deps('react-dom/client');
const userEvent = deps('@testing-library/user-event').default;
const ts = deps('typescript');
after(() => dom.window.close());

const FAKE_VALUE = 'fixture-only-not-a-key-1234';
const LABEL = 'Anthropic API key';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const container = document.createElement('div');
  document.body.append(container);
  const forbiddenCalls = [], saves = [], reloads = [], statuses = [];
  const user = userEvent.setup({ document });
  const forbid = name => () => {
    forbiddenCalls.push(name);
    throw new Error(`Unexpected native/provider action: ${name}`);
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: forbid('clipboard.writeText') } });
  const provider = { agent: 'claude', kind: 'anthropic_api', ready: true, secrets: [{ key: 'anthropic_api_key', present: true, hint: '1234' }] };
  const settingsApi = {
    async providerStatus(agent) {
      assert.equal(agent, 'claude');
      statuses.push(agent);
      return provider;
    },
    connectProvider(agent, config, secrets) {
      assert.equal(agent, 'claude');
      assert.equal(config.kind, 'anthropic_api');
      assert.equal(config.auth, 'api_key');
      assert.equal(JSON.stringify(secrets), JSON.stringify([{ key: 'anthropic_api_key', value: FAKE_VALUE }]));
      const gate = deferred();
      saves.push({ value: secrets[0].value, gate });
      return gate.promise;
    },
    errorText: String,
    revealProviderSecret: forbid('revealProviderSecret'),
    disconnectProvider: forbid('disconnectProvider'),
  };
  const modules = new Map();
  const boundaries = new Map([
    ['src/settings/api', settingsApi],
    ['src/settings/agents/api', { cliLoginStatus: async agent => {
      assert.equal(agent, 'claude');
      return { installed: false, authenticated: false, version: 'fixture-version' };
    }, homeDir: forbid('homeDir') }],
    ['src/backend', { inTauri: () => false, openUrl: forbid('openUrl') }],
    ['src/settings/GeneralPage', { Row: () => null }],
    ['src/settings/rows/AgentOptionRows', { ChromeModeRow: () => null, ExecutablePathRow: () => null }],
    ['src/settings/appearance', { SETTINGS_CHANGED: 'inert-settings-changed' }],
    ['src/settings/useSettings', { rememberSettings: forbid('rememberSettings') }],
    ['src/settings/appPrefs', {}],
    ['src/components/Icons', { CloseIcon: () => null }],
    ['src/components/sidebarMotion', { endingProps: () => ({}) }],
    ['src/components/ReasonMark', { ReasonMark: () => null }],
    ['src/features/openIn/OpenInButton', {}],
    ['src/features/openIn/apps', {}],
    ['src/features/terminal/pty', Object.fromEntries(['onPtyEvent', 'ptySpawn', 'ptyWrite', 'ptyResize', 'ptyAckBytes', 'ptyKill'].map(name => [name, forbid(name)]))],
  ]);
  function load(path) {
    if (boundaries.has(path)) return boundaries.get(path);
    if (modules.has(path)) return modules.get(path);
    const fileName = `${path}.${existsSync(`${path}.tsx`) ? 'tsx' : 'ts'}`;
    const compiled = ts.transpileModule(readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    assert.deepEqual(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), [], `The production module must transpile: ${fileName}`);
    const exports = {};
    modules.set(path, exports);
    runInNewContext(compiled.outputText, {
      exports, console, window, document, navigator, setTimeout, clearTimeout,
      require(name) {
        if (name === 'react' || name === 'react/jsx-runtime') return deps(name);
        if (name.endsWith('.css')) return {};
        if (name === '@tauri-apps/api/core') return { invoke: forbid('invoke') };
        if (name === '@xterm/xterm') return { Terminal: forbid('Terminal') };
        if (name === '@xterm/addon-fit') return { FitAddon: forbid('FitAddon') };
        assert.ok(name.startsWith('.'), `Unexpected dependency: ${name}`);
        const dependency = resolve(dirname(path), name).slice(resolve('.').length + 1);
        const loaded = load(dependency);
        if (path === 'src/settings/agents/ClaudeTab' && name === './kit') return { ...loaded, ConfigFileCard: () => null };
        return loaded;
      },
    });
    return exports;
  }
  const { ClaudeTab } = load('src/settings/agents/ClaudeTab');
  const { DEFAULT_SETTINGS } = load('src/settings/types');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ClaudeTab, {
      settings: { ...DEFAULT_SETTINGS, claude_provider: 'custom', providers: { claude: { kind: 'anthropic_api', auth: 'api_key' } } },
      save: forbid('saveSettings'), reload: () => reloads.push('reload'),
    }));
  });
  const button = label => [...container.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label);
  const input = () => container.querySelector('input[aria-label="Anthropic API key"]');
  const action = async fn => { await act(async () => { await fn(); }); };
  return {
    container, button, input, saves, reloads, statuses, forbiddenCalls,
    async edit(value = `  ${FAKE_VALUE}  `) {
      await action(() => user.click(button(`Edit ${LABEL}`)));
      assert.equal(input().value, '', 'Editing starts with an empty field, not a retrieved value');
      await action(() => user.click(input()));
      if (value) await action(() => user.type(input(), value));
      assert.equal(document.activeElement, input());
    },
    async tab() { await action(() => user.tab()); },
    async enter() { await action(() => user.keyboard('{Enter}')); },
    async cancel() { await action(() => user.click(button('Cancel'))); },
    async settle() { await action(async () => { saves.at(-1).gate.resolve(provider); }); },
    async close() { await action(async () => { root.unmount(); }); container.remove(); },
  };
}

function assertIsolated(view) {
  assert.deepEqual(view.forbiddenCalls, []);
  assert.deepEqual(view.statuses, ['claude']);
}

test('editing a stored key places keyboard focus on Save after one Tab from a nonempty input', async () => {
  const view = await fixture();
  try {
    await view.edit();
    await view.tab();
    assert.equal(document.activeElement, view.button('Save'), 'One Tab from the key input must focus Save, not Cancel');
    assert.equal(view.saves.length, 0);
    assertIsolated(view);
  } finally { await view.close(); }
});

test('Tab then Enter saves the trimmed fake replacement rather than discarding the editor', async () => {
  const view = await fixture();
  try {
    await view.edit();
    await view.tab();
    await view.enter();
    assert.equal(view.saves.length, 1, 'Tab then Enter must save instead of activating Cancel');
    assert.equal(view.saves[0].value, FAKE_VALUE);
    await view.settle();
    assert.equal(view.input(), null);
    assert.deepEqual(view.reloads, ['reload']);
    assertIsolated(view);
  } finally { await view.close(); }
});

test('direct Enter in the input still submits exactly one trimmed fake replacement', async () => {
  const view = await fixture();
  try {
    await view.edit();
    await view.enter();
    assert.equal(view.saves.length, 1);
    assert.equal(view.saves[0].value, FAKE_VALUE);
    await view.settle();
    assert.equal(view.input(), null);
    assert.deepEqual(view.reloads, ['reload']);
    assertIsolated(view);
  } finally { await view.close(); }
});

test('explicit Cancel closes the dirty editor without saving or retrieving the stored value', async () => {
  const view = await fixture();
  try {
    await view.edit();
    await view.cancel();
    assert.equal(view.input(), null);
    assert.ok(view.button(`Edit ${LABEL}`));
    assert.equal(view.saves.length, 0);
    assert.deepEqual(view.reloads, []);
    assertIsolated(view);
  } finally { await view.close(); }
});

test('pending save disables input, Save and Cancel and cannot submit twice', async () => {
  const view = await fixture();
  try {
    await view.edit();
    await view.enter();
    assert.equal(view.saves.length, 1);
    assert.equal(view.input().disabled, true);
    assert.equal(view.button('Saving…').disabled, true);
    assert.equal(view.button('Cancel').disabled, true);
    await view.enter();
    await view.cancel();
    assert.equal(view.saves.length, 1);
    assert.ok(view.input());
    await view.settle();
    assert.equal(view.input(), null);
    assertIsolated(view);
  } finally { await view.close(); }
});

test('whitespace-only input cannot save and keyboard traversal skips its disabled Save action', async () => {
  const view = await fixture();
  try {
    await view.edit('   ');
    assert.equal(view.button('Save').disabled, true);
    await view.enter();
    assert.equal(view.saves.length, 0);
    await view.tab();
    assert.equal(document.activeElement, view.button('Cancel'));
    await view.enter();
    assert.equal(view.input(), null);
    assert.equal(view.saves.length, 0);
    assert.deepEqual(view.reloads, []);
    assertIsolated(view);
  } finally { await view.close(); }
});
