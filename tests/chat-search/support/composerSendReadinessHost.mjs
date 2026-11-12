import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const deps = createRequire(resolve(repo, 'package.json'));
assert.ok(process.env.ONBOARDING_DOM_DEPS, 'Use the existing CI inert DOM dependency prefix');
const domDeps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, 'package.json'));
const { JSDOM } = domDeps('jsdom');
export const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'KeyboardEvent', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const React = deps('react');
const { createRoot } = deps('react-dom/client');
const { Simulate } = deps('react-dom/test-utils');
const { act } = React;
const ts = deps('typescript');
const noop = () => {};
const unsubscribe = () => noop;
const decorative = ({ children }) => children ?? null;
const empty = () => null;
export const normalize = value => JSON.parse(JSON.stringify(value));
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const file = (name, text) => {
  const data = new TextEncoder().encode(text);
  return { name, size: data.byteLength, arrayBuffer: async () => data.buffer };
};

export async function fixture({ working = false, canSteer = false, followUpMode = 'queued', keys = 'enter' } = {}) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const copies = [], writes = [], deliveries = [], forbidden = [], imports = [];
  let writePort = async () => {};
  let copyPort = async () => {};
  const draftStore = { load: async () => ({ message: '', attachments: [] }), save: async () => {}, clear: async () => {} };
  const queue = { status: working ? 'working' : 'idle', items: [], editingId: null, paused: false, next: 1 };
  const transcript = { messages: [{ id: 'existing-user', role: 'user', text: 'Existing chat', createdAt: '2026-11-01T00:00:00Z' }], turns: {}, activeTurn: working ? 'turn' : null };
  const snapshot = { transcript, queue, permissions: [] };
  const reject = (...args) => { forbidden.push(args); throw new Error(`Forbidden native/provider boundary ${String(args[0])}`); };
  const agents = Object.fromEntries(['claude', 'codex', 'reason'].map(id => [id, {
    id, label: id, canSteer, chatId: id => id, snapshot: () => snapshot, subscribe: unsubscribe,
    submit: (...args) => deliveries.push(normalize(args)), stop: reject, queueAction: reject,
  }]));
  const tabs = { tabs: [], activeId: null, findId: null, hidden: false };
  const settings = { models: { default: 'reason-fixture', default_fast_mode: false, default_plan_mode: false, claude_code: {}, codex: {} } };
  const mocks = {
    'src/backend': { inTauri: () => false, fuzzyFilterFiles: reject },
    'src/features/chat/reasonChat': { reasonAvailable: () => true, configureReasonDefault: noop, configureReason: noop, reasonChatConfig: async () => [] },
    'src/features/chat/chatRuntime': { chatStatuses: () => new Map(), subscribeChatStatuses: unsubscribe, hideChat: noop, showChat: noop },
    'src/features/chat/codexChat': { CODEX_ACCESS: {}, codexAccess: () => 'full' },
    'src/features/chat/slashCompletions': { useAgentCommands: () => undefined },
    'src/features/chat/PermissionRequests': { PermissionRequests: empty, pendingToolApproval: () => undefined },
    'src/features/chat/Transcript': { Transcript: empty },
    'src/features/chat/useLocalPlanMode': { useLocalPlanMode: () => undefined },
    'src/lib/local-storage': { composerDrafts: () => draftStore },
    'src/settings/api': { getSettings: async () => settings },
    'src/settings/appPrefs': { useAppPrefs: () => ({ garry_mode: false }) },
    'src/settings/useBoolPref': { useBoolPref: () => false },
    'src/settings/useFollowUpMode': { useFollowUpMode: () => followUpMode },
    'src/settings/agents/api': { listFavorites: async () => [] },
    'src/keybindings/KeybindingsProvider': { KeybindingScope: decorative, useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: noop },
    'src/components/ui/Tooltip': { Tooltip: decorative, ShortcutHint: empty },
    'src/components/motion/usePresence': { usePresence: open => ({ mounted: open, attrs: {} }) },
    'src/state/useAutoUnread': { useWindowFocused: () => false },
    'src/features/chat/useComposerMinimize': { useComposerMinimize: () => ({ minimized: false, animate: false, expand: noop, minimizeIfEmpty: noop }) },
    'src/features/terminal/session': { subscribeTabs: unsubscribe, getTabs: () => tabs, onCenterTabOpened: unsubscribe },
    'src/features/browser/store': { subscribeBrowser: unsubscribe, browserSnapshot: () => ({ pages: new Map() }) },
    'src/features/diff/useWorkspaceDiff': { useWorkspaceDiff: () => ({}) },
    'src/features/diff/ReviewComments': { useReviewComments: () => ({ hasPending: false }) },
    'src/workspace/useSetupWatch': { useCreateSetupRunning: () => false },
    'src/workspace/archive': {}, 'src/workspace/api': {}, 'src/workspace/link': {},
    'src/workspace/firstMessage': { renameAfterFirstMessage: reject },
    'src/features/chat/forkWorkspace': {}, 'src/home/createFirstWorkspace': {},
    'src/features/diff/reviewApi': {}, 'src/settings/repoSettings': {}, 'src/scripts/api': {},
    'src/features/pr/useArchiveOnMerge': { useArchiveOnMerge: () => noop },
    'src/features/pr/workspaceSync': { useWorkspacePrSync: () => noop },
    'src/features/pr/usePullRequest': { usePullRequest: () => ({}) },
    'src/features/pr/useTargetBranch': { useTargetBranch: () => ({}) },
    'src/features/pr/usePrActions': { usePrActions: () => ({}) },
    'src/features/pr/checks/useFixErrors': { useFixErrors: () => ({}) },
    'src/features/pr/usePullLatest': { usePullLatest: () => ({}) },
    'src/features/draft-attachments/api': { draftAttachmentsApi: {
      async write(args) { writes.push(normalize(args)); await writePort(args); },
      async uploadToWorkspace(args) { copies.push(normalize(args)); await copyPort(args); },
      remove: reject,
    } },
  };
  const modules = new Map();
  const actualTsx = new Set(['src/components/WorkspaceView', 'src/features/chat/Composer', 'src/features/chat/ComposerEditor']);
  function load(path) {
    const key = path.slice(repo.length + 1).replace(/\.(tsx?|css)$/, '');
    imports.push(key);
    if (key === 'src/features/chat/agents') return { ...load(resolve(repo, 'src/features/chat/agentChoice.ts')), CHAT_AGENTS: agents };
    if (mocks[key]) return mocks[key];
    if (path.endsWith('.css')) return {};
    if (path.endsWith('.tsx') && !actualTsx.has(key)) return new Proxy({}, { get: () => empty });
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    let source = readFileSync(path, 'utf8');
    if (key === 'src/components/WorkspaceView') source += '\nexport { ChatPanel as HostedChatPanel };\n';
    const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, {
      exports, console, localStorage: storage, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder,
      window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame,
      require(name) {
        if (name === '@tauri-apps/api/core') return { invoke: reject, isTauri: () => false };
        if (name === '@tauri-apps/api/event') return { listen: async () => noop };
        if (name.startsWith('@tauri-apps/')) throw new Error(`Unbound native package ${name}`);
        if (!name.startsWith('.')) return deps(name);
        const base = resolve(dirname(path), name);
        const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
        assert.ok(found, `Missing import ${name} from ${path}`);
        return load(found);
      },
    }, { filename: path });
    return exports;
  }
  const shortcut = load(resolve(repo, 'src/keybindings/registry.ts'));
  mocks['src/keybindings/overrides'] = { ...load(resolve(repo, 'src/keybindings/overrides.ts')), effectiveShortcuts: (id, overrides) => shortcut.SEND_KEY_PRESETS[keys][id] ?? [] };
  const { HostedChatPanel } = load(resolve(repo, 'src/components/WorkspaceView.tsx'));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const renderer = createRoot(container);
  const workspace = { id: 'send-readiness', primaryChatId: 'send-readiness', path: '/synthetic/worktree', status: 'ready', branch: 'main' };
  const repoData = { id: 'repo', path: '/synthetic/repo', defaultBranch: 'main', workspaces: [workspace] };
  await act(async () => renderer.render(React.createElement(HostedChatPanel, {
    repo: repoData, workspace, chatId: workspace.id, dispatch: noop, notify: noop, bridge: { current: null }, content: null,
    openTurnFile: reject, forkToNewTab: reject, chatTabs: [], onClearLocal: reject,
  })));
  const tick = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
  await tick();
  const editor = () => container.querySelector('[data-testid="composer-input"]');
  assert.ok(editor(), 'actual Tiptap contenteditable must mount, not a textarea substitute');
  return {
    container, deliveries, copies, writes, forbidden, imports, tick,
    setWrite(port) { writePort = port; }, setCopy(port) { copyPort = port; },
    async attach(picked) {
      await act(async () => { Simulate.change(container.querySelector('input[type=file]'), { target: { files: [picked], value: '' } }); });
      await tick();
    },
    async paste(text) {
      await act(async () => {
        const event = new window.Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: type => type === 'text/plain' ? text : '' } });
        editor().dispatchEvent(event);
      });
      await tick();
    },
    text() { return editor().textContent; },
    chips() { return [...container.querySelectorAll('.composer-attachment')].map(node => node.textContent.replace('×', '')); },
    alert() { return container.querySelector('[role=alert]')?.textContent ?? null; },
    async action(action) {
      await act(async () => {
        if (action === 'button') container.querySelector('[data-testid=composer-send-button]')?.click();
        else if (action === 'form') container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        else {
          const metaKey = keys === 'enter' ? action === 'opposite' : action === 'normal';
          const altKey = keys === 'cmd-enter' && action === 'opposite';
          const event = new window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', metaKey, altKey, bubbles: true, cancelable: true });
          editor().dispatchEvent(event);
          assert.equal(event.defaultPrevented, true, 'configured key must reach actual Editor→Composer handler');
        }
      });
      await tick();
    },
    async settle(gate, value) { await act(async () => gate.resolve(value)); await tick(); },
    async fail(gate) { await act(async () => gate.reject(new Error('controlled B failure'))); await tick(); },
    async close() { await act(async () => renderer.unmount()); container.remove(); assert.deepEqual(forbidden, []); },
  };
}
