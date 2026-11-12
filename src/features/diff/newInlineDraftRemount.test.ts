import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as comments from "./comments.ts";
import { subscribeReviewComments } from "./commentStore.ts";
import * as navigation from "./nav.ts";
import type { useReviewComments } from "./ReviewComments.tsx";
import type { LineRange } from "./FileDiffView.tsx";
import type { FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const relative = "src/features/diff/ReviewComments.tsx";
const source = process.env.DIFF_NEW_DRAFT_REF
  ? execFileSync("git", ["show", `${process.env.DIFF_NEW_DRAFT_REF}:${relative}`], { encoding: "utf8" })
  : readFileSync(resolve(relative), "utf8");
const javascript = ts.transpileModule(source, {
  fileName: relative,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const file: FileDiff = { path: "src/a.ts", old_path: null, status: "modified", binary: false, additions: 1, deletions: 0, hunks: [] };
const range: LineRange = { side: "new", start: 2, line: 4 };
const body = "  未送信のコメント\nexact trailing spaces  ";

type Review = ReturnType<typeof useReviewComments>;

async function fixture() {
  const added: comments.DiffComment[] = [];
  const stores = new Map<string, object>();
  let finish: (() => void) | undefined;
  let reject: (() => void) | undefined;
  let defer = false;
  const unexpected = () => assert.fail("Unexpected new-inline-comment boundary call");
  const boundaries: Record<string, object> = {
    "../../components/DialogFrame": {
      DialogFrame: ({ children }: { children: unknown }) => React.createElement("section", { role: "alertdialog" }, children),
    },
    "../../backend": { openUrl: unexpected },
    "../../keybindings/KeybindingsProvider.tsx": { useKeybindings: () => undefined },
    "./commentsApi.ts": {
      commentStoreFor(workspace: string) {
        if (!stores.has(workspace)) stores.set(workspace, {
          list: async () => [],
          add: async (comment: comments.DiffComment) => {
            added.push(comment);
            if (defer) await new Promise<void>((resolve, fail) => {
              finish = resolve;
              reject = () => fail(new Error("save rejected"));
            });
          },
          edit: unexpected, remove: unexpected, resolve: unexpected, markSent: unexpected, updateAnchors: unexpected,
        });
        return stores.get(workspace);
      },
    },
    "./comments.ts": comments,
    "./commentStore.ts": { subscribeReviewComments },
    "./commentMarkdown.ts": { CommentMarkdown: unexpected },
    "../chat/chat.css": {}, "./comments-github.css": {},
    "./FileDiffView": { revealLine: unexpected },
    "./nav.ts": navigation,
  };
  const module = { exports: {} };
  runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, { crypto: { randomUUID } })((name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected dependency: ${name}`);
    return boundaries[name];
  }, module, module.exports);
  assert.ok("useReviewComments" in module.exports && typeof module.exports.useReviewComments === "function");
  const hook = module.exports.useReviewComments;
  const chat = { insert: unexpected, send: unexpected, attach: unexpected };
  let review: Review;
  let workspace = "workspace-a";
  let selectedFile = file;
  let selectedRange = range;
  let visible = true;
  let generation = 0;
  let mounts = 0;
  let unmounts = 0;
  function Annotation({ children }: { children: unknown }) {
    React.useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    return React.createElement("section", null, children);
  }
  function Workspace() {
    review = hook(workspace, chat);
    return visible ? React.createElement(Annotation, { key: generation }, review.annotations(selectedFile, selectedRange)) : null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Workspace)); });
  const render = () => renderer.update(React.createElement(Workspace));
  const input = () => renderer.root.findByType("textarea");
  const buttons = () => renderer.root.findAllByType("button");
  const button = (label: string) => {
    const found = buttons().find((b: { props: { children: unknown } }) => b.props.children === label);
    assert.ok(found, `Missing ${label} button`);
    return found;
  };
  return {
    added,
    value: () => input().props.value,
    inputs: () => renderer.root.findAllByType("textarea").length,
    dialogs: () => renderer.root.findAllByProps({ role: "alertdialog" }).length,
    mounts: () => ({ mounts, unmounts }),
    async open(nextFile = selectedFile, nextRange = selectedRange) {
      await act(async () => { selectedFile = nextFile; selectedRange = nextRange; review.onLineClick(nextFile, nextRange); render(); });
    },
    async workspace(value: string) { await act(async () => { workspace = value; render(); }); },
    async visible(value: boolean) { await act(async () => { visible = value; render(); }); },
    async evict() { await act(async () => { generation++; render(); }); },
    async change(value: string) { await act(async () => input().props.onChange({ target: { value } })); },
    async click(label: string) { await act(async () => button(label).props.onClick()); },
    staleInput: () => input().props.onChange,
    staleCancel: () => button("Cancel").props.onClick,
    defer() { defer = true; },
    async finish(success = true) {
      assert.ok(finish && reject, "No pending submit");
      await act(async () => success ? finish?.() : reject?.());
    },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test("new draft hide remount retains exact body", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body);
  const before = view.mounts();
  await view.visible(false);
  assert.equal(view.inputs(), 0, "Hide must unmount the actual annotation textarea");
  assert.equal(view.mounts().unmounts, before.unmounts + 1);
  await view.visible(true);
  assert.equal(view.mounts().mounts, before.mounts + 1);
  assert.equal(view.value(), body, "Hide/remount must retain the exact new draft");
});

test("new draft annotation eviction retains exact body", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); await view.evict();
  assert.equal(view.mounts().unmounts, 1);
  assert.equal(view.value(), body, "Eviction must retain the exact new draft");
});

test("new draft same anchor click preserves body on remount", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body);
  await view.open({ ...file }, { ...range }); await view.evict();
  assert.equal(view.value(), body, "Same identity must preserve the draft");
});

for (const [name, nextFile, nextRange] of [
  ["path", { ...file, path: "src/b.ts" }, range],
  ["side", file, { ...range, side: "old" }],
  ["start", file, { ...range, start: 3 }],
  ["end", file, { ...range, line: 5 }],
] satisfies [string, FileDiff, LineRange][]) {
  test(`new draft ${name} identity is isolated`, async (t) => {
    const view = await fixture(); t.after(view.close);
    await view.open(); await view.change(body); await view.open(nextFile, nextRange);
    assert.equal(view.value(), "", "Different anchor must not inherit another draft");
    await view.change("other draft"); await view.evict();
    assert.equal(view.value(), "other draft", "New identity must retain its own draft");
  });
}

test("new draft workspace identity is isolated", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); await view.workspace("workspace-b");
  assert.equal(view.inputs(), 0);
  await view.open();
  assert.equal(view.value(), "", "Different workspace must not inherit a draft");
  await view.change("workspace b"); await view.visible(false); await view.visible(true);
  assert.equal(view.value(), "workspace b", "Workspace draft must survive its own remount");
});

test("new draft explicit discard clears body", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); await view.click("Cancel");
  assert.equal(view.dialogs(), 1); await view.click("Discard");
  assert.equal(view.inputs(), 0); await view.open(); await view.evict();
  assert.equal(view.value(), ""); assert.equal(view.added.length, 0);
});

test("new draft keep editing retains body after remount", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); await view.click("Cancel"); await view.click("Keep editing");
  await view.visible(false); await view.visible(true);
  assert.equal(view.value(), body, "Keep editing must retain the new draft");
});

test("new draft successful submit clears only saved draft", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); await view.click("Comment");
  assert.equal(view.added.length, 1); assert.equal(view.added[0].body, "未送信のコメント\nexact trailing spaces");
  assert.equal(view.added[0].workspace_id, "workspace-a"); assert.equal(view.added[0].file_path, file.path);
  assert.equal(view.inputs(), 0); await view.open(); await view.evict(); assert.equal(view.value(), "");
});

test("new draft failed submit retains body after remount", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); view.defer(); await view.click("Comment"); await view.finish(false);
  await view.evict(); assert.equal(view.value(), body, "Failed submit must retain the draft");
});

test("new draft late old submit cannot clear different anchor", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); view.defer(); await view.click("Comment");
  await view.open(file, { ...range, line: 8 }); await view.change("new anchor body"); await view.finish();
  assert.equal(view.inputs(), 1, "Old submit must not close the new draft");
  assert.equal(view.value(), "new anchor body"); await view.evict(); assert.equal(view.value(), "new anchor body");
});

test("new draft late old submit cannot clear replacement at same anchor", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); view.defer(); await view.click("Comment");
  await view.click("Cancel"); await view.click("Discard"); await view.open(); await view.change("replacement"); await view.finish();
  assert.equal(view.inputs(), 1, "Old submit must not close a replacement draft");
  assert.equal(view.value(), "replacement");
});

test("new draft late old submit cannot clear other workspace", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(body); view.defer(); await view.click("Comment");
  await view.workspace("workspace-b"); await view.open(); await view.change("new workspace body"); await view.finish();
  assert.equal(view.inputs(), 1, "Old submit must not close the other workspace draft");
  assert.equal(view.value(), "new workspace body");
});

test("new draft stale callbacks cannot overwrite replacement", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); const change = view.staleInput(); const cancel = view.staleCancel();
  await view.open(file, { ...range, line: 9 }); await view.change("replacement");
  await act(async () => { change({ target: { value: "stale input" } }); cancel(); });
  assert.equal(view.inputs(), 1, "Old cancel must not close the replacement draft");
  assert.equal(view.value(), "replacement");
});
