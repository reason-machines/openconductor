import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { highlight, Markdown } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";

// Prepared source only. Run only under a separate canonical runtime admission.
// Full production ConductorToolRow -> Row -> MoreRows -> SubagentRow and the
// unchanged Markdown pipeline execute. No mock supplies missing workspace props.
// Backend/clipboard/menu-portal adapters do not prove OS or native behavior.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
type Options = {
  name?: "Task" | "Agent";
  type?: string;
  workspacePath?: string;
  withoutWorkspace?: boolean;
  withoutCallback?: boolean;
  rawResult?: unknown;
  open?: boolean;
};
const textOf = (node: Node | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");
function compile(file: string): string {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
  return output.outputText;
}
const rowCode = compile("./ToolRows.tsx"), linkCode = compile("./LinkMenu.tsx");

async function fixture(initialText: string, initial: Options = {}) {
  const files: Array<[string, string]> = [], external: string[] = [], copies: string[] = [], linkCopies: string[] = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  let text = initialText, options = initial, callbackTag = "first", toggles = 0;
  const links: Partial<typeof import("./LinkMenu.tsx")> = {};
  runInNewContext(linkCode, {
    exports: links,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "../openIn/apps.ts": return { copyText: async (value: string) => { linkCopies.push(value); } };
        case "../../components/menu/ContextMenu": return {
          ContextMenu: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { role: "menu" }, children),
          MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect: () => void }) =>
            React.createElement("button", { role: "menuitem", onClick: onSelect }, children),
        };
        case "../../components/menu/menuIcons": return { CopyIcon: () => null };
        default: throw new Error(`Unexpected LinkMenu dependency ${name}`);
      }
    },
  }, { filename: "LinkMenu.tsx" });
  const rows: Partial<typeof import("./ToolRows.tsx")> = {};
  runInNewContext(rowCode, {
    exports: rows,
    navigator: { clipboard: { writeText: async (value: string) => { copies.push(value); } } },
    setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() { throw new Error("Unexpected copy timer cancellation"); },
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./markdown.ts": return { Markdown, highlight };
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./LinkMenu.tsx": return links;
        case "../../backend.ts": return { openUrl: async (value: string) => { external.push(value); } };
        default: throw new Error(`Unexpected ToolRows dependency ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.ok(rows.ConductorToolRow);
  const Row = rows.ConductorToolRow;
  function Scene() {
    const [open, setOpen] = React.useState(options.open ?? true);
    const tag = callbackTag;
    const props: ToolRowProps = {
      tool: { name: options.name ?? "Task", input: { subagent_type: options.type ?? "Explore", description: "Inspect files" } },
      status: "done", isError: false, open, result: text, rawResult: options.rawResult,
      workspacePath: options.withoutWorkspace ? undefined : options.workspacePath ?? "/workspace",
      onOpenFile: options.withoutCallback ? undefined : (path) => { files.push([tag, path]); },
      onToggle: () => { toggles++; setOpen((value) => !value); },
    };
    return React.createElement(Row, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const withClass = (name: string) => all((node) => String(node.props.className ?? "").split(" ").includes(name));
  async function event(node: Node, name: string, payload: Record<string, unknown> = {}) {
    assert.equal(typeof node.props[name], "function", `Production ${name} callback exists`);
    await act(async () => { await (node.props[name] as (event: Record<string, unknown>) => unknown)(payload); });
  }
  return {
    all, withClass, files, external, copies, linkCopies, timers, event,
    get toggles() { return toggles; },
    fileButtons: () => withClass("md-file-link"),
    async openFile(expected: string) {
      const matches = this.fileButtons().filter((node) => node.props.title === `Open ${expected}`);
      assert.equal(matches.length, 1, "TYPED_SUBAGENT_MUST_FORWARD_WORKSPACE_FILE_CONTEXT");
      await event(matches[0]!, "onClick");
    },
    async tab(label: "Raw" | "Formatted") {
      const tabs = withClass("oc-subagent-tab").filter((node) => textOf(node) === label);
      assert.equal(tabs.length, 1);
      await event(tabs[0]!, "onClick");
    },
    async toggle() {
      const heads = all((node) => String(node.props.className ?? "").startsWith("oc-tool-head"));
      assert.equal(heads.length, 1);
      await event(heads[0]!, "onClick");
    },
    async update(nextText: string, nextOptions = options, nextTag = callbackTag) {
      text = nextText; options = nextOptions; callbackTag = nextTag;
      await act(async () => { renderer.update(React.createElement(Scene)); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const positives = [
  { name: "Task", text: "Inspect `src/a.ts`.", expected: "/workspace/src/a.ts" },
  { name: "Agent", text: "Inspect `./src/a.ts:12:4`.", expected: "/workspace/src/a.ts" },
  { name: "Task", text: "Inspect src/a.ts next.", expected: "/workspace/src/a.ts" },
  { name: "Agent", text: "Inspect `/workspace/src/a.ts`.", expected: "/workspace/src/a.ts" },
] as const;
for (const item of positives) {
  test(`typed ${item.name} formatted result forwards ${item.text}`, async () => {
    const f = await fixture(item.text, { name: item.name });
    try {
      await f.openFile(item.expected);
      assert.deepEqual(f.files, [["first", item.expected]]);
      assert.deepEqual(f.external, []);
      assert.equal(f.toggles, 0);
    } finally { await f.close(); }
  });
}

test("typed structured result, not flattened fallback, supplies formatted file content", async () => {
  const f = await fixture("Inspect `src/wrong.ts`.", { rawResult: [{ type: "text", text: "Inspect `src/right.ts`." }] });
  try {
    await f.openFile("/workspace/src/right.ts");
    assert.deepEqual(f.files, [["first", "/workspace/src/right.ts"]]);
    assert.equal(f.fileButtons().some((node) => node.props.title === "Open /workspace/src/wrong.ts"), false);
  } finally { await f.close(); }
});

test("workspace and callback updates do not retain an old destination", async () => {
  const f = await fixture("Inspect `src/a.ts`.");
  try {
    await f.openFile("/workspace/src/a.ts");
    await f.update("Inspect `src/b.ts`.", { workspacePath: "/second" }, "second");
    await f.openFile("/second/src/b.ts");
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"], ["second", "/second/src/b.ts"]]);
    assert.deepEqual(f.external, []);
  } finally { await f.close(); }
});

test("returning from Raw and reopening keeps current formatted file context", async () => {
  const f = await fixture("Inspect `src/a.ts`.");
  try {
    await f.tab("Raw");
    assert.equal(f.fileButtons().length, 0);
    await f.tab("Formatted");
    await f.toggle();
    assert.equal(f.fileButtons().length, 0);
    await f.toggle();
    await f.openFile("/workspace/src/a.ts");
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"]]);
    assert.equal(f.toggles, 2);
  } finally { await f.close(); }
});

test("existing lexical guard rejects escape, root, sibling-prefix and URI-shaped code", async () => {
  const text = "`../outside.ts` `/workspace` `/workspace-other/a.ts` `file:///workspace/a.ts` `conductor-file:///workspace/a.ts` `javascript:alert(1)`";
  const f = await fixture(text);
  try {
    assert.equal(f.fileButtons().length, 0);
    assert.deepEqual(f.files, []);
    assert.deepEqual(f.external, []);
  } finally { await f.close(); }
});

test("missing workspace does not synthesize a file root", async () => {
  const f = await fixture("Inspect `src/a.ts`.", { withoutWorkspace: true });
  try {
    assert.equal(f.fileButtons().length, 0);
    assert.deepEqual(f.files, []);
  } finally { await f.close(); }
});

test("missing file callback produces no navigation side effect", async () => {
  const f = await fixture("Inspect `src/a.ts`.", { withoutCallback: true });
  try {
    // Preserve existing renderer behavior: workspace alone may draw a button.
    // This case deliberately does not assert presence or absence of that button.
    for (const button of f.fileButtons()) await f.event(button, "onClick");
    assert.deepEqual(f.files, []);
    assert.deepEqual(f.external, []);
  } finally { await f.close(); }
});

test("Raw and result-copy retain exact result text, without file dispatch", async () => {
  const text = "  Inspect `src/a.ts`.\n\n";
  const f = await fixture(text);
  try {
    await f.tab("Raw");
    const raw = f.withClass("oc-subagent-raw");
    assert.equal(raw.length, 1);
    assert.equal(textOf(raw[0]!), text);
    assert.equal(f.fileButtons().length, 0);
    const copy = f.all((node) => node.type === "button" && node.props["aria-label"] === "Copy");
    assert.equal(copy.length, 1);
    await f.event(copy[0]!, "onClick", { stopPropagation() {} });
    assert.deepEqual(f.copies, [text]);
    assert.deepEqual(f.files, []);
  } finally { await f.close(); }
});

test("existing external link opener and Copy link address menu remain independent", async () => {
  const href = "https://example.test/a?q=one&b=two#end";
  const f = await fixture(`[Reference](${href})`);
  try {
    const anchors = f.all((node) => node.type === "a");
    assert.equal(anchors.length, 1);
    let prevented = 0;
    await f.event(anchors[0]!, "onClick", { preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
    assert.deepEqual(f.external, [href]);
    await f.event(anchors[0]!, "onContextMenu", { clientX: 10, clientY: 20, preventDefault() {} });
    const items = f.all((node) => node.props.role === "menuitem");
    assert.equal(items.length, 1);
    assert.equal(textOf(items[0]!), "Copy link address");
    await f.event(items[0]!, "onClick");
    assert.deepEqual(f.linkCopies, [href]);
    assert.deepEqual(f.files, []);
  } finally { await f.close(); }
});

for (const type of ["", "general-purpose"]) {
  test(`untyped or generic subagent ${JSON.stringify(type)} stays outside typed result UI`, async () => {
    const f = await fixture("Inspect `src/a.ts`.", { type });
    try {
      assert.equal(f.withClass("oc-subagent-result").length, 0);
      assert.equal(f.fileButtons().length, 0);
      assert.deepEqual(f.files, []);
    } finally { await f.close(); }
  });
}
