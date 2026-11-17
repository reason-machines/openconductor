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
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
type LabelCase = { id: string; name: string; input: Record<string, unknown>; output: string; expected_label: string };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isLabelCase(value: unknown): value is LabelCase {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string"
    && isRecord(value.input) && typeof value.output === "string" && typeof value.expected_label === "string";
}
function normalizedTool(entry: LabelCase) {
  const chatId = "workspace:claude";
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Check the tool output", at);
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: "ordinary-generic-tool", title: entry.name, kind: "other",
    toolName: entry.name, rawInput: entry.input, status: "completed", output: entry.output,
    diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.deepEqual(part.call.tool, { name: entry.name, input: entry.input });
  assert.equal(part.call.result, entry.output);
  assert.equal(part.call.status, "done");
  return part.call;
}
async function fixture(entry: LabelCase) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
  const unrelated = () => { throw new Error("Unrelated generic-title dependency executed"); };
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { highlight: unrelated, Markdown: unrelated };
        case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
        case "../../backend.ts": return { openUrl: unrelated };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  const call = normalizedTool(entry);
  function Scene() {
    const [open, setOpen] = React.useState(false);
    const props: ToolRowProps = {
      tool: call.tool, status: call.status, result: call.result, isError: false,
      open, onToggle: () => setOpen((value: boolean) => !value),
    };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (predicate: (node: Node) => boolean): Node => {
    const found = all(predicate); assert.equal(found.length, 1); return found[0]!;
  };
  return {
    all,
    header: () => one((node) => hasClass(node, "oc-tool-head")),
    label: () => one((node) => hasClass(node, "oc-tool-left")),
    bodies: () => all((node) => hasClass(node, "oc-tool-content")),
    async toggle() {
      const callback = this.header().props.onClick;
      assert.equal(typeof callback, "function");
      if (typeof callback === "function") await act(async () => { callback(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
const declared: unknown = JSON.parse(readFileSync(new URL("./genericToolLabels.inputs.json", import.meta.url), "utf8"));
assert.ok(isRecord(declared) && Array.isArray(declared.cases));
const cases = declared.cases.map((entry: unknown) => { assert.ok(isLabelCase(entry)); return entry; });
for (const entry of cases) {
  test(`generic tool title matches shipped literal: ${entry.id}`, async () => {
    const view = await fixture(entry);
    try {
      assert.equal(text(view.label()), entry.expected_label);
      assert.equal(view.header().props["aria-expanded"], false);
      assert.deepEqual(view.bodies(), []);
      await view.toggle();
      assert.equal(view.header().props["aria-expanded"], true);
      assert.equal(text(view.label()), entry.expected_label);
      const body = view.bodies();
      assert.equal(body.length, 1);
      const hasInput = Object.keys(entry.input).length > 0;
      const prefix = entry.name.startsWith("mcp__") ? `Tool: ${entry.name}` : "";
      const input = hasInput ? `Input:${JSON.stringify(entry.input, null, 2)}Output:` : "";
      assert.equal(text(body[0]!), `${prefix}${input}${entry.output}`);
      await view.toggle();
      assert.equal(view.header().props["aria-expanded"], false);
      assert.deepEqual(view.bodies(), []);
      assert.equal(text(view.label()), entry.expected_label);
    } finally { await view.close(); }
  });
}
