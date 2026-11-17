import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { Markdown } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
type Case = { id: string; output?: string; rawResult?: unknown; error?: boolean; expanded: boolean; text: string; formatted?: string };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => name.split(" ").every(part => String(node.props.className).split(" ").includes(part));
const cases: Case[] = [
  { id: "text-blocks-concatenate", output: "First\nSecond", rawResult: [{ type: "text", text: "First" }, { type: "resource", resource: { uri: "local://agent" } }, { type: "text", text: "Second" }], expanded: true, text: "FirstSecond" },
  { id: "verbatim-raw-string", output: "Flattened legacy", rawResult: "Original returned text", expanded: true, text: "Original returned text" },
  { id: "object-text", output: "Flattened legacy", rawResult: { text: "Object answer", metadata: 7 }, expanded: true, text: "Object answer" },
  { id: "structured-object", output: "Flattened legacy", rawResult: { answer: 7 }, expanded: true, text: "{\n  \"answer\": 7\n}", formatted: "{\n“answer”: 7\n}" },
  { id: "empty-array-keeps-controls", output: "", rawResult: [], expanded: true, text: "" },
  { id: "explicit-null", output: "Must not resurrect flattened output", rawResult: null, expanded: false, text: "" },
  { id: "explicit-false", output: "Must not resurrect flattened output", rawResult: false, expanded: false, text: "" },
  { id: "explicit-zero", output: "Must not resurrect flattened output", rawResult: 0, expanded: false, text: "" },
  { id: "explicit-empty-string", output: "Must not resurrect flattened output", rawResult: "", expanded: false, text: "" },
  { id: "legacy-success", output: "Legacy answer", expanded: true, text: "Legacy answer" },
  { id: "legacy-error", output: "Legacy failure", error: true, expanded: true, text: "Legacy failure" },
  { id: "pending", expanded: false, text: "" },
  { id: "raw-true-control", output: "true", rawResult: true, expanded: true, text: "true" },
  { id: "matching-text-array-control", output: "Accepted answer", rawResult: [{ type: "text", text: "Accepted answer" }], expanded: true, text: "Accepted answer" },
];
assert.equal(cases.length * 3, 42);
const unrelated = () => { throw new Error("Unrelated typed-subagent raw-result dependency executed"); };
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);

for (const name of ["Task", "Agent", "sub-agent"]) for (const entry of cases) test(`typed subagent raw result: ${name}:${entry.id}`, async () => {
  const copied: string[] = [], timers: Array<() => void> = [], production: Record<string, unknown> = {};
  runInNewContext(compiled.outputText, {
    exports: production,
    navigator: { clipboard: { writeText: async (value: string) => { copied.push(value); } } },
    setTimeout(callback: () => void, delay: number) { assert.equal(delay, 1500); timers.push(callback); return timers.length; },
    require(module: string) {
      switch (module) {
        case "react": case "react/jsx-runtime": return dependencies(module);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { Markdown, highlight: unrelated };
        case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
        case "../../backend.ts": return { openUrl: unrelated };
        default: throw new Error(`Unexpected ToolRows dependency: ${module}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.equal(typeof production.ConductorToolRow, "function");
  const at = new Date(0), chatId = `typed-raw:${name}:${entry.id}`;
  const input = { subagent_type: "Explore", model: "sonnet", description: "Inspect (sonnet)" };
  const started = startTurn(reasonChat(chatId), "Inspect result", at);
  const pending = entry.output === undefined;
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: entry.id, title: name, kind: "other", toolName: name, rawInput: input,
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
  assert.deepEqual(call.rawResult, entry.rawResult);
  assert.equal(call.result, entry.output);
  assert.deepEqual(call.tool, { name, input });
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
  async function event(node: Node, name: string, value?: unknown) {
    const fn = node.props[name]; assert.equal(typeof fn, "function", `Production ${name} exists`);
    if (typeof fn === "function") await act(async () => fn(value));
  }
  async function tab(label: string) {
    const nodes = all("oc-subagent-tab").filter(node => text(node) === label);
    assert.equal(nodes.length, 1); assert.ok(nodes[0]); await event(nodes[0], "onClick");
  }
  try {
    assert.equal(one("oc-tool").props["data-status"], pending ? "running" : entry.error ? "error" : "done");
    assert.equal(text(one("oc-subagent-type")), "Explore\u2022Sonnet");
    assert.equal(text(one("oc-tool-count")), "Inspect");
    assert.deepEqual(all("oc-error-chip"), []);
    assert.equal(all("oc-tool-content").length, 0);
    assert.equal(one("oc-tool-head").props["aria-expanded"], entry.expanded ? false : undefined, `TYPED_RAW_DISCLOSURE_${name}:${entry.id}`);
    if (!entry.expanded) {
      assert.equal(one("oc-tool-head").props.onClick, undefined);
      assert.equal(all("oc-subagent-tabs").length, 0);
      assert.equal(toggles, 0);
    } else {
      await event(one("oc-tool-head"), "onClick");
      assert.equal(one("oc-tool-head").props["aria-expanded"], true);
      assert.equal(text(one("oc-subagent-tab active")), "Formatted");
      const markdown = renderer.root.findAll((node: Node) => node.type === Markdown);
      assert.equal(markdown.length, 1); assert.equal(markdown[0].props.text, entry.text, `TYPED_RAW_MARKDOWN_INPUT_${name}:${entry.id}`);
      assert.equal(text(one("oc-subagent-body")), entry.formatted ?? entry.text, `TYPED_RAW_FORMATTED_${name}:${entry.id}`);
      let stopped = 0;
      await event(one("oc-copy-icon"), "onClick", { stopPropagation() { stopped++; } });
      assert.equal(stopped, 1); assert.deepEqual(copied, [entry.text]); assert.equal(toggles, 1);
      await act(async () => { for (const timer of timers.splice(0)) timer(); });
      await tab("Raw");
      assert.equal(text(one("oc-subagent-raw")), entry.text);
      await event(one("oc-tool-head"), "onClick");
      assert.equal(all("oc-tool-content").length, 0);
      await event(one("oc-tool-head"), "onClick");
      assert.equal(text(one("oc-subagent-tab active")), "Raw");
      assert.equal(text(one("oc-subagent-raw")), entry.text);
      await tab("Formatted");
      assert.equal(text(one("oc-subagent-body")), entry.formatted ?? entry.text);
      await event(one("oc-tool-head"), "onClick");
      assert.equal(all("oc-tool-content").length, 0); assert.equal(toggles, 4);
    }
    assert.equal(renderer.root.findAll((node: Node) => node.type === "img" || node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
    assert.equal(call.result, entry.output); assert.deepEqual(call.rawResult, entry.rawResult);
  } finally { await act(async () => renderer.unmount()); }
});
