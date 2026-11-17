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
type Case = { id: string; input: Record<string, unknown>; output?: string; rawResult?: unknown; error?: boolean; opens: boolean; shown?: string };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => name.split(" ").every(part => String(node.props.className).split(" ").includes(part));
const input = { title: "Inspect values" };
const cases: Case[] = [
  { id: "null-without-input", input: {}, output: "Flattened stale answer", rawResult: null, opens: false },
  { id: "false-without-input", input: {}, output: "Flattened stale answer", rawResult: false, opens: false },
  { id: "zero-without-input", input: {}, output: "Flattened stale answer", rawResult: 0, opens: false },
  { id: "empty-string-without-input", input: {}, output: "Flattened stale answer", rawResult: "", opens: false },
  { id: "null-with-input", input, output: "Flattened stale answer", rawResult: null, opens: true },
  { id: "false-with-input", input, output: "Flattened stale answer", rawResult: false, opens: true },
  { id: "zero-with-input", input, output: "Flattened stale answer", rawResult: 0, opens: true },
  { id: "empty-string-with-input", input, output: "Flattened stale answer", rawResult: "", opens: true },
  { id: "legacy-empty-without-input", input: {}, output: "", opens: false },
  { id: "legacy-empty-with-input", input, output: "", opens: true },
  { id: "pending-without-input", input: {}, opens: false },
  { id: "pending-with-input", input, opens: true },
  { id: "legacy-success", input: {}, output: "Legacy\nanswer", opens: true, shown: "Legacy\nanswer" },
  { id: "legacy-failure", input, output: "Legacy failure", error: true, opens: true, shown: "Legacy failure" },
  { id: "verbatim-raw-string", input, output: "Normalized answer", rawResult: "Original\nanswer", opens: true, shown: "Original\nanswer" },
  { id: "structured-object", input, output: "Summary only", rawResult: { text: "Summary", metadata: 7 }, opens: true, shown: "{\n  \"text\": \"Summary\",\n  \"metadata\": 7\n}" },
  { id: "structured-array", input, output: "Summary only", rawResult: [{ type: "text", text: "Summary", extra: 7 }], opens: true, shown: "[\n  {\n    \"type\": \"text\",\n    \"text\": \"Summary\",\n    \"extra\": 7\n  }\n]" },
  { id: "empty-array", input: {}, output: "", rawResult: [], opens: true, shown: "[]" },
  { id: "empty-object", input: {}, output: "", rawResult: {}, opens: true, shown: "{}" },
  { id: "true", input: {}, output: "Normalized answer", rawResult: true, opens: true, shown: "true" },
  { id: "string-zero", input: {}, output: "Normalized answer", rawResult: "0", opens: true, shown: "0" },
  { id: "string-false", input: {}, output: "Normalized answer", rawResult: "false", opens: true, shown: "false" },
  { id: "long-raw-string", input, output: "Normalized answer", rawResult: "x".repeat(100_005), opens: true, shown: "x".repeat(100_005) },
  { id: "raw-error-string", input, output: "Normalized failure", rawResult: "Original failure", error: true, opens: true, shown: "Original failure" },
];
assert.equal(cases.length, 24);
const unrelated = () => { throw new Error("Unrelated Node REPL dependency executed"); };
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);

for (const entry of cases) test(`Node REPL result truthiness: ${entry.id}`, async () => {
  const production: Record<string, unknown> = {};
  runInNewContext(compiled.outputText, {
    exports: production,
    require(module: string) {
      switch (module) {
        case "react": case "react/jsx-runtime": return dependencies(module);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { Markdown: unrelated, highlight: unrelated };
        case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
        case "../../backend.ts": return { openUrl: unrelated };
        default: throw new Error(`Unexpected ToolRows dependency: ${module}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.equal(typeof production.ConductorToolRow, "function");
  const at = new Date(0), chatId = `node-repl-truthiness:${entry.id}`, name = "mcp__node_repl__js";
  const started = startTurn(reasonChat(chatId), "Inspect values", at);
  const pending = entry.output === undefined;
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: entry.id, title: name, kind: "other", toolName: name, rawInput: entry.input,
    status: pending ? "running" : entry.error ? "failed" : "completed", output: entry.output ?? null,
    ...(entry.rawResult !== undefined ? { rawResult: entry.rawResult } : {}), diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find(row => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find(part => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  const call = part.call;
  assert.equal(call.id, entry.id); assert.deepEqual(call.tool, { name, input: entry.input });
  assert.equal(call.result, entry.output); assert.deepEqual(call.rawResult, entry.rawResult);
  assert.equal(tools.toolKind(call.tool.name), "node-repl-js");
  let toggles = 0;
  function Scene() {
    const [open, setOpen] = React.useState(false);
    const props: ToolRowProps = { tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
      isError: call.status === "error", open, onToggle: () => { toggles++; setOpen((value: boolean) => !value); } };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (name: string): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && hasClass(node, name));
  const one = (name: string): Node => { const nodes = all(name); assert.equal(nodes.length, 1, name); assert.ok(nodes[0]); return nodes[0]; };
  async function click() {
    const fn = one("oc-tool-head").props.onClick; assert.equal(typeof fn, "function", "Production header handler exists");
    if (typeof fn === "function") await act(async () => fn());
  }
  function body() {
    assert.equal(all("oc-io").length, 1);
    const pres = all("oc-io-pre");
    const expected = [...(Object.keys(entry.input).length ? [JSON.stringify(entry.input, null, 2)] : []), ...(entry.shown ? [entry.shown.slice(0, 100_000)] : [])];
    assert.deepEqual(pres.map(text), expected, `NODE_REPL_OUTPUT_${entry.id}`);
    const labels = [...(Object.keys(entry.input).length ? ["Input:"] : []), ...(Object.keys(entry.input).length && entry.shown ? [entry.error ? "Error:" : "Output:"] : [])];
    assert.deepEqual(all("oc-io-label").map(text), labels);
    assert.equal(all("oc-io-pre error").length, entry.error && entry.shown ? 1 : 0);
    assert.deepEqual(all("oc-io-truncated").map(text), entry.shown && entry.shown.length > 100_000 ? [`Content truncated (${entry.shown.length.toLocaleString()} chars total)`] : []);
  }
  try {
    assert.equal(one("oc-tool").props["data-status"], pending ? "running" : entry.error ? "error" : "done");
    assert.equal(text(one("oc-tool-left")), "Node REPL");
    assert.deepEqual(all("oc-error-chip"), []);
    assert.equal(all("oc-tool-content").length, 0);
    assert.equal(one("oc-tool-head").props["aria-expanded"], entry.opens ? false : undefined, `NODE_REPL_DISCLOSURE_${entry.id}`);
    assert.equal(one("oc-tool-head").props.role, entry.opens ? "button" : undefined);
    assert.equal(all("oc-tool-icon-swap").length, entry.opens ? 1 : 0);
    if (entry.opens) {
      await click(); assert.equal(one("oc-tool-head").props["aria-expanded"], true); body();
      await click(); assert.equal(all("oc-tool-content").length, 0);
      await click(); body();
      await click(); assert.equal(toggles, 4); assert.equal(all("oc-tool-content").length, 0);
    } else {
      assert.equal(one("oc-tool-head").props.onClick, undefined); assert.equal(toggles, 0);
    }
    assert.equal(renderer.root.findAll((node: Node) => node.type === "script" || node.type === "img" || "dangerouslySetInnerHTML" in node.props).length, 0);
    assert.equal(call.result, entry.output); assert.deepEqual(call.rawResult, entry.rawResult);
  } finally { await act(async () => renderer.unmount()); }
});
