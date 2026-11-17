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
type Case = { id: string; name: string; input: Record<string, unknown>; output?: string; rawResult?: unknown; isError?: boolean; expected: string };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const resources = [{ type: "text", text: "Summary" }, { type: "resource", resource: { uri: "local://agent-result", revision: 7 } }];
const pretty = '[\n  {\n    "type": "text",\n    "text": "Summary"\n  },\n  {\n    "type": "resource",\n    "resource": {\n      "uri": "local://agent-result",\n      "revision": 7\n    }\n  }\n]';
const cases: Case[] = [];
for (const name of ["Task", "Agent", "sub-agent"]) {
  cases.push(
    { name, id: `${name}:missing-type-resources`, input: { description: "Inspect" }, output: "Summary", rawResult: resources, expected: pretty },
    { name, id: `${name}:empty-type-resources`, input: { subagent_type: "" }, output: "Summary", rawResult: resources, expected: pretty },
    { name, id: `${name}:general-purpose-resources`, input: { subagent_type: "general-purpose" }, output: "Summary", rawResult: resources, expected: pretty },
    { name, id: `${name}:raw-string`, input: {}, output: "Legacy flattened", rawResult: "{\"verbatim\":true}", expected: "{\"verbatim\":true}" },
    { name, id: `${name}:empty-array`, input: {}, output: "", rawResult: [], expected: "[]" },
    { name, id: `${name}:explicit-null`, input: { subagent_type: "general-purpose" }, output: "Do not resurrect flattened content", rawResult: null, expected: "" },
    { name, id: `${name}:legacy-success`, input: { subagent_type: "general-purpose" }, output: "Legacy result", expected: "Legacy result" },
    { name, id: `${name}:legacy-error`, input: {}, output: "Legacy error", isError: true, expected: "Legacy error" },
    { name, id: `${name}:pending`, input: {}, expected: "" },
    { name, id: `${name}:false`, input: {}, output: "", rawResult: false, expected: "" },
  );
}
assert.equal(cases.length, 30);
const unrelated = () => { throw new Error("Unrelated subagent-fallback dependency executed"); };
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

for (const entry of cases) test(`subagent fallback structured result: ${entry.id}`, async () => {
  const at = new Date(0), chatId = `subagent-fallback:${entry.id}`;
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
  let toggles = 0;
  function Scene() {
    const [open, setOpen] = React.useState(false);
    const props: ToolRowProps = { tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
      isError: call.status === "error", open, onToggle: () => { toggles++; setOpen((value: boolean) => !value); } };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const byClass = (name: string): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && hasClass(node, name));
  const one = (name: string): Node => { const all = byClass(name); assert.equal(all.length, 1, name); assert.ok(all[0]); return all[0]; };
  const toggle = async () => { const fn = one("oc-tool-head").props.onClick; assert.equal(typeof fn, "function"); if (typeof fn === "function") await act(async () => fn()); };
  try {
    assert.equal(text(one("oc-tool-left")), entry.name);
    assert.equal(one("oc-tool").props["data-status"], pending ? "running" : entry.isError ? "error" : "done");
    assert.deepEqual(byClass("oc-error-chip"), []);
    assert.deepEqual(byClass("oc-subagent-tabs"), []);
    assert.equal(byClass("oc-tool-content").length, 0);
    const hasInput = Object.keys(entry.input).length > 0;
    if (!hasInput && !entry.expected) {
      assert.equal(one("oc-tool-head").props.onClick, undefined);
      assert.equal(one("oc-tool-head").props["aria-expanded"], undefined);
      assert.equal(toggles, 0);
    } else {
      for (let repeat = 0; repeat < 2; repeat++) {
        await toggle();
        assert.equal(one("oc-tool-head").props["aria-expanded"], true);
        const pre = byClass("oc-io-pre");
        assert.deepEqual(pre.filter(node => hasClass(node, "muted")).map(text), hasInput ? [JSON.stringify(entry.input, null, 2)] : []);
        assert.deepEqual(pre.filter(node => !hasClass(node, "muted")).map(text), entry.expected ? [entry.expected] : [], `SUBAGENT_FALLBACK_OUTPUT_${entry.id}`);
        assert.deepEqual(byClass("oc-io-label").map(text), [hasInput ? "Input:" : "", hasInput && entry.expected ? entry.isError ? "Error:" : "Output:" : ""].filter(Boolean));
        assert.equal(renderer.root.findAll((node: Node) => node.type === "img" || node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
        await toggle();
        assert.equal(byClass("oc-tool-content").length, 0);
      }
      assert.equal(toggles, 4);
    }
  } finally { await act(async () => renderer.unmount()); }
});
