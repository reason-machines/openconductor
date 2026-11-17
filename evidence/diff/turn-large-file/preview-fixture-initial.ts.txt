import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { LoadExtra } from "../diff/api.ts";
import type { TurnRef } from "../diff/turnChangesCache.ts";
import type { DiffViewOptions, FileChange, FileDiff } from "../diff/types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const allowed = new Set([
  "src/features/chat/TurnChanges.tsx",
  "src/features/chat/turnFilePreview.ts",
  "src/features/chat/ToolRows.tsx",
  "src/features/chat/toolIconData.ts",
  "src/features/chat/conductorTools.ts",
  "src/features/chat/thinkingChip.ts",
  "src/features/diff/turnChangesCache.ts",
  "src/lib/local-storage/subsystems.ts",
].map((path) => resolve(root, path)));

type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string> };
const change = (over: Partial<FileChange> = {}): FileChange => ({
  path: "src/first.ts", old_path: null, status: "modified", binary: false, additions: 2, deletions: 1, ...over,
});
const diff = (over: Partial<FileDiff> = {}): FileDiff => ({
  ...change(),
  hunks: [{ old_start: 4, new_start: 4, old_lines: 2, new_lines: 2, section: "", lines: [
    { kind: "context", old_line: 4, new_line: 4, text: "context" },
    { kind: "deletion", old_line: 5, new_line: null, text: "old value" },
    { kind: "addition", old_line: null, new_line: 5, text: "<script>new & safe</script>" },
  ] }], ...over,
});
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");

async function fixture(initial = [change()]) {
  let files = initial;
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const opened: string[] = [];
  const requests: Array<{
    worktree: string | null; options: DiffViewOptions; extra: LoadExtra;
    resolve: (files: FileDiff[]) => void; reject: (error: Error) => void;
  }> = [];
  const props = { turn: { sessionId: "session-a", turnId: "turn-a" } satisfies TurnRef, worktree: "/repo", onOpenFile: (path: string) => opened.push(path) };
  const listeners = new Map<string, Set<() => void>>();
  const events = {
    addEventListener(name: string, callback: () => void) {
      const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set);
    },
    removeEventListener(name: string, callback: () => void) { listeners.get(name)?.delete(callback); },
  };
  const document = { body: {}, ...events };
  const window = { innerWidth: 1024, innerHeight: 768, ...events };
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (name: string) => {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "react-dom") return { createPortal: (children: unknown) => children };
      if (name.endsWith(".css")) return {};
      if (name === "../diff/useTurnChanges.ts") return { useTurnChanges: () => files };
      if (name === "../diff/api.ts") return {
        loadWorkspaceDiff: (worktree: string | null, _target: unknown, options: DiffViewOptions, extra: LoadExtra) => new Promise<FileDiff[]>((resolve, reject) => {
          requests.push({ worktree, options, extra, resolve, reject });
        }),
      };
      if (name === "./markdown.ts") return { Markdown: () => { throw new Error("Unrelated Markdown was rendered"); } };
      if (name === "./LinkMenu.tsx") return { LinkWithMenu: () => { throw new Error("Unrelated link menu rendered"); } };
      if (name === "../../backend.ts") return { openUrl: () => { throw new Error("Unrelated external opener invoked"); } };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    };
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      document, window,
      setTimeout: (run: () => void, delay: number) => { const id = ++timerId; timers.set(id, { at: now + delay, run }); return id; },
      clearTimeout: (id: number) => { timers.delete(id); },
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { TurnChanges } = load(resolve(root, "src/features/chat/TurnChanges.tsx"));
  assert.equal(typeof TurnChanges, "function");
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(TurnChanges, props), {
      createNodeMock: () => ({ getBoundingClientRect: () => ({ left: 100, right: 220, top: 600, bottom: 624, width: 120, height: 24 }) }),
    });
  });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const buttons = () => all((node) => node.type === "button" && String(node.props.className).split(" ").includes("filebadge"));
  const chip = (name = "first.ts") => {
    const node = buttons().find((button) => text(button).includes(name));
    assert.ok(node, `Missing changed-file chip ${name}`);
    return node;
  };
  async function event(node: Node, name: string, payload: Record<string, unknown> = {}) {
    let target: Node | null = node;
    while (target && typeof target.props[name] !== "function") target = target.parent;
    const handler = target?.props[name];
    if (typeof handler === "function") await act(async () => { handler(payload); });
  }
  async function tick(ms: number) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]);
      await act(async () => { next[1].run(); });
    }
    now = end;
  }
  return {
    opened, requests, buttons, chip, all, event, tick,
    content: () => all((node) => node.props["aria-label"] === "File change preview"),
    text: () => text(renderer.root),
    async hover(name?: string) { await event(chip(name), "onPointerEnter"); await tick(150); },
    async finish(index: number, result: FileDiff[]) { await act(async () => { requests[index].resolve(result); }); },
    async fail(index: number) { await act(async () => { requests[index].reject(new Error("git unavailable")); }); },
    async update(next: Partial<typeof props>, nextFiles = files) {
      Object.assign(props, next); files = nextFiles;
      await act(async () => { renderer.update(React.createElement(TurnChanges, props)); });
    },
    async close() { await act(async () => { renderer.unmount(); }); assert.equal(timers.size, 0, "unmount clears pending hover timers"); },
  };
}

test("turn-file preview opens after 150ms, loads only its historical turn/path, and preserves the chip click", async () => {
  const view = await fixture([change({ status: "renamed", old_path: "src/before.ts", additions: 499, deletions: 1 })]);
  try {
    assert.equal(view.requests.length, 0, "mount must not request file contents");
    await view.event(view.chip(), "onFocus"); await view.tick(200);
    assert.equal(view.requests.length, 0, "focus alone must not open the pointer preview");
    await view.event(view.chip(), "onPointerEnter"); await view.tick(149);
    assert.equal(view.requests.length, 0);
    await view.tick(1);
    assert.equal(view.requests.length, 1, "exactly 500 changed lines are previewable");
    assert.equal(view.requests[0].worktree, "/repo");
    assert.equal(view.requests[0].extra.path, "src/first.ts");
    assert.equal(view.requests[0].extra.turn?.sessionId, "session-a");
    assert.equal(view.requests[0].extra.turn?.turnId, "turn-a");
    assert.equal(view.requests[0].options.ignoreWhitespace, false);
    assert.equal(view.requests[0].options.layout, "unified");
    assert.equal(view.content().length, 1);
    assert.match(view.text(), /Loading/);
    let stopped = 0;
    await view.event(view.chip(), "onClick", { stopPropagation: () => { stopped += 1; } });
    assert.deepEqual(view.opened, ["src/first.ts"]);
    assert.equal(stopped, 1);
    await view.finish(0, [diff({ status: "renamed", old_path: "src/before.ts" })]);
    assert.match(view.text(), /src\/first\.ts/);
    assert.match(view.text(), /old value/);
    assert.match(view.text(), /<script>new & safe<\/script>/);
    assert.equal(view.all((node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0, "diff text stays inert");
  } finally { await view.close(); }
});

test("turn-file preview leaves 501-line chips tooltip-only without fetching and preserves navigation", async () => {
  const view = await fixture([change({ additions: 500, deletions: 1 })]);
  try {
    assert.equal(view.chip().props.title, "Open to view preview");
    await view.hover(); await view.tick(1000);
    assert.equal(view.requests.length, 0);
    assert.equal(view.content().length, 0);
    await view.event(view.chip(), "onClick", { stopPropagation() {} });
    assert.deepEqual(view.opened, ["src/first.ts"]);
  } finally { await view.close(); }
});

test("turn-file preview cancels a short hover, remains interactive across the 100ms close gap, and dismisses", async () => {
  const view = await fixture();
  try {
    await view.event(view.chip(), "onPointerEnter"); await view.tick(100);
    await view.event(view.chip(), "onPointerLeave"); await view.tick(200);
    assert.equal(view.requests.length, 0, "leaving before open must cancel the request");
    await view.hover();
    assert.equal(view.requests.length, 1);
    await view.finish(0, [diff()]);
    await view.event(view.chip(), "onPointerLeave"); await view.tick(99);
    assert.equal(view.content().length, 1);
    await view.event(view.content()[0], "onPointerEnter"); await view.tick(200);
    assert.equal(view.content().length, 1, "content can be entered and text selected without closing");
    await view.event(view.content()[0], "onPointerLeave"); await view.tick(100);
    assert.equal(view.content().length, 0);
  } finally { await view.close(); }
});

for (const state of ["empty", "binary", "error"] as const) {
  test(`turn-file preview shows its ${state} unavailable state without stale diff text`, async () => {
    const view = await fixture([change({ binary: state === "binary" })]);
    try {
      await view.hover();
      assert.equal(view.requests.length, 1);
      if (state === "error") await view.fail(0);
      else await view.finish(0, state === "empty" ? [] : [diff({ binary: true, hunks: [] })]);
      assert.match(view.text(), state === "binary" ? /Binary file changed/ : /No diff available/);
      assert.doesNotMatch(view.text(), /old value|Loading/);
      await view.event(view.chip(), "onClick", { stopPropagation() {} });
      assert.deepEqual(view.opened, ["src/first.ts"]);
    } finally { await view.close(); }
  });
}

test("turn-file preview names a saved snapshot that is too large without losing navigation", async () => {
  const view = await fixture();
  try {
    await view.hover();
    assert.equal(view.requests.length, 1);
    await view.finish(0, [diff({ hide_reason: "file_too_large", hunks: [] })]);
    assert.match(view.text(), /File too large to preview/);
    assert.doesNotMatch(view.text(), /No diff available|Binary file changed|old value|Loading/);
    await view.event(view.chip(), "onClick", { stopPropagation() {} });
    assert.deepEqual(view.opened, ["src/first.ts"]);
  } finally { await view.close(); }
});

test("turn-file preview renders only the requested file from a response", async () => {
  const view = await fixture();
  try {
    await view.hover(); assert.equal(view.requests.length, 1);
    await view.finish(0, [diff({ path: "src/not-requested.ts" })]);
    assert.match(view.text(), /No diff available/);
    assert.doesNotMatch(view.text(), /old value/);
  } finally { await view.close(); }
});

for (const changed of ["turn", "session", "worktree", "path"] as const) {
  test(`turn-file preview ignores a stale response after changing ${changed}`, async () => {
    const view = await fixture();
    try {
      await view.hover(); assert.equal(view.requests.length, 1);
      const path = changed === "path" ? "src/second.ts" : "src/first.ts";
      await view.update({
        turn: { sessionId: changed === "session" ? "session-b" : "session-a", turnId: changed === "turn" ? "turn-b" : "turn-a" },
        worktree: changed === "worktree" ? "/other-repo" : "/repo",
      }, [change({ path })]);
      assert.equal(view.content().length, 0, "a new target must not inherit the old open preview");
      await view.hover(changed === "path" ? "second.ts" : "first.ts");
      assert.equal(view.requests.length, 2);
      await view.finish(1, [diff({ path, hunks: [] })]);
      const currentText = view.text();
      await view.finish(0, [diff()]);
      assert.equal(view.text(), currentText, "old async results must not replace the new target");
      assert.doesNotMatch(view.text(), /old value/);
    } finally { await view.close(); }
  });
}

test("turn-file preview discards an in-flight result after close or unmount", async () => {
  const view = await fixture();
  try {
    await view.hover(); assert.equal(view.requests.length, 1);
    await view.event(view.chip(), "onPointerLeave"); await view.tick(100);
    assert.equal(view.content().length, 0);
    await view.finish(0, [diff()]);
    assert.equal(view.content().length, 0);
    await view.hover(); assert.equal(view.requests.length, 2);
  } finally { await view.close(); }
  await view.finish(1, [diff()]);
});

test("footer chip glyphs, counts, order, compact layout and three-at-a-time reveal remain intact", async () => {
  const view = await fixture(Array.from({ length: 7 }, (_, i) => change({ path: `src/file-${i}.ts`, additions: i + 1, deletions: i })));
  try {
    assert.equal(view.requests.length, 0);
    assert.equal(view.buttons().length, 2);
    assert.deepEqual(view.buttons().map((node) => text(node).split("+")[0]), ["file-0.ts", "file-1.ts"]);
    assert.match(text(view.buttons()[0]), /\+1-0$/);
    assert.ok(view.all((node) => node.type === "svg").length >= 3, "file glyphs and reveal icon remain present");
    const more = view.all((node) => node.type === "button" && node.props.title === "Show 3 more changed files")[0];
    assert.ok(more);
    await view.event(more, "onClick");
    assert.equal(view.buttons().length, 5);
    assert.equal(view.all((node) => node.props.className === "chat-turn-changes-more revealed").length, 1);
    const group = view.all((node) => node.props.role === "group" && node.props["aria-label"] === "Files changed in this turn")[0];
    assert.equal(group.props.className, "chat-turn-changes revealed");
    await view.event(view.buttons()[4], "onClick", { stopPropagation() {} });
    assert.deepEqual(view.opened, ["src/file-4.ts"]);
    assert.equal(view.requests.length, 0, "revealing and clicking do not fetch previews");
  } finally { await view.close(); }
});

for (const initial of [[], [change()]]) {
  test(`footer preserves ${initial.length ? "ordinary click" : "no-files"} behavior before any preview`, async () => {
    const view = await fixture(initial);
    try {
      assert.equal(view.content().length, 0);
      assert.equal(view.requests.length, 0);
      assert.equal(view.buttons().length, initial.length);
      if (initial.length) {
        await view.event(view.chip(), "onClick", { stopPropagation() {} });
        assert.deepEqual(view.opened, ["src/first.ts"]);
      }
    } finally { await view.close(); }
  });
}
