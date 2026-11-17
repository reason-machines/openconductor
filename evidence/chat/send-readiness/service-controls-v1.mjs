import test from 'node:test';
import assert from 'node:assert/strict';
import { ComposerSession } from './current/src/features/chat/composerSession.ts';

export const status = 'PROPOSED_NOT_EXECUTED';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function session() {
  const saves = [];
  const store = {
    load: async () => ({ message: '', attachments: [] }),
    save: async (...args) => { saves.push(args); },
    clear: async () => {},
  };
  const value = new ComposerSession('send-readiness-proposal', store);
  await value.connect();
  return { value, saves };
}

const file = (name, text) => {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
};
const writer = async () => {};

for (const phase of ['read', 'write']) {
  test(`actual session blocks ${phase}-pending B without clearing ready A or prose`, async () => {
    const { value } = await session();
    try {
      value.setDraft('keep this prose');
      await value.attach([file('A.txt', 'ready A')], writer);
      const before = value.snapshot();
      const gate = deferred();
      const entered = deferred();
      const B = file('B.txt', 'ready B');
      const pending = value.attach([
        phase === 'read' ? { ...B, arrayBuffer: () => { entered.resolve(); return gate.promise; } } : B,
      ], phase === 'write' ? () => { entered.resolve(); return gate.promise; } : writer);
      await entered.promise;
      const copies = [];
      const deliveries = [];
      assert.equal(await value.send(async path => { copies.push(path); }, a => { deliveries.push(a); }), false);
      assert.equal(deliveries.length, 0);
      assert.equal(copies.length, 0);
      assert.equal(value.snapshot().draft, before.draft);
      assert.deepEqual(value.snapshot().attachments, before.attachments);
      assert.match(value.snapshot().error, /Wait for the draft and selected files/);
      gate.resolve(phase === 'read' ? new TextEncoder().encode('ready B').buffer : undefined);
      await pending;
      assert.equal(deliveries.length, 0, 'settlement must not silently retry the rejected send');
      assert.equal(await value.send(async path => { copies.push(path); }, a => { deliveries.push(a); }), true);
      assert.equal(deliveries.length, 1);
      assert.deepEqual(deliveries[0].map(a => [a.label, a.text]), [['A.txt', 'ready A'], ['B.txt', 'ready B']]);
      assert.equal(copies.length, 2);
      assert.ok(deliveries[0].every(a => !('staged' in a)));
      assert.equal(value.snapshot().draft, '');
      assert.deepEqual(value.snapshot().attachments, []);
    } finally {
      value.disconnect();
    }
  });
}

test('failed B preserves ready A and explicit attachment-only delivery', async () => {
  const { value } = await session();
  try {
    await value.attach([file('A.txt', 'ready A')], writer);
    const gate = deferred();
    const pending = value.attach([{ ...file('B.txt', 'unused'), arrayBuffer: () => gate.promise }], writer);
    gate.reject(new Error('controlled read failure'));
    await pending;
    assert.deepEqual(value.snapshot().attachments.map(a => a.label), ['A.txt']);
    assert.match(value.snapshot().error, /Failed to attach B.txt/);
    const deliveries = [];
    assert.equal(await value.send(async () => {}, a => { deliveries.push(a); }), true);
    assert.deepEqual(deliveries.map(a => a.map(x => [x.label, x.text])), [[['A.txt', 'ready A']]]);
  } finally {
    value.disconnect();
  }
});

test('workspace copy failure preserves draft and attachment for explicit retry', async () => {
  const { value } = await session();
  try {
    value.setDraft('keep on failure');
    await value.attach([file('A.txt', 'ready A')], writer);
    const before = value.snapshot();
    const deliveries = [];
    assert.equal(await value.send(async () => { throw new Error('controlled copy failure'); }, a => { deliveries.push(a); }), false);
    assert.equal(deliveries.length, 0);
    assert.equal(value.snapshot().draft, before.draft);
    assert.deepEqual(value.snapshot().attachments, before.attachments);
    assert.equal(await value.send(async () => {}, a => { deliveries.push(a); }), true);
    assert.equal(deliveries.length, 1);
  } finally {
    value.disconnect();
  }
});
