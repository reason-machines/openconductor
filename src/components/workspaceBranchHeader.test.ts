import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { Workspace } from "../state/types";
import { createBranchHeaderController, sanitizeHeaderBranch } from "./branchHeaderController.ts";

function deferred() {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(branch = "sven/full.branch", workspaceId = "ws1", status: Workspace["status"] = "idle") {
  const calls: unknown[] = [];
  const errors: string[] = [];
  const rename = deferred();
  let markerError: Error | undefined;
  const controller = createBranchHeaderController({
    repoId: "repo1", workspace: { id: workspaceId, branch, status },
    renameBranch: async (...args) => { calls.push(["rename", ...args]); await rename.promise; },
    markUserSetBranchName: async (id) => { calls.push(["mark", id]); if (markerError) throw markerError; },
    dispatch: (action) => { calls.push(action); },
    copyText: async (text) => { calls.push(["copy", text]); },
    onError: (message) => { errors.push(message); },
    onChange: () => {},
  });
  return { controller, calls, errors, rename, failMarker: () => { markerError = new Error("disk error"); } };
}

function key(key: string) {
  return { key, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
}

const mountedDependencies = createRequire(import.meta.url);
const { act, create } = mountedDependencies("react-test-renderer");

function inputChange(value: string, selectionStart: number | null = value.length) {
  const selectionWrites: Array<[number, number]> = [];
  const input = {
    value, selectionStart, selectionEnd: selectionStart,
    setSelectionRange(start: number, end: number) {
      selectionWrites.push([start, end]);
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  return { currentTarget: input, target: input, selectionWrites };
}

function mountedHeaderFixture() {
  const rename = deferred();
  const marker = deferred();
  const calls: unknown[] = [];
  const errors: string[] = [];
  const exports: Partial<Pick<typeof import("./WorkspaceBranchHeader"), "WorkspaceBranchHeader">> = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL("./WorkspaceBranchHeader.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
  });
  const nativeImports: Record<string, unknown> = {
    "../backend": { markUserSetBranchName: async (id: string) => { calls.push(["mark", id]); await marker.promise; } },
    "../workspace/api": { renameWorkspaceBranch: async (...args: string[]) => { calls.push(["rename", ...args]); await rename.promise; } },
    "../features/openIn/apps": { copyText: async (text: string) => { calls.push(["copy", text]); } },
    "./branchHeaderController": { createBranchHeaderController },
    "./Icons": { BranchIcon: () => null },
    "./menu/menuIcons": { CopyIcon: () => null, PencilIcon: () => null },
    "./menu/ContextMenu": { ContextMenu: () => null, MenuItem: () => null },
  };
  runInNewContext(outputText, {
    exports,
    queueMicrotask,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return mountedDependencies(name);
      if (name.endsWith(".css")) return {};
      assert.ok(name in nativeImports, `Unexpected branch header dependency: ${name}`);
      return nativeImports[name];
    },
  });
  const Header = exports.WorkspaceBranchHeader;
  assert.ok(Header);
  const workspace: Workspace = { id: "ws1", name: "workspace", branch: "old/branch", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0 };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(Header, {
      repoId: "repo1", workspace,
      dispatch: (action) => { calls.push(action); },
      onError: (message: string) => { errors.push(message); },
    }));
  });
  return {
    rename, marker, calls, errors,
    inputs: () => renderer.root.findAllByType("input"),
    button: () => renderer.root.findByProps({ "aria-label": "Rename branch" }),
    async close() {
      await act(async () => { rename.resolve(); marker.resolve(); });
      act(() => { renderer.unmount(); });
    },
  };
}

test("mounted branch editor requests the shipped new-password autocomplete hint", async () => {
  const view = mountedHeaderFixture();
  try {
    act(() => { view.button().props.onClick(); });
    assert.equal(view.inputs()[0].props.autoComplete, "new-password");
  } finally { await view.close(); }
});

for (const submitWith of ["Enter", "blur"] as const) {
  test(`mounted branch editor closes on ${submitWith} before rename and marker finish`, async () => {
    const view = mountedHeaderFixture();
    try {
      act(() => { view.button().props.onClick(); });
      const input = view.inputs()[0];
      assert.ok(input);
      act(() => { input.props.onChange(inputChange("next/branch")); });
      const { onBlur, onKeyDown } = input.props;
      act(() => {
        if (submitWith === "Enter") onKeyDown(key("Enter"));
        else onBlur();
      });
      assert.deepEqual(view.calls, [["rename", "ws1", "next/branch"]]);
      assert.equal(view.inputs().length, 0, "submitted editor closes while the rename promise is unresolved");
      assert.equal(view.button().props["aria-disabled"], true);
      act(() => { onBlur(); onKeyDown(key("Enter")); view.button().props.onClick(); });
      assert.equal(view.inputs().length, 0);
      assert.deepEqual(view.calls, [["rename", "ws1", "next/branch"]]);
      await act(async () => { view.rename.resolve(); });
      assert.deepEqual(view.calls, [
        ["rename", "ws1", "next/branch"],
        { type: "renameWorkspace", repoId: "repo1", workspaceId: "ws1", branch: "next/branch", userSet: true },
        ["mark", "ws1"],
      ]);
      assert.equal(view.inputs().length, 0, "the preference write does not hold the editor open");
      assert.equal(view.button().props["aria-disabled"], true);
      await act(async () => { view.marker.resolve(); });
      assert.equal(view.button().props["aria-disabled"], false);
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  });
}

test("mounted submitted branch editor stays closed on rename rejection and permits a retry", async () => {
  const view = mountedHeaderFixture();
  try {
    act(() => { view.button().props.onClick(); });
    const input = view.inputs()[0];
    assert.ok(input);
    act(() => { input.props.onChange(inputChange("taken")); input.props.onBlur(); });
    assert.equal(view.inputs().length, 0, "submitted editor closes before a rejected rename settles");
    await act(async () => { view.rename.reject(new Error("branch exists")); });
    assert.deepEqual(view.calls, [["rename", "ws1", "taken"]]);
    assert.deepEqual(view.errors, ["Failed to rename branch: branch exists"]);
    assert.equal(view.button().props["aria-disabled"], false);
    act(() => { view.button().props.onClick(); });
    assert.equal(view.inputs()[0].props.value, "old/branch");
  } finally { await view.close(); }
});

test("mounted branch editor preserves empty, unchanged and Escape controls without I/O", async () => {
  const view = mountedHeaderFixture();
  try {
    act(() => { view.button().props.onClick(); });
    act(() => { view.inputs()[0].props.onChange(inputChange("")); });
    act(() => { view.inputs()[0].props.onBlur(); });
    assert.equal(view.inputs().length, 1);
    assert.deepEqual(view.calls, []);
    act(() => { view.inputs()[0].props.onChange(inputChange("old/branch")); });
    act(() => { view.inputs()[0].props.onKeyDown(key("Enter")); });
    assert.equal(view.inputs().length, 0);
    act(() => { view.button().props.onClick(); });
    act(() => { view.inputs()[0].props.onChange(inputChange("discard")); });
    const input = view.inputs()[0];
    const escape = key("Escape");
    act(() => { input.props.onKeyDown(escape); input.props.onBlur(); });
    assert.equal(escape.stopped, true);
    assert.equal(view.inputs().length, 0);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

for (const { raw, caret, expected } of [
  { raw: "feature/ab", caret: 8, expected: "feature/ab" },
  { raw: "feature/a!!b", caret: 9, expected: "feature/a-b" },
  { raw: "feature/ab", caret: null, expected: "feature/ab" },
]) {
  test(`mounted branch editor restores caret ${caret ?? 0} after queued change of ${raw}`, async () => {
    const view = mountedHeaderFixture();
    try {
      act(() => { view.button().props.onClick(); });
      const change = inputChange(raw, caret);
      act(() => { view.inputs()[0].props.onChange(change); });
      assert.equal(view.inputs()[0].props.value, expected);
      assert.equal(view.inputs().length, 1);
      assert.deepEqual(change.selectionWrites, [], "selection is not restored before the controlled update finishes");
      change.currentTarget.selectionStart = 0;
      change.currentTarget.selectionEnd = 0;
      await act(async () => {});
      assert.deepEqual(change.selectionWrites, [[caret ?? 0, caret ?? 0]], "the queued callback restores the captured caret");
      assert.equal(change.currentTarget.selectionStart, caret ?? 0);
      assert.equal(change.currentTarget.selectionEnd, caret ?? 0);
      assert.deepEqual(view.calls, []);
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  });
}

test("archived header renders only a static branch label; active headers retain Rename", () => {
  // Transform just this TSX module for Node's renderer; native I/O stays stubbed.
  const source = readFileSync(new URL("./WorkspaceBranchHeader.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021,
  } });
  const calls: string[] = [];
  const nativeCall = async () => { calls.push("native"); };
  const require = createRequire(import.meta.url);
  const exports: { WorkspaceBranchHeader?: ComponentType<{
    repoId: string; workspace: Workspace; dispatch(): void; onError(): void;
  }> } = {};
  runInNewContext(outputText, { exports, require: (name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "./branchHeaderController") return { createBranchHeaderController };
    if (name === "../backend") return { markUserSetBranchName: nativeCall };
    if (name === "../workspace/api") return { renameWorkspaceBranch: nativeCall };
    if (name === "../features/openIn/apps") return { copyText: nativeCall };
    if (name === "./Icons") return { BranchIcon: () => null };
    if (name === "./menu/menuIcons") return { CopyIcon: () => null, PencilIcon: () => null };
    if (name === "./menu/ContextMenu") return { ContextMenu: () => null, MenuItem: () => null };
    if (name.endsWith(".css")) return {};
    throw new Error(`Unexpected component dependency: ${name}`);
  } });
  const Header = exports.WorkspaceBranchHeader;
  assert.ok(Header);
  const workspace: Workspace = { id: "ws1", name: "workspace", branch: "sven/full.branch", status: "archived", diff: { added: 0, removed: 0 }, createdAt: 0 };
  const props = { repoId: "repo1", workspace, dispatch() {}, onError() {} };
  const archived = renderToStaticMarkup(createElement(Header, props));
  assert.equal(archived, '<span class="chip"> sven/full.branch</span>');
  assert.doesNotMatch(archived, /button|input|menu|Rename/);
  for (const status of ["idle", "needs-review"] as const) {
    const active = renderToStaticMarkup(createElement(Header, { ...props, workspace: { ...workspace, status } }));
    assert.match(active, /<button[^>]+aria-label="Rename branch"/);
  }
  assert.deepEqual(calls, []);
});

test("archived header ignores edit, Copy/Rename shortcuts, Enter and blur without side effects", async () => {
  const { controller, calls, rename } = fixture("sven/full.branch", "archived", "archived");
  rename.resolve();
  controller.startEditing();
  await controller.menuKey(key("r"));
  controller.change("must-not-rename");
  await controller.inputKey(key("Enter"));
  await controller.blur();
  await controller.menuKey(key("c"));
  await controller.copy();
  assert.deepEqual(calls, []);
  assert.equal(controller.canRename, false);
  assert.equal(controller.state.editing, false);
  assert.equal(controller.state.pending, false);
});

test("review workspace retains the active branch editor", async () => {
  const { controller, calls, rename } = fixture("old", "review", "needs-review");
  controller.startEditing();
  controller.change("new");
  const submitted = controller.inputKey(key("Enter"));
  rename.resolve();
  await submitted;
  assert.deepEqual(calls[0], ["rename", "review", "new"]);
});

test("inline edit starts with the full branch and sanitizes only disallowed runs", () => {
  const { controller } = fixture();
  controller.startEditing();
  assert.equal(controller.state.value, "sven/full.branch");
  controller.change("Feature/a b!!_C.D-e/f");
  assert.equal(controller.state.value, "Feature/a-b-_C.D-e/f");
  assert.equal(sanitizeHeaderBranch("é 🐬 ?"), "-");
});

test("Enter followed by blur submits once, persists user-set and dispatches branch only", async () => {
  const { controller, calls, rename } = fixture();
  controller.startEditing();
  controller.change("full/new branch");
  const event = key("Enter");
  const submitted = controller.inputKey(event);
  await controller.blur();
  assert.equal(event.prevented, true);
  assert.equal(controller.state.pending, true);
  assert.deepEqual(calls, [["rename", "ws1", "full/new-branch"]]);
  rename.resolve();
  await submitted;
  assert.deepEqual(calls, [
    ["rename", "ws1", "full/new-branch"],
    { type: "renameWorkspace", repoId: "repo1", workspaceId: "ws1", branch: "full/new-branch", userSet: true },
    ["mark", "ws1"],
  ]);
  await controller.blur();
  assert.equal(calls.length, 3);
  assert.equal(controller.state.editing, false);
  assert.equal(controller.state.pending, false);
});

test("blur submits; Escape stops propagation and cancels without blur mutation", async () => {
  const first = fixture();
  first.controller.startEditing();
  first.controller.change("next");
  const submitted = first.controller.blur();
  first.rename.resolve();
  await submitted;
  assert.deepEqual(first.calls[0], ["rename", "ws1", "next"]);
  const second = fixture();
  second.controller.startEditing();
  second.controller.change("discard");
  const event = key("Escape");
  await second.controller.inputKey(event);
  await second.controller.blur();
  assert.equal(event.stopped, true);
  assert.equal(second.controller.state.editing, false);
  assert.deepEqual(second.calls, []);
});

test("empty input stays open, unchanged input exits, neither mutates", async () => {
  const { controller, calls } = fixture();
  controller.startEditing();
  controller.change("");
  await controller.blur();
  assert.equal(controller.state.editing, true);
  controller.change("sven/full.branch");
  await controller.inputKey(key("Enter"));
  assert.equal(controller.state.editing, false);
  assert.deepEqual(calls, []);
});

test("copy writes the full original branch, not the current draft; C and R work", async () => {
  const { controller, calls } = fixture();
  const renameKey = key("R");
  assert.equal(await controller.menuKey(renameKey), true);
  controller.change("draft");
  const copyKey = key("c");
  assert.equal(await controller.menuKey(copyKey), true);
  assert.equal(copyKey.prevented, true);
  assert.deepEqual(calls, [["copy", "sven/full.branch"]]);
  assert.equal(await controller.menuKey(key("x")), false);
});

test("missing and detached branches never enter editing or rename", async () => {
  for (const branch of ["", "(detached HEAD)"]) {
    const { controller, calls } = fixture(branch);
    assert.equal(controller.canRename, false);
    controller.startEditing();
    await controller.menuKey(key("r"));
    controller.change("not-allowed");
    await controller.inputKey(key("Enter"));
    await controller.blur();
    assert.equal(controller.state.editing, false);
    assert.deepEqual(calls, []);
    await controller.copy();
    assert.deepEqual(calls, branch ? [["copy", branch]] : []);
  }
});

test("pending blocks edits and repeated submits; rename error resets pending truthfully", async () => {
  const { controller, calls, errors, rename } = fixture();
  controller.startEditing();
  controller.change("next");
  const submitted = controller.blur();
  controller.startEditing();
  controller.change("other");
  await controller.inputKey(key("Enter"));
  rename.reject(new Error("branch exists"));
  await submitted;
  assert.deepEqual(calls, [["rename", "ws1", "next"]]);
  assert.deepEqual(errors, ["Failed to rename branch: branch exists"]);
  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.editing, false);
  controller.startEditing();
  assert.equal(controller.state.value, "sven/full.branch");
});

test("marker failure does not hide a successful Git branch rename", async () => {
  const { controller, calls, errors, rename, failMarker } = fixture();
  failMarker();
  controller.startEditing();
  controller.change("next");
  const submitted = controller.blur();
  rename.resolve();
  await submitted;
  assert.deepEqual(calls[1], { type: "renameWorkspace", repoId: "repo1", workspaceId: "ws1", branch: "next", userSet: true });
  assert.deepEqual(errors, ["Branch renamed, but failed to save branch-name preference: disk error"]);
  assert.equal(controller.state.pending, false);
});

test("in-flight rename keeps its workspace identity separate from another header", async () => {
  const first = fixture("old/one", "one");
  const second = fixture("old/two", "two");
  first.controller.startEditing();
  first.controller.change("new/one");
  const submitted = first.controller.blur();
  second.controller.startEditing();
  assert.equal(second.controller.state.value, "old/two");
  first.rename.resolve();
  await submitted;
  assert.deepEqual(first.calls[1], { type: "renameWorkspace", repoId: "repo1", workspaceId: "one", branch: "new/one", userSet: true });
  assert.deepEqual(second.calls, []);
});

test("clipboard rejection is reported without renaming", async () => {
  const errors: string[] = [];
  const controller = createBranchHeaderController({
    repoId: "repo1", workspace: { id: "ws1", branch: "full/name", status: "idle" },
    renameBranch: async () => { assert.fail("must not rename"); },
    markUserSetBranchName: async () => { assert.fail("must not mark"); },
    dispatch: () => { assert.fail("must not dispatch"); },
    copyText: async () => { throw new Error("denied"); },
    onError: (message) => { errors.push(message); }, onChange: () => {},
  });
  await controller.copy();
  assert.deepEqual(errors, ["Failed to copy to clipboard"]);
});
