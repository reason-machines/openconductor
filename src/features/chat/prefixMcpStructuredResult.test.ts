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
type Case = { id: string; name: string; input: Record<string, unknown>; output?: string; rawResult?: unknown; isError?: boolean; body: string; label: string; right?: string; errorChip?: string };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const content = [{ type: "text", text: "Summary" }, { type: "resource", resource: { uri: "local://result", revision: 7 } }];
const pretty = '[\n  {\n    "type": "text",\n    "text": "Summary"\n  },\n  {\n    "type": "resource",\n    "resource": {\n      "uri": "local://result",\n      "revision": 7\n    }\n  }\n]';
const cases: Case[] = [];
for (const entry of [
  { name: "mcp__linear__get_issue", input: { id: "ENG-17" }, label: "Get issue", right: "ENG-17" },
  { name: "mcp__context7__get-library-docs", input: { topic: "routing" }, label: "Get library docs", right: "routing" },
]) {
  cases.push(
    { ...entry, id: `${entry.name}:resources`, output: "Summary", rawResult: content, body: pretty },
    { ...entry, id: `${entry.name}:error-object`, output: "Flattened error", rawResult: { code: 409, retry: false }, isError: true, body: '{\n  "code": 409,\n  "retry": false\n}', errorChip: '{"code":409,"retry":false}' },
    { ...entry, id: `${entry.name}:string`, output: "Legacy flattened", rawResult: "{\"verbatim\":true}", body: "{\"verbatim\":true}" },
    { ...entry, id: `${entry.name}:legacy-error`, output: "Legacy error", isError: true, body: "Legacy error", errorChip: "Legacy error" },
    { ...entry, id: `${entry.name}:empty-array`, input: {}, output: "", rawResult: [], body: "[]", right: undefined },
    { ...entry, id: `${entry.name}:null`, input: {}, output: "Do not resurrect flattened content", rawResult: null, body: "", right: undefined },
    { ...entry, id: `${entry.name}:pending`, input: {}, body: "", right: undefined },
  );
}
cases.push(
  { id: "resolve-library-id", name: "mcp__context7__resolve-library-id", input: { libraryName: "React" }, output: "Summary", rawResult: content, body: pretty, label: "Resolve library id", right: "React" },
  { id: "other-linear-prefix", name: "mcp__linear__search", input: { query: "bug" }, output: "Summary", rawResult: content, body: pretty, label: "Search" },
  { id: "generic-control", name: "mcp__sample__inspect", input: { query: "sample" }, output: "Summary", rawResult: content, body: pretty, label: "Inspect", right: "sample" },
  { id: "node-control", name: "mcp__node_repl__js", input: { title: "Inspect state" }, output: "Summary", rawResult: content, body: pretty, label: "Node REPL", right: "Inspect state" },
);
const unrelated = () => { throw new Error("Unrelated prefix MCP dependency executed"); };
const production: Record<string, unknown> = {};
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
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
assert.equal(typeof production.ConductorToolRow, "function");

for (const entry of cases) test(`prefix MCP structured result: ${entry.id}`, async () => {
  const at = new Date(0), chatId = `prefix-mcp:${entry.id}`;
  const started = startTurn(reasonChat(chatId), "Inspect result", at);
  const pending = entry.output === undefined;
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: entry.id, title: entry.name, kind: "other", toolName: entry.name, rawInput: entry.input,
    status: pending ? "running" : entry.isError ? "failed" : "completed", output: entry.output ?? null,
    ...(entry.rawResult !== undefined ? { rawResult: entry.rawResult } : {}), diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find(row => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find(part => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  const call = part.call;
  assert.deepEqual(call.rawResult, entry.rawResult);
  assert.equal(call.result, entry.output);
  assert.deepEqual(call.tool, { name: entry.name, input: entry.input });
  function Scene() {
    const [open, setOpen] = React.useState(false);
    const props: ToolRowProps = { tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
      isError: call.status === "error", open, onToggle: () => setOpen((value: boolean) => !value) };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const byClass = (name: string): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && hasClass(node, name));
  const one = (name: string): Node => { const all = byClass(name); assert.equal(all.length, 1, name); assert.ok(all[0]); return all[0]; };
  const toggle = async () => { const fn = one("oc-tool-head").props.onClick; assert.equal(typeof fn, "function"); if (typeof fn === "function") await act(async () => fn()); };
  try {
    assert.equal(text(one("oc-tool-left")), entry.label);
    assert.equal(one("oc-tool").props["data-status"], pending ? "running" : entry.isError ? "error" : "done");
    assert.deepEqual(byClass("oc-error-chip").map(text), entry.errorChip === undefined ? [] : [entry.errorChip]);
    assert.deepEqual(byClass("oc-code-chip").map(text), !entry.errorChip && entry.right ? [entry.right] : []);
    assert.equal(byClass("oc-tool-content").length, 0);
    const hasInput = Object.keys(entry.input).length > 0;
    if (!hasInput && !entry.body) {
      assert.equal(one("oc-tool-head").props.onClick, undefined);
      assert.equal(one("oc-tool-head").props["aria-expanded"], undefined);
    } else {
      for (let repeat = 0; repeat < 2; repeat++) {
        await toggle();
        assert.equal(one("oc-tool-head").props["aria-expanded"], true);
        const pre = byClass("oc-io-pre");
        assert.deepEqual(pre.filter(node => hasClass(node, "muted")).map(text), hasInput ? [JSON.stringify(entry.input, null, 2)] : []);
        assert.deepEqual(pre.filter(node => !hasClass(node, "muted")).map(text), entry.body ? [entry.body] : []);
        assert.deepEqual(byClass("oc-io-label").map(text).filter(label => !label.startsWith("Tool: ")), [hasInput ? "Input:" : "", hasInput && entry.body ? entry.isError ? "Error:" : "Output:" : ""].filter(Boolean));
        assert.equal(renderer.root.findAll((node: Node) => node.type === "img" || node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
        await toggle();
        assert.equal(byClass("oc-tool-content").length, 0);
      }
    }
  } finally { await act(async () => renderer.unmount()); }
});
