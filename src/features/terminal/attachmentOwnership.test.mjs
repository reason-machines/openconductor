import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Execute only OpenConductor's unchanged exported attachTab body, not reference JS.
// Node builtin type erasure and synthetic DOM/xterm boundaries; no dependencies,
// application, PTY, backend, native process, or Conductor code is executed.
// Baseline identity is checked externally and recorded in frozen.json. The
// fixture reads the working source so exactly the same test can later run GREEN.
const file = 'src/features/terminal/session.ts';
const source = readFileSync(file, 'utf8');
const begin = source.indexOf('export function attachTab(');
const end = source.indexOf('\nfunction writeInput(', begin);
assert.ok(begin >= 0 && end > begin);
const body = stripTypeScriptTypes(source.slice(begin, end).replace(/^export /, ''));

function fixture() {
  const observers = [];
  let opens = 0;
  let fits = 0;
  const host = { parentElement: null, clientWidth: 640, remove() { this.parentElement = null; } };
  const terminal = {
    host, opened: false, quiet: false,
    term: { open() { opens++; }, focus() {} },
    fit: { fit() { fits++; } },
  };
  class ResizeObserver {
    disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(container) { this.container = container; }
    disconnect() { this.disconnected = true; }
  }
  const attachTab = runInNewContext(`${body}\nattachTab`, {
    live: new Map([['term', terminal]]), ResizeObserver,
    typingElsewhere: () => false, console,
    ATTACH_FAILED: 'Failed to attach terminal', attachFailureListeners: new Set(),
  }, { filename: `${file}#unchanged-attachTab` });
  const container = (name) => ({ name, appendChild(child) { child.parentElement = this; } });
  return { attachTab, host, observers, container, opens: () => opens, fits: () => fits };
}

test('control: initial attach opens once, fits, and mounts in its container', () => {
  const f = fixture();
  const a = f.container('A');
  f.attachTab('term', a);
  assert.equal(f.host.parentElement, a);
  assert.equal(f.opens(), 1);
  assert.equal(f.fits(), 1);
});

test('control: the active detach removes its mount and disconnects its observer', () => {
  const f = fixture();
  const detach = f.attachTab('term', f.container('A'));
  detach();
  assert.equal(f.host.parentElement, null);
  assert.equal(f.observers[0].disconnected, true);
});

test('stale detach must not remove a newer attachment in another container', () => {
  const f = fixture();
  const detachA = f.attachTab('term', f.container('A'));
  const b = f.container('B');
  f.attachTab('term', b);
  assert.equal(f.host.parentElement, b, 'new attachment is mounted before old cleanup');
  detachA();
  assert.equal(f.host.parentElement, b, 'old cleanup must not remove the newer mount');
});

test('stale detach must not remove a newer attachment in the same container', () => {
  const f = fixture();
  const a = f.container('A');
  const detachOld = f.attachTab('term', a);
  f.attachTab('term', a);
  assert.equal(f.host.parentElement, a);
  detachOld();
  assert.equal(f.host.parentElement, a, 'attachment identity, not container equality, owns cleanup');
});

test('replacing an attachment disconnects the old resize observer immediately', () => {
  const f = fixture();
  f.attachTab('term', f.container('A'));
  f.attachTab('term', f.container('B'));
  assert.equal(f.observers.length, 2);
  assert.equal(f.observers[0].disconnected, true, 'old observer loses ownership at replacement, not at eventual cleanup');
  assert.equal(f.observers[1].disconnected, false);
  assert.equal(f.opens(), 1, 'reattach reuses the existing xterm');
});
