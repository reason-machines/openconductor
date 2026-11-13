import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import fixtures from "./readErrorResult.inputs.json" with { type: "json" };
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { highlight } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Input = (typeof fixtures.cases)[number];
type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<Node | string>;
  findAll: (predicate: (node: Node) => boolean) => Node[];
};
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const all = (root: Node, name: string): Node[] => root.findAll((node) => typeof node.type === "string" && hasClass(node, name));
function one(root: Node, name: string): Node {
  const matches = all(root, name);
  assert.equal(matches.length, 1, name);
  const match = matches[0];
  assert.ok(match);
  return match;
}
const unrelated = () => { throw new Error("Unrelated Read error dependency executed"); };
const production: Record<string, unknown> = {};
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((diagnostic: { category: number }) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
runInNewContext(compiled.outputText, {
  exports: production,
  require(name: string) {
    switch (name) {
      case "react": case "react/jsx-runtime": return dependencies(name);
      case "./conductorTools.ts": return tools;
      case "./toolIconData.ts": return icons;
      case "./thinkingChip.ts": return { thinkingChipText };
      case "./markdown.ts": return { highlight, Markdown: unrelated };
      case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
      case "../../backend.ts": return { openUrl: unrelated };
      default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
    }
  },
}, { filename: "ToolRows.tsx" });
assert.ok(typeof production.ConductorToolRow === "function");

function normalizedRead(input: Input, name: "Read" | "NotebookRead" = "Read", structuredResult?: unknown) {
  const chatId = `read-error:${input.id}:${name}`;
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Read the file", at);
  const output = "output" in input ? input.output : undefined;
  const rawInput = { file_path: input.path, offset: input.offset };
  const rawResult = structuredResult === undefined ? output : structuredResult;
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: input.id, title: "Read file", kind: "read", toolName: name,
    rawInput, status: input.state === "running" ? "running" : input.state === "error" ? "failed" : "completed",
    output: output ?? null, ...(rawResult !== undefined ? { rawResult } : {}), diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.deepEqual(part.call.tool, { name, input: rawInput });
  assert.equal(part.call.status, input.state);
  assert.equal(part.call.result, output);
  assert.deepEqual(part.call.rawResult, rawResult);
  return part.call;
}

async function fixture(call: ReturnType<typeof normalizedRead>) {
  let toggles = 0;
  const opened: string[] = [];
  function Scene() {
    const [open, setOpen] = React.useState(false);
    const props: ToolRowProps = {
      tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
      isError: call.status === "error", open,
      onToggle: () => { toggles++; setOpen((value: boolean) => !value); },
      onOpenFile: (path) => { opened.push(path); },
    };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const row = one(renderer.root, "oc-tool");
  return {
    row, opened,
    header: () => one(row, "oc-tool-head"),
    label: () => text(one(row, "oc-tool-left")),
    lines: () => all(row, "oc-code-line").map((line) => {
      const value = line.children[1];
      assert.ok(value !== undefined);
      return { number: text(one(line, "oc-code-ln")), text: text(value) };
    }),
    toggles: () => toggles,
    async toggle() {
      const handler = this.header().props.onClick;
      assert.equal(typeof handler, "function");
      if (typeof handler === "function") await act(async () => { handler(); });
    },
    async openFile() {
      const badge = one(row, "oc-file-badge");
      assert.equal(badge.props.title, call.tool.input.file_path);
      const handler = badge.props.onClick;
      assert.ok(typeof handler === "function");
      let stopped = false;
      await act(async () => { handler({ stopPropagation: () => { stopped = true; } }); });
      assert.equal(stopped, true);
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const input of fixtures.cases) {
  test(`Read error result: ${input.id}`, async () => {
    const call = normalizedRead(input);
    const view = await fixture(call);
    try {
      assert.equal(view.row.props["data-status"], input.state);
      assert.equal(view.label(), input.expected.label, `READ_ERROR_LABEL_${input.id}`);
      assert.equal(all(view.row, "oc-tool-content").length, 0);
      assert.equal(typeof view.header().props.onClick === "function", input.expected.expandable, `READ_ERROR_DISCLOSURE_${input.id}`);
      assert.equal(view.header().props.role, input.expected.expandable ? "button" : undefined);
      assert.equal(view.header().props["aria-expanded"], input.expected.expandable ? false : undefined);
      assert.equal(hasClass(view.header(), "opens"), input.expected.expandable);
      await view.openFile();
      assert.deepEqual(view.opened, [input.path]);
      assert.equal(view.toggles(), 0);
      if (input.expected.expandable) {
        await view.toggle();
        assert.equal(view.header().props["aria-expanded"], true);
        assert.deepEqual(view.lines(), input.expected.lines);
        assert.equal(view.row.findAll((node) => node.type === "img" || node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
        await view.openFile();
        assert.deepEqual(view.opened, [input.path, input.path]);
        assert.equal(view.header().props["aria-expanded"], true);
        assert.equal(view.toggles(), 1);
        await view.toggle();
        assert.equal(view.header().props["aria-expanded"], false);
        assert.equal(all(view.row, "oc-tool-content").length, 0);
        await view.toggle();
        assert.deepEqual(view.lines(), input.expected.lines);
        await view.toggle();
      } else {
        assert.deepEqual(view.lines(), []);
      }
      assert.equal(view.toggles(), input.expected.expandable ? 4 : 0);
      assert.equal(all(view.row, "oc-error-chip").length, 0);
      assert.equal(all(view.row, "oc-tool-content").length, 0);
      assert.equal(view.row.findAll((node) => node.type === "img" || node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
      assert.equal(call.result, "output" in input ? input.output : undefined);
    } finally { await view.close(); }
    if (input.id === "failed-permission") {
      const notebook = await fixture(normalizedRead(input, "NotebookRead"));
      try {
        assert.equal(notebook.row.props["data-status"], "error");
        assert.equal(notebook.label(), "Reading", "NotebookRead stays outside this exact-Read correction");
        assert.equal(notebook.header().props.onClick, undefined);
        assert.deepEqual(notebook.lines(), []);
      } finally { await notebook.close(); }
      const rawResult = { content: [{ type: "text", text: "raw sentinel must not replace the flattened result" }] };
      const structured = await fixture(normalizedRead(input, "Read", rawResult));
      try {
        assert.equal(structured.label(), "Read 1 lines");
        await structured.toggle();
        assert.deepEqual(structured.lines(), [{ number: "7", text: "Permission denied" }]);
      } finally { await structured.close(); }
    }
  });
}
