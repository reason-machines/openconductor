import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, file, deferred } from './support/composerSendReadinessHost.mjs';

const modes = [
  { name: 'idle', working: false, canSteer: false, followUpMode: 'queued' },
  { name: 'working-queue', working: true, canSteer: false, followUpMode: 'queued' },
  { name: 'working-steer', working: true, canSteer: true, followUpMode: 'queued' },
];
const actions = ['button', 'normal', 'opposite'];
const presets = ['enter', 'cmd-enter'];
const modeFor = (options, action) => options.working && options.canSteer && action === 'opposite' ? 'steer' : 'queue';

function assertDelivery(f, expectedText, expectedFiles, options, action) {
  assert.equal(f.deliveries.length, 1, 'one explicit retry must submit exactly once');
  const [id, cwd, input, mode, attachments] = f.deliveries[0];
  assert.equal(id, 'send-readiness');
  assert.equal(cwd, '/synthetic/worktree');
  assert.equal(input.text, expectedText);
  assert.equal(mode, modeFor(options, action));
  assert.deepEqual(attachments.map(a => [a.name.split('/').at(-1), a.text]), expectedFiles);
  assert.ok(attachments.every(a => !('staged' in a)), 'transport cannot leak staging metadata');
  assert.equal(f.text(), '');
  assert.deepEqual(f.chips(), []);
}

for (const options of modes) for (const keys of presets) for (const action of actions) {
  for (const phase of ['read', 'write']) {
    test(`mounted ${options.name}/${keys}/${action}: ${phase}-pending B retains ready A/prose until explicit retry`, async () => {
      const f = await fixture({ ...options, keys });
      try {
        await f.attach(file('A.txt', 'ready A'));
        await f.paste('keep this prose');
        const gate = deferred();
        const B = file('B.txt', 'ready B');
        if (phase === 'write') f.setWrite(() => gate.promise);
        await f.attach(phase === 'read' ? { ...B, arrayBuffer: () => gate.promise } : B);
        assert.deepEqual(f.chips(), ['A.txt']);
        await f.action(action);
        assert.deepEqual(f.deliveries, []);
        assert.deepEqual(f.copies, []);
        assert.equal(f.text(), 'keep this prose');
        assert.deepEqual(f.chips(), ['A.txt']);
        assert.match(f.alert(), /Wait for the draft and selected files/);
        await f.settle(gate, phase === 'read' ? await B.arrayBuffer() : undefined);
        assert.deepEqual(f.chips(), ['A.txt', 'B.txt']);
        assert.deepEqual(f.deliveries, [], 'settlement must not implicitly retry');
        await f.action(action);
        assertDelivery(f, 'keep this prose', [['A.txt', 'ready A'], ['B.txt', 'ready B']], options, action);
        assert.deepEqual(f.copies.map(c => c.relativePath), f.writes.map(w => w.relativePath));
      } finally { await f.close(); }
    });
  }
  test(`mounted ${options.name}/${keys}/${action}: failed B retains attachment-only ready A`, async () => {
    const f = await fixture({ ...options, keys });
    try {
      await f.attach(file('A.txt', 'ready A'));
      const gate = deferred();
      await f.attach({ ...file('B.txt', 'unused'), arrayBuffer: () => gate.promise });
      await f.fail(gate);
      assert.deepEqual(f.chips(), ['A.txt']);
      assert.match(f.alert(), /Failed to attach B.txt/);
      await f.action(action);
      assertDelivery(f, '', [['A.txt', 'ready A']], options, action);
      assert.equal(f.copies.length, 1);
    } finally { await f.close(); }
  });
  test(`mounted ${options.name}/${keys}/${action}: workspace-copy failure retains draft for explicit retry`, async () => {
    const f = await fixture({ ...options, keys });
    try {
      await f.attach(file('A.txt', 'ready A'));
      await f.paste('keep on failure');
      f.setCopy(async () => { throw new Error('controlled workspace-copy failure'); });
      await f.action(action);
      assert.deepEqual(f.deliveries, []);
      assert.equal(f.text(), 'keep on failure');
      assert.deepEqual(f.chips(), ['A.txt']);
      assert.match(f.alert(), /Message not sent.*controlled workspace-copy failure/);
      f.setCopy(async () => {});
      await f.tick();
      assert.deepEqual(f.deliveries, [], 'repairing the copy port must not retry');
      await f.action(action);
      assertDelivery(f, 'keep on failure', [['A.txt', 'ready A']], options, action);
      assert.equal(f.copies.length, 2);
    } finally { await f.close(); }
  });
}
