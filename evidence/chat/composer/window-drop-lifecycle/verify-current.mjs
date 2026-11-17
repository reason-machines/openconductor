import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const dir = "evidence/chat/composer/window-drop-lifecycle";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(path, "utf8");
const checks = JSON.parse(read(join(dir, "checks.json")));
const reference = JSON.parse(read(join(dir, "reference.json")));
const hookPath = "src/features/chat/useWindowDragDrop.ts";
const fixturePath = "src/features/chat/useWindowDragDropLifecycle.test.ts";
const frozenPath = join(dir, "frozen/windowDropLifecycle.qualification.test.mjs");
const baselinePath = join(dir, "frozen/main", hookPath);

assert.equal(hash(readFileSync(frozenPath)), checks.frozenFixtureSha256);
assert.equal(hash(readFileSync(fixturePath)), checks.dedicatedFixtureSha256);
assert.equal(hash(readFileSync(baselinePath)), checks.baselineHookSha256);
assert.equal(hash(execFileSync("git", ["show", `${checks.baselineMain}:${hookPath}`])), checks.baselineHookSha256);
assert.equal(hash(readFileSync(hookPath)), checks.treatmentHookSha256);

function parse(path) {
  const ast = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, `${path} parses completely`);
  return ast;
}
function shape(node) {
  const children = [];
  ts.forEachChild(node, (child) => { children.push(shape(child)); });
  return [node.kind, ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : null, children];
}
function cases(ast) {
  return ast.statements.filter((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(ast) === "test").map(shape);
}
const frozenCases = cases(parse(frozenPath));
assert.equal(frozenCases.length, 8);
assert.deepEqual(cases(parse(fixturePath)), frozenCases);

function nativeConversion(ast) {
  return ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "nativePathToFile").getText(ast);
}
assert.equal(nativeConversion(parse(hookPath)), nativeConversion(parse(baselinePath)));

assert.equal(reference.manifest.length, 6);
const parent = process.argv[2] ? readFileSync(process.argv[2]) : null;
if (parent) {
  assert.equal(parent.byteLength, checks.originalParentBytes);
  assert.equal(hash(parent), reference.parentSha256);
}
for (const span of reference.manifest) {
  const bytes = readFileSync(join(dir, span.file));
  assert.equal(bytes.byteLength, span.bytes);
  assert.equal(hash(bytes), span.sha256);
  assert.equal(parse(join(dir, span.file)).parseDiagnostics.length, 0);
  if (parent) {
    assert.ok(bytes.equals(parent.subarray(...span.utf8)));
    assert.equal(bytes.toString("utf8"), parent.toString("utf8").slice(...span.utf16));
  }
}

const changed = execFileSync("git", ["diff", "--name-only", checks.baselineMain], { encoding: "utf8" }).trim().split("\n");
for (const path of changed) {
  assert.ok(path === hookPath || path === fixturePath || path.startsWith(`${dir}/`), `outside hook-only lease: ${path}`);
}
console.log("PASS: exact frozen/dedicated/baseline/treatment hashes; all eight case ASTs unchanged; nativePathToFile unchanged; six complete source spans; tracked diff confined to lease.");
console.log(parent ? "PASS: retained original full parent identity and exact UTF8/UTF16 ranges (read as inert data only)." : "Original full parent not supplied; checked retained span hashes/syntax only.");
