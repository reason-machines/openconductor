// Frozen qualification only: current production callbacks, synthetic IPC/timers.
// Original application source is not executed. The expected cancel behavior comes
// from retained X3a -> aD -> kos plus complete pos/default context closure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const root = process.cwd();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = ({ children }) => React.createElement('section', null, children);
const inert = () => null;
const edited = '  https://localhost:4321  ';
async function fixture() {
  const cache = new Map(), timers = new Map(), writes = [];
  let clock = 0, stored = [{ name: 'App', url: 'https://localhost:4000' }];
  const events = new EventTarget();
  const setTimeout = (fn, ms) => { const id = ++clock; timers.set(id, { fn, ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  const window = Object.assign(events, { setTimeout, clearTimeout });
  const snapshot = () => ({ prompts: {}, git: {}, previewUrls: stored === null ? null : { value: stored, layer: 'repo_local' }, env: { local: {}, cloud: {}, files: [] }, warnings: [] });
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    let source = fs.readFileSync(filename, 'utf8');
    // Import-host adapter only: expose the existing private component unchanged.
    if (filename === path.join(root, 'src/settings/rows/RepoMiscRows.tsx')) source += '\nexport { PreviewUrlsRow };\n';
    const js = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    function controlled(name) {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('.css')) return {};
      if (name === '@tauri-apps/api/core') return { isTauri: () => true, invoke: async (command, args) => {
        if (command === 'repo_settings_effective') return snapshot();
        assert.equal(command, 'repo_settings_set_local', 'no app/action/native/provider commands');
        assert.equal(args.repoPath, '/synthetic/preview-urls');
        assert.equal(args.key, 'preview_urls');
        writes.push(JSON.parse(JSON.stringify(args)));
        stored = args.value;
        return snapshot();
      } };
      if (name === '@base-ui/react/popover') return { Popover: {} };
      if (name.endsWith('/components/RepoIcon')) return { RepoIcon: inert };
      if (name.endsWith('/components/RepoIconDialog')) return { RepoIconPicker: inert };
      if (name.endsWith('/components/RemoveRepositoryDialog')) return { RemoveRepositoryDialog: inert };
      if (name.endsWith('/components/Icons')) return Object.fromEntries(['ArrowUpRightIcon','ChevronDownIcon','ChevronUpIcon','CircleAlertIcon','PlusIcon','RefreshCwIcon'].map(x => [x, inert]));
      if (name.endsWith('/features/openIn/OpenInButton')) return { OpenInButton: inert };
      if (name.endsWith('/GeneralPage')) return { Row: host };
      if (name.endsWith('/icons')) return { TrashIcon: inert };
      if (name.endsWith('/rootPath')) return {};
      if (name.endsWith('/backend')) return { openUrl: () => assert.fail('external URL must not open') };
      assert.ok(name.startsWith('.'), 'unexpected dependency ' + name);
      const base = path.resolve(path.dirname(filename), name);
      const target = [base, base + '.ts', base + '.tsx'].find(x => fs.existsSync(x));
      assert.ok(target, 'missing dependency ' + name);
      return load(target);
    }
    runInNewContext(js, { module, exports: module.exports, require: controlled, console, window, Event, EventTarget, setTimeout, clearTimeout });
    return module.exports;
  }
  const { PreviewUrlsRow } = load(path.join(root, 'src/settings/rows/RepoMiscRows.tsx'));
  let view;
  await act(async () => { view = create(React.createElement(PreviewUrlsRow, { repoPath: '/synthetic/preview-urls' })); });
  return {
    writes, timers,
    async edit() { await act(async () => view.root.findByProps({ 'aria-label': 'Preview URL' }).props.onChange({ target: { value: edited } })); },
    async tick() { const pending = [...timers.values()]; timers.clear(); await act(async () => { for (const timer of pending) timer.fn(); }); },
    async close() { await act(async () => view.unmount()); },
  };
}

test('unchanged row unmount does not invent a write', async () => {
  const view = await fixture(); await view.close(); assert.deepEqual(view.writes, []);
});

test('mounted row defers writes 500 ms and saves the trimmed URL once', async () => {
  const view = await fixture();
  await view.edit();
  assert.deepEqual(view.writes, []);
  assert.equal(view.timers.size, 1);
  assert.equal([...view.timers.values()][0].ms, 500);
  await view.tick();
  assert.deepEqual(view.writes.map(x => x.value), [[{ name: 'App', url: edited.trim() }]]);
  await view.close();
  assert.equal(view.writes.length, 1);
});

test('normal row unmount before 500 ms cancels the pending Preview URL write', async () => {
  const view = await fixture();
  await view.edit();
  assert.deepEqual(view.writes, []);
  await view.close();
  assert.equal(view.timers.size, 0, 'timer must be cancelled');
  assert.deepEqual(view.writes, [], 'original X3a/aD cancels, rather than flushing, before the debounce expires');
});
