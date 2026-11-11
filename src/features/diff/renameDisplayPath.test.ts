import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as changesFilter from "./changesFilter.ts";
import * as changesTree from "./changesTree.ts";
import * as copyPaths from "./fileCopyPaths.ts";
import { DEFAULT_VIEW_OPTIONS, type FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function javascript(source: string, fileName: string) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function evaluate(source: string, fileName: string, require: (name: string) => unknown) {
  const module: { exports: Record<string, unknown> } = { exports: {} };
  runInNewContext(`(function(require, module, exports) { ${javascript(source, fileName)}\n})`)(require, module, module.exports);
  return module.exports;
}

const pathChip = resolve("src/features/diff/FilePathChip.tsx");
const pathSource = ts.createSourceFile(pathChip, readFileSync(pathChip, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pathFunction = pathSource.statements.find((node: { name?: { text: string } }) => ts.isFunctionDeclaration(node) && node.name?.text === "splitPath");
assert.ok(pathFunction, "the real path formatter must exist");
const pathFormatter = evaluate(pathFunction.getText(pathSource), pathChip, () => { throw new Error("Unexpected path formatter dependency"); });
const unexpected = () => { throw new Error("Unexpected Changes list action"); };
const icon = () => null;
const boundaries: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": dependencies("react/jsx-runtime"),
  "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: unknown }) => children },
  "./diff.css": {},
  "./DiscardDialog": { RevertIcon: icon },
  "./FileContextMenu": { FileContextMenu: unexpected },
  "./fileCopyPaths.ts": copyPaths,
  "../openIn/apps": { copyText: unexpected, openInApp: unexpected },
  "./FilePathChip": pathFormatter,
  "../files/panelIcons": { SearchIcon: icon, XIcon: icon },
  "./changesFilter": changesFilter,
  "./changesTree.ts": changesTree,
};
const componentPath = resolve("src/features/diff/ChangesList.tsx");
const component = evaluate(readFileSync(componentPath, "utf8"), componentPath, (name) => {
  if (name === "./renameDisplayPath.ts") {
    const helperPath = resolve("src/features/diff/renameDisplayPath.ts");
    return evaluate(readFileSync(helperPath, "utf8"), helperPath, () => { throw new Error("Unexpected rename helper dependency"); });
  }
  assert.ok(Object.hasOwn(boundaries, name), `Unexpected Changes list dependency: ${name}`);
  return boundaries[name];
});
assert.equal(typeof component.ChangesList, "function");

interface TextNode { children: readonly (string | TextNode)[] }
function visibleText(node: TextNode): string {
  return node.children.map((child) => typeof child === "string" ? child : visibleText(child)).join("");
}

function renamed(path: string, old_path: string | null): FileDiff {
  return { path, old_path, status: "renamed", additions: 0, deletions: 0, binary: false, hunks: [] };
}

function label(file: FileDiff, view: changesTree.ChangesView): string {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(component.ChangesList, {
      diff: {
        opts: DEFAULT_VIEW_OPTIONS, load: { state: "ready" }, files: [file], totals: { a: 0, d: 0 }, current: 0,
        isViewed: () => false, uncommittedPaths: new Set(), canDiscard: false, openPath: unexpected, refresh: unexpected, turn: null,
      },
      view, collapsed: new Set(), toggleDirectory: unexpected,
    }));
  });
  try {
    const button = renderer.root.findByProps({ title: `Open ${file.path}` });
    return visibleText(button.findByProps({ className: "name" }));
  } finally {
    act(() => renderer.unmount());
  }
}

const cases: { name: string; path: string; oldPath: string; tree: string; flat: string }[] = [
  { name: "move with the same basename", path: "new/auth.ts", oldPath: "old/auth.ts", tree: "old/auth.ts→auth.ts", flat: "old/auth.ts→new/auth.ts" },
  { name: "move and rename", path: "new/current.ts", oldPath: "old/legacy.ts", tree: "old/legacy.ts→current.ts", flat: "old/legacy.ts→new/current.ts" },
  { name: "move from nested directory to root", path: "auth.ts", oldPath: "old/auth.ts", tree: "old/auth.ts→auth.ts", flat: "old/auth.ts→auth.ts" },
  { name: "move from root into a directory", path: "new/auth.ts", oldPath: "auth.ts", tree: "auth.ts→auth.ts", flat: "auth.ts→new/auth.ts" },
  { name: "rename within one directory", path: "src/auth.ts", oldPath: "src/legacy.ts", tree: "legacy.ts→auth.ts", flat: "src/legacy.ts→src/auth.ts" },
  { name: "rename within a deep directory", path: "src/lib/auth.ts", oldPath: "src/lib/legacy.ts", tree: "legacy.ts→auth.ts", flat: "src/lib/legacy.ts→src/lib/auth.ts" },
  { name: "rename at root", path: "auth.ts", oldPath: "legacy.ts", tree: "legacy.ts→auth.ts", flat: "legacy.ts→auth.ts" },
];
for (const entry of cases) {
  for (const view of ["tree", "flat"] satisfies changesTree.ChangesView[]) {
    test(`actual ChangesList ${view} label preserves ${entry.name}`, () => {
      assert.equal(label(renamed(entry.path, entry.oldPath), view), entry[view]);
    });
  }
}
for (const view of ["tree", "flat"] satisfies changesTree.ChangesView[]) {
  test(`actual ChangesList ${view} label omits a missing rename source`, () => {
    assert.equal(label(renamed("src/auth.ts", null), view), view === "tree" ? "auth.ts" : "src/auth.ts");
  });
  test(`actual ChangesList ${view} label ignores old_path for a non-rename`, () => {
    assert.equal(label({ ...renamed("src/auth.ts", "old/auth.ts"), status: "modified" }, view), view === "tree" ? "auth.ts" : "src/auth.ts");
  });
}
