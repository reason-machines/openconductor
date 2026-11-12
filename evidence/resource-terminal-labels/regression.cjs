const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const deps = createRequire(path.resolve(process.env.RESOURCE_LABEL_DEPS || '.', 'package.json'));
const React = deps('react');
const { create, act } = deps('react-test-renderer');
const ts = deps('typescript');

function fixture({ enabled = true, desktop = true } = {}) {
  const modules = new Map();
  const polls = [];
  const shells = new Map();
  const saved = new Map();
  const timers = [];
  let sequence = 0;
  const noOp = () => {};
  const unexpected = () => { throw new Error('Fixture must not execute native APIs, browser, PTYs, or process collection'); };
  const document = { createElement: () => ({}), documentElement: {}, body: {}, addEventListener: noOp, removeEventListener: noOp };
  const window = { addEventListener: noOp, removeEventListener: noOp, setInterval: f => { timers.push(f); return timers.length; }, clearInterval: noOp, innerWidth: 1200 };
  function sample(labels) {
    const terminals = [...shells];
    if (process.env.RESOURCE_LABEL_SAMPLER) {
      const result = spawnSync(process.env.RESOURCE_LABEL_SAMPLER, { input: JSON.stringify({ labels, terminals }), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    }
    return { totalCpuPercent: 0, totalMemoryKb: 2048 + 1024 * terminals.length, processes: [
      { pid: 500, ppid: 1, label: 'OpenConductor', command: 'OpenConductor', memoryKb: 2048, cpuPercent: 0 },
      ...terminals.map(([id, pid]) => ({ pid, ppid: 500, label: labels[id] ?? 'zsh', command: '/bin/zsh', memoryKb: 1024, cpuPercent: 0, terminalId: id })),
    ] };
  }
  const boundaries = {
    '@xterm/xterm': { Terminal: class { constructor(options) { this.options = options; this.cols = 80; this.rows = 24; this.unicode = { activeVersion: '6' }; } loadAddon() {} resize() {} write() {} dispose() {} attachCustomKeyEventHandler() {} onData() {} onResize() {} } },
    '@xterm/addon-fit': { FitAddon: class {} },
    '@xterm/addon-unicode11': { Unicode11Addon: class {} },
    'src/features/terminal/events': { AckBatcher: class {} },
    'src/features/terminal/pty': new Proxy({
      onPtyEvent: async () => noOp,
      ptySpawn: async args => { shells.set(args.id, 510 + sequence); return args.id; },
      ptyLoadTerminalHistory: async () => undefined,
      ptyDeleteTerminalHistory: async () => {},
      ptyDeleteWorkspaceTerminalHistory: async () => {},
      ptyKill: async id => { shells.delete(id); },
    }, { get: (target, key) => key in target ? target[key] : unexpected }),
    'src/features/terminal/restore': { PersistThrottle: class { flush() { return Promise.resolve(); } drop(id, f) { return f(); } }, restoreCwds: (_, cwd) => [cwd], restoreOutput: () => '' },
    'src/features/terminal/localStorage': { subsystemStorage: () => ({}) },
    'src/features/terminal/tabList': { TabListStore: class { async workspace(id) { return saved.get(id); } async setWorkspace() {} }, savedWorkspace: () => ({}), TABS_SIZE_LIMIT: 1, TABS_SUBSYSTEM: 'fixture' },
    'src/settings/appPrefs': { getAppPrefs: () => ({ experimental_tab_freak_mode: true }), useAppPrefs: () => ({ sidebar_resource_usage: enabled }) },
    'src/features/terminal/shortcuts': { FIND_COMMAND: 'find', LINE_EDIT_BYTES: {}, terminalCommandFor: () => undefined },
    'src/features/terminal/font': { currentTerminalFont: () => ({ family: 'monospace', size: 12 }), onTerminalFont: noOp, TERMINAL_LINE_HEIGHT: 1 },
    'src/features/terminal/scrollback': { currentScrollbackRows: () => 100, onScrollbackRows: noOp },
    'src/features/terminal/shellIntegration': { emptyShellState: () => ({}) },
    'src/features/terminal/bigTerminal': { bigTabRequest: () => ({}) },
    'src/components/Icons': new Proxy({}, { get: () => () => React.createElement('svg') }),
    '@tauri-apps/api/core': { isTauri: () => desktop, invoke: async (command, args) => {
      assert.equal(command, 'get_resource_usage');
      polls.push(JSON.parse(JSON.stringify(args)));
      return sample(args.terminalLabels);
    } },
  };
  function load(file) {
    file = file.replace(/\.tsx?$/, '');
    if (Object.hasOwn(boundaries, file)) return boundaries[file];
    if (modules.has(file)) return modules.get(file).exports;
    const source = [file + '.tsx', file + '.ts'].find(fs.existsSync);
    assert.ok(source, file);
    const module = { exports: {} }; modules.set(file, module);
    const { outputText } = ts.transpileModule(fs.readFileSync(source, 'utf8'), { fileName: source, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } });
    function requireSource(name) {
      if (name === 'react' || name === 'react/jsx-runtime') return deps(name);
      if (name === 'react-dom') return { createPortal: children => children };
      if (Object.hasOwn(boundaries, name)) return boundaries[name];
      assert.ok(name.startsWith('.'), name);
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)));
    }
    const scope = { console, TextDecoder, TextEncoder, document, window, navigator: { clipboard: { writeText: unexpected } }, crypto: { randomUUID: () => String(++sequence) }, getComputedStyle: () => ({ getPropertyValue: () => '' }), ResizeObserver: class { observe() {} disconnect() {} }, setTimeout: unexpected, clearTimeout: unexpected };
    vm.runInNewContext(`(function(require,module,exports){${outputText}\n})`, scope, { filename: source })(requireSource, module, module.exports);
    return module.exports;
  }
  const session = load('src/features/terminal/session');
  return {
    session, polls, saved, shells,
    labels: () => JSON.parse(JSON.stringify(session.getResourceTerminalLabels())),
    async mount() {
      const { ResourceUsagePill } = load('src/components/ResourceUsagePill');
      let renderer;
      await act(async () => { renderer = create(React.createElement(ResourceUsagePill, { workspaces: [] }), { createNodeMock: () => ({ closest: () => ({ getBoundingClientRect: () => ({ width: 300 }) }), getBoundingClientRect: () => ({ right: 300, bottom: 30 }), offsetWidth: 360 }) }); });
      return {
        renderer,
        async includeTerminals() {
          await act(async () => renderer.root.findByProps({ className: 'sb-usage-pill' }).props.onClick());
          const toggle = renderer.root.findAllByType('button').find(b => b.props.title === 'Include terminal processes');
          assert.ok(toggle);
          await act(async () => toggle.props.onClick());
        },
        async poll() { await act(async () => { timers[0](); }); },
        visible: () => renderer.root.findAllByType('td').filter(n => n.props.className === 'usage-name').map(n => n.children.join('')),
        close() { act(() => renderer.unmount()); },
      };
    },
  };
}

test('actual mounted resource poll renders panel and center labels instead of shell executable names', async () => {
  const f = fixture();
  const panelB = await f.session.openTab('B', '/fixture/B');
  const centerA = await f.session.openBigTab('A', '/fixture/A', {});
  const panelA = await f.session.openTab('A', '/fixture/A');
  const centerB = await f.session.openBigTab('B', '/fixture/B', {});
  const expected = { [panelB]: 'Terminal 1', [panelA]: 'Terminal 2', [centerA]: 'Terminal tab 1', [centerB]: 'Terminal tab 2' };
  const pill = await f.mount();
  try {
    await pill.includeTerminals();
    assert.deepEqual(f.polls[0].terminalLabels, expected);
    assert.deepEqual(pill.visible().sort(), ['OpenConductor', ...Object.values(expected)].sort());
    f.session.closeTab('B', panelB);
    await pill.poll();
    assert.deepEqual(f.polls.at(-1).terminalLabels, { [panelA]: 'Terminal 1', [centerA]: 'Terminal tab 1', [centerB]: 'Terminal tab 2' });
    assert.deepEqual(pill.visible().sort(), ['OpenConductor', 'Terminal 1', 'Terminal tab 1', 'Terminal tab 2'].sort());
  } finally { pill.close(); }
});

test('panel numbering starts at first PANEL insertion, independent of center-first workspaces and titles', async () => {
  const f = fixture();
  const centerA = await f.session.openBigTab('A', '/fixture/A', {});
  const panelB = await f.session.openTab('B', '/fixture/B');
  const panelA = await f.session.openTab('A', '/fixture/A');
  const centerB = await f.session.openBigTab('B', '/fixture/B', {});
  const centerA2 = await f.session.openBigTab('A', '/fixture/A', {});
  assert.deepEqual(f.labels(), { [panelB]: 'Terminal 1', [panelA]: 'Terminal 2', [centerA]: 'Terminal tab 1', [centerB]: 'Terminal tab 2', [centerA2]: 'Terminal tab 3' });
  f.session.closeTab('B', panelB);
  const reopenedB = await f.session.openTab('B', '/fixture/B');
  assert.equal(f.session.getTabs('B').tabs.find(t => t.id === reopenedB).title, 'Terminal 3');
  assert.deepEqual(f.labels(), { [reopenedB]: 'Terminal 1', [panelA]: 'Terminal 2', [centerA]: 'Terminal tab 1', [centerB]: 'Terminal tab 2', [centerA2]: 'Terminal tab 3' });
  await f.session.destroyWorkspaceTerminals('B');
  const newB = await f.session.openTab('B', '/fixture/B');
  assert.deepEqual(f.labels(), { [panelA]: 'Terminal 1', [newB]: 'Terminal 2', [centerA]: 'Terminal tab 1', [centerA2]: 'Terminal tab 2' });
});

test('restored terminal ids keep their placement labels without using saved titles', async () => {
  const f = fixture();
  f.saved.set('saved', { tabs: [{ id: 'saved-center', title: 'Custom center', placement: 'center' }, { id: 'saved-panel', title: 'Terminal 73' }], activeId: 'saved-panel', next: 74 });
  await f.session.restoreWorkspaceTabs('saved', '/fixture/saved');
  assert.deepEqual([...f.shells.keys()], ['saved-center', 'saved-panel']);
  assert.deepEqual(f.labels(), { 'saved-panel': 'Terminal 1', 'saved-center': 'Terminal tab 1' });
});

for (const options of [{ enabled: false }, { desktop: false }]) {
  test(`resource labels do not enable polling with ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await f.session.openTab('A', '/fixture/A');
    const pill = await f.mount();
    assert.deepEqual(f.polls, []);
    pill.close();
  });
}
