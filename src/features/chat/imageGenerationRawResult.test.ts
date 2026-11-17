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
type Case = { id: string; output?: string; rawResult?: unknown; shown: string; collapsible: boolean; error?: boolean };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const cases: Case[] = [
  { id: "raw-path-wins", output: "/flattened/stale.jpg", rawResult: "/original/image.png", shown: "/original/image.png", collapsible: true },
  { id: "raw-text-blocks", output: "Flattened summary", rawResult: [{ type: "text", text: "/original/image.png" }], shown: "/original/image.png", collapsible: true },
  { id: "raw-text-object", output: "Flattened summary", rawResult: { text: "/original/image.png", metadata: 9 }, shown: "/original/image.png", collapsible: true },
  { id: "raw-null", output: "Flattened stale answer", rawResult: null, shown: "null", collapsible: false },
  { id: "raw-false", output: "Flattened stale answer", rawResult: false, shown: "false", collapsible: false },
  { id: "raw-zero", output: "Flattened stale answer", rawResult: 0, shown: "0", collapsible: false },
  { id: "raw-empty-string", output: "Flattened stale answer", rawResult: "", shown: "", collapsible: false },
  { id: "raw-empty-array", output: "Flattened stale answer", rawResult: [], shown: "", collapsible: false },
  { id: "raw-object-json", output: "Flattened stale answer", rawResult: { path: "/original/image.png", metadata: 9 }, shown: "{\n  \"path\": \"/original/image.png\",\n  \"metadata\": 9\n}", collapsible: false },
  { id: "raw-nontext-array", output: "Flattened stale answer", rawResult: [{ type: "image", data: "not-loaded" }], shown: "", collapsible: false },
  { id: "raw-trimmed-fallback", output: "Flattened stale answer", rawResult: " \nOriginal explanation\n ", shown: "Original explanation", collapsible: false },
  { id: "raw-error", output: "Flattened failure", rawResult: "Original failure", shown: "Original failure", collapsible: false, error: true },
  { id: "legacy-png", output: "/legacy/image.PNG", shown: "/legacy/image.PNG", collapsible: true },
  { id: "legacy-plain", output: "Image generation unavailable", shown: "Image generation unavailable", collapsible: false },
  { id: "pending", shown: "", collapsible: false },
  { id: "legacy-error", output: "Legacy failure", shown: "Legacy failure", collapsible: false, error: true },
  { id: "same-raw-png", output: "/same/image.png", rawResult: "/same/image.png", shown: "/same/image.png", collapsible: true },
  { id: "same-null", output: "null", rawResult: null, shown: "null", collapsible: false },
  { id: "same-false", output: "false", rawResult: false, shown: "false", collapsible: false },
  { id: "same-empty-object", output: "{}", rawResult: {}, shown: "{}", collapsible: false },
  { id: "same-joined-blocks", output: "first second", rawResult: [{ text: "first " }, { text: "second" }], shown: "first second", collapsible: false },
  { id: "unsupported-svg", output: "/same/vector.svg", rawResult: "/same/vector.svg", shown: "/same/vector.svg", collapsible: false },
  { id: "same-trimmed", output: " \nSame explanation\n ", rawResult: " \nSame explanation\n ", shown: "Same explanation", collapsible: false },
  { id: "legacy-empty", output: "", shown: "", collapsible: false },
];
assert.equal(cases.length, 24);
const unrelated = () => { throw new Error("Unrelated image raw-result dependency executed"); };
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);

for (const entry of cases) test(`Image generation raw result: ${entry.id}`, async () => {
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
  assert.ok(typeof production.opensByDefault === "function");
  const at = new Date(0), chatId = `image-raw:${entry.id}`, name = "ImageGeneration";
  const started = startTurn(reasonChat(chatId), "Generate image", at);
  const pending = entry.output === undefined;
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: entry.id, title: name, kind: "other", toolName: name, rawInput: {},
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
  assert.deepEqual(call.tool, { name, input: {} });
  assert.equal(call.result, entry.output); assert.deepEqual(call.rawResult, entry.rawResult);
  assert.equal(tools.toolKind(call.tool.name), "image-generation");
  assert.equal(production.opensByDefault(call.tool), true);
  let toggles = 0;
  let setControlledOpen: (value: boolean) => void = unrelated;
  function Scene() {
    const [open, setOpen] = React.useState(true);
    setControlledOpen = setOpen;
    const props: ToolRowProps = { tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
      isError: call.status === "error", open, onToggle: () => { toggles++; setOpen((value: boolean) => !value); }, onOpenFile: unrelated };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (name: string): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && hasClass(node, name));
  const one = (name: string): Node => { const nodes = all(name); assert.equal(nodes.length, 1, name); assert.ok(nodes[0]); return nodes[0]; };
  async function click() { const fn = one("oc-tool-head").props.onClick; if (typeof fn === "function") await act(async () => fn()); }
  function body() {
    assert.deepEqual(all("oc-tool-content").map(text), entry.shown ? [entry.shown] : [], `IMAGE_RAW_CONTENT_${entry.id}`);
    assert.equal(one("oc-tool-head").props.role, entry.collapsible ? "button" : undefined, `IMAGE_RAW_COLLAPSIBLE_${entry.id}`);
  }
  try {
    assert.equal(one("oc-tool").props["data-status"], pending ? "running" : entry.error ? "error" : "done");
    assert.equal(text(one("oc-tool-left")), pending ? "Generating image" : "Generated image");
    assert.equal(all("oc-error-chip").length, 0);
    body();
    await click();
    if (entry.collapsible) {
      assert.equal(toggles, 1); assert.equal(all("oc-tool-content").length, 0);
      assert.equal(one("oc-tool-head").props["aria-expanded"], false);
      await click(); assert.equal(toggles, 2); body();
      assert.equal(one("oc-tool-head").props["aria-expanded"], true);
    } else {
      assert.equal(toggles, 0); assert.equal(one("oc-tool-head").props["aria-expanded"], undefined); body();
      await act(async () => setControlledOpen(false)); assert.equal(all("oc-tool-content").length, 0);
      await click(); assert.equal(toggles, 0); assert.equal(all("oc-tool-content").length, 0);
    }
    assert.equal(renderer.root.findAll((node: Node) => node.type === "script" || node.type === "img" || "dangerouslySetInnerHTML" in node.props).length, 0);
    assert.equal(call.result, entry.output); assert.deepEqual(call.rawResult, entry.rawResult);
  } finally { await act(async () => renderer.unmount()); }
});
