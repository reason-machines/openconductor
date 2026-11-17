import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { after, test } from 'node:test';
import { runInNewContext } from 'node:vm';

const deps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS ?? '.', 'package.json'));
const { JSDOM } = deps('jsdom');
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

const FAKE_VALUE = 'fixture-only-not-a-key-1234';
const LABEL = 'Anthropic API key';
const MASK = '••••••••1234';

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function fixture({ present = true, clipboard = 'available' } = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const forbiddenCalls = [], revealRequests = [], writes = [], statuses = [];
  const forbid = name => () => {
    forbiddenCalls.push(name);
    throw new Error(`Unexpected native/provider action: ${name}`);
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard === 'missing' ? undefined : {
      async writeText(value) {
        assert.equal(value, FAKE_VALUE, 'The clipboard boundary only accepts the complete fake value, never a hint');
        writes.push(value);
        if (clipboard === 'denied') throw new Error('fixture clipboard denied');
      },
    },
  });
  const settingsApi = {
    async providerStatus(agent) {
      assert.equal(agent, 'claude');
      statuses.push(agent);
      return { agent, kind: 'anthropic_api', ready: present, secrets: [{ key: 'anthropic_api_key', present, hint: present ? '1234' : undefined }] };
    },
    revealProviderSecret(agent, key) {
      assert.equal(agent, 'claude');
      assert.equal(key, 'anthropic_api_key', 'The real caller must retain its current-provider key selection');
      const gate = deferred();
      revealRequests.push(gate);
      return gate.promise;
    },
    errorText: String,
    connectProvider: forbid('connectProvider'), disconnectProvider: forbid('disconnectProvider'),
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
      save: forbid('save'), reload: forbid('reload'),
    }));
  });
  const value = () => container.querySelector('[data-testid="secret-value"]');
  const button = name => [...container.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === name);
  return {
    container, value, button, revealRequests, writes, statuses, forbiddenCalls,
    text: () => container.textContent,
    async activateValue() {
      assert.ok(value(), 'The real API-key caller must render its stored value row');
      await act(async () => { value().click(); });
    },
    async show() { await act(async () => { button(`Reveal ${LABEL}`).click(); }); },
    async settle(value = FAKE_VALUE) { await act(async () => { revealRequests.at(-1).resolve(value); }); },
    async reject() { await act(async () => { revealRequests.at(-1).reject(new Error('fixture retrieval denied')); }); },
    async close() { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

function assertUntouched(view) {
  assert.deepEqual(view.forbiddenCalls, []);
  assert.deepEqual(view.statuses, ['claude'], 'Copying must not reconfigure or refresh the provider');
}

function assertMasked(view) {
  assert.equal(view.value().textContent, MASK);
  assert.doesNotMatch(view.text(), /fixture-only-not-a-key/);
  assert.equal(view.button(`Reveal ${LABEL}`).getAttribute('aria-pressed'), 'false');
}

test('stored-key mount shows only its hint without retrieving or copying the value', async () => {
  const view = await fixture();
  try {
    assertMasked(view);
    assert.equal(view.revealRequests.length, 0);
    assert.deepEqual(view.writes, []);
    assertUntouched(view);
  } finally { await view.close(); }
});

test('masked value activation lazily copies the whole fake value and remains masked', async () => {
  const view = await fixture();
  try {
    await view.activateValue();
    assert.equal(view.revealRequests.length, 1, 'Explicit masked-row activation must request the complete stored value');
    assertMasked(view);
    assert.deepEqual(view.writes, [], 'Do not copy before the requested value arrives');
    assert.equal(view.value().disabled, true);
    await view.activateValue();
    assert.equal(view.revealRequests.length, 1, 'A pending copy must not issue a second retrieval');
    await view.settle();
    assert.deepEqual(view.writes, [FAKE_VALUE]);
    assertMasked(view);
    assert.equal(view.value().tagName, 'BUTTON', 'The copy gesture must use a keyboard-activatable control');
    assert.equal(view.value().getAttribute('aria-label'), `Copy ${LABEL}`);
    assert.equal(view.value().disabled, false);
    assert.match(view.container.querySelector('[role="status"]').textContent, /Copied Anthropic API key\./);
    assertUntouched(view);
  } finally { await view.close(); }
});

test('revealed value activation copies the complete fake value without another retrieval', async () => {
  const view = await fixture();
  try {
    await view.show();
    assert.equal(view.revealRequests.length, 1);
    await view.settle();
    assert.equal(view.value().textContent, FAKE_VALUE);
    assert.deepEqual(view.writes, [], 'Show alone must not copy anything');
    await view.activateValue();
    assert.deepEqual(view.writes, [FAKE_VALUE], 'The revealed row must copy its complete value');
    assert.equal(view.revealRequests.length, 1);
    assert.equal(view.value().textContent, FAKE_VALUE);
    assertUntouched(view);
  } finally { await view.close(); }
});

test('unconfigured key has no value-copy gesture and never retrieves or writes a value', async () => {
  const view = await fixture({ present: false });
  try {
    assert.equal(view.value(), null);
    assert.ok(view.container.querySelector('input[type="password"]'));
    assert.equal(view.revealRequests.length, 0);
    assert.deepEqual(view.writes, []);
    assertUntouched(view);
  } finally { await view.close(); }
});

for (const outcome of ['rejected', 'empty']) {
  test(`${outcome} copy retrieval never writes the hint or reveals the row`, async () => {
    const view = await fixture();
    try {
      await view.activateValue();
      assert.equal(view.revealRequests.length, 1);
      if (outcome === 'rejected') await view.reject();
      else await view.settle('');
      assert.deepEqual(view.writes, []);
      assertMasked(view);
      assert.equal(view.value().disabled, false);
      assert.match(view.container.querySelector('[role="alert"]').textContent, /Failed to copy Anthropic API key\./);
      assert.equal(view.container.querySelector('[role="status"]'), null);
      assertUntouched(view);
    } finally { await view.close(); }
  });
}

for (const clipboard of ['denied', 'missing']) {
  test(`${clipboard} clipboard reports failure without success or revealing the key`, async () => {
    const view = await fixture({ clipboard });
    try {
      await view.activateValue();
      assert.equal(view.revealRequests.length, 1);
      await view.settle();
      assert.deepEqual(view.writes, clipboard === 'denied' ? [FAKE_VALUE] : []);
      assertMasked(view);
      assert.equal(view.value().disabled, false);
      assert.match(view.container.querySelector('[role="alert"]').textContent, /Failed to copy Anthropic API key\./);
      assert.equal(view.container.querySelector('[role="status"]'), null);
      assertUntouched(view);
    } finally { await view.close(); }
  });
}

test('Show then Hide never copies and drops the revealed fake value', async () => {
  const view = await fixture();
  try {
    await view.show();
    await view.settle();
    await act(async () => { view.button(`Hide ${LABEL}`).click(); });
    assertMasked(view);
    assert.equal(view.revealRequests.length, 1);
    assert.deepEqual(view.writes, []);
    assertUntouched(view);
  } finally { await view.close(); }
});
