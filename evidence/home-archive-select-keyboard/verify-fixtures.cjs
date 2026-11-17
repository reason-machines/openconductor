// Compare every existing test call and assertion AST against the retained original bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = __dirname;
const originals = JSON.parse(fs.readFileSync(path.join(root, 'structural-fixtures-before.sha256.json'), 'utf8'));
let tests = 0, assertions = 0;
function calls(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result = { tests: [], assertions: [] };
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const target = node.expression.getText(source);
      if (/^test(?:\.|$)/.test(target)) result.tests.push(node.getText(source));
      if (/^assert(?:\.|$)/.test(target)) result.assertions.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
for (const [file, digest] of Object.entries(originals)) {
  const before = execFileSync('tar', ['-xOf', path.join(root, 'structural-fixtures-before.tar.gz'), file]);
  assert.equal(createHash('sha256').update(before).digest('hex'), digest, file + ' original bytes');
  const a = calls(file, before.toString('utf8'));
  const b = calls(file, fs.readFileSync(file, 'utf8'));
  assert.deepEqual(b.tests, a.tests, file + ' test call/body text unchanged');
  assert.deepEqual(b.assertions, a.assertions, file + ' assertion text unchanged');
  tests += a.tests.length; assertions += a.assertions.length;
}
assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'frozen/archiveKeyboard.test.cjs'))).digest('hex'), '6ee3125f62b9f9f5e6267a7d96f1a8d36391fa4eaeabfbacef5575e767d180db');
console.log(JSON.stringify({ files: Object.keys(originals).length, testCalls: tests, assertions, originalBytesVerified: true, testBodiesUnchanged: true, assertionTextUnchanged: true, frozenV2Unchanged: true }));
