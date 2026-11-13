import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as editorContents from "../diff/editorContents.ts";
import { isTextPath } from "../diff/copyFile.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { matchesEvent } from "../../keybindings/shortcut.ts";
import { readText } from "./readText.ts";
import type { WorkspaceFileViewProps } from "./WorkspaceFileView.tsx";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function load(file: string, exported: object, imports: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports: exported,
    document: { documentElement: { dataset: { theme: "dark" } } },
    MutationObserver: class { observe() {} disconnect() {} },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      assert.ok(name in imports, `Unexpected workspace-file dependency: ${name}`);
      return imports[name];
    },
  });
}

async function fixture({ text = "saved", desktop = true, read, write, saveError }: {
  text?: string;
  desktop?: boolean;
  read?: (args: unknown) => Promise<unknown>;
  write?: () => Promise<void>;
  saveError?: Error;
} = {}, initial: Partial<WorkspaceFileViewProps> = {}) {
  const calls: string[] = [];
  let diskText = text;
  const native = {
    async invoke(command: string, args: unknown) {
      calls.push(JSON.stringify({ command, args }));
      if (command === "workspace_read_text") return read ? read(args) : diskText;
      assert.equal(command, "diff_write_file");
      if (saveError) throw saveError;
      assert.ok(args !== null && typeof args === "object" && "request" in args);
      const request = args.request;
      assert.ok(request !== null && typeof request === "object" && "contents" in request && typeof request.contents === "string");
      await write?.();
      diskText = request.contents;
    },
  };
  const edits: Partial<typeof import("../diff/EditInViewer.ts")> = {};
  load("../diff/EditInViewer.ts", edits, {
    "@tauri-apps/api/core": native,
    "@pierre/diffs/edit": { Editor: class {} },
    "../../backend": { inTauri: () => desktop },
    "./editorContents.ts": editorContents,
    "./editable.ts": {},
  });
  const component: Partial<typeof import("./WorkspaceFileView.tsx")> = {};
  const CodeView = React.forwardRef<unknown, object>((props, _ref) => React.createElement("code-probe", props));
  load("./WorkspaceFileView.tsx", component, {
    "@tauri-apps/api/core": native,
    "@pierre/diffs/react": {
      CodeView,
      EditProvider: ({ children }: { children: React.ReactNode }) => children,
    },
    "../../backend": { inTauri: () => desktop },
    "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "../../keybindings/KeybindingsProvider.tsx": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../../keybindings/overrides.ts": { effectiveShortcuts },
    "../../keybindings/shortcut.ts": { matchesEvent },
    "../diff/copyFile.ts": { isTextPath },
    "../diff/EditInViewer.ts": edits,
    "../diff/FilePathChip": { FilePathChip: ({ path }: { path: string }) => React.createElement("span", {}, path) },
    "../diff/pierre.ts": { CODE_VIEW_LAYOUT: { paddingTop: 0, paddingBottom: 8, gap: 8 } },
    "../diff/useDiffTheme.ts": { useDiffTheme: () => "test-theme" },
    "../diff/Whitespace": { ViewOptionsMenu: () => null },
    "./readText.ts": { readText },
  });
  assert.ok(component.WorkspaceFileView);
  const View = component.WorkspaceFileView;
  let props: WorkspaceFileViewProps = { worktree: "/tmp/workspace-a", path: "src/unchanged.ts", isVisible: true, readOnly: false, ...initial };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(View, props)); await settle(); });
  return {
    calls,
    code: () => renderer.root.findByType("code-probe"),
    codeCount: () => renderer.root.findAllByType("code-probe").length,
    alertCount: () => renderer.root.findAllByProps({ role: "alert" }).length,
    async update(next: Partial<WorkspaceFileViewProps>) {
      props = { ...props, ...next };
      await act(async () => { renderer.update(React.createElement(View, props)); await settle(); });
    },
    async change(contents: string) { await act(async () => { this.code().props.onItemEditChange({ file: { contents } }); }); },
    async save() {
      let prevented = false;
      const nativeEvent = { key: "s", code: "KeyS", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
      await act(async () => {
        renderer.root.findByProps({ className: "workspace-file-code" }).props.onKeyDown({ nativeEvent, preventDefault() { prevented = true; } });
        await settle();
      });
      return prevented;
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const text of ["", "const café = '海';\r\n", "no final newline"]) {
  test(`unchanged generic text is a raw editable file, including ${JSON.stringify(text)}`, async () => {
    const view = await fixture({ text });
    try {
      assert.equal(view.calls[0], JSON.stringify({ command: "workspace_read_text", args: { repo: "/tmp/workspace-a", path: "src/unchanged.ts" } }));
      const item = view.code().props.items[0];
      assert.equal(item.type, "file");
      assert.equal(item.file.contents, text);
      assert.equal(item.edit, true);
      assert.equal(item.fileDiff, undefined);
    } finally { await view.close(); }
  });
}

test("the existing draft/save hook writes the generic file, without a diff API", async () => {
  const view = await fixture();
  try {
    await view.change("draft\n");
    assert.equal(await view.save(), true);
    assert.equal(view.calls[1], JSON.stringify({ command: "diff_write_file", args: { repo: "/tmp/workspace-a", request: { path: "src/unchanged.ts", contents: "draft\n" } } }));
    assert.equal(view.alertCount(), 0);
  } finally { await view.close(); }
});

test("a save refusal is visible and does not discard the draft", async () => {
  const view = await fixture({ saveError: new Error("disk full") });
  try {
    await view.change("unsaved");
    await view.save();
    assert.equal(view.alertCount(), 1);
    await view.update({ path: "other.ts" });
    await view.update({ path: "src/unchanged.ts" });
    assert.equal(view.code().props.items[0].file.contents, "unsaved");
  } finally { await view.close(); }
});

test("explicit read-only files render without edit or save", async () => {
  const view = await fixture({}, { readOnly: true });
  try {
    assert.equal(view.code().props.items[0].edit, false);
    assert.equal(view.code().props.onItemEditChange, undefined);
    assert.equal(await view.save(), false);
    assert.equal(view.calls.length, 1);
  } finally { await view.close(); }
});

test("switching to read-only after an acknowledged save rereads the saved contents", async () => {
  const view = await fixture({ text: "original" });
  try {
    await view.change("saved replacement");
    await view.save();
    await view.update({ readOnly: true });
    assert.equal(view.code().props.items[0].file.contents, "saved replacement");
    assert.equal(view.code().props.items[0].edit, false);
    assert.equal(view.calls.length, 3, "initial read, existing write, read-only reread");
    assert.equal(await view.save(), false);
  } finally { await view.close(); }
});

test("a read-only replacement waits for its target's pending save before reading", async () => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const view = await fixture({ text: "old disk", write: () => pending });
  try {
    await view.change("new disk");
    await view.save();
    await view.update({ readOnly: true });
    assert.equal(view.codeCount(), 0, "do not publish a pre-save read as the readonly file");
    assert.equal(view.calls.length, 2, "initial read and pending write only");
    await act(async () => { finish(); await settle(); });
    assert.equal(view.code().props.items[0].file.contents, "new disk");
    assert.equal(view.code().props.items[0].edit, false);
    assert.equal(await view.save(), false);
    assert.equal(view.calls.length, 3, "one replacement read, no new save");
  } finally { finish(); await view.close(); }
});

test("reopening the same target while its save is pending reads after the write", async () => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const view = await fixture({ text: "old disk", write: () => pending });
  try {
    await view.change("new disk");
    await view.save();
    await view.update({ path: "other.ts" });
    await view.update({ path: "src/unchanged.ts" });
    assert.equal(view.codeCount(), 0);
    await act(async () => { finish(); await settle(); });
    assert.equal(view.code().props.items[0].file.contents, "new disk");
  } finally { finish(); await view.close(); }
});

test("A's pending completion cannot replace the current B target", async () => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const view = await fixture({ write: () => pending, read: async (args) => JSON.stringify(args).includes("workspace-b") ? "target B" : "target A" });
  try {
    await view.change("saved A");
    await view.save();
    await view.update({ readOnly: true });
    await view.update({ worktree: "/tmp/workspace-b" });
    assert.equal(view.code().props.items[0].file.contents, "target B");
    await act(async () => { finish(); await settle(); });
    assert.equal(view.code().props.items[0].file.contents, "target B");
    assert.equal(view.code().props.items[0].edit, false);
    assert.equal(view.calls.filter((call) => call.includes("workspace-b")).length, 1);
    assert.equal(view.calls.length, 3, "cancelled A must not issue a read after its save settles");
  } finally { finish(); await view.close(); }
});

test("a pending save failure releases the read without discarding the unsaved draft", async () => {
  let reject: (error: Error) => void = () => {};
  const pending = new Promise<void>((_, no) => { reject = no; });
  const view = await fixture({ text: "old disk", write: () => pending });
  try {
    await view.change("unsaved draft");
    await view.save();
    await view.update({ readOnly: true });
    assert.equal(view.codeCount(), 0);
    await act(async () => { reject(new Error("write failed")); await settle(); });
    assert.equal(view.code().props.items[0].file.contents, "old disk");
    assert.equal(view.code().props.items[0].edit, false);
    await view.update({ readOnly: false });
    assert.equal(view.code().props.items[0].file.contents, "unsaved draft");
  } finally { reject(new Error("cleanup")); await view.close(); }
});

test("a read-only round trip retains an unsaved draft without displaying it as disk text", async () => {
  const view = await fixture({ text: "on disk" });
  try {
    await view.change("pending draft");
    await view.update({ readOnly: true });
    assert.equal(view.code().props.items[0].file.contents, "on disk");
    await view.update({ readOnly: false });
    assert.equal(view.code().props.items[0].file.contents, "pending draft");
    assert.equal(view.calls.length, 3, "reads only; no write on policy changes");
  } finally { await view.close(); }
});

test("retaining a hidden view cannot consume save or write", async () => {
  const view = await fixture();
  try {
    await view.change("draft");
    await view.update({ isVisible: false });
    assert.equal(await view.save(), false);
    assert.equal(view.calls.length, 1);
    await view.update({ isVisible: true });
    assert.equal(await view.save(), true);
    assert.match(view.calls[1], /draft/);
  } finally { await view.close(); }
});

for (const path of ["picture.PNG", "movie.mov", "document.pdf"]) {
  test(`non-text path ${path} never becomes an editor`, async () => {
    const view = await fixture({}, { path });
    try { assert.equal(view.codeCount(), 0); assert.equal(view.calls.length, 0); }
    finally { await view.close(); }
  });
}

for (const read of [async () => { throw new Error("missing or refused"); }, async () => null]) {
  test("load refusal or invalid response does not manufacture empty editable content", async () => {
    const view = await fixture({ read });
    try { assert.equal(view.codeCount(), 0); assert.equal(view.alertCount(), 1); }
    finally { await view.close(); }
  });
}

test("browser mode refuses local reads rather than enabling sample writes", async () => {
  const view = await fixture({ desktop: false });
  try { assert.equal(view.codeCount(), 0); assert.equal(view.alertCount(), 1); assert.equal(view.calls.length, 0); }
  finally { await view.close(); }
});

test("a different worktree does not display the old path's late read", async () => {
  let resolveOld: (text: string) => void = () => {};
  const old = new Promise<string>((resolve) => { resolveOld = resolve; });
  const view = await fixture({ read: (args) => JSON.stringify(args).includes("workspace-a") ? old : Promise.resolve("workspace b") });
  try {
    assert.equal(view.codeCount(), 0);
    await view.update({ worktree: "/tmp/workspace-b" });
    assert.equal(view.code().props.items[0].file.contents, "workspace b");
    await act(async () => { resolveOld("stale workspace a"); await settle(); });
    assert.equal(view.code().props.items[0].file.contents, "workspace b");
  } finally { await view.close(); }
});
