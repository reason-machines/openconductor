import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { DiffComment } from "./comments.ts";
import type { CommentStore } from "./commentStore.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const products = new Set(["ReviewComments.tsx", "comments.ts", "commentStore.ts", "nav.ts"].map((name) => resolve(root, "src/features/diff", name)));
let nextFixture = 0;

async function fixture() {
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const stores = new Map<string, CommentStore>();
  const storage = new Map<string, string>();
  let failSave = false;
  function load(filename: string): Record<string, unknown> {
    assert.ok(products.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_COMMENT_DRAFT_REF && relative === "src/features/diff/ReviewComments.tsx"
      ? execFileSync("git", ["show", `${process.env.DIFF_COMMENT_DRAFT_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function require(name: string): unknown {
      if (["react", "react/jsx-runtime"].includes(name)) return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { openUrl: () => assert.fail("Unexpected external URL") };
      if (name === "../../components/DialogFrame") return { DialogFrame: ({ children }: { children: unknown }) => React.createElement("dialog", null, children) };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined };
      if (name === "./commentsApi.ts") return { commentStoreFor: (id: string) => {
        const store = stores.get(id);
        assert.ok(store, `Unseeded workspace: ${id}`);
        return store;
      } };
      if (name === "./commentMarkdown.ts") return { CommentMarkdown: ({ text }: { text: string }) => React.createElement("comment-body", null, text) };
      if (name === "./FileDiffView") return { revealLine: () => assert.fail("Unexpected line navigation") };
      return load(resolve(dirname(filename), name));
    }
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      console, Map, Set, setInterval: () => assert.fail("Unexpected background sync"), clearInterval() {},
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const commentModule = load(resolve(root, "src/features/diff/comments.ts"));
  const storeModule = load(resolve(root, "src/features/diff/commentStore.ts"));
  assert.ok(typeof commentModule.newLocalComment === "function" && typeof storeModule.localCommentStore === "function");
  const a = `draft-a-${++nextFixture}`;
  const b = `draft-b-${nextFixture}`;
  const comments: DiffComment[] = [];
  for (const workspace of [a, b]) {
    const store: CommentStore = storeModule.localCommentStore({ getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); } }, workspace);
    for (const id of ["first", "second"]) {
      const comment = commentModule.newLocalComment({ id, workspaceId: workspace, filePath: "example.txt", side: "new", start: 3, end: 5, body: `${workspace}:${id}:saved`, now: 1 });
      comments.push(comment);
      await store.add(comment);
    }
    stores.set(workspace, { ...store, edit: (id, body) => failSave ? Promise.reject(new Error("Deliberate save failure")) : store.edit(id, body) });
  }
  const reviewModule = load(resolve(root, "src/features/diff/ReviewComments.tsx"));
  assert.ok(typeof reviewModule.useReviewComments === "function");
  const useReviewComments = reviewModule.useReviewComments;
  const chat = { insert() {}, send() {}, attach() {} };
  const file = { path: "example.txt" };
  function Harness({ workspace, visible = true }: { workspace: string; visible?: boolean }) {
    const review = useReviewComments(workspace, chat);
    return visible ? review.annotations(file, { side: "new", line: 5 }) : null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness, { workspace: a })); });
  const buttons = (label: string) => renderer.root.findAll((node: { type: unknown; props: { children: unknown } }) => node.type === "button" && node.props.children === label);
  const texts = () => renderer.root.findAllByType("textarea");
  const click = async (label: string, index = 0) => { await act(async () => { assert.ok(buttons(label)[index], `Missing ${label} action`); buttons(label)[index].props.onClick(); }); };
  return {
    a, b, comments, texts, click, buttons,
    type: async (body: string, index = 0) => { await act(async () => { assert.ok(texts()[index], `Missing editor ${index}`); texts()[index].props.onChange({ target: { value: body } }); }); },
    show: async (workspace = a, visible = true) => { await act(async () => { renderer.update(React.createElement(Harness, { workspace, visible })); }); },
    remount: async (workspace = a) => { await act(async () => renderer.unmount()); await act(async () => { renderer = create(React.createElement(Harness, { workspace })); }); },
    list: (workspace = a) => { const store = stores.get(workspace); assert.ok(store); return store.list(); },
    rejectSaves: () => { failSave = true; },
    close: async () => { await act(async () => renderer.unmount()); },
  };
}

for (const body of ["unsaved replacement", ""]) {
  test(`comment edit survives annotation unmount with ${body === "" ? "empty" : "nonempty"} draft`, async (t) => {
    const f = await fixture(); t.after(f.close);
    await f.click("Edit"); await f.type(body);
    await f.show(f.a, false); await f.show();
    assert.equal(f.texts().length, 1, "Retained edit must reopen after annotation unmount");
    assert.equal(f.texts()[0].props.value, body);
    assert.equal((await f.list())[0].body, `${f.a}:first:saved`, "Typing must not persist the body");
  });
}

test("comment edit survives full review remount and stays isolated by comment and workspace", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.click("Edit"); await f.type("first comment draft");
  await f.remount(f.b);
  assert.equal(f.texts().length, 0, "Same comment ID in another workspace must not inherit the draft");
  await f.remount();
  assert.equal(f.texts().length, 1, "Retained edit must reopen after review remount");
  assert.equal(f.texts()[0].props.value, "first comment draft");
  assert.equal(f.buttons("Edit").length, 1, "The second comment must remain unedited");
});

test("successful save persists body and clears only the edited draft", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.click("Edit"); await f.type("saved replacement");
  await f.click("Edit"); await f.type("second comment draft", 1);
  await f.click("Save");
  assert.equal(f.texts().length, 1, "Saving one comment must not clear another comment's draft");
  assert.equal(f.texts()[0].props.value, "second comment draft");
  assert.equal((await f.list())[0].body, "saved replacement");
  assert.equal((await f.list())[1].body, `${f.a}:second:saved`, "Other draft must remain unpersisted");
  await f.click("Save");
  await f.remount(); assert.equal(f.texts().length, 0, "Saved drafts must not reopen");
  await f.click("Edit"); assert.equal(f.texts()[0].props.value, "saved replacement");
});

test("failed save retains unpersisted draft across review remount", async (t) => {
  const f = await fixture(); t.after(f.close); f.rejectSaves();
  await f.click("Edit"); await f.type("retry this body"); await f.click("Save");
  assert.equal(f.texts()[0].props.value, "retry this body");
  await f.remount();
  assert.equal(f.texts().length, 1, "Failed-save draft must reopen after review remount");
  assert.equal(f.texts()[0].props.value, "retry this body");
  assert.equal((await f.list())[0].body, `${f.a}:first:saved`);
});

test("cancel keeps dirty draft until explicit discard and never writes stored body", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.click("Edit"); await f.type("discard this body");
  await f.click("Edit"); await f.type("keep second draft", 1);
  await f.click("Cancel");
  await f.click("Keep editing"); assert.equal(f.texts()[0].props.value, "discard this body");
  await f.click("Cancel"); await f.click("Discard");
  assert.equal(f.texts().length, 1, "Discarding one comment must not clear another comment's draft");
  assert.equal(f.texts()[0].props.value, "keep second draft");
  await f.click("Cancel"); await f.click("Discard");
  await f.remount(); assert.equal(f.texts().length, 0);
  assert.deepEqual(Array.from(await f.list(), (c) => c.body), [`${f.a}:first:saved`, `${f.a}:second:saved`]);
  await f.click("Edit"); assert.equal(f.texts()[0].props.value, `${f.a}:first:saved`);
});
