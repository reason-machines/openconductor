const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve, dirname, join } = require('node:path');
const { runInNewContext } = require('node:vm');

const root = resolve(process.env.RESTART_IDLE_SOURCE_ROOT ?? process.cwd());
const dependencies = createRequire(join(root, 'package.json'));
const React = dependencies('react');
const { act, create } = dependencies('react-test-renderer');
const ts = dependencies('typescript');
const inert = () => null;

async function mount(options = {}) {
  const events = [];
  const notifications = [];
  const native = [];
  const timers = new Map();
  const listeners = new Set();
  let nextTimer = 0;
  let readiness = options.readiness ?? { kind: 'ready', sessionStatuses: [], workspaceStates: ['ready'], setupRunning: false };
  const settings = { general: { auto_restart_on_update_when_idle: options.enabled !== false } };
  const state = { repos: [], selection: { kind: 'root' }, sections: [] };
  const dispatch = () => assert.fail('Unexpected App state mutation');
  const show = (kind, message) => notifications.push({ kind, message });
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const window = Object.assign(new EventTarget(), {
    location: { pathname: '/', search: '' },
    history: { state: null, replaceState() {} },
    localStorage: storage,
  });
  const setTimer = (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; };
  const clearTimer = (id) => timers.delete(id);
  Object.assign(window, { setTimeout: setTimer, clearTimeout: clearTimer, setInterval: setTimer, clearInterval: clearTimer });
  const update = {
    version: 'fixture-2.0.0', body: 'Synthetic release notes',
    async download() { events.push('download'); },
    async install() { events.push('install'); },
    async close() { events.push('close'); },
  };
  const barrier = {
    async drain() { events.push('flush'); return {}; },
    isCurrent() { return true; },
  };
  const modules = new Map();
  const mocks = new Map([
    [resolve(root, 'src/features/updates/api.ts'), {
      async checkForUpdate() { events.push('check'); return update; },
      async restartApp() { events.push('restart'); },
    }],
    [resolve(root, 'src/features/updates/useIdleReadiness.ts'), {
      useIdleReadiness() {
        return { read: () => readiness, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
      },
    }],
    [resolve(root, 'src/lib/persistence/restartPersistence.ts'), { restartPersistence: () => barrier }],
  ]);
  const common = {
    inTauri: () => true,
    useAppStore: () => [state, dispatch, 'ready'],
    isSidebarVisible: () => false,
    useAppPrefs: () => ({}),
    useBoolPref: () => false,
    useBoolPrefState: () => false,
    useCustomSectionCollapse: () => [new Set(), inert],
    useNavHistory: () => ({ onBack: inert, onForward: inert }),
    useWorkspaceDeepLinks: inert,
    useAutoUnread: inert,
    useSidebarVisiblePref: inert,
    useSidebarWidth: () => ({ style: {}, resizer: null }),
    useSetupWatch: inert,
    useInitIssues: inert,
    useArchiveOnMergeWatcher: inert,
    useKeybindings: inert,
    useKeybindingOverrides: () => ({ overrides: {} }),
    useToasts: () => ({ toasts: [], show, dismiss: inert }),
    storedOrganization: () => null,
    resolveSettingsUrl: () => null,
    effectiveShortcuts: () => [],
    glyphs: () => '',
    getSettings: async () => settings,
    boolPref: (stored, key) => stored.general[key] === true,
    USER_PAGES: [], REPO_SECTIONS: [], PRIORITY: { DIALOG: 1 },
    invoke(name) { native.push(name); assert.fail(`Unexpected native command ${name}`); },
  };

  function local(from, specifier) {
    if (!specifier.startsWith('.')) return;
    const bare = resolve(dirname(from), specifier.replace(/\.tsx?$/, ''));
    return [bare + '.ts', bare + '.tsx', bare + '.cjs'].find((path) => mocks.has(path) || existsSync(path));
  }

  function evaluate(filename) {
    if (mocks.has(filename)) return mocks.get(filename);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const source = readFileSync(filename, 'utf8');
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const mocked = new Map();
    for (const statement of tree.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const target = local(filename, specifier);
      if (specifier === 'react' || target && (mocks.has(target) || target.startsWith(resolve(root, 'src/features/updates') + '/'))) continue;
      const names = {};
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) {
          if (item.isTypeOnly) continue;
          const name = item.propertyName?.text ?? item.name.text;
          names[name] = name in common ? common[name] : /^[A-Z]/.test(name) ? inert : () => assert.fail(`Unexpected dependency ${specifier}.${name}`);
        }
      }
      mocked.set(specifier, names);
    }
    const javascript = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true });
    runInNewContext(javascript, {
      exports, window, document, localStorage: storage, URLSearchParams, Event, Date, console,
      setTimeout: setTimer, clearTimeout: clearTimer, setInterval: setTimer, clearInterval: clearTimer,
      require(specifier) {
        if (specifier === 'react') return filename === resolve(root, 'src/App.tsx') ? { ...React, useEffect: inert } : React;
        if (specifier === 'react/jsx-runtime') return dependencies(specifier);
        const target = local(filename, specifier);
        if (target && (mocks.has(target) || target.startsWith(resolve(root, 'src/features/updates') + '/'))) return evaluate(target);
        const module = mocked.get(specifier);
        assert.ok(module, `Unexpected module ${specifier}`);
        return module;
      },
    });
    return exports;
  }

  const App = evaluate(resolve(root, 'src/App.tsx')).default;
  assert.equal(typeof App, 'function', 'Actual App loads without a missing-module failure');
  let renderer;
  await act(async () => { renderer = create(React.createElement(App)); });
  return {
    events, notifications, native,
    async observe(next) { await act(async () => { readiness = next; for (const fn of listeners) fn(); }); },
    async close() { await act(async () => { renderer.unmount(); }); assert.equal(timers.size, 0, 'owned updater timers released'); },
  };
}

module.exports = { mount };
