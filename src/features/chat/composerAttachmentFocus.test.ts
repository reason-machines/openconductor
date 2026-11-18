import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { ComposerSession } from "./composerSession.ts";
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";

// Qualifies the actual parent attachment callback with real ComposerSession state.
// File reads, storage and editor focus are inert ports: no OS picker, native IPC,
// browser, provider or package behavior is claimed by this fixture.
const source = readFileSync(new URL("../../components/WorkspaceView.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("WorkspaceView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const candidates: ts.FunctionDeclaration[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "attachFiles") candidates.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(candidates.length, 1, "one actual WorkspaceView attachment callback");
const callbackSource = ts.transpileModule(candidates[0]!.getText(tree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const bytes = () => new Uint8Array([104, 105]).buffer;
function file(read: () => Promise<ArrayBuffer> = async () => bytes()) {
  return { name: "fixture.txt", size: 2, arrayBuffer: read };
}
type PickedFile = ReturnType<typeof file>;

async function fixture({ attached = true } = {}) {
  const focused: string[] = [];
  const editor = { focus: () => { focused.push("original"); } } as unknown as ComposerEditorHandle;
  const inputRef: { current: ComposerEditorHandle | null } = { current: attached ? editor : null };
  const store = {
    async load() { return { message: "retained draft", attachments: [] }; },
    async save() { return true; },
    async clear() {},
  };
  const session = new ComposerSession("attachment-focus-fixture", store);
  await session.connect();
  const attachFiles = new Function("session", "reason", "workspace", "draftAttachmentsApi", "inputRef", `${callbackSource}\nreturn attachFiles;`)(
    session, false, { id: "fixture-workspace" }, { write: () => assert.fail("no platform writes in local fixture") }, inputRef,
  ) as (files: PickedFile[]) => Promise<void>;
  return {
    focused, inputRef, session, attachFiles,
    replace() { inputRef.current = { focus: () => { focused.push("replacement"); } } as unknown as ComposerEditorHandle; },
    dispose() { inputRef.current = null; session.disconnect(); },
  };
}

test("nonempty attachment attempt refocuses its live captured editor after settlement", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  const read = deferred<ArrayBuffer>();
  const pending = view.attachFiles([file(() => read.promise)]);
  assert.deepEqual(view.focused, [], "never eagerly focus before the local attachment attempt settles");
  read.resolve(bytes()); await pending;
  assert.equal(view.session.snapshot().attachments.length, 1);
  assert.equal(view.session.snapshot().draft, "retained draft");
  assert.deepEqual(view.focused, ["original"]);
});

test("an empty selection preserves the draft and does not focus", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  await view.attachFiles([]);
  assert.deepEqual(view.focused, []);
  assert.equal(view.session.snapshot().draft, "retained draft");
  assert.equal(view.session.snapshot().attachments.length, 0);
});

test("the local swallowed file-read error and retained draft remain visible", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  await view.attachFiles([file(async () => { throw new Error("fixture read refused"); })]);
  assert.match(view.session.snapshot().error ?? "", /fixture read refused/);
  assert.equal(view.session.snapshot().attachments.length, 0);
  assert.equal(view.session.snapshot().draft, "retained draft");
  // Original local IIr may resolve after launching asynchronous processing.
  // This control intentionally does not invent native write-error focus policy.
});

test("detaching during a pending read does not refocus the old editor", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  const read = deferred<ArrayBuffer>();
  const pending = view.attachFiles([file(() => read.promise)]);
  view.inputRef.current = null;
  read.resolve(bytes()); await pending;
  assert.deepEqual(view.focused, []);
  assert.equal(view.session.snapshot().attachments.length, 1, "pending work stays with its original session");
});

test("replacing the handle during a pending read never focuses the replacement", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  const read = deferred<ArrayBuffer>();
  const pending = view.attachFiles([file(() => read.promise)]);
  view.replace();
  read.resolve(bytes()); await pending;
  assert.deepEqual(view.focused, []);
  assert.equal(view.session.snapshot().attachments.length, 1);
});

test("an absent initial editor does not acquire a replacement after the read", async (t) => {
  const view = await fixture({ attached: false }); t.after(view.dispose);
  const read = deferred<ArrayBuffer>();
  const pending = view.attachFiles([file(() => read.promise)]);
  view.replace();
  read.resolve(bytes()); await pending;
  assert.deepEqual(view.focused, []);
  assert.equal(view.session.snapshot().attachments.length, 1);
});

test("a pending attachment in one composer cannot focus a second composer", async (t) => {
  const first = await fixture(), second = await fixture();
  t.after(first.dispose); t.after(second.dispose);
  const read = deferred<ArrayBuffer>();
  const pending = first.attachFiles([file(() => read.promise)]);
  assert.deepEqual(first.focused, []);
  assert.deepEqual(second.focused, []);
  read.resolve(bytes()); await pending;
  assert.deepEqual(second.focused, []);
  assert.equal(second.session.snapshot().attachments.length, 0);
});

test("an adapter rejection is not converted to a successful focus", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  view.session.attach = async () => { throw new Error("fixture adapter rejected"); };
  await assert.rejects(view.attachFiles([file()]), /fixture adapter rejected/);
  assert.deepEqual(view.focused, []);
  assert.equal(view.session.snapshot().draft, "retained draft");
});
