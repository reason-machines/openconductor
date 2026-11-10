import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";

// Production React callbacks and effects, with a deterministic clock and host
// geometry. This is behavioral renderer coverage, not browser/native evidence.
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string> };
const path = "/repo/src/example.ts";
const edits = [
  { old_string: "- same\n- first old", new_string: "+ same\n+ first new" },
  { old_string: "- same\n- " + "last old ".repeat(12), new_string: "+ <script>last new & safe</script>" },
];
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);

async function fixture(options: { tool?: tools.ConductorTool; plain?: boolean; open?: boolean } = {}) {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const opened: string[] = [];
  const window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener(name: string, callback: (event: unknown) => void) {
      const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set);
    },
    removeEventListener(name: string, callback: (event: unknown) => void) { listeners.get(name)?.delete(callback); },
  };
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    exports: production, window,
    setTimeout(run: () => void, delay: number) { const key = ++id; timers.set(key, { at: now + delay, run }); return key; },
    clearTimeout(key: number) { timers.delete(key); },
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { Markdown: () => { throw new Error("Unrelated Markdown leaf"); } };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  function Scene() {
    const [open, setOpen] = React.useState(options.open ?? false);
    if (options.plain) return React.createElement(production.FileBadge, { path, onOpen: (value: string) => opened.push(value) }, "plain child");
    const props: ToolRowProps = {
      tool: options.tool ?? { name: "MultiEdit", input: { file_path: path, edits } },
      status: "done", isError: false, open, onToggle: () => setOpen((value: boolean) => !value),
      onOpenFile: (value) => opened.push(value),
    };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Scene), {
      createNodeMock: (element: Node) => ({
        getBoundingClientRect: () => element.props.role === "region"
          ? { left: 100, top: 200, right: 548, bottom: 300, width: 448, height: 100 }
          : { left: 100, top: 600, right: 220, bottom: 620, width: 120, height: 20 },
        contains: () => false,
      }),
    });
  });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (predicate: (node: Node) => boolean): Node => {
    const found = all(predicate); assert.equal(found.length, 1, "one production control exists"); return found[0]!;
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
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]);
      await act(async () => { next[1].run(); });
    }
    now = end;
  }
  return {
    opened, all, one, event, tick,
    badge: () => one((node) => node.type === "button" && hasClass(node, "oc-file-badge")),
    header: () => one((node) => hasClass(node, "oc-tool-head")),
    preview: () => all((node) => node.props.role === "region" && node.props["aria-label"] === "File change preview"),
    async hover() { await event(this.badge(), "onPointerEnter", { pointerType: "mouse" }); await tick(150); },
    async global(name: string, payload: Record<string, unknown> = {}) {
      await act(async () => { for (const listener of listeners.get(name) ?? []) listener(payload); });
    },
    async close() {
      await act(async () => { renderer.unmount(); });
      assert.equal(timers.size, 0, "unmount clears pending hover timers");
      assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0, "unmount removes listeners");
    },
  };
}

for (const name of ["MultiEdit", "NotebookEdit"]) {
  test(`${name} badge hover shows the full marker-normalized aggregate after 150ms`, async () => {
    const view = await fixture({ tool: { name, input: { file_path: path, edits } } });
    try {
      assert.equal(view.preview().length, 0);
      await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" });
      await view.tick(149); assert.equal(view.preview().length, 0);
      await view.tick(1); assert.equal(view.preview().length, 1, "aggregate hover opens independently of the collapsed row");
      const preview = view.preview()[0]!;
      const rows = view.all((node) => hasClass(node, "oc-code-line"));
      assert.deepEqual(rows.filter((node) => hasClass(node, "del")).map(text), ["-same", "-first old", "-same", "-" + "last old ".repeat(12)]);
      assert.deepEqual(rows.filter((node) => hasClass(node, "add")).map(text), ["+same", "+first new", "+<script>last new & safe</script>"]);
      assert.ok(text(preview).includes("last old ".repeat(12)), "not the per-edit forty-character preview");
      assert.equal(view.all((node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
      assert.equal(view.header().props["aria-expanded"], false);
      assert.equal(view.all((node) => node.props["aria-label"] === "Edit 1").length, 0);
    } finally { await view.close(); }
  });
}

test("aggregate hover cancels short entry, bridges the 100ms close gap, and dismisses on Escape", async () => {
  const view = await fixture();
  try {
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" }); await view.tick(149);
    await view.event(view.badge(), "onPointerLeave"); await view.tick(1000);
    assert.equal(view.preview().length, 0);
    await view.hover(); assert.equal(view.preview().length, 1);
    await view.event(view.badge(), "onPointerLeave"); await view.tick(99);
    await view.event(view.preview()[0]!, "onPointerEnter"); await view.tick(100);
    assert.equal(view.preview().length, 1, "pointer can enter the diff without closing it");
    await view.event(view.preview()[0]!, "onPointerLeave"); await view.tick(99);
    assert.equal(view.preview().length, 1);
    await view.tick(1); assert.equal(view.preview().length, 0);
    await view.hover(); await view.global("keydown", { key: "Escape" });
    assert.equal(view.preview().length, 0);
  } finally { await view.close(); }
});

test("hover preserves file navigation and independent nested edit inspection", async () => {
  const view = await fixture();
  try {
    await view.hover(); assert.equal(view.preview().length, 1);
    let stopped = 0;
    await view.event(view.badge(), "onClick", { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 1); assert.deepEqual(view.opened, [path]);
    assert.equal(view.header().props["aria-expanded"], false);
    await view.global("keydown", { key: "Escape" });
    await view.event(view.header(), "onClick");
    const edit = (index: number) => view.one((node) => node.props["aria-label"] === `Edit ${index}`);
    assert.equal(edit(1).props["aria-expanded"], false);
    assert.equal(edit(2).props["aria-expanded"], false);
    await view.event(edit(2), "onClick");
    assert.equal(edit(1).props["aria-expanded"], false); assert.equal(edit(2).props["aria-expanded"], true);
    const before = view.all((node) => hasClass(node, "oc-multi-edit-body")).map(text);
    await view.hover(); assert.equal(view.preview().length, 1);
    assert.deepEqual(view.all((node) => hasClass(node, "oc-multi-edit-body")).map(text), before);
    assert.equal(edit(1).props["aria-expanded"], false); assert.equal(edit(2).props["aria-expanded"], true);
  } finally { await view.close(); }
});

test("plain FileBadge keeps path tooltip, children and navigation without a hover", async () => {
  const view = await fixture({ plain: true });
  try {
    assert.equal(view.badge().props.title, path); assert.ok(text(view.badge()).includes("plain child"));
    await view.hover(); await view.tick(1000); assert.equal(view.preview().length, 0);
    let stopped = 0;
    await view.event(view.badge(), "onClick", { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 1); assert.deepEqual(view.opened, [path]);
  } finally { await view.close(); }
});

test("Read, Write and Edit badges do not acquire the opt-in aggregate hover", async () => {
  for (const tool of [
    { name: "Read", input: { file_path: path } },
    { name: "Write", input: { file_path: path, content: "written" } },
    { name: "Edit", input: { file_path: path, old_string: "old", new_string: "new" } },
  ]) {
    const view = await fixture({ tool });
    try {
      assert.equal(view.badge().props.title, path);
      await view.hover(); await view.tick(1000); assert.equal(view.preview().length, 0);
      await view.event(view.badge(), "onClick", { stopPropagation() {} }); assert.deepEqual(view.opened, [path]);
    } finally { await view.close(); }
  }
});

test("native Codex file_change projection remains Edit/Write/Bash with no aggregate hover", async () => {
  const projected = tools.conductorTools("file_change", { changes: [
    { path, kind: "update", diff: "@@ -1 +1 @@\n-old\n+new" },
    { path, kind: "add", diff: "@@ -0,0 +1 @@\n+created" },
    { path, kind: "delete", diff: "@@ -1 +0,0 @@\n-removed" },
  ] });
  assert.deepEqual(projected.map((tool) => tool.name), ["Edit", "Write", "Bash"]);
  for (const tool of projected) {
    const view = await fixture({ tool, open: true });
    try {
      for (const badge of view.all((node) => hasClass(node, "oc-file-badge"))) {
        await view.event(badge, "onPointerEnter", { pointerType: "mouse" }); await view.tick(1000);
      }
      assert.equal(view.preview().length, 0);
      assert.equal(view.all((node) => hasClass(node, "oc-multi-edit-list")).length, 0);
      assert.equal(view.all((node) => hasClass(node, "oc-tool-content")).length, 1);
    } finally { await view.close(); }
  }
});

test("touch and focus do not open a pointer hover; pending timers are cleaned up", async () => {
  const view = await fixture();
  try {
    await view.event(view.badge(), "onPointerEnter", { pointerType: "touch" }); await view.tick(1000);
    await view.event(view.badge(), "onFocus"); await view.tick(1000); assert.equal(view.preview().length, 0);
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" });
  } finally { await view.close(); }
});
