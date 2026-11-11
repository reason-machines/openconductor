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

function fixture(initial: string) {
  let browserConfirmations = 0;
  let dismissed = 0;
  let prevented = 0;
  const submitted: string[] = [];
  const unexpected = () => { throw new Error("Unexpected comment-composer boundary call"); };
  function DialogFrame({ kind, titleId, descriptionId, onClose, children }: { kind: string; titleId: string; descriptionId?: string; onClose: () => void; children: unknown }) {
    return React.createElement("section", { role: kind === "alert" ? "alertdialog" : "dialog", "aria-labelledby": titleId, "aria-describedby": descriptionId, onDismiss: onClose }, children);
  }
  const boundaries: Record<string, object> = {
    "../../components/DialogFrame": { DialogFrame },
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
    window: { confirm: () => { browserConfirmations++; return false; } },
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
  const dialogs = () => renderer.root.findAllByProps({ role: "alertdialog" });
  const button = (label: string) => {
    const buttons = renderer.root.findAllByType("button").filter((node: { props: { children?: unknown } }) => node.props.children === label);
    assert.equal(buttons.length, 1, `one ${label} button must be present`);
    return buttons[0];
  };
  const dialog = () => {
    assert.equal(dialogs().length, 1, "dirty cancellation must open an in-app alert");
    return dialogs()[0];
  };
  return {
    submitted,
    browserConfirmations: () => browserConfirmations,
    confirmations: () => dialogs().length,
    title: () => dialog().findByProps({ id: dialog().props["aria-labelledby"] }).children.join(""),
    description: () => dialog().findByProps({ id: dialog().props["aria-describedby"] }).children.join(""),
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
        act(() => button("Cancel").props.onClick());
      }
    },
    choose(label: "Keep editing" | "Discard") {
      const action = button(label);
      if (label === "Keep editing") assert.equal(action.props["data-dialog-cancel"], true);
      else assert.match(action.props.className, /btn-danger/);
      act(() => action.props.onClick());
    },
    dismissDialog() { act(() => dialog().props.onDismiss()); },
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
        assert.equal(view.browserConfirmations(), 0, "comment cancellation must not use browser confirmation");
        assert.equal(view.confirmations(), entry.dirty ? 1 : 0, "changed saved text and nonblank new drafts must request confirmation");
        assert.equal(view.dismissed(), entry.dirty ? 0 : 1, "requesting discard must keep the composer open");
        assert.equal(view.value(), entry.value, "requesting discard must preserve the exact draft");
        assert.deepEqual(view.submitted, [], "cancel must not submit the comment");
        assert.equal(view.prevented(), action === "Escape" ? 1 : 0);
        if (entry.dirty) {
          assert.equal(view.title(), "Discard comment?");
          assert.equal(view.description(), entry.initial === "" ? "This comment will be lost." : "Your changes to this comment will be lost.");
          view.choose("Keep editing");
          assert.equal(view.confirmations(), 0);
          assert.equal(view.dismissed(), 0);
          assert.equal(view.value(), entry.value, "Keep editing must preserve the exact draft");
        }
      } finally { view.close(); }
    });
  }

  test(`actual comment Composer ${action}: accepting discard of a cleared saved comment dismisses once`, () => {
    const view = fixture("Review this line");
    try {
      view.change("");
      view.cancel(action);
      assert.equal(view.browserConfirmations(), 0);
      assert.equal(view.confirmations(), 1);
      assert.equal(view.dismissed(), 0);
      view.choose("Discard");
      assert.equal(view.confirmations(), 0);
      assert.equal(view.dismissed(), 1);
      assert.deepEqual(view.submitted, []);
      assert.equal(view.prevented(), action === "Escape" ? 1 : 0);
    } finally { view.close(); }
  });

  for (const initial of ["", "Review this line"]) {
    const kind = initial === "" ? "new" : "saved";
    test(`actual comment Composer ${action}: ${kind} draft can keep editing, reopen and discard`, () => {
      const view = fixture(initial);
      try {
        view.change("  Draft comment\n");
        view.cancel(action);
        assert.equal(view.confirmations(), 1);
        view.choose("Keep editing");
        assert.equal(view.confirmations(), 0);
        assert.equal(view.dismissed(), 0);
        assert.equal(view.value(), "  Draft comment\n");
        view.change("  Revised comment\n");
        view.cancel(action);
        assert.equal(view.confirmations(), 1);
        assert.equal(view.dismissed(), 0);
        view.choose("Discard");
        assert.equal(view.confirmations(), 0);
        assert.equal(view.dismissed(), 1);
        assert.equal(view.browserConfirmations(), 0);
        assert.deepEqual(view.submitted, []);
      } finally { view.close(); }
    });

    test(`actual comment Composer ${action}: closing the ${kind} draft alert preserves the composer`, () => {
      const view = fixture(initial);
      try {
        view.change("  Retained comment\n");
        view.cancel(action);
        assert.equal(view.confirmations(), 1);
        view.dismissDialog();
        assert.equal(view.confirmations(), 0);
        assert.equal(view.dismissed(), 0);
        assert.equal(view.value(), "  Retained comment\n");
        assert.equal(view.browserConfirmations(), 0);
        assert.deepEqual(view.submitted, []);
      } finally { view.close(); }
    });
  }
}
