import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/localFastHost.mjs';

const eligible = [
  { agent: 'claude', model: 'opus-5-1m', effort: 'high' },
  { agent: 'codex', model: 'gpt-5.4', effort: 'high' },
];
const identity = choice => ({ agent: choice.agent, model: choice.model, effort: choice.effort });

for (const choice of eligible) {
  test(`mounted local Fast picker: ${choice.agent}/${choice.model} saves one explicit toggle without changing identity`, async () => {
    const f = await fixture(choice);
    try {
      assert.equal(Boolean(f.choice().fast), false);
      await f.openPicker();
      const row = f.fastRow();
      assert.ok(row, 'eligible actual ChatModelPicker must expose Fast');
      assert.equal(row.disabled, false);
      assert.equal(row.getAttribute('aria-checked'), 'false');
      await f.clickFast();
      assert.equal(Boolean(f.choice().fast), true);
      assert.deepEqual(identity(f.choice()), choice);
      assert.equal(f.choiceWrites().length, 1);
      assert.equal(f.fastRow().getAttribute('aria-checked'), 'true');
      await f.clickFast();
      assert.equal(Boolean(f.choice().fast), false);
      assert.deepEqual(identity(f.choice()), choice);
      assert.equal(f.choiceWrites().length, 2);
      assert.equal(f.fastRow().getAttribute('aria-checked'), 'false');
      assert.deepEqual(f.deliveries, []);
    } finally { await f.close(); }
  });

  test(`mounted local Fast command: ${choice.agent}/${choice.model} changes session choice instead of submitting a prompt`, async () => {
    const f = await fixture(choice);
    try {
      await f.command();
      assert.equal(Boolean(f.choice().fast), true, 'actual Workspace command must apply the supported Fast choice');
      assert.deepEqual(identity(f.choice()), choice);
      assert.equal(f.choiceWrites().length, 1);
      assert.deepEqual(f.deliveries, []);
      assert.equal(f.text(), '');
      assert.equal(f.alert(), null);
      await f.command();
      assert.equal(Boolean(f.choice().fast), false);
      assert.deepEqual(identity(f.choice()), choice);
      assert.equal(f.choiceWrites().length, 2);
      assert.deepEqual(f.deliveries, []);
    } finally { await f.close(); }
  });

  test(`mounted local Fast precedence control: ${choice.agent} agent-reported command remains an agent prompt`, async () => {
    const f = await fixture({ ...choice, reportedFast: true });
    try {
      const before = f.choice();
      await f.command();
      assert.deepEqual(f.choice(), before);
      assert.equal(f.choiceWrites().length, 0);
      assert.equal(f.deliveries.length, 1);
      assert.equal(f.deliveries[0][2].text, '/fast');
      assert.equal(f.text(), '');
    } finally { await f.close(); }
  });
}

for (const model of ['sonnet-5-1m', 'haiku-4-5']) {
  test(`mounted local Fast unsupported control: Claude ${model} keeps a disabled row and cannot enable Fast`, async () => {
    const f = await fixture({ agent: 'claude', model });
    try {
      const before = f.choice();
      await f.openPicker();
      const row = f.fastRow();
      assert.ok(row, 'original unsupported local Fast is disabled, not an absent row');
      assert.equal(row.disabled, true);
      assert.equal(row.getAttribute('aria-checked'), 'false');
      await f.clickFast();
      assert.deepEqual(f.choice(), before);
      assert.equal(f.choiceWrites().length, 0);
      assert.deepEqual(f.deliveries, []);
    } finally { await f.close(); }
  });

  test(`mounted local Fast unsupported command control: Claude ${model} cannot enable Fast or deliver the app-owned command`, async () => {
    const f = await fixture({ agent: 'claude', model });
    try {
      const before = f.choice();
      await f.command();
      assert.deepEqual(f.choice(), before);
      assert.equal(f.choiceWrites().length, 0);
      assert.deepEqual(f.deliveries, []);
      assert.match(f.alert(), /not available/);
    } finally { await f.close(); }
  });
}

for (const { model } of eligible) {
  test(`mounted local Fast Reason/ACP control: raw ${model} does not inherit local capability`, async () => {
    const f = await fixture({ agent: 'reason', model });
    try {
      const before = f.choice();
      await f.openPicker();
      assert.equal(f.fastRow(), null);
      await f.command();
      assert.deepEqual(f.choice(), before);
      assert.equal(f.choiceWrites().length, 0);
      assert.deepEqual(f.deliveries, []);
      assert.match(f.alert(), /not available for Reason/);
    } finally { await f.close(); }
  });
}
