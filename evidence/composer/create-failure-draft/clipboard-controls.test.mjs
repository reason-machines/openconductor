import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const appText = readFileSync("src/App.tsx", "utf8");
const app = ts.createSourceFile("App.tsx", appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = [];
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(app) === "onWarning") callbacks.push(node.initializer.expression.getText(app));
  ts.forEachChild(node, visit);
}
visit(app);
assert.equal(callbacks.length, 2);
const adapter = readFileSync("src/features/openIn/apps.ts", "utf8");
function evaluate(source, context) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, ...context });
  return exports;
}
function warning(index, clipboard) {
  const calls = [];
  const { copyText } = evaluate(adapter, {
    navigator: { clipboard },
    require(name) {
      assert.equal(name, "@tauri-apps/api/core");
      return { isTauri: () => false, invoke: () => assert.fail("No native invocation is admitted") };
    },
  });
  const { consume } = evaluate(`export const consume = ${callbacks[index]};`, {
    copyText,
    show: (kind, message, options) => { calls.push({ kind, message, options }); },
  });
  return { calls, consume };
}
const prompt = "  Submitted café\nnot the replacement draft  ";
for (const [index, surface] of [[0, "page warning"], [1, "dialog warning"]]) {
  test(`${surface}: recover copies captured bytes and confirms only after fulfillment`, async () => {
    let resolve;
    const pending = new Promise((yes) => { resolve = yes; });
    const writes = [];
    const { calls, consume } = warning(index, { writeText: (text) => { writes.push(text); return pending; } });
    consume("original failure", { prompt });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "error");
    assert.equal(calls[0].message, "original failure");
    assert.equal(calls[0].options.sticky, true);
    assert.equal(calls[0].options.action.label, "Recover prompt");
    assert.deepEqual(writes, []);
    calls[0].options.action.onClick();
    assert.deepEqual(writes, [prompt]);
    assert.equal(calls.length, 1, "Never report a copy before its promise fulfills");
    resolve();
    await new Promise(setImmediate);
    assert.deepEqual(calls.slice(1).map(({ kind, message }) => ({ kind, message })), [{ kind: "info", message: "Copied prompt to clipboard" }]);
  });
  test(`${surface}: clipboard rejection is contained and never reports success`, async () => {
    const writes = [];
    const { calls, consume } = warning(index, { writeText: async (text) => { writes.push(text); throw new Error("Synthetic denied clipboard"); } });
    consume("original failure", { prompt });
    calls[0].options.action.onClick();
    await new Promise(setImmediate);
    assert.deepEqual(writes, [prompt]);
    assert.deepEqual(calls.slice(1).map(({ kind, message }) => ({ kind, message })), [{ kind: "error", message: "Failed to copy to clipboard" }]);
  });
  test(`${surface}: missing clipboard is contained by the same error-reporting path`, async () => {
    const { calls, consume } = warning(index, undefined);
    consume("original failure", { prompt });
    calls[0].options.action.onClick();
    await new Promise(setImmediate);
    assert.deepEqual(calls.slice(1).map(({ kind, message }) => ({ kind, message })), [{ kind: "error", message: "Failed to copy to clipboard" }]);
  });
  test(`${surface}: existing one-argument warnings keep their sticky error and no action`, () => {
    const { calls, consume } = warning(index, { writeText: () => assert.fail("Legacy warnings cannot copy") });
    consume("Existing unrelated warning");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "error");
    assert.equal(calls[0].message, "Existing unrelated warning");
    assert.equal(calls[0].options.sticky, true);
    assert.equal(calls[0].options.action, undefined);
  });
}
