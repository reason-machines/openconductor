import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as changesFilter from "./changesFilter.ts";
import * as changesTree from "./changesTree.ts";
import * as copyPaths from "./fileCopyPaths.ts";
import * as renamePaths from "./renameDisplayPath.ts";
import { DEFAULT_VIEW_OPTIONS, type DiffScope, type FileDiff } from "./types.ts";
import type { TurnRef } from "./turnChangesCache.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function evaluate(source: string, fileName: string, require: (name: string) => unknown) {
  const javascript = ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module: { exports: Record<string, unknown> } = { exports: {} };
  runInNewContext(`(function(require, module, exports) { ${javascript}\n})`)(require, module, module.exports);
  return module.exports;
}

const pathChip = resolve("src/features/diff/FilePathChip.tsx");
const pathSource = ts.createSourceFile(pathChip, readFileSync(pathChip, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pathFunction = pathSource.statements.find((node: { name?: { text: string } }) => ts.isFunctionDeclaration(node) && node.name?.text === "splitPath");
assert.ok(pathFunction, "the real path formatter must exist");
const unexpected = () => { throw new Error("Unexpected Changes list action"); };
const pathFormatter = evaluate(pathFunction.getText(pathSource), pathChip, unexpected);
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
  "./renameDisplayPath.ts": renamePaths,
};
const componentPath = resolve("src/features/diff/ChangesList.tsx");
const component = evaluate(readFileSync(componentPath, "utf8"), componentPath, (name) => {
  assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected Changes list dependency: ${name}`);
  return boundaries[name];
});
assert.equal(typeof component.ChangesList, "function");

interface TextNode { children: readonly (string | TextNode)[] }
function visibleText(node: TextNode): string {
  return node.children.map((child) => typeof child === "string" ? child : visibleText(child)).join("");
}

interface Target { name: string; scope: DiffScope; turn: TurnRef | null }
const targets: Target[] = [
  { name: "branch", scope: "all", turn: null },
  { name: "uncommitted", scope: "uncommitted", turn: null },
  { name: "turn", scope: "all", turn: { sessionId: "session", turnId: "turn" } },
];
const files: FileDiff[] = [
  { path: "src/alpha.ts", old_path: null, status: "modified", additions: 4, deletions: 1, binary: false, hunks: [] },
  { path: "src/beta.ts", old_path: null, status: "modified", additions: 5, deletions: 3, binary: false, hunks: [] },
];

function renderList(target: Target, view: changesTree.ChangesView, selectedFiles: FileDiff[], query?: string, collapsed: ReadonlySet<string> = new Set()) {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(component.ChangesList, {
      diff: {
        opts: { ...DEFAULT_VIEW_OPTIONS, scope: target.scope }, load: { state: "ready" }, files: selectedFiles,
        totals: selectedFiles.reduce((total, file) => ({ a: total.a + file.additions, d: total.d + file.deletions }), { a: 0, d: 0 }),
        current: 0, isViewed: () => false, uncommittedPaths: new Set(), canDiscard: false,
        openPath: unexpected, refresh: unexpected, turn: target.turn,
      },
      view, collapsed, toggleDirectory: unexpected,
      filter: query === undefined ? undefined : { open: true, query, setQuery: unexpected, close: unexpected },
    }));
  });
  try {
    return {
      summaries: renderer.root.findAllByProps({ className: "oc-changes-header" }).map(visibleText),
      rows: renderer.root.findAllByProps({ className: "oc-change" }).map(visibleText),
      directories: renderer.root.findAllByProps({ className: "oc-change-directory" }).map((node: TextNode & { props: { "aria-expanded": boolean } }) => ({ text: visibleText(node), expanded: node.props["aria-expanded"] })),

      matches: renderer.root.findAllByProps({ className: "oc-changes-filter-count" }).map(visibleText),
      noMatch: renderer.root.findAllByProps({ className: "oc-changes-nomatch" }).map(visibleText),
    };
  } finally {
    act(() => renderer.unmount());
  }
}

for (const target of targets) {
  for (const view of ["flat", "tree"] satisfies changesTree.ChangesView[]) {
    test(`actual ChangesList ${target.name}/${view} omits a single-file aggregate header`, () => {
      const result = renderList(target, view, files.slice(0, 1));
      assert.deepEqual(result.summaries, []);
      assert.equal(result.rows.length, 1);
      assert.ok(result.rows[0].includes("alpha.ts"));
    });
    test(`actual ChangesList ${target.name}/${view} omits an empty aggregate header`, () => {
      const result = renderList(target, view, []);
      assert.deepEqual(result.summaries, []);
      assert.deepEqual(result.rows, []);
    });
    test(`actual ChangesList ${target.name}/${view} retains the multi-file aggregate and totals`, () => {
      const result = renderList(target, view, files);
      assert.deepEqual(result.summaries, ["2 files changed+9-4"]);
      assert.equal(result.rows.length, 2);
    });
    test(`actual ChangesList ${target.name}/${view} summarizes all files when only one matches`, () => {
      const result = renderList(target, view, files, "alpha");
      assert.deepEqual(result.summaries, ["2 files changed+9-4"]);
      assert.equal(result.rows.length, 1);
      assert.ok(result.rows[0].includes("alpha.ts"));
      assert.deepEqual(result.matches, ["1 of 2"]);
      assert.deepEqual(result.noMatch, []);
    });
  }
}
for (const view of ["flat", "tree"] satisfies changesTree.ChangesView[]) {
  test(`actual ChangesList ${view} retains a multi-file summary when no files match`, () => {
    const result = renderList(targets[0], view, files, "missing");
    assert.deepEqual(result.summaries, ["2 files changed+9-4"]);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.matches, ["0 of 2"]);
    assert.deepEqual(result.noMatch, ["No files match this filter"]);
  });
  test(`actual ChangesList ${view} still omits a single-file summary when no file matches`, () => {
    const result = renderList(targets[0], view, files.slice(0, 1), "missing");
    assert.deepEqual(result.summaries, []);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.matches, ["0 of 1"]);
    assert.deepEqual(result.noMatch, ["No files match this filter"]);
  });
  test(`actual ChangesList ${view} retains explicit zero totals for multiple files`, () => {
    const result = renderList(targets[0], view, files.map((file) => ({ ...file, additions: 0, deletions: 0 })));
    assert.deepEqual(result.summaries, ["2 files changed+0-0"]);
    assert.equal(result.rows.length, 2);
  });
  for (const count of [0, 1, 2]) {
    test(`actual ChangesList commit/${view} keeps the existing header exclusion for ${count} files`, () => {
      const result = renderList({ name: "commit", scope: { type: "commit", commitHash: "0123456789abcdef" }, turn: null }, view, files.slice(0, count));
      assert.deepEqual(result.summaries, []);
      assert.equal(result.rows.length, count);
    });
  }
}

for (const target of targets) {
  test(`actual ChangesList ${target.name}/tree keeps a matching directory collapsed`, () => {
    const collapsed = new Set(["src"]);
    const result = renderList(target, "tree", files, "alpha", collapsed);
    assert.deepEqual(result.directories, [{ text: "src+4-1", expanded: false }]);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.matches, ["1 of 2"]);
    assert.deepEqual(result.summaries, ["2 files changed+9-4"]);
    assert.deepEqual(result.noMatch, []);
    assert.deepEqual([...collapsed], ["src"]);
  });
}

test("actual ChangesList tree keeps a directory collapsed without a filter", () => {
  const result = renderList(targets[0], "tree", files, undefined, new Set(["src"]));
  assert.deepEqual(result.directories, [{ text: "src+9-4", expanded: false }]);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.matches, []);
});

test("actual ChangesList tree keeps a directory collapsed with a whitespace-only filter", () => {
  const result = renderList(targets[0], "tree", files, "   ", new Set(["src"]));
  assert.deepEqual(result.directories, [{ text: "src+9-4", expanded: false }]);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.matches, ["2 of 2"]);
});

test("actual ChangesList tree still shows a matching file in an expanded directory", () => {
  const result = renderList(targets[0], "tree", files, "alpha");
  assert.deepEqual(result.directories, [{ text: "src", expanded: true }]);
  assert.equal(result.rows.length, 1);
  assert.ok(result.rows[0].includes("alpha.ts"));
  assert.deepEqual(result.matches, ["1 of 2"]);
});

test("actual ChangesList tree retains the no-match message with collapsed paths", () => {
  const result = renderList(targets[0], "tree", files, "missing", new Set(["src"]));
  assert.deepEqual(result.directories, []);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.matches, ["0 of 2"]);
  assert.deepEqual(result.noMatch, ["No files match this filter"]);
});

test("actual ChangesList flat filtering ignores tree collapse state", () => {
  const result = renderList(targets[0], "flat", files, "alpha", new Set(["src"]));
  assert.deepEqual(result.directories, []);
  assert.equal(result.rows.length, 1);
  assert.ok(result.rows[0].includes("alpha.ts"));
  assert.deepEqual(result.matches, ["1 of 2"]);
});

test("actual ChangesList tree retains collapse for a compressed directory while filtering", () => {
  const nested = files.map((file) => ({ ...file, path: file.path.replace("src/", "src/lib/") }));
  const result = renderList(targets[0], "tree", nested, "alpha", new Set(["src/lib"]));
  assert.deepEqual(result.directories, [{ text: "src / lib+4-1", expanded: false }]);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.matches, ["1 of 2"]);
});
