const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const read = (name) => readFileSync(join(__dirname, 'reference', name + '.txt'), 'utf8');

for (const outcome of ['refused', 'rejected', 'legacy-rejected', 'saved']) {
  test(`retained send-key USER change callback handles ${outcome} persistence`, async () => {
    const notifications = [];
    const writes = [];
    let registration;
    const context = vm.createContext({
      ir: (row) => { registration = row; },
      p: { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      Z5e: 'fixture-select-row',
      Ss: 'fixture-shortcut',
      iFt: () => 'enter',
      kt: { error: (message) => notifications.push(message) },
      K_: ['fixture-send-command'],
      zl: { 'cmd-enter': { 'fixture-send-command': [] } },
      rU: { updateMany: async (update) => {
        writes.push({ boundary: 'overrides', update });
        if (outcome === 'rejected') throw new Error('Fixture override rejection');
        return outcome !== 'refused';
      } },
      gu: { writeLegacyMessageSendKey: async (mode) => {
        writes.push({ boundary: 'legacy', mode });
        if (outcome === 'legacy-rejected') throw new Error('Fixture legacy rejection');
        return true;
      } },
    });
    vm.runInContext(read('BUt') + read('RQt') + read('bga') + ';var xAn = RQt;' + read('registration'), context, { timeout: 1000 });
    assert.deepEqual(Array.from(registration.scopes), ['user']);
    const row = registration.render(registration);
    assert.equal(row.type, 'fixture-select-row');
    row.props.onValueChange('cmd-enter');
    await new Promise(setImmediate);
    assert.deepEqual(notifications, outcome === 'saved' ? [] : ['Failed to update message send key']);
    assert.deepEqual(writes.map((write) => write.boundary),
      outcome === 'refused' || outcome === 'rejected' ? ['overrides'] : ['overrides', 'legacy']);
  });
}
