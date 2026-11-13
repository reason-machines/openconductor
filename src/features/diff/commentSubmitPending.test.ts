import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { CommentStore } from "./commentStore.ts";
import type { DiffComment } from "./comments.ts";
import type { useReviewComments } from "./ReviewComments.tsx";
import type { FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const products = new Set(["ReviewComments.tsx", "comments.ts", "commentStore.ts", "nav.ts"].map((name) => resolve(root, "src/features/diff", name)));
let nextFixture = 0;

async function fixture() {
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const storage = new Map<string, string>();
  const writes: { comment: DiffComment; resolve: () => void; reject: (reason: unknown) => void; settled: boolean }[] = [];
  let store: CommentStore;
  function load(filename: string): Record<string, unknown> {
    assert.ok(products.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const javascript = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function require(name: string): unknown {
      if (["react", "react/jsx-runtime"].includes(name)) return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { openUrl: () => assert.fail("Unexpected external URL") };
      if (name === "../../components/DialogFrame") return { DialogFrame: ({ children }: { children: unknown }) => React.createElement("dialog", null, children) };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined };
      if (name === "./commentsApi.ts") return { commentStoreFor: () => store };
      if (name === "./commentMarkdown.ts") return { CommentMarkdown: ({ text }: { text: string }) => React.createElement("comment-body", null, text) };
      if (name === "./FileDiffView") return { revealLine: () => assert.fail("Unexpected line navigation") };
      return load(resolve(dirname(filename), name));
    }
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      console, Map, Set, Error, crypto: { randomUUID },
      setInterval: () => assert.fail("Unexpected background sync"), clearInterval() {},
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const storeModule = load(resolve(root, "src/features/diff/commentStore.ts"));
  assert.ok(typeof storeModule.localCommentStore === "function");
  const workspace = `submit-pending-${++nextFixture}`;
  const local: CommentStore = storeModule.localCommentStore({
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  }, workspace);
  store = { ...local, add: (comment) => new Promise<void>((resolve, reject) => { writes.push({ comment, resolve, reject, settled: false }); }) };
  const reviewModule = load(resolve(root, "src/features/diff/ReviewComments.tsx"));
  assert.ok(typeof reviewModule.useReviewComments === "function");
  const useReview = reviewModule.useReviewComments;
  const unexpected = () => assert.fail("Unexpected chat operation");
  const file: FileDiff = { path: "example.txt", old_path: null, status: "modified", binary: false, additions: 2, deletions: 0, hunks: [] };
  let review: ReturnType<typeof useReviewComments>;
  function Harness() {
    review = useReview(workspace, { insert: unexpected, send: unexpected, attach: unexpected });
    return React.createElement(React.Fragment, null,
      ...[5, 9].map((line) => React.createElement("div", { key: line, "data-test-anchor": line }, review.annotations(file, { side: "new", line }))),
      review.actions());
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const anchor = (line = 5) => renderer.root.findByProps({ "data-test-anchor": line });
  const editors = (line = 5) => anchor(line).findAllByType("textarea");
  const editor = (line = 5) => { assert.equal(editors(line).length, 1, `Expected draft at ${line}`); return editors(line)[0]; };
  const button = (line = 5) => anchor(line).find((node: { type: unknown; props: { children: unknown } }) => node.type === "button" && node.props.children === "Comment");
  return {
    workspace, writes, editors, button,
    open: async (line = 5) => { await act(async () => { review.onLineClick(file, { side: "new", start: line - 1, line }); }); },
    type: async (body: string, line = 5) => { await act(async () => editor(line).props.onChange({ target: { value: body } })); },
    value: (line = 5) => editor(line).props.value,
    click: async (line = 5) => { await act(async () => { assert.equal(button(line).props.disabled, false); button(line).props.onClick(); }); },
    shortcut: async (modifier: "metaKey" | "ctrlKey", line = 5) => { await act(async () => editor(line).props.onKeyDown({
      key: "Enter", metaKey: modifier === "metaKey", ctrlKey: modifier === "ctrlKey", keyCode: 13, which: 13,
      nativeEvent: { isComposing: false }, preventDefault() {},
    })); },
    saved: () => local.list(),
    commitAll: async () => { await act(async () => {
      for (const write of writes.filter((write) => !write.settled)) { await local.add(write.comment); write.settled = true; write.resolve(); }
    }); },
    reject: async () => { await act(async () => {
      const write = writes.find((write) => !write.settled); assert.ok(write); write.settled = true; write.reject(new Error("disk full"));
    }); },
    close: async () => { await act(async () => {
      for (const write of writes.filter((write) => !write.settled)) { write.settled = true; write.reject(new Error("fixture disposed")); }
    }); await act(async () => renderer.unmount()); },
  };
}

test("double click while a new comment commit is pending persists one identity", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open(); await f.type("one comment"); await f.click(); await f.click();
  await f.commitAll();
  const saved = await f.saved();
  assert.equal(saved.length, 1, "One pending draft must not persist two comments");
  assert.equal(new Set(saved.map((comment) => comment.id)).size, 1);
  assert.equal(saved[0].body, "one comment");
  assert.equal(f.editors().length, 0);
});

test("click then shortcut while a new comment commit is pending persists one identity", async (t) => {
  for (const modifier of ["metaKey", "ctrlKey"] satisfies ("metaKey" | "ctrlKey")[]) {
    const f = await fixture(); t.after(f.close);
    await f.open(); await f.type("one shortcut comment"); await f.click(); await f.shortcut(modifier);
    await f.commitAll();
    assert.equal((await f.saved()).length, 1, `${modifier} must not duplicate a pending comment`);
    assert.equal(f.editors().length, 0);
  }
});

test("blank and whitespace drafts keep Comment disabled and shortcuts write nothing", async (t) => {
  const f = await fixture(); t.after(f.close); await f.open();
  for (const text of ["", " ", "\t", "\n", " \t\n "]) {
    await f.type(text);
    assert.equal(f.button().props.disabled, true);
    await f.shortcut("metaKey"); await f.shortcut("ctrlKey");
  }
  assert.equal(f.writes.length, 0);
  assert.equal((await f.saved()).length, 0);
});

test("one nonblank commit keeps normalized body and workspace file side and range", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open(); await f.type("  one normalized comment\n"); await f.click();
  assert.equal((await f.saved()).length, 0, "Commit is controlled at the asynchronous store boundary");
  await f.commitAll();
  const saved = await f.saved(); assert.equal(saved.length, 1);
  const comment = saved[0];
  assert.equal(comment.workspace_id, f.workspace); assert.equal(comment.file_path, "example.txt");
  assert.equal(comment.location, "modified"); assert.equal(comment.line_number, 4); assert.equal(comment.end_line_number, 5);
  assert.equal(comment.body, "one normalized comment"); assert.equal(f.editors().length, 0);
});

test("pending commit captures body A and preserves newer body B after settlement", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open(); await f.type("body A"); await f.click(); await f.type("body B");
  assert.equal(f.writes[0].comment.body, "body A");
  await f.commitAll();
  assert.deepEqual(Array.from(await f.saved(), (comment) => comment.body), ["body A"]);
  assert.equal(f.value(), "body B");
  await f.click(); await f.commitAll();
  assert.deepEqual(Array.from(await f.saved(), (comment) => comment.body), ["body A", "body B"]);
  assert.equal(f.editors().length, 0);
});

test("distinct anchor drafts each commit independently while the other is pending", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open(); await f.type("first anchor"); await f.click();
  await f.open(9); await f.type("second anchor", 9); await f.click(9);
  assert.equal(f.writes.length, 2);
  await f.commitAll();
  const saved = await f.saved();
  assert.equal(saved.length, 2); assert.equal(new Set(saved.map((comment) => comment.id)).size, 2);
  assert.deepEqual(Array.from(saved, (comment) => [comment.end_line_number, comment.body]), [[5, "first anchor"], [9, "second anchor"]]);
  assert.equal(f.editors().length, 0); assert.equal(f.editors(9).length, 0);
});

test("a rejected new comment keeps its draft and permits a later retry", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open(); await f.type("retry body"); await f.click(); await f.reject();
  assert.equal(f.value(), "retry body"); assert.equal((await f.saved()).length, 0);
  await f.click(); await f.commitAll();
  assert.equal(f.writes.length, 2);
  assert.deepEqual(Array.from(await f.saved(), (comment) => comment.body), ["retry body"]);
  assert.equal(f.editors().length, 0);
});
