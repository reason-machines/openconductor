import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as model from "./submitPrompt.ts";
import { PRIORITY } from "../keybindings/dispatcher.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function fixture() {
  const requests: { url: string; resolve: () => void; reject: (error: Error) => void }[] = [];
  let commands: Record<string, () => unknown> = {};
  let closes = 0;
  const exports: Partial<Pick<typeof import("./SubmitPromptDialog"), "SubmitPromptDialog">> = {};
  const source = readFileSync(new URL("./SubmitPromptDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "SubmitPromptDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports, Error,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../backend") return {
        openUrl(url: string) {
          let resolve = () => {};
          let reject = (_error: Error) => {};
          const request = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
          void request.catch(() => {});
          requests.push({ url, resolve, reject });
          return request;
        },
      };
      if (name === "../keybindings/KeybindingsProvider") return {
        useKeybindingOverrides: () => ({ overrides: {} }),
        useKeybindings(handlers: typeof commands) { commands = handlers; },
      };
      if (name === "../keybindings/dispatcher") return { PRIORITY };
      if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
      if (name === "../keybindings/shortcut") return { glyphs: () => "" };
      if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
      if (name === "./submitPrompt") return model;
      throw new Error(`Unexpected SubmitPromptDialog test dependency: ${name}`);
    },
  });
  assert.ok(exports.SubmitPromptDialog);
  function Host() {
    const [open, setOpen] = React.useState(true);
    return open ? React.createElement(exports.SubmitPromptDialog, {
      appVersion: "0.test", platform: "synthetic",
      onClose() { closes += 1; setOpen(false); },
    }) : null;
  }
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(Host)); });
  const input = (id: string) => renderer.root.findByProps({ id });
  return {
    requests,
    closes: () => closes,
    input,
    button: () => renderer.root.findByProps({ type: "submit" }),
    text: () => JSON.stringify(renderer.toJSON()),
    edit(id: string, value: string) { act(() => input(id).props.onChange({ target: { value } })); },
    fill() {
      this.edit("submit-prompt-message", "  Preserve my prompt\nwith details  ");
      this.edit("submit-prompt-name", "  Jane Test  ");
    },
    submit() { act(() => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); }); },
    shortcut() { act(() => { void commands["dialog.primaryAction"](); }); },
    submitAndShortcut() {
      act(() => {
        void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
        void commands["dialog.primaryAction"]();
      });
    },
    async resolve(index = 0) { await act(async () => { requests[index].resolve(); }); },
    async reject(index = 0) { await act(async () => { requests[index].reject(new Error("Synthetic opener rejected")); }); },
    escape() { act(() => renderer.root.findByProps({ role: "dialog" }).props.onKeyDown({ key: "Escape" })); },
    backdrop(outside: boolean) {
      const target = {};
      act(() => renderer.root.findByProps({ className: "submit-prompt-backdrop" }).props.onMouseDown({ currentTarget: target, target: outside ? target : {} }));
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

test("empty prompt does not open a draft", () => {
  const view = fixture();
  try {
    assert.equal(view.button().props.disabled, true);
    view.submit();
    view.shortcut();
    assert.equal(view.requests.length, 0);
    assert.equal(view.closes(), 0);
  } finally { view.dispose(); }
});

test("submit waits for the draft opener before closing and keeps captured arguments", async () => {
  const view = fixture();
  try {
    view.fill();
    view.submit();
    assert.equal(view.requests.length, 1);
    assert.equal(view.requests[0].url, model.promptSubmissionUrl("  Preserve my prompt\nwith details  ", "  Jane Test  ", "0.test", "synthetic"));
    assert.equal(view.closes(), 0, "dialog must stay mounted until the opener succeeds");
    assert.equal(view.button().props.disabled, true);
    assert.equal(view.input("submit-prompt-message").props.disabled, true);
    assert.equal(view.input("submit-prompt-name").props.disabled, true);
    await view.resolve();
    assert.equal(view.closes(), 1);
    assert.equal(view.text(), "null");
  } finally { view.dispose(); }
});

for (const trigger of ["submit", "shortcut"] as const) {
  test(`${trigger} rejection preserves the prompt and name and allows retry`, async () => {
    const view = fixture();
    try {
      view.fill();
      view[trigger]();
      await view.reject();
      assert.equal(view.closes(), 0, "a rejected opener must not discard the form");
      assert.equal(view.input("submit-prompt-message").props.value, "  Preserve my prompt\nwith details  ");
      assert.equal(view.input("submit-prompt-name").props.value, "  Jane Test  ");
      assert.equal(view.button().props.disabled, false);
      assert.notEqual(view.input("submit-prompt-message").props.disabled, true);
      assert.notEqual(view.input("submit-prompt-name").props.disabled, true);
      assert.match(view.text(), /Failed to submit prompt/);
      view.edit("submit-prompt-message", "Retry with changed text");
      view[trigger]();
      assert.equal(view.requests.length, 2);
      assert.equal(view.requests[1].url, model.promptSubmissionUrl("Retry with changed text", "  Jane Test  ", "0.test", "synthetic"));
      await view.resolve(1);
      assert.equal(view.closes(), 1);
    } finally { view.dispose(); }
  });
}

test("form and shortcut cannot start duplicate pending openers in the same render", async () => {
  const view = fixture();
  try {
    view.fill();
    view.submitAndShortcut();
    assert.equal(view.requests.length, 1);
    view.shortcut();
    assert.equal(view.requests.length, 1);
    await view.resolve();
    assert.equal(view.closes(), 1);
  } finally { view.dispose(); }
});

test("Escape remains an explicit dismissal", () => {
  const view = fixture();
  try {
    view.fill();
    view.escape();
    assert.equal(view.closes(), 1);
    assert.equal(view.requests.length, 0);
  } finally { view.dispose(); }
});

test("only outside backdrop presses dismiss the form", () => {
  const view = fixture();
  try {
    view.fill();
    view.backdrop(false);
    assert.equal(view.closes(), 0);
    view.backdrop(true);
    assert.equal(view.closes(), 1);
    assert.equal(view.requests.length, 0);
  } finally { view.dispose(); }
});
