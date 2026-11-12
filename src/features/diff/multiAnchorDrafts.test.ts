import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as comments from "./comments.ts";
import * as navigation from "./nav.ts";
import type { useReviewComments } from "./ReviewComments.tsx";
import type { LineRange } from "./FileDiffView.tsx";
import type { FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const path = "src/features/diff/ReviewComments.tsx";
const source = process.env.DIFF_MULTI_DRAFT_REF
  ? execFileSync("git", ["show", `${process.env.DIFF_MULTI_DRAFT_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(resolve(path), "utf8");
const javascript = ts.transpileModule(source, {
  fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const file: FileDiff = { path: "src/a.ts", old_path: null, status: "modified", binary: false, additions: 1, deletions: 0, hunks: [] };
const first: LineRange = { side: "new", start: 2, line: 2 };
const second: LineRange = { side: "new", start: 8, line: 8 };
const firstBody = "  最初の下書き\nA trailing spaces  ";
const secondBody = "  another draft\nB trailing spaces  ";
type Review = ReturnType<typeof useReviewComments>;

async function fixture() {
  const added: comments.DiffComment[] = [];
  const stores = new Map<string, object>();
  let defer = false;
  let finish: (() => void) | undefined;
  let reject: (() => void) | undefined;
  const unexpected = () => assert.fail("Unexpected multi-anchor boundary call");
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
  let selectedFile = file;
  let workspace = "workspace-a";
  let visible = true;
  let generation = 0;
  let mounts = 0;
  let unmounts = 0;
  function Annotation({ children }: { children: unknown }) {
    React.useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    return children;
  }
  function Workspace() {
    review = hook(workspace, chat);
    return visible ? React.createElement(Annotation, { key: generation },
      ...review.anchors(selectedFile).map((anchor) => React.createElement("section", {
        key: `${anchor.side}:${anchor.line}`, "data-anchor": `${anchor.side}:${anchor.line}`,
      }, review.annotations(selectedFile, anchor))),
    ) : null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Workspace)); });
  const render = () => renderer.update(React.createElement(Workspace));
  const annotation = (anchor: LineRange) => renderer.root.findAllByProps({ "data-anchor": `${anchor.side}:${anchor.line}` })[0];
  const input = (anchor: LineRange) => annotation(anchor)?.findAllByType("textarea")[0];
  const button = (anchor: LineRange, label: string) => {
    const found = annotation(anchor)?.findAllByType("button").find((b: { props: { children: unknown } }) => b.props.children === label);
    assert.ok(found, `Missing ${label} button at ${anchor.side}:${anchor.line}`);
    return found;
  };
  return {
    added,
    value: (anchor = first) => input(anchor)?.props.value,
    inputs: () => renderer.root.findAllByType("textarea").length,
    mounts: () => ({ mounts, unmounts }),
    async open(range = first, nextFile = selectedFile) {
      await act(async () => { selectedFile = nextFile; review.onLineClick(nextFile, range); render(); });
    },
    async select(nextFile: FileDiff) { await act(async () => { selectedFile = nextFile; render(); }); },
    async workspace(value: string) { await act(async () => { workspace = value; render(); }); },
    async visible(value: boolean) { await act(async () => { visible = value; render(); }); },
    async evict() { await act(async () => { generation++; render(); }); },
    async change(anchor: LineRange, value: string) {
      const field = input(anchor); assert.ok(field, `Missing draft input at ${anchor.side}:${anchor.line}`);
      await act(async () => field.props.onChange({ target: { value } }));
    },
    async click(anchor: LineRange, label: string) { await act(async () => button(anchor, label).props.onClick()); },
    staleInput: (anchor: LineRange) => input(anchor).props.onChange,
    staleCancel: (anchor: LineRange) => button(anchor, "Cancel").props.onClick,
    defer() { defer = true; },
    async finish(success = true) {
      assert.ok(finish && reject, "No pending submit");
      await act(async () => success ? finish?.() : reject?.());
    },
    async close() { await act(async () => renderer.unmount()); },
  };
}

async function openBoth(view: Awaited<ReturnType<typeof fixture>>) {
  await view.open(first); await view.change(first, firstBody);
  await view.open(second); await view.change(second, secondBody);
}

test("multi draft distinct anchors render independent bodies", async (t) => {
  const view = await fixture(); t.after(view.close); await openBoth(view);
  assert.equal(view.value(first), firstBody, "First anchor body must survive starting a second draft");
  assert.equal(view.value(second), secondBody); assert.equal(view.inputs(), 2);
});

test("multi draft reselect restores the existing body", async (t) => {
  const view = await fixture(); t.after(view.close); await openBoth(view); await view.open(first);
  assert.equal(view.value(first), firstBody, "Reselecting an earlier anchor must restore its exact body");
  assert.equal(view.value(second), secondBody); assert.equal(view.inputs(), 2);
});

test("multi draft different paths retain independent bodies", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(first, firstBody);
  const other = { ...file, path: "src/b.ts" };
  await view.open(first, other); assert.equal(view.value(first), ""); await view.change(first, secondBody);
  await view.select(file);
  assert.equal(view.value(first), firstBody, "Returning to a file must retain its existing draft");
  await view.select(other); assert.equal(view.value(first), secondBody);
});

test("multi draft opposite sides retain independent bodies", async (t) => {
  const view = await fixture(); t.after(view.close);
  const old: LineRange = { ...first, side: "old" };
  await view.open(); await view.change(first, firstBody); await view.open(old); await view.change(old, secondBody);
  assert.equal(view.value(first), firstBody, "New-side draft must survive an old-side draft at the same line");
  assert.equal(view.value(old), secondBody); assert.equal(view.inputs(), 2);
});

test("multi draft shared ending line retains each range body", async (t) => {
  const view = await fixture(); t.after(view.close);
  const wide: LineRange = { ...first, start: 1 };
  await view.open(); await view.change(first, firstBody); await view.open(wide);
  assert.equal(view.value(first), ""); await view.change(wide, secondBody); await view.open(first);
  assert.equal(view.value(first), firstBody, "Overlapping ranges must retain their separate bodies when reselected");
  assert.equal(view.inputs(), 1); await view.open(wide); assert.equal(view.value(wide), secondBody);
});

test("multi draft discard removes only the selected draft", async (t) => {
  const view = await fixture(); t.after(view.close); await openBoth(view);
  await view.click(second, "Cancel"); await view.click(second, "Discard");
  assert.equal(view.value(first), firstBody, "Discarding a second draft must retain the first draft");
  assert.equal(view.value(second), undefined); assert.equal(view.inputs(), 1);
  await view.open(second); assert.equal(view.value(second), ""); assert.equal(view.added.length, 0);
});

test("multi draft save removes only the saved draft", async (t) => {
  const view = await fixture(); t.after(view.close); await openBoth(view); await view.click(second, "Comment");
  assert.equal(view.value(first), firstBody, "Saving a second draft must retain the first draft");
  assert.equal(view.value(second), undefined); assert.equal(view.added.length, 1);
  assert.equal(view.added[0].body, secondBody.trim()); assert.equal(view.added[0].line_number, second.start);
});

test("multi draft hide remount retains all draft bodies", async (t) => {
  const view = await fixture(); t.after(view.close); await openBoth(view);
  const before = view.mounts(); await view.visible(false); assert.equal(view.inputs(), 0);
  assert.equal(view.mounts().unmounts, before.unmounts + 1); await view.visible(true);
  assert.equal(view.value(first), firstBody, "Remounting annotations must retain every independent draft");
  assert.equal(view.value(second), secondBody); assert.equal(view.inputs(), 2);
});

test("multi draft failed save retains both bodies", async (t) => {
  const view = await fixture(); t.after(view.close); await openBoth(view);
  view.defer(); await view.click(second, "Comment"); await view.finish(false); await view.evict();
  assert.equal(view.value(first), firstBody, "Failed save must not lose the other independent draft");
  assert.equal(view.value(second), secondBody);
});

test("multi draft late save cannot clear another anchor", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(first, firstBody); view.defer(); await view.click(first, "Comment");
  await view.open(second); await view.change(second, secondBody); await view.finish();
  assert.equal(view.value(second), secondBody); assert.equal(view.value(first), undefined);
});

test("multi draft same anchor click does not duplicate or reset", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(first, firstBody); await view.open({ ...first }); await view.evict();
  assert.equal(view.value(first), firstBody); assert.equal(view.inputs(), 1);
});

test("multi draft workspace change does not leak draft bodies", async (t) => {
  const view = await fixture(); t.after(view.close);
  await view.open(); await view.change(first, firstBody); await view.workspace("workspace-b");
  assert.equal(view.inputs(), 0); await view.open(); assert.equal(view.value(first), "");
});

test("multi draft stale cancelled callbacks cannot replace a survivor", async (t) => {
  const view = await fixture(); t.after(view.close); await view.open();
  const change = view.staleInput(first); const cancel = view.staleCancel(first);
  await view.click(first, "Cancel"); await view.open(second); await view.change(second, secondBody);
  await act(async () => { change({ target: { value: "stale" } }); cancel(); });
  assert.equal(view.value(second), secondBody); assert.equal(view.value(first), undefined);
});
