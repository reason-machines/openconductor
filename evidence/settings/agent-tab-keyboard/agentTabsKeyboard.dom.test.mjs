import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { after, test } from 'node:test';
import { runInNewContext } from 'node:vm';

const deps = createRequire(resolve('package.json'));
assert.ok(process.env.ONBOARDING_DOM_DEPS, 'Use the admitted isolated jsdom prefix');
const domDeps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, 'package.json'));
const { JSDOM } = domDeps('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'Event', 'MouseEvent', 'KeyboardEvent', 'PopStateEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = deps('react');
const { act } = React;
const { createRoot } = deps('react-dom/client');
const ts = deps('typescript');
const sourceRoot = resolve(process.env.AGENT_TABS_SOURCE_ROOT ?? '.');
after(() => dom.window.close());

const IDS = ['reason', 'claude', 'codex'];
const LABELS = ['Reason', 'Claude Code', 'Codex'];

async function fixture(initial = 'reason') {
  const originalUrl = window.location.href;
  const originalState = window.history.state;
  window.history.replaceState({ fixture: 'provider-free' }, '', `/settings?keep=fixture&providerTab=${initial}#retained`);
  const container = document.createElement('div');
  document.body.append(container);
  const calls = { forbidden: [], bubbled: [], shortcuts: [] };
  const forbid = name => () => { calls.forbidden.push(name); throw new Error(`Unexpected external action: ${name}`); };
  const inert = () => null;
  const provider = label => () => React.createElement('p', { 'data-testid': 'provider-leaf' }, label);
  const boundaries = new Map([
    ['src/components/Icons', { CopyIcon: inert }],
    ['src/components/Toast', { Toaster: inert, useToasts: () => ({ toasts: [], dismiss() {}, show: forbid('toast') }) }],
    ['src/features/openIn/OpenInButton', { AppIcon: inert }],
    ['src/features/openIn/apps', { loadOpenInApps: async () => [], defaultAppId: () => null, openInApp: forbid('openInApp') }],
    ['src/settings/appPrefs', { useAppPrefs: () => ({ default_open_in: null }), recordOpenIn: forbid('recordOpenIn') }],
    ['src/settings/api', { settingsFilePath: async () => null }],
    ['src/settings/agents/ClaudeTab', { ClaudeTab: provider('Claude Code') }],
    ['src/settings/agents/CodexTab', { CodexTab: provider('Codex') }],
    ['src/settings/agents/ReasonTab', { ReasonTab: provider('Reason') }],
    ['src/settings/agents/icons', { AgentMark: inert, ReasonMark: inert, CheckIcon: inert, ChevronDownIcon: inert, ExternalIcon: inert, EyeIcon: inert, PencilIcon: inert, TrashIcon: inert }],
    ['src/settings/agents/parts', {}],
    ['src/settings/rows/AgentOptionRows', {}],
    ['src/backend', { openUrl: forbid('openUrl') }],
  ]);
  const modules = new Map();
  function load(modulePath) {
    if (boundaries.has(modulePath)) return boundaries.get(modulePath);
    if (modules.has(modulePath)) return modules.get(modulePath);
    const fileName = `${modulePath}.${existsSync(resolve(sourceRoot, `${modulePath}.tsx`)) ? 'tsx' : 'ts'}`;
    const compiled = ts.transpileModule(readFileSync(resolve(sourceRoot, fileName), 'utf8'), {
      fileName,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    assert.deepEqual(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), [], `Production module must transpile: ${fileName}`);
    const exports = {};
    modules.set(modulePath, exports);
    runInNewContext(compiled.outputText, {
      exports, console, window, document, navigator, HTMLElement, Element, Node, Event, KeyboardEvent,
      setTimeout, clearTimeout, queueMicrotask,
      require(name) {
        if (name === 'react' || name === 'react/jsx-runtime') return deps(name);
        if (name.endsWith('.css')) return {};
        if (name === '@tauri-apps/api/core') return { invoke: forbid('invoke'), isTauri: () => false };
        assert.ok(name.startsWith('.'), `Unexpected dependency: ${name}`);
        return load(relative(sourceRoot, resolve(dirname(resolve(sourceRoot, fileName)), name)).replace(/\.tsx?$/, ''));
      },
    });
    return exports;
  }
  const { AgentsPage } = load('src/settings/AgentsPage');
  const { KeybindingsProvider, useKeybindings } = load('src/keybindings/KeybindingsProvider');
  function SettingsHost() {
    useKeybindings({
      'settings.close': () => { calls.shortcuts.push('settings.close'); },
      'nav.back': () => { calls.shortcuts.push('nav.back'); },
      'nav.forward': () => { calls.shortcuts.push('nav.forward'); },
    });
    return React.createElement(AgentsPage, {});
  }
  const onDocumentKeyDown = event => calls.bubbled.push(event.key);
  document.addEventListener('keydown', onDocumentKeyDown);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(KeybindingsProvider, null, React.createElement(SettingsHost))); });
  const tabs = () => [...container.querySelectorAll('[role="tab"]')];
  const tab = id => tabs()[IDS.indexOf(id)];
  const selected = () => tabs().filter(node => node.getAttribute('aria-selected') === 'true').map(node => node.textContent);
  return {
    calls, tabs, tab, selected,
    panel: () => container.querySelector('[role="tabpanel"]'),
    async focus(id) { await act(async () => { tab(id).focus(); }); },
    async press(id, key, modifiers = {}) {
      await act(async () => { tab(id).focus(); });
      const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      await act(async () => { tab(id).dispatchEvent(event); });
      return event;
    },
    async click(id) { await act(async () => { tab(id).click(); }); },
    async route(id) {
      await act(async () => {
        const url = new URL(window.location.href);
        url.searchParams.set('providerTab', id);
        window.history.replaceState(window.history.state, '', url);
        window.dispatchEvent(new window.PopStateEvent('popstate'));
      });
    },
    async close() {
      await act(async () => { root.unmount(); });
      document.removeEventListener('keydown', onDocumentKeyDown);
      container.remove();
      window.history.replaceState(originalState, '', originalUrl);
      assert.deepEqual(calls.forbidden, [], 'No provider, backend, clipboard, or external launch may run');
    },
  };
}

function assertActive(view, id, focused = false) {
  const index = IDS.indexOf(id);
  assert.deepEqual(view.selected(), [LABELS[index]]);
  assert.equal(view.panel().getAttribute('aria-label'), LABELS[index]);
  assert.equal(view.panel().textContent, LABELS[index]);
  assert.equal(new URL(window.location.href).searchParams.get('providerTab'), id);
  assert.equal(new URL(window.location.href).searchParams.get('keep'), 'fixture');
  assert.equal(window.location.hash, '#retained');
  assert.deepEqual(window.history.state, { fixture: 'provider-free' });
  if (focused) assert.equal(document.activeElement, view.tab(id));
}

for (const id of IDS) {
  test(`only the selected ${id} tab participates in Tab order`, async () => {
    const view = await fixture(id);
    try {
      assertActive(view, id);
      assert.deepEqual(view.tabs().map(node => node.tabIndex), IDS.map(value => value === id ? 0 : -1));
    } finally { await view.close(); }
  });
}

for (const [from, key, to] of [
  ['reason', 'ArrowRight', 'claude'],
  ['codex', 'ArrowLeft', 'claude'],
  ['codex', 'ArrowRight', 'reason'],
  ['reason', 'ArrowLeft', 'codex'],
  ['codex', 'Home', 'reason'],
  ['reason', 'End', 'codex'],
]) {
  test(`${key} moves focus and automatically activates ${to} from ${from}`, async () => {
    const view = await fixture(from);
    try {
      const event = await view.press(from, key);
      assertActive(view, to, true);
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(view.calls.bubbled, []);
      assert.deepEqual(view.calls.shortcuts, []);
      assert.deepEqual(view.tabs().map(node => node.tabIndex), IDS.map(value => value === to ? 0 : -1));
    } finally { await view.close(); }
  });
}

test('focusing another tab activates its panel and route', async () => {
  const view = await fixture();
  try { await view.focus('codex'); assertActive(view, 'codex', true); }
  finally { await view.close(); }
});

test('clicking another tab still activates its panel and route', async () => {
  const view = await fixture();
  try { await view.click('claude'); assertActive(view, 'claude'); }
  finally { await view.close(); }
});

for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
  test(`${modifier} leaves tab navigation to its existing owner`, async () => {
    const view = await fixture();
    try {
      const event = await view.press('reason', 'ArrowRight', { [modifier]: true });
      assertActive(view, 'reason', true);
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(view.calls.bubbled, ['ArrowRight']);
    } finally { await view.close(); }
  });
}

for (const key of ['ArrowUp', 'ArrowDown', 'Tab']) {
  test(`${key} is not consumed by the horizontal tab row`, async () => {
    const view = await fixture();
    try {
      const event = await view.press('reason', key);
      assertActive(view, 'reason', true);
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(view.calls.bubbled, [key]);
    } finally { await view.close(); }
  });
}

test('Escape still reaches settings.close through the real global dispatcher', async () => {
  const view = await fixture();
  try {
    const event = await view.press('reason', 'Escape');
    assertActive(view, 'reason', true);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(view.calls.shortcuts, ['settings.close']);
  } finally { await view.close(); }
});

for (const [id, key] of [['reason', 'Home'], ['codex', 'End']]) {
  test(`${key} at the ${id} boundary preserves focus without consuming the event`, async () => {
    const view = await fixture(id);
    try {
      const event = await view.press(id, key);
      assertActive(view, id, true);
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(view.calls.bubbled, [key]);
    } finally { await view.close(); }
  });
}

test('a route change updates the sole tab stop without stealing focus from elsewhere', async () => {
  const view = await fixture();
  const outside = document.createElement('button');
  document.body.append(outside);
  try {
    outside.focus();
    await view.route('codex');
    assertActive(view, 'codex');
    assert.equal(document.activeElement, outside);
    assert.deepEqual(view.tabs().map(node => node.tabIndex), [-1, -1, 0]);
  } finally { outside.remove(); await view.close(); }
});
