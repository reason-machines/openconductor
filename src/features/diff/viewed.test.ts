// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { keyedCache } from "../../lib/keyedCache.ts";
import * as navigation from "./nav.ts";
import { changeRows } from "./changesTree.ts";
import { filterChangedFiles } from "./changesFilter.ts";
import type { ChangesPresentation } from "./changesPresentation.ts";
import { discardScope } from "./target.ts";
import * as viewed from "./viewed.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";
import { isViewed, loadViewed, saveViewed, setViewed, toggleViewed, viewedCount } from "./viewed.ts";
import { readCachedTurnChanges } from "./turnChangesCache.ts";
import { DEFAULT_VIEW_OPTIONS, type DiffScope, type DiffViewOptions, type FileDiff } from "./types.ts";

function file(path: string, text: string, modified = 1000): FileDiff & { last_modified_time: number } {
  return {
    path,
    old_path: null,
    status: "modified",
    binary: false,
    additions: 1,
    deletions: 0,
    last_modified_time: modified,
    hunks: [{ old_start: 1, old_lines: 0, new_start: 1, new_lines: 1, section: "", lines: [{ kind: "addition", old_line: null, new_line: 1, text }] }],
  };
}

test("toggling marks and unmarks a file", () => {
  const a = file("a.ts", "x");
  const m1 = toggleViewed({}, a);
  assert.equal(isViewed(m1, a), true);
  assert.equal(isViewed(toggleViewed(m1, a), a), false);
});

test("a viewed file that changes again is no longer viewed", () => {
  const before = file("a.ts", "x");
  const after = file("a.ts", "y", Date.now() + 1000);
  assert.equal(isViewed(toggleViewed({}, before), after), false);
});

test("marking and unmarking retain other paths while counts use only current files", () => {
  const a = file("a.ts", "x");
  const b = file("b.ts", "x");
  const m = toggleViewed(toggleViewed({}, a), b);
  assert.deepEqual(Object.keys(setViewed(m, file("c.ts", "x"), true)).sort(), ["a.ts", "b.ts", "c.ts"]);
  assert.deepEqual(Object.keys(setViewed(m, b, false)), ["a.ts"]);
  assert.equal(viewedCount(m, [a]), 1);
  assert.equal(viewedCount(m, [a, file("b.ts", "changed", Date.now() + 1000)]), 1);
});

test("load and save round-trip through storage and survive corrupt data", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const m = toggleViewed({}, file("a.ts", "x"));
  saveViewed(storage, "ws1", m);
  assert.deepEqual(loadViewed(storage, "ws1"), m);
  assert.deepEqual(loadViewed(storage, "other"), {});
  store.set("openconductor.diff.viewed.bad", "{not json");
  assert.deepEqual(loadViewed(storage, "bad"), {});
});

test("viewed time compares equal, older and newer modification times, including zero and absent metadata", (t) => {
  t.mock.method(Date, "now", () => 2000);
  const marked = setViewed({}, file("a.ts", "x", 2000), true);
  assert.deepEqual(marked, { "a.ts": 2000 });
  assert.equal(isViewed(marked, file("a.ts", "x", 2000)), true);
  assert.equal(isViewed(marked, file("a.ts", "x", 1999)), true);
  assert.equal(isViewed(marked, file("a.ts", "x", 2001)), false);
  assert.equal(isViewed(marked, { ...file("a.ts", "x"), last_modified_time: undefined }), false);
  assert.equal(isViewed({}, file("a.ts", "x", 0)), false);
  assert.equal(isViewed(marked, file("a.ts", "x", 0)), true);
  assert.equal(isViewed(setViewed({}, file("deleted.ts", "", 0), true), file("deleted.ts", "", 0)), true);
});

test("a same-content rewrite invalidates a mark but diff-only hunk changes do not", (t) => {
  t.mock.method(Date, "now", () => 2000);
  const before = file("a.ts", "original", 1000);
  const marked = setViewed({}, before, true);
  assert.equal(isViewed(marked, file("a.ts", "original", 2001)), false);
  assert.equal(isViewed(marked, { ...file("a.ts", "different diff context", 1000), hunks: [] }), true);
});

test("viewed storage discards legacy fingerprints and nonfinite values but preserves numeric zero", () => {
  const storage = { getItem: () => '{"legacy":"1234abcd","current":2000,"zero":0,"overflow":1e400,"empty":null}' };
  assert.deepEqual(loadViewed(storage, "fixture"), { current: 2000, zero: 0 });
});

test("cached turn data keeps optional timestamps without filling absent historical metadata", async (t) => {
  t.mock.method(Date, "now", () => 2000);
  const withMetadata = file("cached.ts", "x", 1000);
  const withoutMetadata = { ...file("fresh.ts", "x"), last_modified_time: undefined };
  const files = [withMetadata, withoutMetadata];
  const cached = await readCachedTurnChanges({ getEntry: async () => files }, { sessionId: "s", turnId: "t" });
  assert.equal(cached, files);
  assert.equal(isViewed(setViewed({}, withMetadata, true), withMetadata), true);
  assert.equal(isViewed(setViewed({}, withoutMetadata, true), withoutMetadata), false);
});

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourcePath = resolve("src/features/diff/useWorkspaceDiff.ts");
const javascript = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function navigationFile(path: string): FileDiff {
  return { path, old_path: null, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [], ...{ last_modified_time: 1000 } };
}

async function fixture(files: FileDiff[], initiallyViewed: FileDiff[] = [], initialPresentation: Partial<ChangesPresentation> = {}, renderTab = false) {
  let presentation: ChangesPresentation = { diffFileListMode: "flat", filePathFilter: "", collapsedDirectoryPaths: [], ...initialPresentation };
  let loadCalls = 0;
  let openCalls = 0;
  let loadedFiles = files;
  let whitespaceFiles: FileDiff[] | undefined;
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  viewed.saveViewed(localStorage, "fixture", initiallyViewed.reduce((map, f) => viewed.setViewed(map, f, true), {}));
  const handlers: Record<string, () => unknown> = {};
  const boundaries: Record<string, object> = {
    react: React,
    "../../lib/keyedCache.ts": { keyedCache },
    "./api.ts": {
      WHOLE_FILE_CONTEXT: 1000000,
      loadWorkspaceDiff: async (_worktree: unknown, _target: unknown, options: DiffViewOptions) => {
        loadCalls++;
        return options.ignoreWhitespace && whitespaceFiles ? whitespaceFiles : loadedFiles;
      },
      discardFileChanges: () => { throw new Error("Unexpected discard"); },
    },
    "../../keybindings/KeybindingsProvider.tsx": { useKeybindings: (next: typeof handlers) => Object.assign(handlers, next) },
    "./nav.ts": navigation,
    "./changesTree.ts": { changeRows },
    "./changesFilter.ts": { filterChangedFiles },
    "./useChangesPresentation.ts": { useChangesPresentation: () => ({ presentation }) },
    "./target.ts": { discardScope },
    "./copyFile.ts": { newFileText: () => { throw new Error("Unexpected contents load"); } },
    "./types.ts": { DEFAULT_VIEW_OPTIONS },
    "./viewed.ts": viewed,
  };
  const module = { exports: {} };
  const evaluate = runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, { localStorage });
  evaluate((name: string) => {
    assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected dependency: ${name}`);
    return boundaries[name];
  }, module, module.exports);
  assert.ok("useWorkspaceDiff" in module.exports && typeof module.exports.useWorkspaceDiff === "function");
  const useWorkspaceDiff = module.exports.useWorkspaceDiff;
  let previewMounts = 0;
  let previewUnmounts = 0;
  function FilePreview({ file }: { file: FileDiff }) {
    const [text, setText] = React.useState("");
    React.useEffect(() => {
      previewMounts++;
      return () => { previewUnmounts++; };
    }, []);
    return React.createElement("textarea", {
      "data-file-preview": file.path,
      value: text,
      onChange: (event: { target: { value: string } }) => setText(event.target.value),
    });
  }
  const tabModule = { exports: {} };
  if (renderTab) {
    const tabPath = resolve("src/features/diff/DiffViewer.tsx");
    const tabJavascript = ts.transpileModule(readFileSync(tabPath, "utf8"), {
      fileName: tabPath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const unexpected = () => { throw new Error("Unexpected DiffTab boundary call"); };
    const tabBoundaries: Record<string, object> = {
      "../../components/ui/Tooltip.tsx": { Tooltip: unexpected },
      "../../components/ConductorIcon": { ConductorIcon: unexpected },
      "./diff.css": {},
      "./DiscardDialog": { DiscardDialog: unexpected },
      "./Whitespace": { ViewOptionsMenu: unexpected },
      "./FileDiffView": { FileDiffView: FilePreview },
      "./EditInViewer.ts": { editableContents: () => null, useFileEdit: () => undefined },
      "./ChangesList": { ChangesList: unexpected },
    };
    const evaluateTab = runInNewContext(`(function(require, module, exports) { ${tabJavascript}\n})`);
    evaluateTab((name: string) => {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(Object.prototype.hasOwnProperty.call(tabBoundaries, name), `Unexpected DiffTab dependency: ${name}`);
      return tabBoundaries[name];
    }, tabModule, tabModule.exports);
    assert.ok("DiffTab" in tabModule.exports && typeof tabModule.exports.DiffTab === "function");
  }
  let current: WorkspaceDiff | undefined;
  function Probe() {
    current = useWorkspaceDiff({ workspaceId: "fixture", worktree: null, target: { branch: "main", remote: "origin" }, onOpen: () => { openCalls++; } });
    return renderTab && "DiffTab" in tabModule.exports ? React.createElement(tabModule.exports.DiffTab, { diff: current }) : null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  const state = () => { assert.ok(current); return current; };
  assert.equal(state().load.state, "ready");
  return {
    state,
    open(index: number) { act(() => state().open(index)); },
    next() { act(() => { handlers["diff.nextFile"](); }); },
    previous() { act(() => { handlers["diff.previousFile"](); }); },
    loadCalls: () => loadCalls,
    openCalls: () => openCalls,
    noMatchMessages: () => renderer.root.findAllByType("p").filter((node: { children: unknown[] }) => node.children.join("") === "No files match this filter").length,
    previews: () => renderer.root.findAllByType("textarea").length,
    visiblePreviews: () => renderer.root.findAllByType("textarea").filter((node: { parent: unknown }) => {
      let ancestor = node.parent;
      while (ancestor !== null && typeof ancestor === "object" && "props" in ancestor && "parent" in ancestor) {
        const props = ancestor.props;
        if (props !== null && typeof props === "object") {
          if ("hidden" in props && props.hidden === true) return false;
          if ("style" in props && props.style !== null && typeof props.style === "object" && "display" in props.style && props.style.display === "none") return false;
        }
        ancestor = ancestor.parent;
      }
      return true;
    }).length,
    previewMounts: () => previewMounts,
    previewUnmounts: () => previewUnmounts,
    previewValue: () => renderer.root.findByType("textarea").props.value,
    writePreview(text: string) { act(() => renderer.root.findByType("textarea").props.onChange({ target: { value: text } })); },
    previewPaths: () => renderer.root.findAllByType("textarea").map((node: { props: Record<string, unknown> }) => node.props["data-file-preview"]).sort(),
    filePreviewValue: (path: string) => renderer.root.findByProps({ "data-file-preview": path }).props.value,
    writeFilePreview(path: string, text: string) {
      act(() => renderer.root.findByProps({ "data-file-preview": path }).props.onChange({ target: { value: text } }));
    },
    async turn(ref: { sessionId: string; turnId: string }, path: string, next: FileDiff[]) {
      loadedFiles = next;
      await act(async () => { state().openTurnFile(ref, path); });
    },
    present(change: Partial<ChangesPresentation>) {
      presentation = { ...presentation, ...change };
      act(() => { renderer.update(React.createElement(Probe)); });
    },
    keyboard() { act(() => { handlers["diff.toggleViewed"](); }); },
    header() {
      const selected = state().selected;
      assert.ok(selected);
      act(() => state().toggleViewed(selected));
    },
    toggle(f: FileDiff) { act(() => state().toggleViewed(f)); },
    async reload(next: FileDiff[]) {
      loadedFiles = next;
      await act(async () => { state().refresh(); });
    },
    async ignoreWhitespace(next: FileDiff[]) {
      whitespaceFiles = next;
      await act(async () => { state().update({ ignoreWhitespace: true }); });
    },
    async scope(scope: DiffScope, next: FileDiff[]) {
      loadedFiles = next;
      await act(async () => { state().update({ scope }); });
    },
    async reopen() {
      act(() => renderer.unmount());
      await act(async () => { renderer = create(React.createElement(Probe)); });
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const action of ["header", "keyboard"] as const) {
  test(`actual viewed ${action} callback marks the selected file and advances`, async () => {
    const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
    const view = await fixture(files);
    try {
      view.open(0);
      view[action]();
      assert.equal(view.state().isViewed(files[0]), true);
      assert.equal(view.state().selected?.path, "b.ts");
    } finally { view.close(); }
  });

  test(`actual viewed ${action} callback unmarks without navigating`, async () => {
    const files = [navigationFile("a.ts"), navigationFile("b.ts")];
    const view = await fixture(files, [files[0]]);
    try {
      view.open(0);
      view[action]();
      assert.equal(view.state().isViewed(files[0]), false);
      assert.equal(view.state().selected?.path, "a.ts");
    } finally { view.close(); }
  });
}

test("actual viewed callback steps back when marking the last unviewed file with another unviewed file remaining", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
  const view = await fixture(files, [files[2]]);
  try {
    view.open(1);
    view.header();
    assert.equal(view.state().isViewed(files[1]), true);
    assert.equal(view.state().selected?.path, "a.ts");
  } finally { view.close(); }
});

test("actual viewed callback advances to the next file when marking the only remaining unviewed file", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
  const view = await fixture(files, [files[1], files[2]]);
  try {
    view.open(0);
    view.keyboard();
    assert.equal(view.state().viewedCount, 3);
    assert.equal(view.state().selected?.path, "b.ts");
  } finally { view.close(); }
});

test("actual viewed callback wraps next-file navigation after the last remaining unviewed file", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
  const view = await fixture(files, [files[0], files[1]]);
  try {
    view.open(2);
    view.header();
    assert.equal(view.state().viewedCount, 3);
    assert.equal(view.state().selected?.path, "a.ts");
  } finally { view.close(); }
});

test("actual viewed callback marks a singleton without losing its selection", async () => {
  const files = [navigationFile("a.ts")];
  const view = await fixture(files);
  try {
    view.open(0);
    view.keyboard();
    assert.equal(view.state().isViewed(files[0]), true);
    assert.equal(view.state().selected?.path, "a.ts");
  } finally { view.close(); }
});

test("actual viewed hook invalidates a same-content rewrite after the load array changes", async (t) => {
  t.mock.method(Date, "now", () => 2000);
  const before = file("a.ts", "unchanged content", 1000);
  const view = await fixture([before]);
  try {
    view.open(0);
    view.header();
    assert.equal(view.state().isViewed(before), true);
    await view.reload([file("a.ts", "unchanged content", 2001)]);
    assert.equal(view.state().selected?.path, "a.ts");
    assert.equal(view.state().viewedCount, 0);
    const selected = view.state().selected;
    assert.ok(selected);
    assert.equal(view.state().isViewed(selected), false);
  } finally { view.close(); }
});

test("actual viewed hook preserves a mark across diff-option-only hunk changes", async (t) => {
  t.mock.method(Date, "now", () => 2000);
  const before = file("a.ts", "visible whitespace", 1000);
  const view = await fixture([before]);
  try {
    view.open(0);
    view.keyboard();
    await view.ignoreWhitespace([{ ...before, hunks: [] }]);
    assert.equal(view.state().opts.ignoreWhitespace, true);
    assert.deepEqual(view.state().selected?.hunks, []);
    assert.equal(view.state().selected?.path, "a.ts");
    assert.equal(view.state().viewedCount, 1);
    const selected = view.state().selected;
    assert.ok(selected);
    assert.equal(view.state().isViewed(selected), true);
  } finally { view.close(); }
});

test("actual viewed hook leaves fresh historical metadata absent and accepts cached numeric metadata", async (t) => {
  t.mock.method(Date, "now", () => 2000);
  const before = file("a.ts", "x", 1000);
  const view = await fixture([before], [before]);
  try {
    view.open(0);
    await view.reload([{ ...before, last_modified_time: undefined }]);
    assert.equal(view.state().viewedCount, 0);
    await view.reload([{ ...before, last_modified_time: 1000 }]);
    assert.equal(view.state().viewedCount, 1);
    assert.equal(view.state().selected?.path, "a.ts");
  } finally { view.close(); }
});

test("actual next and previous keys follow viewed-last flat order and wrap", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
  const view = await fixture(files, [files[1]]);
  try {
    view.open(0);
    for (const path of ["c.ts", "b.ts", "a.ts"]) {
      view.next();
      assert.equal(view.state().selected?.path, path);
    }
    for (const path of ["b.ts", "c.ts", "a.ts"]) {
      view.previous();
      assert.equal(view.state().selected?.path, path);
    }
    assert.equal(view.state().files, files);
    assert.equal(view.state().current, 0);
  } finally { view.close(); }
});

for (const action of ["header", "keyboard"] as const) {
  test(`actual ${action} mark advances past an interleaved viewed file`, async () => {
    const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
    const view = await fixture(files, [files[1]]);
    try {
      view.open(0);
      view[action]();
      assert.equal(view.state().isViewed(files[0]), true);
      assert.equal(view.state().selected, files[2]);
      assert.equal(view.state().current, 2);
      view.previous();
      assert.equal(view.state().selected, files[1]);
    } finally { view.close(); }
  });
}

test("actual mark steps back in displayed order at the final unviewed file", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts"), navigationFile("c.ts")];
  const view = await fixture(files, [files[1]]);
  try {
    view.open(2);
    view.header();
    assert.equal(view.state().isViewed(files[2]), true);
    assert.equal(view.state().selected, files[0]);
  } finally { view.close(); }
});

test("actual navigation follows natural tree order including collapsed descendants", async () => {
  const files = [navigationFile("root.ts"), navigationFile("dir/item10.ts"), navigationFile("dir/item2.ts")];
  const view = await fixture(files, [files[2]], { diffFileListMode: "tree", collapsedDirectoryPaths: ["dir"] });
  try {
    view.open(2);
    for (const path of ["dir/item10.ts", "root.ts", "dir/item2.ts"]) {
      view.next();
      assert.equal(view.state().selected?.path, path);
    }
    view.previous();
    assert.equal(view.state().selected, files[0]);
  } finally { view.close(); }
});

test("actual navigation and mark use the filtered sequence without changing public indices", async () => {
  const files = [navigationFile("a.keep"), navigationFile("b.drop"), navigationFile("c.keep")];
  const view = await fixture(files, [], { filePathFilter: "keep" });
  try {
    view.open(0);
    view.next();
    assert.equal(view.state().selected, files[2]);
    assert.equal(view.state().current, 2);
    view.next();
    assert.equal(view.state().selected, files[0]);
    view.previous();
    assert.equal(view.state().selected, files[2]);
    view.header();
    assert.equal(view.state().isViewed(files[2]), true);
    assert.equal(view.state().selected, files[0]);
    assert.equal(view.state().files, files);
  } finally { view.close(); }
});

test("actual navigation responds to presentation and timestamp changes without reloading for presentation", async (t) => {
  t.mock.method(Date, "now", () => 2000);
  const files = [navigationFile("a.keep"), navigationFile("b.drop"), navigationFile("c.keep")];
  const view = await fixture(files, [files[1]]);
  try {
    view.open(0);
    const calls = view.loadCalls();
    view.present({ filePathFilter: "keep" });
    view.next();
    assert.equal(view.state().selected, files[2]);
    assert.equal(view.loadCalls(), calls);
    view.present({ filePathFilter: "" });
    view.next();
    assert.equal(view.state().selected, files[1]);
    assert.equal(view.loadCalls(), calls);
    await view.reload([files[0], { ...files[1], last_modified_time: 2001 }, files[2]]);
    view.open(0);
    view.next();
    assert.equal(view.state().selected?.path, "b.drop");
    assert.equal(view.state().isViewed(view.state().files[1]), false);
  } finally { view.close(); }
});

test("actual selection redirects an excluded file to the first filtered flat row without opening a tab", async () => {
  const files = [navigationFile("a.keep"), navigationFile("b.drop"), navigationFile("c.keep")];
  const view = await fixture(files, [files[0]]);
  try {
    view.open(1);
    const calls = view.loadCalls();
    const opens = view.openCalls();
    view.present({ filePathFilter: "keep" });
    assert.equal(view.state().selected, files[2], "the first visible unviewed row replaces the excluded selection");
    assert.equal(view.state().current, 2);
    assert.equal(view.state().files, files);
    assert.equal(view.state().isViewed(files[0]), true);
    assert.equal(view.state().viewedCount, 1);
    assert.equal(view.loadCalls(), calls);
    assert.equal(view.openCalls(), opens);
    view.present({ filePathFilter: "" });
    assert.equal(view.state().selected, files[2], "clearing the filter does not restore the excluded selection");
  } finally { view.close(); }
});

test("actual selection redirects to natural tree order including collapsed descendants", async () => {
  const files = [navigationFile("root.keep"), navigationFile("selected.drop"), navigationFile("dir/item10.keep"), navigationFile("dir/item2.keep")];
  const view = await fixture(files, [files[3]], { diffFileListMode: "tree", collapsedDirectoryPaths: ["dir"] });
  try {
    view.open(1);
    const calls = view.loadCalls();
    const opens = view.openCalls();
    view.present({ filePathFilter: "keep" });
    assert.equal(view.state().selected, files[3]);
    assert.equal(view.state().current, 3);
    assert.equal(view.state().files, files);
    assert.equal(view.loadCalls(), calls);
    assert.equal(view.openCalls(), opens);
  } finally { view.close(); }
});

test("actual selection keeps a matching file when filtering and presentation order change", async () => {
  const files = [navigationFile("a.keep"), navigationFile("b.drop"), navigationFile("c.keep")];
  const view = await fixture(files, [files[2]]);
  try {
    view.open(2);
    const calls = view.loadCalls();
    const opens = view.openCalls();
    view.present({ filePathFilter: "keep" });
    assert.equal(view.state().selected, files[2]);
    view.present({ diffFileListMode: "tree" });
    assert.equal(view.state().selected, files[2]);
    assert.equal(view.loadCalls(), calls);
    assert.equal(view.openCalls(), opens);
  } finally { view.close(); }
});

test("actual selection waits through a no-match filter and redirects when matches return", async () => {
  const files = [navigationFile("a.keep"), navigationFile("b.drop")];
  const view = await fixture(files);
  try {
    view.open(1);
    const calls = view.loadCalls();
    const opens = view.openCalls();
    view.present({ filePathFilter: "zzzz-no-match" });
    assert.equal(view.state().selected, files[1], "no matching destination leaves selection unchanged");
    view.present({ filePathFilter: "keep" });
    assert.equal(view.state().selected, files[0]);
    assert.equal(view.loadCalls(), calls);
    assert.equal(view.openCalls(), opens);
  } finally { view.close(); }
});

test("actual selection redirects a removed path after a loaded file list changes", async () => {
  const files = [navigationFile("removed.ts"), navigationFile("z.ts")];
  const view = await fixture(files);
  try {
    view.open(0);
    const opens = view.openCalls();
    const remaining = [files[1], navigationFile("a.ts")];
    await view.reload(remaining);
    assert.equal(view.state().selected, remaining[1]);
    assert.equal(view.state().current, 1);
    assert.equal(view.state().files, remaining);
    assert.equal(view.openCalls(), opens);
  } finally { view.close(); }
});

test("actual selection stays unselected before a file is opened", async () => {
  const files = [navigationFile("a.keep"), navigationFile("b.drop")];
  const view = await fixture(files);
  try {
    view.present({ filePathFilter: "keep" });
    assert.equal(view.state().selected, null);
    await view.reload([files[0]]);
    assert.equal(view.state().selected, null);
    assert.equal(view.state().current, -1);
    assert.equal(view.openCalls(), 0);
  } finally { view.close(); }
});

test("actual selection keeps an empty loaded list inert and recovers its existing path", async () => {
  const files = [navigationFile("a.ts")];
  const view = await fixture(files);
  try {
    view.open(0);
    const opens = view.openCalls();
    await view.reload([]);
    assert.equal(view.state().selected, null);
    assert.equal(view.state().current, -1);
    await view.reload(files);
    assert.equal(view.state().selected, files[0]);
    assert.equal(view.openCalls(), opens);
  } finally { view.close(); }
});

test("actual selection redirects to a renamed file matched by its old path", async () => {
  const renamed: FileDiff = { ...navigationFile("new-name.ts"), old_path: "legacy-target.ts", status: "renamed" };
  const files = [navigationFile("selected.ts"), renamed];
  const view = await fixture(files);
  try {
    view.open(0);
    const calls = view.loadCalls();
    const opens = view.openCalls();
    view.present({ filePathFilter: "legacy-target" });
    assert.equal(view.state().selected, renamed);
    assert.equal(view.state().current, 1);
    assert.equal(view.state().files, files);
    assert.equal(view.loadCalls(), calls);
    assert.equal(view.openCalls(), opens);
  } finally { view.close(); }
});

for (const mode of ["flat", "tree"] as const) {
  test(`actual DiffTab hides a no-match ${mode} view while retaining mounted file state and selection`, async () => {
    const files = [navigationFile("dir/a.keep"), navigationFile("b.drop")];
    const view = await fixture(files, [files[0]], { diffFileListMode: mode }, true);
    try {
      view.open(1);
      view.writePreview("unsaved preview state");
      const loads = view.loadCalls();
      assert.equal(view.visiblePreviews(), 1);
      view.present({ filePathFilter: "zzzz-no-match" });
      assert.equal(view.noMatchMessages(), 1, "the main Diff tab must explain the no-match filter");
      assert.equal(view.visiblePreviews(), 0, "the excluded selected file must not remain visible");
      assert.equal(view.previews(), 1, "the file view must stay mounted while filtered out");
      assert.equal(view.previewMounts(), 1);
      assert.equal(view.previewUnmounts(), 0);
      assert.equal(view.previewValue(), "unsaved preview state");
      assert.equal(view.state().selected, files[1]);
      assert.equal(view.state().current, 1);
      assert.equal(view.state().isViewed(files[0]), true);
      view.next();
      view.previous();
      assert.equal(view.state().selected, files[1]);
      assert.equal(view.openCalls(), 1, "filtering and inert navigation must not open a tab");
      view.present({ filePathFilter: "" });
      assert.equal(view.noMatchMessages(), 0);
      assert.equal(view.visiblePreviews(), 1);
      assert.equal(view.previewValue(), "unsaved preview state");
      assert.equal(view.previewMounts(), 1);
      assert.equal(view.previewUnmounts(), 0);
      assert.equal(view.state().selected, files[1]);
      assert.equal(view.loadCalls(), loads, "filter changes must not reload files");
      assert.equal(view.openCalls(), 1);
    } finally { view.close(); }
  });
}

test("actual DiffTab explains no matches without selecting or opening an initially unselected file", async () => {
  const files = [navigationFile("a.ts")];
  const view = await fixture(files, [], { filePathFilter: "zzzz-no-match" }, true);
  try {
    assert.equal(view.noMatchMessages(), 1);
    assert.equal(view.previews(), 0);
    assert.equal(view.state().selected, null);
    assert.equal(view.openCalls(), 0);
    view.present({ filePathFilter: "" });
    assert.equal(view.noMatchMessages(), 0);
    assert.equal(view.state().selected, null);
    assert.equal(view.openCalls(), 0);
  } finally { view.close(); }
});

test("actual DiffTab keeps a truly empty loaded list distinct from no matching files", async () => {
  const view = await fixture([], [], { filePathFilter: "zzzz-no-match" }, true);
  try {
    assert.equal(view.noMatchMessages(), 0);
    assert.equal(view.previews(), 0);
    assert.equal(view.state().load.state, "ready");
    assert.equal(view.state().selected, null);
    assert.equal(view.openCalls(), 0);
  } finally { view.close(); }
});

test("actual DiffTab retains a matching renamed file and hides no content for an old-path match", async () => {
  const renamed = { ...navigationFile("new-name.ts"), old_path: "old-name.ts", status: "renamed" as const };
  const view = await fixture([renamed], [], {}, true);
  try {
    view.open(0);
    view.writePreview("retained preview state");
    const loads = view.loadCalls();
    view.present({ filePathFilter: "old-name" });
    assert.equal(view.noMatchMessages(), 0);
    assert.equal(view.visiblePreviews(), 1);
    assert.equal(view.state().selected, renamed);
    assert.equal(view.previewValue(), "retained preview state");
    assert.equal(view.previewMounts(), 1);
    assert.equal(view.previewUnmounts(), 0);
    assert.equal(view.loadCalls(), loads);
    assert.equal(view.openCalls(), 1);
  } finally { view.close(); }
});

const subsetScopes: DiffScope[] = ["uncommitted", { type: "commit", commitHash: "fixture-commit" }];
for (const scope of subsetScopes) {
  for (const action of ["header", "keyboard"] as const) {
    for (const wasViewed of [false, true]) {
      const scopeName = typeof scope === "object" ? "commit" : scope;
      test(`actual ${action} ${wasViewed ? "unmark" : "mark"} in ${scopeName} scope retains off-scope viewed marks after return and reopen`, async (t) => {
        t.mock.method(Date, "now", () => 2000);
        const a = navigationFile("a.ts");
        const b = navigationFile("b.ts");
        const files = [a, b];
        const view = await fixture(files, wasViewed ? files : [a]);
        try {
          await view.scope(scope, [b]);
          assert.deepEqual(view.state().files, [b]);
          assert.equal(view.state().opts.scope, scope);
          assert.equal(view.state().isViewed(a), true);
          assert.equal(view.state().isViewed(b), wasViewed);
          view.open(0);
          view[action]();
          assert.equal(view.state().isViewed(b), !wasViewed);
          assert.equal(view.state().viewedCount, wasViewed ? 0 : 1);
          await view.scope("all", files);
          assert.equal(view.state().isViewed(a), true, "toggling the subset must retain a.ts's existing mark");
          assert.equal(view.state().isViewed(b), !wasViewed);
          assert.equal(view.state().viewedCount, wasViewed ? 1 : 2);
          await view.reopen();
          assert.equal(view.state().isViewed(a), true, "the retained mark must survive storage and remount");
          assert.equal(view.state().isViewed(b), !wasViewed);
          assert.equal(view.state().viewedCount, wasViewed ? 1 : 2);
          await view.reload([{ ...a, last_modified_time: 2001 }, b]);
          assert.equal(view.state().isViewed(view.state().files[0]), false);
          assert.equal(view.state().viewedCount, wasViewed ? 0 : 1);
        } finally { view.close(); }
      });
    }
  }
}

test("actual DiffTab keeps independent mounted preview state when selecting A, B, then A", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts")];
  const view = await fixture(files, [], {}, true);
  try {
    assert.equal(view.previews(), 0, "unvisited files must not mount");
    view.open(0);
    view.writeFilePreview("a.ts", "local A state");
    view.open(1);
    assert.equal(view.previews(), 2, "visiting B must retain A's mounted view");
    assert.equal(view.visiblePreviews(), 1);
    view.writeFilePreview("b.ts", "local B state");
    view.open(0);
    assert.equal(view.filePreviewValue("a.ts"), "local A state");
    assert.equal(view.filePreviewValue("b.ts"), "local B state");
    assert.equal(view.previewMounts(), 2);
    assert.equal(view.previewUnmounts(), 0);
    assert.equal(view.state().current, 0);
    assert.equal(view.state().files, files);
    assert.equal(view.openCalls(), 3);
  } finally { view.close(); }
});

test("actual DiffTab retains five recent unique views and evicts the least recently visited", async () => {
  const files = ["a", "b", "c", "d", "e", "f"].map((name) => navigationFile(`${name}.ts`));
  const view = await fixture(files, [], {}, true);
  try {
    for (let i = 0; i < 5; i++) {
      view.open(i);
      view.writeFilePreview(files[i].path, `state ${i}`);
    }
    assert.equal(view.previews(), 5, "all five recent files stay mounted");
    view.open(0);
    view.open(5);
    assert.deepEqual(view.previewPaths(), ["a.ts", "c.ts", "d.ts", "e.ts", "f.ts"]);
    assert.equal(view.filePreviewValue("a.ts"), "state 0", "revisiting A refreshes its recency");
    assert.equal(view.visiblePreviews(), 1);
    assert.equal(view.previewUnmounts(), 1, "the sixth unique file evicts only B");
    view.open(1);
    assert.equal(view.filePreviewValue("b.ts"), "", "an evicted view starts fresh");
    assert.equal(view.previews(), 5);
    assert.equal(view.visiblePreviews(), 1);
    assert.equal(view.previewUnmounts(), 2);
  } finally { view.close(); }
});

test("actual DiffTab hides all retained previews for no matches without losing either visited view", async () => {
  const files = [navigationFile("a.ts"), navigationFile("b.ts")];
  const view = await fixture(files, [], {}, true);
  try {
    view.open(0);
    view.writeFilePreview("a.ts", "A before filter");
    view.open(1);
    view.writeFilePreview("b.ts", "B before filter");
    view.present({ filePathFilter: "zzzz-no-match" });
    assert.equal(view.noMatchMessages(), 1);
    assert.equal(view.previews(), 2, "no-match filtering retains every visited view");
    assert.equal(view.visiblePreviews(), 0);
    view.present({ filePathFilter: "" });
    view.open(0);
    assert.equal(view.filePreviewValue("a.ts"), "A before filter");
    assert.equal(view.filePreviewValue("b.ts"), "B before filter");
    assert.equal(view.previewMounts(), 2);
    assert.equal(view.previewUnmounts(), 0);
  } finally { view.close(); }
});

test("actual DiffTab clears retained views when the existing selection redirects to a filtered destination", async () => {
  const files = [navigationFile("a.drop"), navigationFile("b.drop"), navigationFile("c.keep")];
  const view = await fixture(files, [], {}, true);
  try {
    view.open(0);
    view.writeFilePreview("a.drop", "A before redirect");
    view.open(1);
    assert.equal(view.previews(), 2, "ordinary navigation retains A before the redirect");
    const opens = view.openCalls();
    view.present({ filePathFilter: "keep" });
    assert.equal(view.state().selected, files[2]);
    assert.deepEqual(view.previewPaths(), ["c.keep"], "an automatic redirect resets the retained-view set");
    assert.equal(view.visiblePreviews(), 1);
    assert.equal(view.openCalls(), opens);
    view.present({ filePathFilter: "" });
    view.open(0);
    assert.equal(view.filePreviewValue("a.drop"), "", "redirected-away state must not be resurrected");
  } finally { view.close(); }
});

for (const scope of ["uncommitted", { type: "commit", commitHash: "first" }] satisfies DiffScope[]) {
  test(`actual DiffTab isolates a retained path between all and ${typeof scope === "string" ? scope : "commit"} scope`, async () => {
    const files = [navigationFile("a.ts")];
    const view = await fixture(files, [], {}, true);
    try {
      view.open(0);
      view.writeFilePreview("a.ts", "all-scope state");
      await view.scope(scope, files);
      assert.equal(view.filePreviewValue("a.ts"), "", "the same path in a different scope must remount");
      view.writeFilePreview("a.ts", "subset state");
      await view.scope("all", files);
      assert.equal(view.filePreviewValue("a.ts"), "", "scope-local view state must not leak back");
      assert.equal(view.previews(), 1);
      assert.equal(view.visiblePreviews(), 1);
    } finally { view.close(); }
  });
}

test("actual DiffTab isolates the same file between distinct commit identities", async () => {
  const files = [navigationFile("a.ts")];
  const view = await fixture(files, [], {}, true);
  try {
    await view.scope({ type: "commit", commitHash: "first" }, files);
    view.open(0);
    view.writeFilePreview("a.ts", "first-commit state");
    await view.scope({ type: "commit", commitHash: "second" }, files);
    assert.equal(view.filePreviewValue("a.ts"), "", "commit hash is part of mounted view identity");
    assert.equal(view.previews(), 1);
  } finally { view.close(); }
});

for (const ref of [{ sessionId: "s", turnId: "second" }, { sessionId: "other", turnId: "first" }]) {
  test(`actual DiffTab isolates the same path for turn ${ref.sessionId}/${ref.turnId}`, async () => {
    const files = [navigationFile("a.ts")];
    const view = await fixture(files, [], {}, true);
    try {
      await view.turn({ sessionId: "s", turnId: "first" }, "a.ts", files);
      view.writeFilePreview("a.ts", "first-turn state");
      await view.turn(ref, "a.ts", files);
      assert.equal(view.filePreviewValue("a.ts"), "", "both session and turn are part of mounted view identity");
      assert.equal(view.previews(), 1);
      assert.equal(view.visiblePreviews(), 1);
    } finally { view.close(); }
  });
}

function fileVisibilityFixture() {
  const listeners = new Set<(command: string) => unknown>();
  const navigations: string[] = [];
  const reveals: string[] = [];
  const inert = () => null;
  const keybindings = {
    useKeybindingOverrides: () => ({ overrides: {} }),
    useKeybindings(handlers: Record<string, () => unknown>) {
      const latest = React.useRef(handlers);
      latest.current = handlers;
      React.useEffect(() => {
        const dispatch = (command: string) => latest.current[command]?.();
        listeners.add(dispatch);
        return () => { listeners.delete(dispatch); };
      }, []);
    },
  };
  function loadComponent(path: string, boundaries: Record<string, object>, globals: object = {}) {
    const source = readFileSync(resolve(path), "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    const evaluate = runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, globals);
    evaluate((name: string) => {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected visibility dependency: ${name}`);
      return boundaries[name];
    }, module, module.exports);
    return module.exports;
  }
  const commentModule = loadComponent("src/features/diff/CommentNav.tsx", {
    "../../keybindings/KeybindingsProvider.tsx": keybindings,
    "../../keybindings/dispatcher.ts": { PRIORITY: { HIGH: 100 } },
    "../../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../../keybindings/shortcut.ts": { glyphs: inert },
    "./nav.ts": navigation,
    "./pierre.ts": { toPierreSide: inert },
    "./CommentNav.css": {},
  });
  assert.ok("CommentNav" in commentModule && typeof commentModule.CommentNav === "function");
  const CodeView = React.forwardRef((props: { items: { id: string }[] }, ref: unknown) => {
    const path = props.items[0].id;
    React.useImperativeHandle(ref, () => ({ scrollTo: () => { reveals.push(path); } }), [path]);
    return React.createElement("fixture-visible-code", { ...props, "data-path": path });
  });
  const fileModule = loadComponent("src/features/diff/FileDiffView.tsx", {
    "../../components/ui/Tooltip.tsx": { Tooltip: inert },
    "../../components/Icons.tsx": { CheckIcon: inert, CopyIcon: inert },
    "@tauri-apps/api/core": { invoke() { throw new Error("Unexpected native IPC"); } },
    "../../backend": { inTauri: () => false },
    "./copyFile.ts": { copySource: () => null },
    "@pierre/diffs": { processFile: () => ({ isPartial: false }) },
    "@pierre/diffs/react": { CodeView, EditProvider: ({ children }: { children: unknown }) => children },
    "./Whitespace": { WhitespaceOnly: inert },
    "../../keybindings/KeybindingsProvider.tsx": keybindings,
    "../../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../../keybindings/shortcut.ts": { matchesEvent: () => false },
    "./EditInViewer.ts": { createEditor: inert },
    "./CommentNav": {
      CommentNav: commentModule.CommentNav,
      useCommentNavigation: (_handle: unknown, path: string) => ({
        previousCount: 1, nextCount: 1, refresh: inert,
        navigate: (direction: string) => { navigations.push(`${path}:${direction}`); return true; },
      }),
    },
    "./DiscardDialog": { RevertIcon: inert },
    "./FilePathChip": { FilePathChip: inert },
    "./useDiffTheme.ts": { useDiffTheme: () => ({ dark: "fixture", light: "fixture" }) },
    "./pierre.ts": {
      toPatch: () => "fixture patch", fullDiffMeta: () => ({ isPartial: false }),
      codeViewItem: (file: FileDiff) => ({ id: file.path, type: "diff", fileDiff: { isPartial: false } }),
      editableCodeViewItem: (item: object) => item,
      selectionOf: inert, lineTarget: inert,
      CODE_VIEW_LAYOUT: {}, EXPANSION_LINE_COUNT: 20,
    },
  }, {
    document: { documentElement: { dataset: { theme: "dark" } } },
    MutationObserver: class { observe() {} disconnect() {} },
  });
  assert.ok("FileDiffView" in fileModule && typeof fileModule.FileDiffView === "function");
  assert.ok("revealLine" in fileModule && typeof fileModule.revealLine === "function");
  const FileDiffView = fileModule.FileDiffView;
  const revealLine = fileModule.revealLine;
  let visible: string | null = "a.ts";
  let useDefault = false;
  function Probe() {
    return React.createElement(React.Fragment, null, ...["a.ts", "b.ts"].map((path) => React.createElement(FileDiffView, {
      key: path, file: file(path, "x"), layout: "unified", ignoreWhitespace: false,
      wrapLines: true, viewed: false, onToggleViewed: inert,
      ...useDefault ? {} : { isVisible: path === visible },
    })));
  }
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(Probe)); });
  return {
    navigations, reveals,
    listeners: () => listeners.size,
    key(command: string) {
      for (const dispatch of [...listeners].reverse()) if (dispatch(command) !== false) break;
    },
    reveal: (path: string) => revealLine(path, { side: "new", line: 1 }),
    show(path: string | null) { visible = path; act(() => { renderer.update(React.createElement(Probe)); }); },
    defaults() { useDefault = true; act(() => { renderer.update(React.createElement(Probe)); }); },
    select(path: string) {
      act(() => renderer.root.findByProps({ "data-path": path }).props.onSelectedLinesChange({ id: path, range: { start: 1, end: 1 } }));
    },
    selection: (path: string) => renderer.root.findByProps({ "data-path": path }).props.selectedLines,
    codeViews: () => renderer.root.findAllByType("fixture-visible-code").length,
    close() { act(() => renderer.unmount()); },
  };
}

test("actual FileDiffView keeps hidden Code state but only active CommentNav shortcuts and revealers", () => {
  const view = fileVisibilityFixture();
  try {
    assert.equal(view.codeViews(), 2);
    assert.equal(view.listeners(), 1, "hidden retained files must not register global comment shortcuts");
    view.select("a.ts");
    view.key("diff.nextComment");
    assert.deepEqual(view.navigations, ["a.ts:next"]);
    assert.equal(view.reveal("b.ts"), false, "a hidden retained file must not accept reveal navigation");
    assert.deepEqual(view.reveals, []);
    assert.equal(view.reveal("a.ts"), true);
    assert.deepEqual(view.reveals, ["a.ts"]);
    view.show("b.ts");
    assert.equal(view.codeViews(), 2, "visibility changes must not unmount the Code views");
    assert.equal(view.listeners(), 1);
    view.key("diff.previousComment");
    assert.deepEqual(view.navigations, ["a.ts:next", "b.ts:previous"]);
    assert.equal(view.reveal("a.ts"), false);
    view.show(null);
    assert.equal(view.listeners(), 0, "a no-match state must leave no retained comment shortcuts active");
    assert.equal(view.reveal("b.ts"), false);
    view.key("diff.nextComment");
    assert.equal(view.navigations.length, 2);
    view.show("a.ts");
    assert.equal(view.selection("a.ts").id, "a.ts", "the real Code component keeps its local selection");
    view.key("diff.nextComment");
    assert.deepEqual(view.navigations, ["a.ts:next", "b.ts:previous", "a.ts:next"]);
    view.defaults();
    assert.equal(view.listeners(), 2, "existing callers that omit visibility remain active by default");
    assert.equal(view.reveal("b.ts"), true);
  } finally { view.close(); }
});

test("actual viewed callbacks leave empty, unselected and missing files alone", async () => {
  for (const files of [[], [navigationFile("a.ts")]]) {
    const view = await fixture(files);
    try {
      view.keyboard();
      assert.equal(view.state().selected, null);
      assert.equal(view.state().viewedCount, 0);
      if (files.length) view.open(0);
      const before = view.state().selected?.path;
      view.toggle(navigationFile("missing.ts"));
      assert.equal(view.state().selected?.path, before);
      assert.equal(view.state().viewedCount, 0);
    } finally { view.close(); }
  }
});

async function emptyDiffCloseFixture(initialLoad: WorkspaceDiff["load"] = { state: "ready", files: [navigationFile("a.ts")] }) {
  const ownerPath = resolve("src/components/WorkspaceView.tsx");
  const ownerSource = ts.createSourceFile(ownerPath, readFileSync(ownerPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let owner;
  let tabOfChat;
  for (const statement of ownerSource.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "WorkspaceView") owner = statement;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "tabOfChat") tabOfChat = statement;
  }
  assert.ok(owner?.body);
  assert.ok(tabOfChat);
  const statements = owner.body.statements;
  const declaration = (name: string) => {
    for (const statement of statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const item of statement.declarationList.declarations) {
        if (item.name.getText() === name) return statement;
      }
    }
    throw new Error(`Missing workspace declaration: ${name}`);
  };
  const from = statements.indexOf(declaration("activeReview"));
  const to = statements.indexOf(declaration("prNumber"));
  assert.ok(from >= 0 && to > from);
  const activeOwner = statements.slice(from, to).map((node: { getText(): string }) => node.getText()).join("\n");
  let tabJSX = "";
  function findTab(node: { getText(): string; tagName?: { getText(): string } }) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName?.getText() === "DiffTab") {
      assert.equal(tabJSX, "", "one owner-to-DiffTab binding");
      tabJSX = node.getText();
    }
    ts.forEachChild(node, findTab);
  }
  findTab(owner);
  assert.notEqual(tabJSX, "");
  const closedHistory: { workspaceId: string; tab: object }[] = [];
  let closeCalls = 0;
  let controls: { open: () => void; select: (tab: string) => void; manual: () => void; automatic?: () => void } | undefined;
  function ObserveClose({ children }: { children: { props: { onClose?: () => void } } }) {
    const callback = children.props.onClose;
    const observed = React.useCallback(() => { closeCalls++; callback?.(); }, [callback]);
    return React.cloneElement(children, callback ? { onClose: observed } : {});
  }
  const tabPath = resolve("src/features/diff/DiffViewer.tsx");
  const tabJavascript = ts.transpileModule(readFileSync(tabPath, "utf8"), {
    fileName: tabPath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const inert = () => null;
  const tabBoundaries: Record<string, object> = {
    "../../components/ui/Tooltip.tsx": { Tooltip: inert },
    "../../components/ConductorIcon": { ConductorIcon: inert },
    "./diff.css": {},
    "./DiscardDialog": { DiscardDialog: inert },
    "./Whitespace": { ViewOptionsMenu: inert },
    "./FileDiffView": { FileDiffView: inert },
    "./EditInViewer.ts": { editableContents: () => null, useFileEdit: () => undefined },
    "./ChangesList": { ChangesList: inert },
  };
  const tabModule = { exports: {} };
  runInNewContext(`(function(require, module, exports) { ${tabJavascript}\n})`)((name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(Object.prototype.hasOwnProperty.call(tabBoundaries, name), `Unexpected auto-close boundary: ${name}`);
    return tabBoundaries[name];
  }, tabModule, tabModule.exports);
  assert.ok("DiffTab" in tabModule.exports && typeof tabModule.exports.DiffTab === "function");
  const probeSource = `
    const { useState, useRef, useCallback } = React;
    ${tabOfChat.getText()}
    function Probe({ workspace, reviews, load, noMatchingFiles }) {
      ${declaration("primaryId").getText()}
      ${declaration("[diffOpen, setDiffOpen]").getText()}
      ${declaration("[mainTab, setMainTab]").getText()}
      ${declaration("openDiffTab").getText()}
      ${declaration("closeDiffTab").getText()}
      const centerTerminal = undefined;
      const fileTarget = null;
      const showDiff = diffOpen && mainTab === "diff";
      const showPr = false;
      ${activeOwner}
      const files = load.state === "ready" ? load.files : [];
      const diff = {
        load, files, selected: files[0] ?? null, noMatchingFiles, redirectRevision: 0,
        turn: null, worktree: "fixture-owner", target: { branch: "main", remote: "origin" }, opts: options, update() {},
        isViewed: () => false, loadFull: async (file) => file, loadText: async () => "",
        unread: -1, current: 0, canDiscard: false, reloadQuietly() {}
      };
      const review = {};
      const notify = undefined;
      const content = showDiff ? (${tabJSX}) : null;
      recordControls({ open: openDiffTab, select: setMainTab, manual: closeDiffTab, automatic: content?.props.onClose });
      return <div data-empty-diff-owner={true} data-main-tab={mainTab} data-diff-open={diffOpen}>
        {content && <ObserveClose>{content}</ObserveClose>}
      </div>;
    }
    module.exports = { Probe };
  `;
  const probeJavascript = ts.transpileModule(probeSource, {
    fileName: "empty-diff-owner.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const probeModule = { exports: {} };
  runInNewContext(`(function(require, module, exports) { ${probeJavascript}\n})`, {
    React, ObserveClose, DiffTab: tabModule.exports.DiffTab, options: DEFAULT_VIEW_OPTIONS,
    recordControls: (next: typeof controls) => { controls = next; },
    pushClosedTab: (workspaceId: string, tab: object) => { closedHistory.push({ workspaceId, tab: { ...tab } }); },
  })(dependencies, probeModule, probeModule.exports);
  assert.ok("Probe" in probeModule.exports && typeof probeModule.exports.Probe === "function");
  const Probe = probeModule.exports.Probe;
  let inputs = { workspace: { id: "fixture-owner", path: null }, reviews: { tabs: [{ chatId: "review-a" }] }, load: initialLoad, noMatchingFiles: false };
  let renderer: ReturnType<typeof create>;
  const element = () => React.createElement(Probe, inputs);
  await act(async () => { renderer = create(element()); });
  const actions = () => { assert.ok(controls); return controls; };
  const update = async () => { await act(async () => { renderer.update(element()); }); };
  return {
    open() { act(() => actions().open()); },
    select(tab: string) { act(() => actions().select(tab)); },
    manual() { act(() => actions().manual()); },
    automatic: () => actions().automatic,
    invoke(callback: (() => void) | undefined) { act(() => callback?.()); },
    async load(load: WorkspaceDiff["load"]) { inputs = { ...inputs, load }; await update(); },
    async noMatch(noMatchingFiles: boolean) { inputs = { ...inputs, noMatchingFiles }; await update(); },
    async reviews(tabs: { chatId: string }[]) { inputs = { ...inputs, reviews: { tabs } }; await update(); },
    async workspace(id: string) { inputs = { ...inputs, workspace: { ...inputs.workspace, id } }; await update(); },
    snapshot() {
      const props = renderer.root.findByProps({ "data-empty-diff-owner": true }).props;
      return { tab: props["data-main-tab"], open: props["data-diff-open"] };
    },
    closeCalls: () => closeCalls,
    closedHistory,
    update,
    close() { act(() => renderer.unmount()); },
  };
}

test("mounted DiffTab and actual owner wiring auto-close a populated-to-empty raw list without reopen history", async () => {
  const view = await emptyDiffCloseFixture();
  try {
    view.open();
    assert.deepEqual(view.snapshot(), { tab: "diff", open: true });
    await view.load({ state: "ready", files: [] });
    assert.deepEqual(view.snapshot(), { tab: "chat", open: false });
    assert.equal(view.closeCalls(), 1);
    assert.deepEqual(view.closedHistory, []);
  } finally { view.close(); }
});

test("mounted DiffTab and actual owner wiring close an initially empty loaded list once", async () => {
  const view = await emptyDiffCloseFixture({ state: "ready", files: [] });
  try {
    view.open();
    await view.update();
    await view.update();
    assert.deepEqual(view.snapshot(), { tab: "chat", open: false });
    assert.equal(view.closeCalls(), 1);
    assert.deepEqual(view.closedHistory, []);
  } finally { view.close(); }
});

test("mounted DiffTab never auto-closes loading, failed or filtered-nonempty raw lists", async () => {
  const view = await emptyDiffCloseFixture({ state: "loading" });
  try {
    view.open();
    assert.deepEqual(view.snapshot(), { tab: "diff", open: true });
    await view.load({ state: "error", message: "fixture load failed" });
    assert.deepEqual(view.snapshot(), { tab: "diff", open: true });
    await view.load({ state: "ready", files: [navigationFile("a.ts")] });
    await view.noMatch(true);
    assert.deepEqual(view.snapshot(), { tab: "diff", open: true });
    assert.equal(view.closeCalls(), 0);
    assert.deepEqual(view.closedHistory, []);
  } finally { view.close(); }
});

test("automatic empty Diff close returns to the previously viewed review chat", async () => {
  const view = await emptyDiffCloseFixture();
  try {
    view.select("review-a");
    view.open();
    await view.load({ state: "ready", files: [] });
    assert.deepEqual(view.snapshot(), { tab: "review-a", open: false });
    assert.equal(view.closeCalls(), 1);
    assert.deepEqual(view.closedHistory, []);
  } finally { view.close(); }
});

test("automatic empty Diff close falls back to the workspace chat if its previous review closed", async () => {
  const view = await emptyDiffCloseFixture();
  try {
    view.select("review-a");
    view.open();
    await view.reviews([]);
    await view.load({ state: "ready", files: [] });
    assert.deepEqual(view.snapshot(), { tab: "chat", open: false });
    assert.equal(view.closeCalls(), 1);
    assert.deepEqual(view.closedHistory, []);
  } finally { view.close(); }
});

test("a stale automatic Diff close cannot steal an inactive tab or another workspace", async () => {
  const view = await emptyDiffCloseFixture();
  try {
    view.open();
    const automatic = view.automatic();
    view.select("review-a");
    view.invoke(automatic);
    assert.deepEqual(view.snapshot(), { tab: "review-a", open: true });
    view.select("diff");
    await view.workspace("other-workspace");
    view.invoke(automatic);
    assert.deepEqual(view.snapshot(), { tab: "diff", open: true });
    await view.load({ state: "ready", files: [] });
    assert.deepEqual(view.snapshot(), { tab: "chat", open: false });
    assert.deepEqual(view.closedHistory, []);
  } finally { view.close(); }
});

test("manual Diff close still records a reopenable Diff tab", async () => {
  const view = await emptyDiffCloseFixture();
  try {
    view.open();
    view.manual();
    assert.deepEqual(view.snapshot(), { tab: "chat", open: false });
    assert.equal(view.closeCalls(), 0);
    assert.deepEqual(view.closedHistory, [{ workspaceId: "fixture-owner", tab: { kind: "diff" } }]);
  } finally { view.close(); }
});
