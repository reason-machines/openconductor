// Conductor Rebuild: execute only the actual dependency-setup block, with npm inert.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../../src/features/settings/caffeinateConsumer.test.ts', import.meta.url), 'utf8');
const start = source.indexOf('    const dependencyFiles = [');
const end = source.indexOf('    const result = runGraph(folder, "baseline");', start);
assert.ok(start > 0 && end > start);
const setup = source.slice(start, end);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture({ drift = true, result = { status: 0, signal: null, stdout: '', stderr: '' }, mutate } = {}, check) {
  const root = mkdtempSync(join(tmpdir(), 'oc-dependency-current-'));
  const folder = mkdtempSync(join(tmpdir(), 'oc-dependency-frozen-'));
  try {
    const files = new Map();
    for (const name of ['package.json', 'package-lock.json']) {
      const bytes = Buffer.from(`${name}: frozen bytes\n`);
      writeFileSync(join(folder, name), bytes);
      writeFileSync(join(root, name), drift ? Buffer.concat([bytes, Buffer.from('later dependency\n')]) : bytes);
      files.set(name, sha256(bytes));
    }
    const installs = [], links = [];
    const execute = () => runInNewContext(setup, {
      assert, sha256, readFileSync, join, root, folder, manifest: { files },
      symlinkSync: (...args) => { links.push(args); },
      spawnSync: (...args) => { installs.push(args); mutate?.(folder); return result; },
    });
    check({ execute, installs, links, root, folder });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(folder, { recursive: true, force: true });
  }
}

test('identical manifests retain the existing dependency symlink without installing', () => {
  fixture({ drift: false }, ({ execute, installs, links, root, folder }) => {
    execute();
    assert.deepEqual(installs, []);
    assert.deepEqual(links, [[join(root, 'node_modules'), join(folder, 'node_modules'), 'dir']]);
  });
});

test('drift installs the immutable graph with scripts disabled, without reusing current dependencies', () => {
  fixture({}, ({ execute, installs, links, folder }) => {
    execute();
    assert.deepEqual(links, []);
    assert.equal(installs.length, 1);
    assert.equal(installs[0][0], 'npm');
    assert.deepEqual(Array.from(installs[0][1]), ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--include=dev', '--prefer-offline']);
    assert.equal(installs[0][2].cwd, folder);
    assert.equal(installs[0][2].timeout, 180000);
  });
});

for (const [name, result] of [
  ['launch error', { error: new Error('missing npm'), status: null, signal: null, stdout: '', stderr: '' }],
  ['nonzero exit', { status: 1, signal: null, stdout: '', stderr: 'install failed' }],
  ['termination signal', { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }],
]) {
  test(`${name} remains a hard setup failure, never a semantic baseline RED`, () => {
    fixture({ result }, ({ execute }) => assert.throws(execute, { code: 'ERR_ASSERTION' }));
  });
}

for (const name of ['package.json', 'package-lock.json']) {
  test(`a successful installer cannot rewrite frozen ${name}`, () => {
    fixture({ mutate: folder => writeFileSync(join(folder, name), 'changed') }, ({ execute }) => {
      assert.throws(execute, /frozen install must preserve historical bytes/);
    });
  });
}
