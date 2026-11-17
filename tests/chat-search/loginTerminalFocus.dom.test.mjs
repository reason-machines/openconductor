import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, after } from 'node:test';
import { runInNewContext } from 'node:vm';

const deps = createRequire(resolve('package.json'));
assert.ok(process.env.ONBOARDING_DOM_DEPS, 'Use the existing CI inert DOM dependency prefix');
const domDeps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, 'package.json'));
const { JSDOM } = domDeps('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
const style = dom.window.document.createElement('style');
style.textContent = readFileSync('src/settings/agents/agents.css', 'utf8');
dom.window.document.head.append(style);
dom.window.document.documentElement.style.setProperty('--terminal-transparent', '#00000000');
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLTextAreaElement', 'HTMLCanvasElement', 'Element', 'Node', 'Document', 'MutationObserver', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.self = dom.window;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const resizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = dom.window.ResizeObserver = resizeObserver;
// jsdom has no raster canvas. Only painting and text metrics are replaced; DOM events and focus remain real.
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  const context = {
    canvas: this,
    measureText: (text) => ({ width: String(text).length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: (_x, _y, width = 1, height = 1) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  };
  return new Proxy(context, { get: (target, key) => key in target ? target[key] : () => {} });
};
const React = deps('react');
const { act } = React;
const { createRoot } = deps('react-dom/client');
const { Terminal } = deps('@xterm/xterm');
const { FitAddon } = deps('@xterm/addon-fit');
const ts = deps('typescript');
const source = readFileSync(process.env.LOGIN_TERMINAL_FOCUS_SOURCE_FILE ?? 'src/settings/agents/parts.tsx', 'utf8');
const terminalId = 'login-focus-pty';
after(() => dom.window.close());

async function fixture() {
  const container = document.createElement('div');
  const outside = document.createElement('button');
  outside.textContent = 'Outside the login terminal';
  document.body.append(outside, container);
  let refreshed = 0;
  const spawned = [], writes = [], killed = [];
  let emit, parsedOutput;
  const exports = {};
  const compiled = ts.transpileModule(source, {
    fileName: 'parts.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    exports, document, window, getComputedStyle, console,
    crypto: { randomUUID: () => terminalId }, ResizeObserver: resizeObserver,
    require(name) {
      if (name === 'react' || name === 'react/jsx-runtime') return deps(name);
      if (name.endsWith('.css')) return {};
      if (name === '@xterm/xterm') return { Terminal };
      if (name === '@xterm/addon-fit') return { FitAddon };
      if (name === '../../features/terminal/pty') return {
        onPtyEvent: async handler => { emit = handler; return () => { emit = undefined; }; },
        ptySpawn: async args => { spawned.push(args); return args.id; },
        ptyWrite: async (id, data) => { writes.push({ id, data }); },
        ptyResize: async () => {}, ptyAckBytes: async () => { parsedOutput?.(); },
        ptyKill: async id => { killed.push(id); },
      };
      if (name === './agentAuth') return {};
      if (name === './api') return { homeDir: async () => '/fixture-home' };
      if (name === './icons') return new Proxy({}, { get: () => () => null });
      throw new Error(`Unexpected login focus dependency: ${name}`);
    },
  });
  assert.equal(typeof exports.LoginButton, 'function');
  const root = createRoot(container);
  const click = async target => {
    assert.ok(target, 'A real mounted DOM click target is required');
    await act(async () => {
      for (const type of ['mousedown', 'mouseup', 'click']) {
        target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      }
    });
  };
  const button = label => [...container.querySelectorAll('button')].find(node => node.textContent === label || node.getAttribute('aria-label') === label);
  await act(async () => { root.render(React.createElement(exports.LoginButton, {
    command: 'fixture-cli login', label: 'fixture-cli login', onDone: () => { refreshed++; },
  })); });
  try {
    await click(button('Run fixture-cli login'));
    assert.equal(spawned.length, 1);
    const body = container.querySelector('[data-terminal]');
    const input = body?.querySelector('textarea.xterm-helper-textarea');
    const child = body?.querySelector('.xterm');
    assert.ok(body && input && child, 'Real xterm must be mounted inside the production padded body');
    assert.equal(getComputedStyle(body).padding, '12px', 'The event target includes the production wrapper padding');
    outside.focus();
    assert.equal(document.activeElement, outside);
    return {
      body, input, child, spawned, writes, killed,
      refreshed: () => refreshed,
      clickBody: () => click(body),
      clickChild: () => click(child),
      dismiss: () => click(button('Close terminal')),
      done: () => click(button('Done')),
      async complete() {
        assert.ok(emit);
        await act(async () => {
          await new Promise(resolve => {
            parsedOutput = resolve;
            emit({ kind: 'data', id: terminalId, data: new TextEncoder().encode(`\x1b]633;Conductor;CommandDone;${terminalId}\x07`) });
          });
        });
        parsedOutput = undefined;
        assert.ok(button('Done'));
      },
      async type() {
        await act(async () => {
          document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keypress', {
            bubbles: true, cancelable: true, key: 'x', code: 'KeyX', charCode: 120, keyCode: 120, which: 120,
          }));
        });
      },
      async close() { await act(async () => { root.unmount(); }); container.remove(); outside.remove(); },
    };
  } catch (error) {
    await act(async () => { root.unmount(); });
    container.remove(); outside.remove();
    throw error;
  }
}

for (const completed of [false, true]) {
  test(`${completed ? 'completed but live' : 'running'} login body padding click restores real input focus`, { timeout: 10000 }, async () => {
    const view = await fixture();
    try {
      if (completed) await view.complete();
      await view.clickBody();
      assert.equal(document.activeElement, view.input, 'Clicking the padded wrapper must focus its own xterm textarea');
      await view.type();
      assert.deepEqual(view.writes, [{ id: terminalId, data: 'x' }], 'Typing after the click must reach the same live login PTY exactly once');
      assert.equal(view.spawned.length, 1);
      assert.equal(view.refreshed(), 0);
    } finally { await view.close(); }
  });
}

test('real xterm child clicks already focus and type into their live login PTY', { timeout: 10000 }, async () => {
  const view = await fixture();
  try {
    await view.clickChild();
    assert.equal(document.activeElement, view.input, 'The real xterm event chain must work independently of the wrapper fix');
    await view.type();
    assert.deepEqual(view.writes, [{ id: terminalId, data: 'x' }]);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test('dismissing login does not focus its terminal or refresh authentication', { timeout: 10000 }, async () => {
  const view = await fixture();
  try {
    await view.dismiss();
    assert.notEqual(document.activeElement, view.input);
    assert.equal(view.refreshed(), 0);
    assert.deepEqual(view.writes, []);
    assert.deepEqual(view.killed, [terminalId]);
  } finally { await view.close(); }
});

test('Done refreshes authentication without focusing the terminal', { timeout: 10000 }, async () => {
  const view = await fixture();
  try {
    await view.complete();
    await view.done();
    assert.notEqual(document.activeElement, view.input);
    assert.equal(view.refreshed(), 1);
    assert.deepEqual(view.writes, []);
    assert.deepEqual(view.killed, [terminalId]);
  } finally { await view.close(); }
});
