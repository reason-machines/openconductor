import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Row = { old: string; next: string; path?: string; open?: boolean; isError?: boolean; result?: string; name?: string };
const path = "/repo/src/edited.ts";
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const lines = (node: Node): string[] => node.findAll((child) => typeof child.type === "string" && hasClass(child, "oc-code-line")).map(text);

function normalizedCall(row: Row) {
  const chatId = "workspace:claude";
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Edit the file", at);
  const rawInput = { file_path: row.path ?? path, old_string: row.old, new_string: row.next };
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: "ordinary-edit", title: "Edit file", kind: "edit",
    toolName: row.name ?? "Edit", rawInput, status: row.isError ? "failed" : "completed",
    output: row.result ?? "Updated", diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.deepEqual(part.call.tool, { name: row.name ?? "Edit", input: rawInput });
  return part.call;
}

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
        case "./LinkMenu.tsx": return { LinkWithMenu: () => { throw new Error("Unrelated link menu rendered"); } };
        case "../../backend.ts": return { openUrl: () => { throw new Error("Unrelated external opener invoked"); } };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  const calls = rows.map(normalizedCall);
  function Scene() {
    const [open, setOpen] = React.useState(rows.map((row) => row.open ?? false));
    return React.createElement(React.Fragment, null, ...rows.map((_, index) => {
      const call = calls[index]!;
      const props: ToolRowProps = {
        tool: call.tool, status: call.status, result: call.result, isError: call.status === "error",
        open: open[index], onToggle: () => setOpen((previous: boolean[]) => previous.map((value, i) => i === index ? !value : value)),
        onOpenFile: (value) => opened.push(value),
      };
      return React.createElement("section", { key: index, "data-edit-hover-row": index }, React.createElement(production.ConductorToolRow, props));
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
    renderer.root.findByProps({ "data-edit-hover-row": index }).findAll((node: Node) => typeof node.type === "string" && predicate(node));
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
    counts: (index = 0) => all(index, (node) => hasClass(node, "oc-line-counts")).map(text),
    body: (index = 0) => all(index, (node) => hasClass(node, "oc-tool-content"))[0],
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

test("ordinary Claude Edit opens its own diff hover at 150ms without expanding the row", async () => {
  const view = await fixture([{ old: "before", next: "after" }]);
  try {
    assert.equal(view.preview().length, 0);
    assert.deepEqual(view.counts(), ["11"]);
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" });
    await view.tick(149); assert.equal(view.preview().length, 0);
    await view.tick(1); assert.equal(view.preview().length, 1, "ordinary Edit file badge opens its diff preview");
    assert.deepEqual(lines(view.preview()[0]!), ["-before", "+after"]);
    assert.equal(view.header().props["aria-expanded"], false); assert.equal(view.body(), undefined);
    await view.event(view.header(), "onClick");
    assert.equal(view.header().props["aria-expanded"], true);
    assert.deepEqual(lines(view.body()!), lines(view.preview()[0]!));
    assert.equal(view.badge().props.title, path);
    assert.equal(view.all(0, (node) => hasClass(node, "oc-tool-right") && hasClass(node, "hidden")).length, 0);
    assert.deepEqual(view.counts(), ["11"]);
  } finally { await view.close(); }
});

for (const row of [
  { old: "removed", next: "", expected: ["-removed"], counts: "01" },
  { old: "", next: "added", expected: ["+added"], counts: "10" },
  { old: "same", next: "same", expected: ["-same", "+same"], counts: "00" },
  { old: "- old\n- keep", next: "+ <script>safe & literal</script>\n+ keep", expected: ["-old", "-keep", "+<script>safe & literal</script>", "+keep"], counts: "11" },
]) {
  test(`Edit selected sides ${JSON.stringify([row.old, row.next])} agree in hover and expanded body`, async () => {
    const view = await fixture([{ ...row, open: true }]);
    try {
      assert.deepEqual(lines(view.body()!), row.expected);
      await view.hover(); assert.equal(view.preview().length, 1, "nonempty selected side has a hover preview");
      assert.deepEqual(lines(view.preview()[0]!), row.expected);
      assert.deepEqual(view.counts(), [row.counts]);
      assert.equal(view.all(0, (node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
    } finally { await view.close(); }
  });
}

for (const row of [{ old: "", next: "" }, { old: "- ", next: "+ " }]) {
  test(`Edit empty normalized sides ${JSON.stringify(row)} do not add a preview or disclosure`, async () => {
    const view = await fixture([{ ...row, open: true }]);
    try {
      await view.hover(); assert.equal(view.preview().length, 0);
      assert.equal(view.header().props["aria-expanded"], undefined);
      assert.equal(view.body(), undefined); assert.deepEqual(view.counts(), []);
      assert.equal(view.badge().props.title, path);
    } finally { await view.close(); }
  });
}

test("Edit without a path has no badge but retains its expanded diff", async () => {
  const view = await fixture([{ old: "before", next: "after", path: "", open: true }]);
  try {
    assert.equal(view.all(0, (node) => hasClass(node, "oc-file-badge")).length, 0);
    assert.deepEqual(lines(view.body()!), ["-before", "+after"]);
    assert.equal(view.preview().length, 0);
  } finally { await view.close(); }
});

test("failed Edit keeps hover, navigation and a separate error disclosure", async () => {
  const view = await fixture([{ old: "before", next: "after", isError: true, result: "Permission denied" }]);
  try {
    await view.hover(); assert.equal(view.preview().length, 1, "failed Edit still previews its selected sides");
    let stopped = 0;
    await view.event(view.badge(), "onClick", { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 1); assert.deepEqual(view.opened, [path]);
    assert.equal(view.header().props["aria-expanded"], false);
    const errorHead = () => view.all(0, (node) => hasClass(node, "oc-tool-head"))[1]!;
    assert.equal(errorHead().props["aria-expanded"], false);
    await view.event(errorHead(), "onClick");
    assert.equal(errorHead().props["aria-expanded"], true);
    assert.equal(view.all(0, (node) => hasClass(node, "oc-tool-content") && text(node) === "Permission denied").length, 1);
    assert.deepEqual(lines(view.preview()[0]!), ["-before", "+after"]);
    await view.event(view.header(), "onClick");
    assert.equal(errorHead().props["aria-expanded"], true);
    assert.deepEqual(view.counts(), ["11"]);
  } finally { await view.close(); }
});

test("Edit hover cancels short entry, bridges pointer leave and closes on Escape", async () => {
  const view = await fixture([{ old: "before", next: "after" }]);
  try {
    await view.event(view.badge(), "onPointerEnter", { pointerType: "mouse" }); await view.tick(149);
    await view.event(view.badge(), "onPointerLeave"); await view.tick(1000); assert.equal(view.preview().length, 0);
    await view.hover(); assert.equal(view.preview().length, 1, "hover opens after cancelled entry");
    await view.event(view.badge(), "onPointerLeave"); await view.tick(99);
    await view.event(view.preview()[0]!, "onPointerEnter"); await view.tick(1000); assert.equal(view.preview().length, 1);
    await view.event(view.preview()[0]!, "onPointerLeave"); await view.tick(99); assert.equal(view.preview().length, 1);
    await view.tick(1); assert.equal(view.preview().length, 0);
    await view.hover(); await view.escape(); assert.equal(view.preview().length, 0);
  } finally { await view.close(); }
});

test("Edit focus and touch stay closed, rows stay independent and unmount clears timers", async () => {
  const view = await fixture([{ old: "first", next: "one" }, { old: "second", next: "two", path: "/repo/second.ts" }]);
  try {
    await view.event(view.badge(), "onFocus"); await view.tick(1000); assert.equal(view.preview().length, 0);
    await view.event(view.badge(), "onPointerEnter", { pointerType: "touch" }); await view.tick(1000); assert.equal(view.preview().length, 0);
    await view.hover(0); assert.equal(view.preview(0).length, 1, "first Edit opens independently");
    assert.equal(view.preview(1).length, 0);
    await view.hover(1); assert.equal(view.preview(1).length, 1);
    assert.deepEqual(lines(view.preview(0)[0]!), ["-first", "+one"]);
    assert.deepEqual(lines(view.preview(1)[0]!), ["-second", "+two"]);
    await view.event(view.badge(0), "onPointerLeave"); await view.tick(100);
    assert.equal(view.preview(0).length, 0); assert.equal(view.preview(1).length, 1);
    await view.event(view.badge(0), "onPointerEnter", { pointerType: "mouse" });
  } finally { await view.close(); }
});

test("ordinary Read with Edit-shaped raw fields does not acquire an Edit hover", async () => {
  const view = await fixture([{ name: "Read", old: "before", next: "after" }]);
  try {
    await view.hover(); assert.equal(view.preview().length, 0);
    assert.deepEqual(view.counts(), []);
  } finally { await view.close(); }
});
