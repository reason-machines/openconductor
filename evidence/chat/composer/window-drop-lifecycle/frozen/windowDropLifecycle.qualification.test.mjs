import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Qualification only: load the actual fresh-main hook with inert platform imports.
// Never load or evaluate the retained vendor renderer.
const hookPath = new URL('./main/src/features/chat/useWindowDragDrop.ts', import.meta.url);
const code = ts.transpileModule(fs.readFileSync(hookPath, 'utf8'), {
  fileName: 'useWindowDragDrop.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ tauri = true, unavailable = false } = {}) {
  let state = false;
  let callback;
  let effect;
  let resolveSubscription;
  let registrations = 0;
  let unlistens = 0;
  const drops = [];
  const subscription = new Promise(resolve => { resolveSubscription = resolve; });
  const imports = {
    react: {
      useState: initial => { state = initial; return [state, value => { state = typeof value === 'function' ? value(state) : value; }]; },
      useRef: current => ({ current }),
      useEffect: run => { effect = run; },
    },
    '@tauri-apps/api/webview': {
      getCurrentWebview: () => {
        if (unavailable) throw Error('no live webview');
        return { onDragDropEvent: handler => { registrations++; callback = handler; return subscription; } };
      },
    },
    '@tauri-apps/plugin-fs': { readFile: () => { throw Error('qualification must not read native files'); } },
    '../../backend': { inTauri: () => tauri },
  };
  const module = { exports: {} };
  const load = vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { console });
  load(name => {
    if (!(name in imports)) throw Error(`unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  module.exports.useWindowDragDrop(paths => drops.push([...paths]));
  const cleanup = effect();
  return {
    state: () => state,
    registrations: () => registrations,
    unlistens: () => unlistens,
    drops,
    emit: payload => { assert.ok(callback, 'registered real hook callback'); callback({ payload }); },
    unmount: () => cleanup?.(),
    resolve: async () => { resolveSubscription(() => { unlistens++; }); await subscription; await Promise.resolve(); },
  };
}

test('original LNi enter contract: an empty native path list does not advertise a file drop', () => {
  const hook = mount();
  hook.emit({ type: 'enter', paths: [], position: { x: 0, y: 0 } });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, []);
});

test('original LNi cleanup contract: unmount before registration resolves still unsubscribes once', async () => {
  const hook = mount();
  hook.unmount();
  assert.equal(hook.unlistens(), 0, 'pending subscription has no handle yet');
  await hook.resolve();
  assert.equal(hook.unlistens(), 1, 'the resolved native listener must not survive its owner');
});

test('control: nonempty enter shows overlay and leave clears it', () => {
  const hook = mount();
  hook.emit({ type: 'enter', paths: ['/fixture/a.txt'] });
  assert.equal(hook.state(), true);
  hook.emit({ type: 'leave' });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, []);
});

test('control: drop clears overlay and forwards the exact nonempty path list once', () => {
  const hook = mount();
  hook.emit({ type: 'enter', paths: ['/fixture/a.txt'] });
  hook.emit({ type: 'drop', paths: ['/fixture/a.txt', '/fixture/b.txt'] });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, [['/fixture/a.txt', '/fixture/b.txt']]);
});

test('control: empty drop clears overlay without attaching', () => {
  const hook = mount();
  hook.emit({ type: 'enter', paths: ['/fixture/a.txt'] });
  hook.emit({ type: 'drop', paths: [] });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, []);
});

test('control: registration resolved before unmount unsubscribes once', async () => {
  const hook = mount();
  await hook.resolve();
  hook.unmount();
  assert.equal(hook.unlistens(), 1);
});

test('control: a non-Tauri surface does not subscribe', () => {
  const hook = mount({ tauri: false });
  assert.equal(hook.registrations(), 0);
  assert.equal(hook.state(), false);
  hook.unmount();
});

test('control: unavailable webview exits without a listener or native read', () => {
  const hook = mount({ unavailable: true });
  assert.equal(hook.registrations(), 0);
  assert.equal(hook.state(), false);
  hook.unmount();
});
