import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { after, test } from 'node:test';
import { runInNewContext } from 'node:vm';

const deps = createRequire(resolve('package.json'));
assert.ok(process.env.ONBOARDING_DOM_DEPS, 'Use the existing CI inert DOM dependency prefix');
const domDeps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, 'package.json'));
const { JSDOM } = domDeps('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'MutationObserver', 'MouseEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = deps('react');
const { act } = React;
const { createRoot } = deps('react-dom/client');
const ts = deps('typescript');
after(() => dom.window.close());

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const container = document.createElement('div');
  document.body.append(container);
  const forbiddenCalls = [];
  const forbid = name => () => {
    forbiddenCalls.push(name);
    throw new Error(`Unexpected native/provider action: ${name}`);
  };
  const providerRequests = [], loginRequests = [];
  const request = queue => agent => {
    assert.equal(agent, 'codex');
    const gate = deferred();
    queue.push(gate);
    return gate.promise;
  };
  const settingsApi = {
    providerStatus: request(providerRequests), errorText: String,
    connectProvider: forbid('connectProvider'), disconnectProvider: forbid('disconnectProvider'),
    revealProviderSecret: forbid('revealProviderSecret'),
  };
  const agentApi = { cliLoginStatus: request(loginRequests), homeDir: forbid('homeDir') };
  const backend = { inTauri: () => false, openUrl: forbid('openUrl') };
  const modules = new Map();
  const boundaries = new Map([
    ['src/settings/api', settingsApi],
    ['src/settings/agents/api', agentApi],
    ['src/backend', backend],
    ['src/settings/GeneralPage', { Row: () => null }],
    ['src/settings/rows/AgentOptionRows', { ChromeModeRow: () => null, ExecutablePathRow: () => null }],
    ['src/settings/appearance', { SETTINGS_CHANGED: 'inert-settings-changed' }],
    ['src/settings/useSettings', { rememberSettings: forbid('rememberSettings') }],
    ['src/settings/appPrefs', {}],
    ['src/components/Icons', {}],
    ['src/components/ReasonMark', { ReasonMark: () => null }],
    ['src/components/Toast', {}],
    ['src/features/openIn/OpenInButton', {}],
    ['src/features/openIn/apps', {}],
    ['src/features/terminal/pty', Object.fromEntries(['onPtyEvent', 'ptySpawn', 'ptyWrite', 'ptyResize', 'ptyAckBytes', 'ptyKill'].map(name => [name, forbid(name)]))],
  ]);
  function load(path) {
    if (boundaries.has(path)) return boundaries.get(path);
    if (modules.has(path)) return modules.get(path);
    const fileName = ['src/settings/agents/ClaudeTab', 'src/settings/agents/CodexTab', 'src/settings/agents/kit', 'src/settings/agents/parts', 'src/settings/agents/icons'].includes(path) ? `${path}.tsx` : `${path}.ts`;
    const source = readFileSync(fileName, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    assert.deepEqual(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), [], `The production module must transpile: ${fileName}`);
    const exports = {};
    modules.set(path, exports);
    runInNewContext(compiled.outputText, {
      exports, console, window, document,
      require(name) {
        if (name === 'react' || name === 'react/jsx-runtime') return deps(name);
        if (name.endsWith('.css')) return {};
        if (name === '@tauri-apps/api/core') return { invoke: forbid('invoke') };
        if (name === '@xterm/xterm') return { Terminal: forbid('Terminal') };
        if (name === '@xterm/addon-fit') return { FitAddon: forbid('FitAddon') };
        assert.ok(name.startsWith('.'), `Unexpected dependency: ${name}`);
        const dependency = resolve(dirname(path), name).slice(resolve('.').length + 1);
        const loaded = load(dependency);
        if (['src/settings/agents/ClaudeTab', 'src/settings/agents/CodexTab'].includes(path) && name === './kit') {
          return { ...loaded, ConfigFileCard: () => null };
        }
        return loaded;
      },
    });
    return exports;
  }
  const { CodexTab } = load('src/settings/agents/CodexTab');
  const { DEFAULT_SETTINGS } = load('src/settings/types');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(CodexTab, {
      settings: { ...DEFAULT_SETTINGS, codex_provider: 'default', providers: { codex: { kind: 'codex_login' } } },
      save: forbid('save'), reload: forbid('reload'),
    }));
  });
  const provider = {
    agent: 'codex', kind: 'codex_login', ready: true, label: 'Codex Code CLI', detail: null,
    secrets: [],
  };
  const login = authenticated => ({ installed: true, authenticated, method: 'ChatGPT login', version: 'fixture-version' });
  const refresh = () => [...container.querySelectorAll('button')].find(button => button.textContent.trim() === 'Refresh');
  const view = {
    text: () => container.textContent,
    refresh,
    forbiddenCalls,
    requests: () => [providerRequests.length, loginRequests.length],
    async settle(index, authenticated = false) {
      await act(async () => {
        providerRequests[index].resolve(provider);
        loginRequests[index].resolve(login(authenticated));
      });
    },
    async settleProvider(index) { await act(async () => { providerRequests[index].resolve(provider); }); },
    async clickRefresh() {
      assert.ok(refresh());
      assert.equal(refresh().disabled, false);
      await act(async () => { refresh().click(); });
    },
    async close() { await act(async () => { root.unmount(); }); container.remove(); },
  };
  assert.deepEqual(view.requests(), [1, 1], 'Mount must fetch both inert statuses through the production hook');
  return view;
}

function assertIdle(view, authenticated = false) {
  assert.match(view.text(), authenticated ? /Connected/ : /CLI not authenticated/);
  assert.doesNotMatch(view.text(), /Checking login status/);
  assert.match(view.text(), /Run codex login/);
  assert.equal(view.refresh().disabled, false);
  assert.deepEqual(view.forbiddenCalls, []);
}

test('Codex initial pending status displays Checking before any provider record arrives', async () => {
  const view = await fixture();
  try {
    assert.match(view.text(), /Checking login status\.\.\./);
    assert.equal(view.refresh().disabled, true);
    assert.deepEqual(view.forbiddenCalls, []);
  } finally { await view.close(); }
});

test('Codex settled signed-out status retains login action and enabled Refresh', async () => {
  const view = await fixture();
  try {
    await view.settle(0);
    assertIdle(view);
  } finally { await view.close(); }
});

for (const partial of [false, true]) {
  test(`Codex signed-out Refresh displays Checking while ${partial ? 'CLI status alone remains' : 'both status responses remain'} pending`, async () => {
    const view = await fixture();
    try {
      await view.settle(0);
      assertIdle(view);
      await view.clickRefresh();
      assert.deepEqual(view.requests(), [2, 2]);
      if (partial) await view.settleProvider(1);
      assert.equal(view.refresh().disabled, true, 'The real Refresh callback must start a pending request');
      assert.match(view.text(), /Checking login status\.\.\./, 'A retained provider record must not hide the signed-out checking state');
      assert.doesNotMatch(view.text(), /CLI not authenticated/);
      assert.deepEqual(view.forbiddenCalls, []);
      await view.settle(1);
      assertIdle(view);
    } finally { await view.close(); }
  });
}

test('Codex authenticated Refresh preserves Connected and settles without launching login', async () => {
  const view = await fixture();
  try {
    await view.settle(0, true);
    assertIdle(view, true);
    await view.clickRefresh();
    assert.deepEqual(view.requests(), [2, 2]);
    assert.equal(view.refresh().disabled, true);
    assert.match(view.text(), /Connected/);
    assert.doesNotMatch(view.text(), /Checking login status/);
    assert.deepEqual(view.forbiddenCalls, []);
    await view.settle(1, true);
    assertIdle(view, true);
  } finally { await view.close(); }
});
