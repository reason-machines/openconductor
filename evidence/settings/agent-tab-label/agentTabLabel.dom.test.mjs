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

async function fixture(initial = 'reason', pageCount = 1) {
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
      URL: window.URL, URLSearchParams: window.URLSearchParams,
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
    return React.createElement(React.Fragment, null, ...Array.from({ length: pageCount }, (_, index) =>
      React.createElement('div', { key: index, 'data-testid': 'agents-page' }, React.createElement(AgentsPage, {}))));
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
    pages: () => [...container.querySelectorAll('[data-testid="agents-page"]')],
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

function assertLinked(view, id, focused = false) {
  assertActive(view, id, focused);
  const labelledBy = view.panel().getAttribute('aria-labelledby');
  assert.ok(labelledBy, 'The active panel must reference its selected tab');
  assert.equal(labelledBy, view.tab(id).id);
  assert.equal(document.getElementById(labelledBy), view.tab(id));
  assert.equal(view.tab(id).getAttribute('aria-selected'), 'true');
}

test('provider tabs have nonempty distinct DOM IDs', async () => {
  const view = await fixture();
  try {
    const ids = view.tabs().map(node => node.id);
    assert.ok(ids.every(id => id.length > 0 && !/\s/.test(id)), 'Every tab has one nonempty DOM ID');
    assert.equal(new Set(ids).size, IDS.length);
  } finally { await view.close(); }
});

test('the active Claude panel is labelled by its selected tab', async () => {
  const view = await fixture('claude');
  try { assertLinked(view, 'claude'); }
  finally { await view.close(); }
});

test('click selection updates the panel label without changing tab IDs', async () => {
  const view = await fixture('claude');
  try {
    const ids = view.tabs().map(node => node.id);
    await view.click('codex');
    assertLinked(view, 'codex');
    assert.deepEqual(view.tabs().map(node => node.id), ids);
  } finally { await view.close(); }
});

test('keyboard selection updates the panel label without changing tab IDs', async () => {
  const view = await fixture('claude');
  try {
    const ids = view.tabs().map(node => node.id);
    const event = await view.press('claude', 'ArrowRight');
    assertLinked(view, 'codex', true);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(view.tabs().map(node => node.id), ids);
    assert.deepEqual(view.tabs().map(node => node.tabIndex), [-1, -1, 0]);
  } finally { await view.close(); }
});

test('external route selection updates the panel label and preserves tab IDs', async () => {
  const view = await fixture('reason');
  try {
    const ids = view.tabs().map(node => node.id);
    await view.route('claude');
    assertLinked(view, 'claude');
    assert.deepEqual(view.tabs().map(node => node.id), ids);
    assert.deepEqual(view.tabs().map(node => node.tabIndex), [-1, 0, -1]);
  } finally { await view.close(); }
});

test('separate mounted Agents pages have disjoint tab IDs and their own panel labels', async () => {
  const view = await fixture('claude', 2);
  try {
    const ids = view.tabs().map(node => node.id);
    assert.ok(ids.every(id => id.length > 0), 'Every mounted tab has a DOM ID');
    assert.equal(new Set(ids).size, IDS.length * 2);
    assert.equal(view.pages().length, 2);
    for (const page of view.pages()) {
      const selected = page.querySelector('[role="tab"][aria-selected="true"]');
      const panel = page.querySelector('[role="tabpanel"]');
      const labelledBy = panel.getAttribute('aria-labelledby');
      assert.ok(labelledBy, 'Each panel references its own selected tab');
      assert.equal(selected.textContent, 'Claude Code');
      assert.equal(panel.getAttribute('aria-label'), 'Claude Code');
      assert.equal(document.getElementById(labelledBy), selected);
    }
  } finally { await view.close(); }
});

test('existing panel labels and URL fields survive each route selection', async () => {
  const view = await fixture();
  try {
    for (const id of IDS) {
      await view.route(id);
      assertActive(view, id);
      assert.deepEqual(view.tabs().map(node => node.tabIndex), IDS.map(value => value === id ? 0 : -1));
    }
  } finally { await view.close(); }
});

test('K1 focus activation and modified-key ownership remain unchanged', async () => {
  const view = await fixture();
  try {
    const modified = await view.press('reason', 'ArrowRight', { shiftKey: true });
    assertActive(view, 'reason', true);
    assert.equal(modified.defaultPrevented, false);
    assert.deepEqual(view.calls.bubbled, ['ArrowRight']);
    const end = await view.press('reason', 'End');
    assertActive(view, 'codex', true);
    assert.equal(end.defaultPrevented, true);
    assert.deepEqual(view.tabs().map(node => node.tabIndex), [-1, -1, 0]);
    assert.deepEqual(view.calls.bubbled, ['ArrowRight']);
    assert.deepEqual(view.calls.shortcuts, []);
  } finally { await view.close(); }
});
