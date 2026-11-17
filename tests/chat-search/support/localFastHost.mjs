import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const deps = createRequire(resolve(repo, 'package.json'));
assert.ok(process.env.ONBOARDING_DOM_DEPS, 'Use the existing hosted inert DOM dependency prefix');
const domDeps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, 'package.json'));
const { JSDOM } = domDeps('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'KeyboardEvent', 'Event', 'CustomEvent', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const React = deps('react');
const { createRoot } = deps('react-dom/client');
const { act } = React;
const ts = deps('typescript');
const noop = () => {};
const unsubscribe = () => noop;
const decorative = ({ children }) => children ?? null;
const empty = () => null;
export const normalize = value => JSON.parse(JSON.stringify(value));

export async function fixture({ agent, model, effort = 'high', fast = false, reportedFast = false }) {
  const values = new Map();
  const writes = [], deliveries = [], forbidden = [], imports = [];
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); writes.push({ key, value }); },
    removeItem: key => values.delete(key),
  };
  const reject = (...args) => { forbidden.push(args); throw new Error(`Forbidden native/provider boundary ${String(args[0])}`); };
  const snapshot = {
    transcript: { messages: [{ id: 'existing-user', role: 'user', text: 'Existing chat', createdAt: '2026-11-01T00:00:00Z' }], turns: {}, activeTurn: null },
    queue: { status: 'idle', items: [], editingId: null, paused: false, next: 1 },
    permissions: [], approvals: [], consents: [],
  };
  const agents = Object.fromEntries(['claude', 'codex', 'reason'].map(id => [id, {
    id, label: id, canSteer: false, chatId: chatId => chatId,
    snapshot: () => snapshot, subscribe: unsubscribe,
    submit: (...args) => deliveries.push(normalize(args)), stop: reject, queueAction: reject,
  }]));
  const draftStore = { load: async () => ({ message: '', attachments: [] }), save: async () => {}, clear: async () => {} };
  const tabs = { tabs: [], activeId: null, findId: null, hidden: false };
  let settings;
  const mocks = {
    'src/backend': { inTauri: () => false, fuzzyFilterFiles: reject },
    'src/features/chat/reasonChat': {
      reasonAvailable: () => true, configureReasonDefault: noop, configureReason: noop,
      reasonChatConfig: async () => [], reasonModels: async () => [], pickReasonModel: reject,
      RUNNING_MODEL_EVENT: 'openconductor:reason-running-model',
    },
    'src/features/chat/chatRuntime': { chatStatuses: () => new Map(), subscribeChatStatuses: unsubscribe, hideChat: noop, showChat: noop },
    'src/features/chat/codexChat': { CODEX_ACCESS: {}, codexAccess: () => 'full' },
    'src/features/chat/slashCompletions': { useAgentCommands: () => reportedFast ? { slashCommands: [{ name: 'fast', description: 'Reported local command' }], skills: [] } : undefined },
    'src/features/chat/PermissionRequests': { PermissionRequests: empty, pendingToolApproval: () => undefined },
    'src/features/chat/Transcript': { Transcript: empty },
    'src/features/chat/useLocalPlanMode': { useLocalPlanMode: () => undefined },
    'src/lib/local-storage': { composerDrafts: () => draftStore },
    'src/settings/api': { getSettings: async () => settings },
    'src/settings/appPrefs': { useAppPrefs: () => ({ garry_mode: false }) },
    'src/settings/useBoolPref': { useBoolPref: () => false },
    'src/settings/useFollowUpMode': { useFollowUpMode: () => 'queued' },
    'src/settings/agents/api': { listFavorites: async () => [], FAVORITES_CHANGED_EVENT: 'openconductor:favorite-models-changed' },
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
    'src/features/draft-attachments/api': { draftAttachmentsApi: { write: reject, uploadToWorkspace: reject, remove: reject } },
  };
  const modules = new Map();
  const actualTsx = new Set([
    'src/components/WorkspaceView', 'src/features/chat/Composer', 'src/features/chat/ComposerEditor',
    'src/features/chat/ChatModelPicker', 'src/features/chat/ModelPicker',
  ]);
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
      window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
      HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
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
  const { DEFAULT_SETTINGS } = load(resolve(repo, 'src/settings/types.ts'));
  settings = normalize(DEFAULT_SETTINGS);
  settings.models.default_fast_mode = false;
  const shortcuts = load(resolve(repo, 'src/keybindings/registry.ts'));
  mocks['src/keybindings/overrides'] = { ...load(resolve(repo, 'src/keybindings/overrides.ts')), effectiveShortcuts: id => shortcuts.SEND_KEY_PRESETS.enter[id] ?? [] };
  const { saveAgent } = load(resolve(repo, 'src/features/chat/agentChoice.ts'));
  const { saveModelChoice, loadModelChoice } = load(resolve(repo, 'src/features/chat/chatModelChoice.ts'));
  const chatId = 'local-fast-mode';
  saveAgent(chatId, agent, storage);
  saveModelChoice(chatId, { agent, model, effort, fast }, storage);
  const choiceKey = writes.at(-1).key;
  const { HostedChatPanel } = load(resolve(repo, 'src/components/WorkspaceView.tsx'));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const renderer = createRoot(container);
  const workspace = { id: chatId, primaryChatId: chatId, path: '/synthetic/worktree', status: 'ready', branch: 'main' };
  const repoData = { id: 'repo', path: '/synthetic/repo', defaultBranch: 'main', workspaces: [workspace] };
  const tick = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
  const editor = () => container.querySelector('[data-testid="composer-input"]');
  const dispose = async () => {
    try { await act(async () => renderer.unmount()); }
    finally { container.remove(); }
  };
  try {
    await act(async () => renderer.render(React.createElement(HostedChatPanel, {
      repo: repoData, workspace, chatId, dispatch: noop, notify: noop, bridge: { current: null }, content: null,
      openTurnFile: reject, forkToNewTab: reject, chatTabs: [], onClearLocal: reject,
    })));
    await tick();
    assert.ok(editor(), 'actual Tiptap editor must mount');
    assert.ok(container.querySelector('[data-testid="composer-model-button"]'), 'actual chat model picker must mount');
    for (const key of actualTsx) assert.ok(imports.includes(key), `Actual module not reached: ${key}`);
  } catch (error) {
    try { await dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Local Fast fixture setup and cleanup failed'); }
    throw error;
  }
  writes.length = 0;
  return {
    container, deliveries, forbidden, tick,
    choice: () => normalize(loadModelChoice(chatId, storage)),
    choiceWrites: () => writes.filter(write => write.key === choiceKey),
    text: () => editor().textContent,
    alert: () => container.querySelector('[role="alert"]')?.textContent ?? null,
    fastRow: () => [...container.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent.trim().startsWith('Fast')) ?? null,
    async openPicker() {
      await act(async () => container.querySelector('[data-testid="composer-model-button"]').click());
      await tick();
      assert.equal(container.querySelector('[data-testid="composer-model-button"]').getAttribute('aria-expanded'), 'true');
    },
    async clickFast() {
      const row = this.fastRow();
      assert.ok(row, 'actual picker must expose the Fast row');
      await act(async () => row.click());
      await tick();
    },
    async command() {
      await act(async () => editor().focus());
      await tick();
      assert.equal(document.activeElement, editor(), 'the real contenteditable must own focus');
      await act(async () => {
        const paste = new window.Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(paste, 'clipboardData', { value: { files: [], getData: type => type === 'text/plain' ? '/fast ' : '' } });
        editor().dispatchEvent(paste);
      });
      await tick();
      assert.equal(editor().textContent, '/fast ');
      await act(async () => {
        const event = new window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
        editor().dispatchEvent(event);
        assert.equal(event.defaultPrevented, true, 'Enter must reach actual Editor/Composer handlers');
      });
      await tick();
    },
    async close() {
      await dispose();
      assert.deepEqual(forbidden, [], 'no native/provider/storage IPC may be invoked');
    },
  };
}
