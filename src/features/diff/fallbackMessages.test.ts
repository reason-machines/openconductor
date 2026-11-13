import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { FileDiff } from "./types.ts";

type ViewProps = Parameters<typeof import("./FileDiffView.tsx").FileDiffView>[0];
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const unexpected = () => assert.fail("No native, clipboard, editor or code-view execution in a fallback message test");
const inert = () => null;
const view: Partial<typeof import("./FileDiffView.tsx")> = {};
const boundaries: Record<string, unknown> = {
  "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
  "../../components/Icons.tsx": { CheckIcon: inert, CopyIcon: inert },
  "@tauri-apps/api/core": { invoke: unexpected },
  "../../backend": { inTauri: () => false },
  "./copyFile.ts": { copySource: () => null },
  "@pierre/diffs": {},
  "@pierre/diffs/react": { CodeView: unexpected },
  "./Whitespace": {
    WhitespaceOnly: ({ onShow }: { onShow?: () => void }) => React.createElement("button", {
      "data-whitespace-control": true, onClick: onShow,
    }, "Only whitespace changes found"),
  },
  "../../keybindings/KeybindingsProvider.tsx": {},
  "../../keybindings/overrides.ts": {},
  "../../keybindings/shortcut.ts": {},
  "./EditInViewer.ts": {},
  "./CommentNav": {},
  "./DiscardDialog": { RevertIcon: inert },
  "./FilePathChip": {
    FilePathChip: ({ path }: { path: string }) => React.createElement("span", { "data-file-path": path }, path),
  },
  "./pierre.ts": {},
  "./useDiffTheme.ts": {},
};
const javascript = ts.transpileModule(readFileSync(new URL("./FileDiffView.tsx", import.meta.url), "utf8"), {
  fileName: "FileDiffView.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
runInNewContext(javascript, {
  exports: view,
  require(name: string) {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected fallback dependency: ${name}`);
    return boundaries[name];
  },
});
const FileDiffView = view.FileDiffView;
assert.equal(typeof FileDiffView, "function");
assert.ok(FileDiffView);

function file(binary: boolean, extra: Partial<FileDiff> = {}): FileDiff {
  return {
    path: binary ? "selected.bin" : "mode-only.txt", old_path: null, status: "modified",
    binary, additions: 0, deletions: 0, hunks: [], ...extra,
  };
}
function props(selected: FileDiff, extra: Partial<ViewProps> = {}): ViewProps {
  return {
    file: selected, layout: "unified", ignoreWhitespace: false, wrapLines: false,
    viewed: false, onToggleViewed() {}, ...extra,
  };
}

for (const layout of ["unified", "split", "file"] satisfies ViewProps["layout"][]) {
  for (const binary of [true, false]) {
    test(`${layout}: ${binary ? "binary" : "equal-text"} fallback uses Conductor's message`, async (t) => {
      const selected = file(binary);
      let renderer: ReturnType<typeof create>;
      t.after(async () => { if (renderer) await act(async () => renderer.unmount()); });
      await act(async () => { renderer = create(React.createElement(FileDiffView, props(selected, { layout }))); });
      const notes = renderer.root.findAllByProps({ className: "oc-file-note" });
      assert.equal(notes.length, 1);
      assert.equal(notes[0].props.children, binary ? "Binary file changed" : "No changes in this file");
      assert.equal(renderer.root.findAllByProps({ "data-file-path": selected.path }).length, 1);
      assert.equal(renderer.root.findAllByProps({ "aria-label": "Mark as viewed" }).length, 1);
      assert.equal(renderer.root.findAllByProps({ "data-whitespace-control": true }).length, 0);
    });
  }
}

test("a size-hidden file keeps its higher-priority placeholder", async (t) => {
  let renderer: ReturnType<typeof create>;
  t.after(async () => { if (renderer) await act(async () => renderer.unmount()); });
  await act(async () => {
    renderer = create(React.createElement(FileDiffView, props(file(true, { hide_reason: "file_too_large" }))));
  });
  assert.equal(renderer.root.findByProps({ className: "oc-file-note" }).props.children, "File too large to display");
});

test("whitespace-hidden empty text still delegates to the existing control", async (t) => {
  let shows = 0;
  let renderer: ReturnType<typeof create>;
  t.after(async () => { if (renderer) await act(async () => renderer.unmount()); });
  await act(async () => {
    renderer = create(React.createElement(FileDiffView, props(file(false), {
      ignoreWhitespace: true, onShowWhitespace: () => { shows++; },
    })));
  });
  assert.equal(renderer.root.findAllByProps({ className: "oc-file-note" }).length, 0);
  await act(async () => renderer.root.findByProps({ "data-whitespace-control": true }).props.onClick());
  assert.equal(shows, 1);
});

test("Viewed still collapses fallback content without losing the selected path", async (t) => {
  const selected = file(true);
  let toggles = 0;
  let renderer: ReturnType<typeof create>;
  const initial = props(selected, { onToggleViewed: () => { toggles++; } });
  t.after(async () => { if (renderer) await act(async () => renderer.unmount()); });
  await act(async () => { renderer = create(React.createElement(FileDiffView, initial)); });
  await act(async () => renderer.root.findByProps({ "aria-label": "Mark as viewed" }).props.onClick());
  assert.equal(toggles, 1);
  await act(async () => renderer.update(React.createElement(FileDiffView, { ...initial, viewed: true })));
  assert.equal(renderer.root.findAllByProps({ className: "oc-file-note" }).length, 0);
  assert.equal(renderer.root.findAllByProps({ "data-file-path": selected.path }).length, 1);
});
