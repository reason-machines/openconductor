import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { CommentStore } from "./commentStore.ts";
import type { Notify } from "./ReviewComments.tsx";

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
  const notifications: { kind: Parameters<Notify>[0]; message: string }[] = [];
  const edits: { id: string; body: string }[] = [];
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
      console, Map, Set, Error, setInterval: () => assert.fail("Unexpected background sync"), clearInterval() {},
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const commentModule = load(resolve(root, "src/features/diff/comments.ts"));
  const storeModule = load(resolve(root, "src/features/diff/commentStore.ts"));
  assert.ok(typeof commentModule.newLocalComment === "function" && typeof storeModule.localCommentStore === "function");
  const workspace = `save-failure-${++nextFixture}`;
  const local: CommentStore = storeModule.localCommentStore({
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  }, workspace);
  for (const id of ["first", "second"]) {
    await local.add(commentModule.newLocalComment({ id, workspaceId: workspace, filePath: "example.txt", side: "new", start: 3, end: 5, body: `${id}:saved`, now: 1 }));
  }
  let edit: CommentStore["edit"] = local.edit;
  store = { ...local, edit: (id, body) => { edits.push({ id, body }); return edit(id, body); } };
  const reviewModule = load(resolve(root, "src/features/diff/ReviewComments.tsx"));
  assert.ok(typeof reviewModule.useReviewComments === "function");
  const useReviewComments = reviewModule.useReviewComments;
  const notify: Notify = (kind, message) => { notifications.push({ kind, message }); };
  const unexpected = () => assert.fail("Unexpected chat operation");
  const chat = { insert: unexpected, send: unexpected, attach: unexpected };
  function Harness() {
    const review = useReviewComments(workspace, chat, undefined, null, notify);
    return React.createElement(React.Fragment, null,
      review.annotations({ path: "example.txt" }, { side: "new", line: 5 }), review.actions());
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const thread = (id: string) => renderer.root.findByProps({ id: `oc-comment-${id}` });
  const buttons = (label: string, id = "first") => thread(id).findAll((node: { type: unknown; props: { children: unknown } }) => node.type === "button" && node.props.children === label);
  const editors = (id: string) => thread(id).findAllByType("textarea");
  const draft = (id = "first") => { assert.equal(editors(id).length, 1, `Expected retained ${id} draft`); return editors(id)[0].props.value; };
  const click = async (label: string, id = "first") => {
    await act(async () => { assert.equal(buttons(label, id).length, 1, `Missing ${id} ${label}`); buttons(label, id)[0].props.onClick(); });
  };
  return {
    notifications, edits, buttons, draft, editors, click,
    type: async (body: string, id = "first") => { await act(async () => { assert.equal(editors(id).length, 1); editors(id)[0].props.onChange({ target: { value: body } }); }); },
    bodies: async () => Array.from(await local.list(), (comment) => comment.body),
    failures: () => renderer.root.findAll((node: { type: unknown; props: { children: unknown } }) => node.type === "span" && node.props.children === "Comment failed"),
    reject: (reason: unknown) => { edit = () => Promise.reject(reason); },
    succeed: () => { edit = local.edit; },
    pending: () => {
      let rejectPending: (reason: unknown) => void = () => assert.fail("Pending save was not created");
      const promise = new Promise<void>((_resolve, reject) => { rejectPending = reject; });
      edit = () => promise;
      return async (reason: unknown) => { await act(async () => { rejectPending(reason); }); };
    },
    close: async () => { await act(async () => renderer.unmount()); },
  };
}

for (const [name, reason] of [["Error", new Error("disk full")], ["string", "disk full"]]) {
  test(`existing-comment ${name} save rejection notifies once and retains body and draft`, async (t) => {
    const f = await fixture(); t.after(f.close); f.reject(reason);
    await f.click("Edit"); await f.type("retry this body"); await f.click("Save");
    assert.deepEqual(f.edits, [{ id: "first", body: "retry this body" }]);
    assert.deepEqual(await f.bodies(), ["first:saved", "second:saved"]);
    assert.equal(f.draft(), "retry this body");
    assert.equal(f.failures().length, 1, "Generic toolbar failure must remain");
    assert.deepEqual(f.notifications, [{ kind: "error", message: "Failed to save comment: disk full" }]);
  });
}

test("pending save has no early feedback or dismissal, then notifies once on rejection", async (t) => {
  const f = await fixture(); t.after(f.close); const reject = f.pending();
  await f.click("Edit"); await f.type("pending body"); await f.click("Save");
  assert.deepEqual(f.notifications, []);
  assert.equal(f.failures().length, 0);
  assert.equal(f.draft(), "pending body");
  assert.deepEqual(await f.bodies(), ["first:saved", "second:saved"]);
  assert.equal(f.edits.length, 1);
  await reject(new Error("write delayed"));
  assert.equal(f.draft(), "pending body");
  assert.deepEqual(await f.bodies(), ["first:saved", "second:saved"]);
  assert.equal(f.failures().length, 1);
  assert.deepEqual(f.notifications, [{ kind: "error", message: "Failed to save comment: write delayed" }]);
});

test("successful save persists and closes only the edited draft without failure feedback", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.click("Edit"); await f.type("saved replacement");
  await f.click("Edit", "second"); await f.type("second draft", "second");
  await f.click("Save");
  assert.equal(f.editors("first").length, 0);
  assert.equal(f.draft("second"), "second draft");
  assert.deepEqual(await f.bodies(), ["saved replacement", "second:saved"]);
  assert.deepEqual(f.edits, [{ id: "first", body: "saved replacement" }]);
  assert.equal(f.failures().length, 0);
  assert.deepEqual(f.notifications, []);
});

test("rejected save followed by successful retry adds no extra notification", async (t) => {
  const f = await fixture(); t.after(f.close); f.reject(new Error("disk full"));
  await f.click("Edit"); await f.type("retry body"); await f.click("Save");
  assert.equal(f.draft(), "retry body");
  assert.deepEqual(await f.bodies(), ["first:saved", "second:saved"]);
  const failedNotifications = f.notifications.slice();
  f.succeed(); await f.click("Save");
  assert.equal(f.edits.length, 2);
  assert.equal(f.editors("first").length, 0);
  assert.deepEqual(await f.bodies(), ["retry body", "second:saved"]);
  assert.equal(f.failures().length, 0);
  assert.deepEqual(f.notifications, failedNotifications, "Retry success must not emit another notice");
  assert.deepEqual(f.notifications, [{ kind: "error", message: "Failed to save comment: disk full" }]);
});

test("dirty cancellation, keep, discard and blank controls never save or notify", async (t) => {
  const f = await fixture(); t.after(f.close); f.reject(new Error("must not save"));
  await f.click("Edit"); await f.type("dirty body"); await f.click("Cancel");
  assert.equal(f.buttons("Keep editing").length, 1);
  assert.equal(f.buttons("Discard").length, 1);
  assert.equal(f.draft(), "dirty body");
  await f.click("Keep editing");
  assert.equal(f.buttons("Discard").length, 0);
  assert.equal(f.draft(), "dirty body");
  await f.type("   ");
  assert.equal(f.buttons("Save")[0].props.disabled, true);
  await f.click("Save");
  assert.equal(f.draft(), "   ");
  await f.click("Cancel"); await f.click("Discard");
  assert.equal(f.editors("first").length, 0);
  await f.click("Edit"); assert.equal(f.draft(), "first:saved");
  await f.click("Cancel"); assert.equal(f.editors("first").length, 0);
  assert.deepEqual(await f.bodies(), ["first:saved", "second:saved"]);
  assert.deepEqual(f.edits, []);
  assert.equal(f.failures().length, 0);
  assert.deepEqual(f.notifications, []);
});

test("one failed save neither persists nor clears the other comment's draft", async (t) => {
  const f = await fixture(); t.after(f.close); f.reject("read only");
  await f.click("Edit"); await f.type("first draft");
  await f.click("Edit", "second"); await f.type("second draft", "second");
  await f.click("Save");
  assert.deepEqual(f.edits, [{ id: "first", body: "first draft" }]);
  assert.equal(f.draft(), "first draft");
  assert.equal(f.draft("second"), "second draft");
  assert.deepEqual(await f.bodies(), ["first:saved", "second:saved"]);
  assert.equal(f.failures().length, 1);
  assert.deepEqual(f.notifications, [{ kind: "error", message: "Failed to save comment: read only" }]);
});
