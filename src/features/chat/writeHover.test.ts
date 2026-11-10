import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Row = { content: string; path?: string; open?: boolean; isError?: boolean; result?: string };
const path = "/repo/src/written.ts";
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const addedText = (node: Node): string => node.findAll((child) => typeof child.type === "string" && hasClass(child, "oc-code-line") && hasClass(child, "add"))
  .map((line) => text(line.children[line.children.length - 1]!)).join("\n");

async function fixture(rows: Row[]) {
  let now = 0, id = 0;
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
    const [open, setOpen] = React.useState(rows.map((row) => row.open ?? false));
    return React.createElement(React.Fragment, null, ...rows.map((row, index) => {
      const props: ToolRowProps = {
        tool: { name: "Write", input: { file_path: row.path ?? path, content: row.content } },
        status: "done", result: row.result, isError: row.isError ?? false,
        open: open[index], onToggle: () => setOpen((previous: boolean[]) => previous.map((value, i) => i === index ? !value : value)),
        onOpenFile: (value) => opened.push(value),
      };
      return React.createElement("section", { key: index, "data-write-hover-row": index }, React.createElement(production.ConductorToolRow, props));
    }));
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
  const all = (index: number, predicate: (node: Node) => boolean): Node[] =>
    renderer.root.findByProps({ "data-write-hover-row": index }).findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (index: number, predicate: (node: Node) => boolean): Node => {
    const found = all(index, predicate); assert.equal(found.length, 1, "one production control exists"); return found[0]!;
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
    badge: (index = 0) => one(index, (node) => node.type === "button" && hasClass(node, "oc-file-badge")),
    header: (index = 0) => all(index, (node) => hasClass(node, "oc-tool-head"))[0]!,
    label: (index = 0) => text(all(index, (node) => hasClass(node, "oc-tool-left"))[0]!),
    button: (label: string, index = 0) => one(index, (node) => node.type === "button" && text(node) === label),
    body: (index = 0) => {
      const body = all(index, (node) => hasClass(node, "oc-tool-content"))[0];
      return body ? addedText(body) : "";
    },
    preview: (index = 0) => all(index, (node) => node.props.role === "region" && node.props["aria-label"] === "File change preview"),
    async hover(index = 0) { await event(this.badge(index), "onPointerEnter", { pointerType: "mouse" }); await tick(150); },
    async escape() { await act(async () => { for (const listener of listeners.get("keydown") ?? []) listener({ key: "Escape" }); }); },
    async close() {
      await act(async () => { renderer.unmount(); });
      assert.equal(timers.size, 0, "unmount clears pending timers");
      assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0, "unmount removes listeners");
    },
  };
}

for (const size of [0, 1999, 2000, 2001]) {
  test(`Write ${size}-unit badge opens the selected raw content at 150ms without opening the shell`, async () => {
    const content = "x".repeat(size);
    const view = await fixture([{ content }]);
    try {
      assert.equal(view.preview().length, 0);
      await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" });
      await view.tick(149); assert.equal(view.preview().length, 0);
      await view.tick(1); assert.equal(view.preview().length, 1, "Write selected-content hover opens after 150ms");
      assert.equal(addedText(view.preview()[0]!), "x".repeat(Math.min(size, 2000)));
      assert.equal(view.header().props["aria-expanded"], false);
      assert.equal(view.body(), "");
      assert.equal(view.label(), "Write 1 lines");
      assert.equal(view.all(0, (node) => node.type === "button" && text(node) === "Show more").length, 0);
    } finally { await view.close(); }
  });
}

for (const content of [
  "+ literal\n- literal\n<script>literal & safe</script>\n" + "x".repeat(2000) + "\nhidden\n",
  "x".repeat(1999) + "\u{1f680}" + "tail\n",
]) {
  test(`Write hover follows prefix/full/prefix disclosure with ${content.startsWith("+") ? "raw markup" : "an astral boundary"}`, async () => {
    const view = await fixture([{ content, open: true }]);
    try {
      await view.hover(); assert.equal(view.preview().length, 1, "selected-content preview exists");
      const previewText = () => addedText(view.preview()[0]!);
      const prefix = content.substring(0, 2000);
      assert.equal(previewText(), prefix); assert.equal(view.body(), prefix);
      assert.equal(previewText().length, 2000);
      const label = `Write ${content.split("\n").length} lines`;
      assert.equal(view.label(), label);
      await view.event(view.button("Show more"), "onClick");
      assert.equal(view.preview().length, 1);
      assert.equal(previewText(), content); assert.equal(view.body(), content); assert.equal(view.label(), label);
      assert.equal(view.all(0, (node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
      await view.event(view.button("Show less"), "onClick");
      assert.equal(previewText(), prefix); assert.equal(view.body(), prefix); assert.equal(view.label(), label);
      await view.event(view.header(), "onClick");
      assert.equal(view.header().props["aria-expanded"], false);
      assert.equal(view.body(), ""); assert.equal(previewText(), prefix);
    } finally { await view.close(); }
  });
}

test("Write hover cancels short entry, retains content across reentry and closes after 100ms", async () => {
  const view = await fixture([{ content: "retained\ncontent" }]);
  try {
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" }); await view.tick(149);
    await view.event(view.badge(), "onPointerLeave"); await view.tick(1000);
    assert.equal(view.preview().length, 0);
    await view.hover(); assert.equal(view.preview().length, 1, "hover can open after a cancelled entry");
    await view.event(view.badge(), "onPointerLeave"); await view.tick(99);
    await view.event(view.preview()[0]!, "onPointerEnter"); await view.tick(1000);
    assert.equal(view.preview().length, 1, "content entry cancels close");
    assert.equal(addedText(view.preview()[0]!), "retained\ncontent");
    await view.event(view.preview()[0]!, "onPointerLeave"); await view.tick(99);
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" }); await view.tick(1000);
    assert.equal(view.preview().length, 1, "trigger reentry cancels close");
    await view.event(view.badge(), "onPointerLeave"); await view.tick(99);
    assert.equal(view.preview().length, 1);
    await view.tick(1); assert.equal(view.preview().length, 0);
    await view.hover(); await view.escape(); assert.equal(view.preview().length, 0);
  } finally { await view.close(); }
});

test("Write focus and touch do not open a pointer preview or leak a pending timer", async () => {
  const view = await fixture([{ content: "safe" }]);
  try {
    await view.event(view.badge(), "onFocus"); await view.tick(1000);
    assert.equal(view.preview().length, 0);
    await view.event(view.badge(), "onPointerEnter", { pointerType: "touch" }); await view.tick(1000);
    assert.equal(view.preview().length, 0);
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" });
  } finally { await view.close(); }
});

test("Write preview and disclosure are independent between mounted rows", async () => {
  const first = "a".repeat(2001), second = "b".repeat(2002);
  const view = await fixture([{ content: first, open: true }, { content: second, path: "/repo/second.ts", open: true }]);
  try {
    await view.hover(0); assert.equal(view.preview(0).length, 1, "first row opens its preview");
    assert.equal(view.preview(1).length, 0);
    await view.event(view.button("Show more", 0), "onClick");
    assert.equal(addedText(view.preview(0)[0]!), first); assert.equal(view.body(0), first);
    assert.equal(view.body(1), "b".repeat(2000));
    await view.hover(1); assert.equal(view.preview(1).length, 1);
    assert.equal(addedText(view.preview(1)[0]!), "b".repeat(2000));
    await view.event(view.button("Show more", 1), "onClick");
    await view.event(view.button("Show less", 0), "onClick");
    assert.equal(addedText(view.preview(0)[0]!), "a".repeat(2000));
    assert.equal(addedText(view.preview(1)[0]!), second);
    await view.event(view.badge(0), "onPointerLeave"); await view.tick(100);
    assert.equal(view.preview(0).length, 0); assert.equal(view.preview(1).length, 1);
  } finally { await view.close(); }
});

test("Write hover preserves badge navigation, shell toggling and the independent error disclosure", async () => {
  const content = "x".repeat(2001);
  const view = await fixture([{ content, isError: true, result: "Permission denied" }]);
  try {
    const errorHead = () => view.all(0, (node) => hasClass(node, "oc-tool-head"))[1]!;
    await view.hover(); assert.equal(view.preview().length, 1, "failed Write retains its selected-content preview");
    let stopped = 0;
    await view.event(view.badge(), "onClick", { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 1); assert.deepEqual(view.opened, [path]);
    assert.equal(view.badge().props.title, path);
    assert.equal(view.header().props["aria-expanded"], false); assert.equal(errorHead().props["aria-expanded"], false);
    await view.event(view.preview()[0]!, "onClick", { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 2); assert.deepEqual(view.opened, [path]);
    await view.event(errorHead(), "onClick");
    assert.equal(errorHead().props["aria-expanded"], true);
    assert.ok(view.all(0, (node) => hasClass(node, "oc-tool-content")).some((node) => text(node).includes("Permission denied")));
    await view.event(view.header(), "onClick");
    await view.event(view.button("Show more"), "onClick");
    assert.equal(addedText(view.preview()[0]!), content); assert.equal(view.body(), content);
    assert.equal(errorHead().props["aria-expanded"], true);
    await view.event(view.header(), "onClick"); await view.event(view.header(), "onClick");
    assert.equal(view.body(), content); assert.equal(errorHead().props["aria-expanded"], true);
    await view.event(errorHead(), "onClick"); assert.equal(errorHead().props["aria-expanded"], false);
  } finally { await view.close(); }
});

test("Write without a path has no badge while keeping raw disclosure", async () => {
  const content = "x".repeat(2001);
  const view = await fixture([{ content, path: "", open: true }]);
  try {
    assert.equal(view.all(0, (node) => hasClass(node, "oc-file-badge")).length, 0);
    assert.equal(view.preview().length, 0); assert.equal(view.body(), "x".repeat(2000));
    await view.event(view.button("Show more"), "onClick"); assert.equal(view.body(), content);
  } finally { await view.close(); }
});
