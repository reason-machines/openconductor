import assert from "node:assert/strict";
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
const sourcePath = resolve("src/features/diff/ReviewComments.tsx");
const javascript = ts.transpileModule(`${readFileSync(sourcePath, "utf8")}\nexport { Composer };`, {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type CancelAction = "Cancel" | "Escape";

function fixture(initial: string, confirmAnswer = false) {
  let confirmations = 0;
  let dismissed = 0;
  let prevented = 0;
  const submitted: string[] = [];
  const unexpected = () => { throw new Error("Unexpected comment-composer boundary call"); };
  const boundaries: Record<string, object> = {
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
  const evaluate = runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, {
    window: { confirm: () => { confirmations++; return confirmAnswer; } },
  });
  evaluate((name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected dependency: ${name}`);
    return boundaries[name];
  }, module, module.exports);
  assert.ok("Composer" in module.exports && typeof module.exports.Composer === "function");
  const Composer = module.exports.Composer;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Composer, {
      initial,
      submitLabel: initial === "" ? "Reply" : "Save",
      onSubmit: (body: string) => { submitted.push(body); },
      onCancel: () => { dismissed++; },
    }));
  });
  const textarea = () => renderer.root.findByType("textarea");
  return {
    submitted,
    confirmations: () => confirmations,
    dismissed: () => dismissed,
    prevented: () => prevented,
    value: () => textarea().props.value,
    change(value: string) {
      act(() => textarea().props.onChange({ target: { value } }));
    },
    cancel(action: CancelAction) {
      if (action === "Escape") {
        act(() => textarea().props.onKeyDown({ key: "Escape", preventDefault: () => { prevented++; } }));
      } else {
        const buttons = renderer.root.findAllByType("button").filter((node: { props: { children?: unknown } }) => node.props.children === "Cancel");
        assert.equal(buttons.length, 1);
        act(() => buttons[0].props.onClick());
      }
    },
    close() { act(() => renderer.unmount()); },
  };
}

const cases: { name: string; initial: string; value: string; dirty: boolean }[] = [
  { name: "saved comment cleared", initial: "Review this line", value: "", dirty: true },
  { name: "saved comment replaced with whitespace", initial: "Review this line", value: " \n ", dirty: true },
  { name: "saved comment gains surrounding spaces", initial: "Review this line", value: " Review this line ", dirty: true },
  { name: "saved comment gains a trailing newline", initial: "Review this line", value: "Review this line\n", dirty: true },
  { name: "saved comment changes words", initial: "Review this line", value: "Review that line", dirty: true },
  { name: "saved comment unchanged", initial: "Review this line", value: "Review this line", dirty: false },
  { name: "new draft empty", initial: "", value: "", dirty: false },
  { name: "new draft only whitespace", initial: "", value: " \n ", dirty: false },
  { name: "new draft has text", initial: "", value: "Draft comment", dirty: true },
];
const actions: CancelAction[] = ["Cancel", "Escape"];

for (const action of actions) {
  for (const entry of cases) {
    test(`actual comment Composer ${action}: ${entry.name}`, () => {
      const view = fixture(entry.initial);
      try {
        view.change(entry.value);
        assert.equal(view.value(), entry.value);
        view.cancel(action);
        assert.equal(view.confirmations(), entry.dirty ? 1 : 0, "changed saved text and nonblank new drafts must request confirmation");
        assert.equal(view.dismissed(), entry.dirty ? 0 : 1, "rejecting discard must keep the composer open");
        assert.equal(view.value(), entry.value, "rejecting discard must preserve the exact draft");
        assert.deepEqual(view.submitted, [], "cancel must not submit the comment");
        assert.equal(view.prevented(), action === "Escape" ? 1 : 0);
      } finally { view.close(); }
    });
  }

  test(`actual comment Composer ${action}: accepting discard of a cleared saved comment dismisses once`, () => {
    const view = fixture("Review this line", true);
    try {
      view.change("");
      view.cancel(action);
      assert.equal(view.confirmations(), 1);
      assert.equal(view.dismissed(), 1);
      assert.deepEqual(view.submitted, []);
      assert.equal(view.prevented(), action === "Escape" ? 1 : 0);
    } finally { view.close(); }
  });
}
