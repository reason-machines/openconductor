import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as model from "../state/githubRepoDialog.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function javascript(file: string) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function modal() {
  const exports: Partial<Pick<typeof import("./Dialogs"), "Modal">> = {};
  runInNewContext(javascript("./Dialogs.tsx"), {
    exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return dependencies(name);
      if (name === "./Icons") return { CloseIcon: () => null };
      if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
      throw new Error(`Unexpected Modal test dependency: ${name}`);
    },
  });
  assert.ok(exports.Modal);
  return exports.Modal;
}

async function fixture(pending: boolean) {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let closed = 0;
  let creations = 0;
  const exports: Partial<Pick<typeof import("./GitHubRepoDialog"), "GitHubRepoDialog">> = {};
  runInNewContext(javascript("./GitHubRepoDialog.tsx"), {
    exports,
    setTimeout(callback: () => void, milliseconds: number) {
      assert.equal(milliseconds, 300);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../state/githubRepoDialog") return model;
      if (name === "./DialogFrame") return { DialogFrame: ({ children }: { children: unknown }) => children };
      if (name === "../backend") return {
        async githubRepoOwners() { return { owners: [{ login: "me", kind: "user" }], orgsError: null }; },
        async githubRepoAvailability() { return "available"; },
        githubRepoCreate() { creations++; return new Promise(() => {}); },
      };
      throw new Error(`Unexpected GitHub dismissal test dependency: ${name}`);
    },
  });
  assert.ok(exports.GitHubRepoDialog);
  function Host() {
    const [open, setOpen] = React.useState(true);
    return open && React.createElement(exports.GitHubRepoDialog, {
      target: { path: "/synthetic/project", name: "Notes", needsGitInit: false },
      onClose() { closed++; setOpen(false); },
      onCreated: async () => { throw new Error("Creation must remain pending"); },
      onOpenSettings() { throw new Error("Unexpected settings navigation"); },
      onError(message: string) { throw new Error(message); },
    });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Host)); });
  await act(async () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
  });
  const submitBtn = renderer.root.findByProps({ type: "submit" });
  assert.equal(submitBtn.props.disabled, false);
  assert.ok(submitBtn.props["data-primary-action"] !== undefined, "submit button must carry data-primary-action");
  if (pending) {
    await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    assert.equal(creations, 1);
    assert.equal(renderer.root.findByProps({ type: "submit" }).props.disabled, true);
  }
  return {
    closed: () => closed,
    isOpen: () => renderer.root.findAllByType("form").length === 1,
    cancel() {
      const button = renderer.root.findAllByType("button").find((node: { props: { children: unknown; "data-dialog-cancel"?: unknown } }) => node.props["data-dialog-cancel"] !== undefined);
      assert.ok(button, "cancel button must have data-dialog-cancel");
      assert.notEqual(button.props.disabled, true);
      act(() => button.props.onClick());
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const pending of [false, true]) {
  const state = pending ? "while creation is pending" : "before creation";
  test(`GitHub repository dialog cancel button has data-dialog-cancel and closes ${state}`, async () => {
    const view = await fixture(pending);
    try {
      view.cancel();
      assert.equal(view.closed(), 1);
      assert.equal(view.isOpen(), false);
    } finally { view.dispose(); }
  });
}

test("ordinary Modal keeps its default backdrop dismissal", () => {
  let closed = 0;
  const Modal = modal();
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(Modal, { title: "Ordinary dialog", onClose() { closed++; } }, "Content")); });
  try {
    const currentTarget = {};
    act(() => renderer.root.findByProps({ className: "modal-backdrop" }).props.onMouseDown({
      currentTarget, target: currentTarget,
      preventDefault() { throw new Error("Ordinary dialogs do not block backdrop presses"); },
    }));
    assert.equal(closed, 1);
  } finally { act(() => renderer.unmount()); }
});
