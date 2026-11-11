import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";

// Mount the production row and its real React hooks, as multiEditHover.test.ts
// does. Only the unrelated Markdown leaf is excluded; no row is mocked.
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string> };
type Row = { tool: tools.ConductorTool; open?: boolean; isError?: boolean; result?: string };
const path = "/repo/src/written.ts";
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const write = (content: string, options: Omit<Row, "tool"> = {}): Row => ({
  tool: { name: "Write", input: { file_path: path, content } }, ...options,
});

async function fixture(rows: Row[]) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    exports: production, setTimeout, clearTimeout,
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
  const opened: string[] = [];
  function Scene() {
    const [open, setOpen] = React.useState(rows.map((row) => row.open ?? true));
    return React.createElement(React.Fragment, null, ...rows.map((row, index) => {
      const props: ToolRowProps = {
        tool: row.tool, status: "done", result: row.result, isError: row.isError ?? false,
        open: open[index], onToggle: () => setOpen((previous: boolean[]) => previous.map((value, i) => i === index ? !value : value)),
        onOpenFile: (value) => opened.push(value),
      };
      return React.createElement("section", { key: index, "data-write-fixture-row": index }, React.createElement(production.ConductorToolRow, props));
    }));
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (index: number, predicate: (node: Node) => boolean): Node[] =>
    renderer.root.findByProps({ "data-write-fixture-row": index }).findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (index: number, predicate: (node: Node) => boolean): Node => {
    const found = all(index, predicate);
    assert.equal(found.length, 1, "one production control exists");
    return found[0]!;
  };
  return {
    opened, all, one,
    header: (index = 0) => all(index, (node) => hasClass(node, "oc-tool-head"))[0]!,
    buttons: (index = 0) => all(index, (node) => node.type === "button" && /^(Show more|Show less)$/.test(text(node))),
    button: (label: string, index = 0) => one(index, (node) => node.type === "button" && text(node) === label),
    label: (index = 0) => text(one(index, (node) => hasClass(node, "oc-tool-left"))),
    body: (index = 0) => all(index, (node) => hasClass(node, "oc-code-line") && hasClass(node, "add"))
      .map((line) => text(line.children[line.children.length - 1]!)).join("\n"),
    content: (index = 0) => text(renderer.root.findByProps({ "data-write-fixture-row": index })),
    async click(node: Node, payload: Record<string, unknown> = {}) {
      const handler = node.props.onClick;
      assert.equal(typeof handler, "function", "production control is clickable");
      if (typeof handler === "function") await act(async () => { handler(payload); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const size of [0, 1999, 2000, 2001]) {
  test(`Write ${size} UTF-16 units initially shows at most 2000, with controls only above the limit`, async () => {
    const content = "x".repeat(size);
    const view = await fixture([write(content)]);
    try {
      assert.equal(view.body(), "x".repeat(Math.min(size, 2000)), "initial body is the exact 2000-unit prefix");
      assert.equal(view.label(), "Write 1 lines");
      assert.equal(view.buttons().length, size > 2000 ? 1 : 0);
      assert.equal(view.content().includes("Showing first 2,000 characters"), size > 2000);
      if (size > 2000) assert.equal(text(view.button("Show more")), "Show more");
    } finally { await view.close(); }
  });
}

test("Write Show more reveals the full raw body and Show less restores the initial prefix", async () => {
  const content = "+ first\n- second\n<script>literal & safe</script>\n" + "x".repeat(2000) + "\ntail";
  const view = await fixture([write(content)]);
  try {
    assert.equal(view.body(), content.substring(0, 2000));
    assert.equal(view.all(0, (node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
    await view.click(view.button("Show more"));
    assert.equal(view.body(), content);
    assert.ok(view.content().includes("Showing full content"));
    assert.equal(view.buttons().length, 1);
    await view.click(view.button("Show less"));
    assert.equal(view.body(), content.substring(0, 2000));
    assert.ok(view.content().includes("Showing first 2,000 characters"));
    assert.equal(view.buttons().length, 1);
  } finally { await view.close(); }
});

test("Write line count always uses the complete original input, including hidden and trailing lines", async () => {
  const content = "x".repeat(2000) + "\na\nb\n";
  const view = await fixture([write(content)]);
  try {
    assert.equal(view.label(), "Write 4 lines");
    assert.equal(view.body(), "x".repeat(2000));
    await view.click(view.button("Show more"));
    assert.equal(view.label(), "Write 4 lines");
    assert.equal(view.body(), content);
    await view.click(view.button("Show less"));
    assert.equal(view.label(), "Write 4 lines");
  } finally { await view.close(); }
});

test("Write preserves literal plus/minus markers instead of treating them as diff prefixes", async () => {
  const content = "+ literal plus\n- literal minus\n++double\n--double\n";
  const view = await fixture([write(content)]);
  try {
    assert.equal(view.body(), content);
    assert.equal(view.label(), "Write 5 lines");
    assert.equal(view.buttons().length, 0);
  } finally { await view.close(); }
});

test("Write disclosure slices UTF-16 units, including an astral character crossing unit 2000", async () => {
  const content = "x".repeat(1999) + "\u{1f680}" + "z";
  const view = await fixture([write(content)]);
  try {
    assert.equal(view.body(), "x".repeat(1999) + "\ud83d");
    assert.equal(view.body().length, 2000);
    await view.click(view.button("Show more"));
    assert.equal(view.body(), content);
    await view.click(view.button("Show less"));
    assert.equal(view.body(), "x".repeat(1999) + "\ud83d");
  } finally { await view.close(); }
});

test("Write expansion is row-local and survives closing and reopening its outer shell", async () => {
  const first = "a".repeat(2001), second = "b".repeat(2002);
  const view = await fixture([write(first), write(second)]);
  try {
    await view.click(view.button("Show more", 0));
    assert.equal(view.body(0), first);
    assert.equal(view.body(1), "b".repeat(2000));
    assert.equal(text(view.button("Show more", 1)), "Show more");
    await view.click(view.header(0));
    assert.equal(view.header(0).props["aria-expanded"], false);
    assert.equal(view.body(0), "");
    assert.equal(view.buttons(0).length, 0);
    await view.click(view.header(0));
    assert.equal(view.header(0).props["aria-expanded"], true);
    assert.equal(view.body(0), first);
    await view.click(view.button("Show more", 1));
    await view.click(view.button("Show less", 0));
    assert.equal(view.body(0), "a".repeat(2000));
    assert.equal(view.body(1), second);
  } finally { await view.close(); }
});

test("Write starts collapsed when requested and keeps badge navigation without an immediate preview", async () => {
  const view = await fixture([write("x".repeat(2001), { open: false })]);
  try {
    assert.equal(view.header().props["aria-expanded"], false);
    assert.equal(view.buttons().length, 0);
    assert.equal(view.body(), "");
    const badge = view.one(0, (node) => node.type === "button" && hasClass(node, "oc-file-badge"));
    assert.equal(badge.props.title, path);
    let stopped = 0;
    await view.click(badge, { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 1); assert.deepEqual(view.opened, [path]);
    assert.equal(view.header().props["aria-expanded"], false);
    assert.equal(view.all(0, (node) => node.props["aria-label"] === "File change preview").length, 0);
    await view.click(view.header());
    assert.equal(view.body(), "x".repeat(2000));
    assert.equal(view.all(0, (node) => node.props.role === "region").length, 0);
  } finally { await view.close(); }
});

test("failed Write retains an independent expandable error without losing disclosure state", async () => {
  const content = "x".repeat(2001);
  const view = await fixture([write(content, { isError: true, result: "Permission denied" })]);
  try {
    const errorHead = () => view.all(0, (node) => hasClass(node, "oc-tool-head"))[1]!;
    assert.equal(errorHead().props["aria-expanded"], false);
    await view.click(errorHead());
    assert.equal(errorHead().props["aria-expanded"], true);
    assert.ok(view.content().includes("Permission denied"));
    await view.click(view.button("Show more"));
    assert.equal(errorHead().props["aria-expanded"], true);
    assert.equal(view.body(), content);
    await view.click(view.header());
    assert.equal(errorHead().props["aria-expanded"], true);
    await view.click(view.header());
    assert.equal(view.body(), content);
    await view.click(errorHead());
    assert.equal(errorHead().props["aria-expanded"], false);
  } finally { await view.close(); }
});

test("Read, Edit and MultiEdit keep their own body contracts without Write disclosure controls", async () => {
  const view = await fixture([
    { tool: { name: "Read", input: { file_path: path } }, result: "read body" },
    { tool: { name: "Edit", input: { file_path: path, old_string: "- old", new_string: "+ new" } } },
    { tool: { name: "MultiEdit", input: { file_path: path, edits: [{ old_string: "- before", new_string: "+ after" }] } } },
  ]);
  try {
    for (const index of [0, 1, 2]) assert.equal(view.buttons(index).length, 0);
    assert.ok(view.content(0).includes("read body"));
    assert.equal(view.body(1), "new");
    const edit = view.one(2, (node) => node.props["aria-label"] === "Edit 1");
    assert.equal(edit.props["aria-expanded"], false);
    await view.click(edit);
    assert.equal(view.body(2), "after");
    await view.click(view.header(2)); await view.click(view.header(2));
    assert.equal(view.body(2), "after");
    for (const index of [0, 1, 2]) assert.equal(view.buttons(index).length, 0);
  } finally { await view.close(); }
});
