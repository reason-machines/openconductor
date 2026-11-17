// Supplemental controls, separate from the unchanged frozen 31-case regression.
// No provider events, process, app, file IPC or transport is synthesized or run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { conductorTools } from "../../../src/features/chat/conductorTools.ts";
import type { ReasonPath } from "../../../src/features/chat/reason.ts";

const primary: ReasonPath = { raw: "/local/project/src/same.txt", relative: "src/same.txt", place: "cloud", sessionId: "cloud-parent" };
const child: ReasonPath = { raw: "/cloud/child/src/second.txt", relative: "src/second.txt", place: "cloud", sessionId: "cloud-child" };
const local: ReasonPath = { raw: primary.raw, relative: primary.relative, place: "local" };
const project = (input: Record<string, unknown>) => conductorTools("fixture", { kind: "read", paths: [primary], title: "Read: same.txt", ...input });

test("Read and NotebookRead keep the primary location object, including Session ID", () => {
  for (const title of ["Read: same.txt", "NotebookRead: same.txt"]) {
    const tool = project({ title, diffs: [{ path: child, oldText: null, newText: "child" }] })[0]!;
    assert.equal(tool.input.file_path, primary.raw);
    assert.strictEqual(tool.fileTarget, primary);
  }
});
test("split Write/Edit rows retain each diff's own location and Session ID", () => {
  const rows = project({ kind: "edit", diffs: [
    { path: primary, oldText: null, newText: "created" },
    { path: child, oldText: "old", newText: "new" },
  ] });
  assert.deepEqual(rows.map((r) => r.name), ["Write", "Edit"]);
  assert.strictEqual(rows[0]!.fileTarget, primary);
  assert.strictEqual(rows[1]!.fileTarget, child);
});
test("raw-input early return keeps name/input precedence and matching cloud identity", () => {
  const rawInput = { file_path: primary.raw, offset: 7, custom: "unchanged" };
  const tool = project({ toolName: "Read", rawInput })[0]!;
  assert.equal(tool.name, "Read");
  assert.strictEqual(tool.input, rawInput);
  assert.strictEqual(tool.fileTarget, primary);
});
test("raw-input relative file path retains explicitly reported identity", () => {
  const rawInput = { file_path: primary.relative, custom: "unchanged" };
  const tool = project({ toolName: "Read", rawInput })[0]!;
  assert.strictEqual(tool.input, rawInput);
  assert.strictEqual(tool.fileTarget, primary);
});
test("raw-input override never inherits an unrelated cloud location", () => {
  for (const toolName of [undefined, "Read"]) {
    const rawInput = { file_path: "/different/local.txt" };
    const tool = project({ toolName, rawInput })[0]!;
    assert.deepEqual(tool.input, rawInput);
    assert.equal(tool.fileTarget, undefined);
  }
});
test("raw-input exact raw match precedes another location's relative alias", () => {
  const alias: ReasonPath = { raw: "/unrelated/remote", relative: primary.raw, place: "cloud", sessionId: "not-primary" };
  const tool = project({ paths: [alias, primary], toolName: "Read", rawInput: { file_path: primary.raw } })[0]!;
  assert.strictEqual(tool.fileTarget, primary);
});
test("ambiguous relative aliases do not fabricate a target or Session ID", () => {
  const tool = project({ paths: [primary, local], toolName: "Read", rawInput: { file_path: primary.relative } })[0]!;
  assert.equal(tool.fileTarget, undefined);
});
test("a reported diff path supplies identity when the primary location is absent", () => {
  const tool = project({ paths: [], diffs: [{ path: child, oldText: null, newText: "child" }] })[0]!;
  assert.equal(tool.input.file_path, child.raw);
  assert.strictEqual(tool.fileTarget, child);
});
test("legacy incomplete path objects stay untyped rather than being made local", () => {
  const tool = project({ paths: [{ raw: primary.raw, relative: primary.relative }] })[0]!;
  assert.deepEqual(tool.input, { file_path: primary.raw });
  assert.equal(tool.fileTarget, undefined);
});

const source = readFileSync(new URL("../../../src/components/WorkspaceView.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("WorkspaceView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = (predicate: (node: ts.Node) => boolean) => {
  const out: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) out.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  return out;
};
const callbacks = find((n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "openFileOrViewer") as ts.VariableDeclaration[];
assert.equal(callbacks.length, 1);
const initializer = callbacks[0]!.initializer;
assert.ok(initializer && ts.isCallExpression(initializer) && initializer.arguments[0]);
const callback = initializer.arguments[0].getText(ast);
const attributes = find((n) => ts.isJsxAttribute(n) && n.name.getText(ast) === "onOpenFile" && n.getText(ast).includes("path.startsWith(`${cwd}/`)")) as ts.JsxAttribute[];
assert.equal(attributes.length, 1);
const binding = attributes[0]!.initializer;
assert.ok(binding && ts.isJsxExpression(binding) && binding.expression);
function evaluate<T>(expression: string, globals: Record<string, unknown>): T {
  const exports = {} as { value: T };
  const compiled = ts.transpileModule(`export const value = (${expression});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, { exports, ...globals });
  return exports.value;
}
function route(path: string, target: ReasonPath | undefined, files: string[]) {
  const effects: string[] = [];
  const notices: string[] = [];
  const openFile = evaluate<(path: string, target?: ReasonPath) => void>(callback, {
    workspace: { path: "/local/project" },
    diff: { files: files.map((path) => ({ path })), openPath: (path: string) => effects.push(`diff:${path}`) },
    openAnyFile: (path: string) => effects.push(`viewer:${path}`),
    notify: (_kind: string, message: string) => notices.push(message),
  });
  const click = evaluate<(path: string, target?: ReasonPath) => void>(binding.expression!.getText(ast), { cwd: "/local/project", openFile });
  click(path, target);
  return { effects, notices };
}
for (const target of [child, primary]) test(`explicit cloud absolute path equal to exact diff key cannot open locally: ${target.sessionId}`, () => {
  // The first case is outside the worktree: the legacy exact diff match won
  // before the absolute guard. The second also checks cwd normalization.
  const result = route(target.raw, target, [target.raw, target.relative!]);
  assert.deepEqual(result.effects, []);
  assert.equal(result.notices.length, 1);
  assert.match(result.notices[0]!, /cloud file/);
});
test("explicit cloud relative path equal to local diff key cannot open locally", () => {
  const result = route(primary.relative!, primary, [primary.relative!]);
  assert.deepEqual(result.effects, []);
  assert.equal(result.notices.length, 1);
});
test("local target after cloud still opens the local diff", () => {
  const result = route(local.raw, local, [local.relative!]);
  assert.deepEqual(result, { effects: [`diff:${local.relative}`], notices: [] });
});
test("untyped local absolute paths keep cwd normalization and viewer routing", () => {
  assert.deepEqual(route(local.raw, undefined, []), { effects: [`viewer:${local.relative}`], notices: [] });
});
test("untyped outside-worktree absolute paths retain the literal cloud notice", () => {
  const result = route(child.raw, undefined, []);
  assert.deepEqual(result.effects, []);
  assert.equal(result.notices.length, 1);
});
test("untyped exact absolute diff matches keep legacy precedence", () => {
  assert.deepEqual(route(child.raw, undefined, [child.raw]), { effects: [`diff:${child.raw}`], notices: [] });
});
test("ChatPanel forwards the exact target object and original cloud string", () => {
  const seen: { path: string; target?: ReasonPath }[] = [];
  const click = evaluate<(path: string, target?: ReasonPath) => void>(binding.expression!.getText(ast), {
    cwd: "/local/project", openFile: (path: string, target?: ReasonPath) => seen.push({ path, target }),
  });
  click(primary.raw, primary);
  assert.equal(seen[0]!.path, primary.raw);
  assert.strictEqual(seen[0]!.target, primary);
  assert.equal(seen[0]!.target?.sessionId, "cloud-parent");
});
