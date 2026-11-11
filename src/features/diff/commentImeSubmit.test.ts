import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as comments from "./comments.ts";
import * as navigation from "./nav.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const relative = "src/features/diff/ReviewComments.tsx";
const source = process.env.DIFF_COMMENT_IME_REF
  ? execFileSync("git", ["show", `${process.env.DIFF_COMMENT_IME_REF}:${relative}`], { encoding: "utf8" })
  : readFileSync(resolve(relative), "utf8");
const javascript = ts.transpileModule(`${source}\nexport { Composer };`, {
  fileName: relative,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type Modifier = "metaKey" | "ctrlKey";
type NativeKey = { isComposing?: boolean; keyCode?: number; which?: number };

function fixture(initial = "Saved comment") {
  const submitted: string[] = [];
  let cancelled = 0;
  let prevented = 0;
  const unexpected = () => assert.fail("Unexpected comment-composer boundary call");
  const boundaries: Record<string, object> = {
    "../../components/DialogFrame": {
      DialogFrame: ({ children }: { children: unknown }) => React.createElement("section", { role: "alertdialog" }, children),
    },
    "../../backend": { openUrl: unexpected },
    "../../keybindings/KeybindingsProvider.tsx": { useKeybindings: unexpected },
    "./commentsApi.ts": { commentStoreFor: unexpected },
    "./comments.ts": comments,
    "./commentMarkdown.ts": { CommentMarkdown: unexpected },
    "../chat/chat.css": {},
    "./comments-github.css": {},
    "./FileDiffView": { revealLine: unexpected },
    "./nav.ts": navigation,
  };
  const module = { exports: {} };
  runInNewContext(`(function(require, module, exports) { ${javascript}\n})`)((name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected dependency: ${name}`);
    return boundaries[name];
  }, module, module.exports);
  assert.ok("Composer" in module.exports && typeof module.exports.Composer === "function");
  const Composer = module.exports.Composer;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Composer, {
      initial, submitLabel: "Save", onSubmit: (body: string) => { submitted.push(body); },
      onCancel: () => { cancelled++; },
    }));
  });
  const input = () => renderer.root.findByType("textarea");
  return {
    submitted,
    cancelled: () => cancelled,
    prevented: () => prevented,
    dialogs: () => renderer.root.findAllByProps({ role: "alertdialog" }).length,
    value: () => input().props.value,
    change(value: string) { act(() => input().props.onChange({ target: { value } })); },
    lifecycle(name: "onCompositionStart" | "onCompositionEnd" | "onBlur") {
      act(() => input().props[name]?.());
    },
    press(key: "Enter" | "Escape", modifier?: Modifier, native: NativeKey = {}) {
      const keyCode = key === "Enter" ? 13 : 27;
      act(() => input().props.onKeyDown({
        key, code: key, metaKey: modifier === "metaKey", ctrlKey: modifier === "ctrlKey", altKey: false, shiftKey: false,
        keyCode: native.keyCode ?? keyCode, which: native.which ?? keyCode,
        nativeEvent: { isComposing: false, keyCode, which: keyCode, ...native },
        preventDefault: () => { prevented++; },
      }));
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const modifier of ["metaKey", "ctrlKey"] satisfies Modifier[]) {
  for (const signal of ["native", "lifecycle", "keyCode", "which"]) {
    test(`comment IME ${signal} blocks ${modifier} Enter`, (t) => {
      const view = fixture(); t.after(view.close);
      view.change("未確定の入力");
      if (signal === "lifecycle") view.lifecycle("onCompositionStart");
      view.press("Enter", modifier, signal === "native" ? { isComposing: true }
        : signal === "keyCode" ? { keyCode: 229 } : signal === "which" ? { which: 229 } : {});
      assert.deepEqual(view.submitted, [], "IME must not submit the comment");
      assert.equal(view.cancelled(), 0);
      assert.equal(view.dialogs(), 0);
      assert.equal(view.prevented(), 0, "IME owns the composition key");
      assert.equal(view.value(), "未確定の入力");
    });
  }
  test(`comment non-IME ${modifier} Enter saves exact text once`, (t) => {
    const view = fixture(); t.after(view.close);
    view.change("  Completed comment\n");
    view.press("Enter", modifier);
    assert.deepEqual(view.submitted, ["  Completed comment\n"]);
    assert.equal(view.prevented(), 1);
    assert.equal(view.cancelled(), 0);
  });
}

for (const signal of ["native", "lifecycle", "legacy"]) {
  test(`comment IME ${signal} blocks Escape cancellation`, (t) => {
    const view = fixture(); t.after(view.close);
    if (signal === "lifecycle") view.lifecycle("onCompositionStart");
    view.press("Escape", undefined, signal === "native" ? { isComposing: true } : signal === "legacy" ? { keyCode: 229 } : {});
    assert.equal(view.cancelled(), 0, "IME must not cancel the comment");
    assert.equal(view.dialogs(), 0, "IME Escape must not open discard confirmation");
    assert.equal(view.prevented(), 0);
    assert.deepEqual(view.submitted, []);
    assert.equal(view.value(), "Saved comment");
  });
}

test("comment composition end and blur restore normal shortcuts", (t) => {
  for (const reset of ["onCompositionEnd", "onBlur"] satisfies ("onCompositionEnd" | "onBlur")[]) {
    const view = fixture(); t.after(view.close);
    view.lifecycle("onCompositionStart");
    view.lifecycle(reset);
    view.press("Enter", "metaKey");
    assert.deepEqual(view.submitted, ["Saved comment"]);
    assert.equal(view.prevented(), 1);
  }
});

test("comment blank submit remains disabled after composition", (t) => {
  const view = fixture(""); t.after(view.close);
  view.change(" \n ");
  view.lifecycle("onCompositionStart");
  view.lifecycle("onCompositionEnd");
  view.press("Enter", "ctrlKey");
  assert.deepEqual(view.submitted, []);
  assert.equal(view.cancelled(), 0);
  assert.equal(view.dialogs(), 0);
});

test("comment non-IME Escape still confirms dirty cancellation", (t) => {
  const view = fixture(); t.after(view.close);
  view.change("Changed comment");
  view.press("Escape");
  assert.equal(view.dialogs(), 1);
  assert.equal(view.cancelled(), 0);
  assert.deepEqual(view.submitted, []);
  assert.equal(view.prevented(), 1);
});
