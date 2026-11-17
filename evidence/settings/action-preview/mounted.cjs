// Harness ports only from frozen/preview.test.cjs: recursive local TS loader and pure preview IPC.
// All seven test bodies and their assertions are unchanged. Original Conductor JS is inert data.
// Dialog/Markdown are host stubs; native preview output is controlled, not native acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const ROOT = path.resolve(process.env.SETTINGS_SOURCE_ROOT || '.');
const kinds = ['code_review', 'create_pr', 'fix_errors', 'resolve_merge_conflicts', 'rename_branch'];
const titles = ['Code review preferences', 'Create PR preferences', 'Fix errors preferences', 'Resolve conflicts preferences', 'Branch rename preferences'];
const text = node => typeof node === 'string' ? node : node?.children?.map(text).join('') || '';
async function mount(options = {}) {
  const cache = new Map(), saves = [], timers = new Map(), launches = [], previews = [];
  const effective = { prompts: Object.fromEntries([...kinds, 'general'].map(kind => [kind, { value: `Saved ${kind} instructions.`, layer: 'repo_local' }])) };
  const pending = { change() {}, flush() {} };
  const host = { clearTimeout: id => timers.delete(id), setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; } };
  function load(relative) {
    const filename = path.resolve(ROOT, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8');
    const js = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const requireControlled = name => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('.css')) return {};
      if (name === '../../lib/persistence/producer.ts') return { usePendingEdit: () => pending };
      if (name === '../repoSettings.ts') return { layerLabel: value => value, repoSettingsSetLocal: async (...args) => { saves.push(args); } };
      if (name === '../useRepoSettings.ts') return { useRepoSettings: () => effective, notifyRepoSettingsChanged() {} };
      if (name === './rowModel.ts') return load('src/settings/rows/rowModel.ts');
      if (name === '@tauri-apps/api/core') return { invoke: (command, args) => {
        previews.push({ command, args });
        assert.equal(command, 'pr_action_prompt_preview', 'only the pure preview IPC is permitted');
        assert.deepEqual(Object.keys(args).sort(), ['custom', 'kind']);
        return options.native ? options.native(command, args) : Promise.resolve(`Controlled pure IPC ${args.kind}: ${args.custom.trim()}`);
      } };
      if (name === '../../components/DialogFrame') return { DialogFrame: ({ children, titleId }) => React.createElement('div', { role: 'dialog', 'aria-labelledby': titleId }, children) };
      if (name === '../../features/chat/markdown') return { Markdown: props => React.createElement('div', { 'data-preview-markdown': true }, props.text ?? props.children ?? '') };
      if (name === '../../backend') return new Proxy({}, { get: (_, key) => () => { launches.push(key); assert.fail('No native/action/provider execution in Preview qualification'); } });
      if (name.startsWith('.')) {
        let resolved = path.resolve(path.dirname(filename), name);
        if (!path.extname(resolved)) resolved += '.ts';
        return load(path.relative(ROOT, resolved));
      }
      throw new Error('Unexpected Preview fixture dependency: ' + relative + ' -> ' + name);
    };
    vm.runInNewContext('(function(require,module,exports){' + js + '\n})', { console, window: host }, { filename })(requireControlled, module, module.exports);
    return module.exports;
  }
  const { RepoActionsRows } = load('src/settings/rows/PromptRows.tsx');
  let renderer;
  await act(async () => { renderer = create(React.createElement(RepoActionsRows, { repoPath: '/synthetic/not-a-real-repository' })); });
  const rows = () => renderer.root.findAll(node => node.type === 'div' && node.props.className === 'settings-row oc-prompt-row');
  const row = kind => rows()[[...kinds, 'general'].indexOf(kind)];
  const input = kind => row(kind).findByType('textarea');
  const open = async kind => { await act(async () => { row(kind).findByProps({ className: 'oc-prompt-trigger' }).props.onClick(); }); };
  return {
    renderer, saves, launches, rows, row, input, open, previewCalls: previews,
    loadPreview: () => load('src/settings/actionPromptPreview.ts'),
    async change(kind, value) { await act(async () => { input(kind).props.onChange({ target: { value } }); }); },
    previews: kind => row(kind).findAll(node => node.type === 'button' && text(node).trim() === 'Preview'),
    async click(node) { await act(async () => { node.props.onClick(); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
module.exports = { mount };
for (let i = 0; i < kinds.length; i++) {
  const kind = kinds[i], title = titles[i];
  test(`${kind}: expanded action Preview displays the current unsaved draft without launching or saving`, async () => {
    const f = await mount();
    try {
      await f.open(kind);
      const draft = `Synthetic CURRENT ${kind} draft, not the saved value.`;
      await f.change(kind, draft);
      const previews = f.previews(kind);
      assert.equal(previews.length, 1, `${title} exposes one Preview button`);
      const before = f.saves.length;
      await f.click(previews[0]);
      const dialogs = f.renderer.root.findAll(node => node.type === 'div' && node.props.role === 'dialog');
      assert.equal(dialogs.length, 1, 'Preview opens one prompt dialog');
      assert.ok(text(dialogs[0]).includes(`${title} prompt`), 'dialog title identifies the action');
      assert.ok(text(dialogs[0]).includes(draft), 'preview contains current draft rather than stored preference');
      assert.ok(!text(dialogs[0]).includes(`Saved ${kind} instructions.`), 'stale saved preference is not shown');
      assert.equal(f.saves.length, before, 'Preview does not save');
      assert.equal(f.launches.length, 0, 'Preview launches no action/native/provider work');
    } finally { await f.close(); }
  });
}
test('General preferences explicitly suppress Preview even when expanded and customized', async () => {
  const f = await mount();
  try {
    await f.open('general');
    assert.equal(f.input('general').props.value, 'Saved general instructions.');
    assert.equal(f.previews('general').length, 0);
    assert.equal(f.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  } finally { await f.close(); }
});
test('collapsed action editors expose no Preview and preserve the six-row order', async () => {
  const f = await mount();
  try {
    assert.equal(f.rows().length, 6);
    assert.deepEqual(f.rows().map(row => text(row.findByProps({ className: 'oc-prompt-title' })).replace(/Customized$/, '')), [...titles, 'General preferences']);
    for (const kind of kinds) assert.equal(f.previews(kind).length, 0);
    assert.equal(f.renderer.root.findAllByType('textarea').length, 0);
    assert.equal(f.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  } finally { await f.close(); }
});
