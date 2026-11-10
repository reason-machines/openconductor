// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { keyedCache } from "../../lib/keyedCache.ts";
import * as navigation from "./nav.ts";
import { discardScope } from "./target.ts";
import * as viewed from "./viewed.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";
import { fileFingerprint, isViewed, loadViewed, pruneViewed, saveViewed, toggleViewed, viewedCount } from "./viewed.ts";
import { DEFAULT_VIEW_OPTIONS, type FileDiff } from "./types.ts";

function file(path: string, text: string): FileDiff {
  return {
    path,
    old_path: null,
    status: "modified",
    binary: false,
    additions: 1,
    deletions: 0,
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
  const after = file("a.ts", "y");
  assert.notEqual(fileFingerprint(before), fileFingerprint(after));
  assert.equal(isViewed(toggleViewed({}, before), after), false);
});

test("prune drops files that left the diff; count only counts current marks", () => {
  const a = file("a.ts", "x");
  const b = file("b.ts", "x");
  const m = toggleViewed(toggleViewed({}, a), b);
  assert.deepEqual(Object.keys(pruneViewed(m, [a])), ["a.ts"]);
  assert.equal(viewedCount(m, [a, file("b.ts", "changed")]), 1);
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
  return { path, old_path: null, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [] };
}

async function fixture(files: FileDiff[], initiallyViewed: FileDiff[] = []) {
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
      loadWorkspaceDiff: async () => files,
      discardFileChanges: () => { throw new Error("Unexpected discard"); },
    },
    "../../keybindings/KeybindingsProvider.tsx": { useKeybindings: (next: typeof handlers) => Object.assign(handlers, next) },
    "./nav.ts": navigation,
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
  let current: WorkspaceDiff | undefined;
  function Probe() {
    current = useWorkspaceDiff({ workspaceId: "fixture", worktree: null, target: { branch: "main", remote: "origin" } });
    return null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  const state = () => { assert.ok(current); return current; };
  assert.equal(state().load.state, "ready");
  return {
    state,
    open(index: number) { act(() => state().open(index)); },
    keyboard() { act(() => { handlers["diff.toggleViewed"](); }); },
    header() {
      const selected = state().selected;
      assert.ok(selected);
      act(() => state().toggleViewed(selected));
    },
    toggle(f: FileDiff) { act(() => state().toggleViewed(f)); },
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
