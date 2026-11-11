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
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Web = { name: "WebFetch"; input: { url: string; prompt?: string }; output: string }
  | { name: "WebSearch"; input: { query: string }; output: string };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);

function normalizedWeb(web: Web) {
  const chatId = "workspace:claude";
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Look up the documentation", at);
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: "ordinary-web", title: web.name, kind: "fetch",
    toolName: web.name, rawInput: web.input, status: "completed",
    output: web.output, diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.deepEqual(part.call.tool, { name: web.name, input: web.input });
  assert.equal(part.call.result, web.output);
  assert.equal(part.call.status, "done");
  return part.call;
}

async function fixture(web: Web) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
  const unrelated = () => { throw new Error("Unrelated web-row dependency executed"); };
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
  const call = normalizedWeb(web);
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
    all, one,
    header: () => one((node) => hasClass(node, "oc-tool-head")),
    bodies: () => all((node) => hasClass(node, "oc-tool-content")),
    chip: () => one((node) => hasClass(node, "oc-code-chip")),
    async toggle() {
      const callback = this.header().props.onClick;
      assert.equal(typeof callback, "function");
      if (typeof callback === "function") await act(async () => { callback(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const url = "https://example.com/docs";
const output = "The documented keys are enabled and retryLimit.";

for (const prompt of ["Find the supported configuration keys.", "  Keep spacing.\nAnd this line.  "]) {
  test(`ordinary Claude WebFetch discloses exact prompt before the unchanged result: ${JSON.stringify(prompt)}`, async () => {
    const view = await fixture({ name: "WebFetch", input: { url, prompt }, output });
    try {
      assert.equal(text(view.header()).includes("Web Browse"), true);
      assert.equal(text(view.chip()), url);
      assert.equal(view.header().props["aria-expanded"], false);
      assert.deepEqual(view.bodies(), []);
      assert.equal(view.all((node) => node.type === "code").length, 0);
      await view.toggle();
      assert.equal(view.header().props["aria-expanded"], true);
      assert.equal(text(view.chip()), url);
      const code = view.all((node) => node.type === "code");
      assert.equal(code.length, 1, "expanded ordinary WebFetch must disclose its prompt in a code element");
      assert.equal(text(code[0]!), prompt);
      const item = view.one((node) => node.type === "li");
      assert.equal(text(item), `Prompt: ${prompt}`);
      assert.equal(text(view.bodies()[0]!), `Prompt: ${prompt}${output}`);
      assert.equal(view.bodies()[0]!.children.at(-1), output);
      await view.toggle();
      assert.equal(view.header().props["aria-expanded"], false);
      assert.deepEqual(view.bodies(), []);
      assert.equal(view.all((node) => node.type === "code").length, 0);
      assert.equal(text(view.chip()), url);
    } finally { await view.close(); }
  });
}

test("WebFetch keeps HTML-like prompt and result text literal", async () => {
  const prompt = '<script>unsafe()</script> & <b>configuration</b>';
  const result = '<img src=x onerror="unsafe()"> & **literal result**';
  const view = await fixture({ name: "WebFetch", input: { url, prompt }, output: result });
  try {
    await view.toggle();
    const code = view.all((node) => node.type === "code");
    assert.equal(code.length, 1, "the prompt is a plain code child, not missing or interpreted markup");
    assert.equal(text(code[0]!), prompt);
    assert.equal(text(view.bodies()[0]!), `Prompt: ${prompt}${result}`);
    assert.equal(view.bodies()[0]!.children.at(-1), result);
    assert.equal(view.all((node) => ["script", "img", "b", "strong"].includes(String(node.type)) || "dangerouslySetInnerHTML" in node.props).length, 0);
  } finally { await view.close(); }
});

for (const input of [{ url }, { url, prompt: "" }]) {
  test(`WebFetch with ${"prompt" in input ? "empty" : "missing"} prompt keeps its output-only disclosure`, async () => {
    const view = await fixture({ name: "WebFetch", input, output });
    try {
      assert.deepEqual(view.bodies(), []);
      await view.toggle();
      assert.equal(text(view.bodies()[0]!), output);
      assert.deepEqual(view.bodies()[0]!.children, [output]);
      assert.equal(view.all((node) => node.type === "li" || node.type === "code").length, 0);
      assert.equal(text(view.chip()), url);
      await view.toggle(); assert.deepEqual(view.bodies(), []);
    } finally { await view.close(); }
  });
}

test("completed WebSearch without prompt keeps its query and result disclosure", async () => {
  const query = "supported configuration keys";
  const view = await fixture({ name: "WebSearch", input: { query }, output });
  try {
    assert.equal(text(view.header()).includes("Web Search"), true);
    assert.equal(text(view.chip()), query);
    assert.deepEqual(view.bodies(), []);
    await view.toggle();
    assert.deepEqual(view.bodies()[0]!.children, [output]);
    assert.equal(view.all((node) => node.type === "li" || node.type === "code").length, 0);
    assert.equal(text(view.chip()), query);
    await view.toggle(); assert.deepEqual(view.bodies(), []);
  } finally { await view.close(); }
});

test("a completed WebFetch prompt alone does not open an empty result", async () => {
  const view = await fixture({ name: "WebFetch", input: { url, prompt: "Find the keys." }, output: "" });
  try {
    assert.equal(view.header().props["aria-expanded"], undefined);
    assert.equal(view.header().props.onClick, undefined);
    assert.deepEqual(view.bodies(), []);
    assert.equal(view.all((node) => node.type === "li" || node.type === "code").length, 0);
    assert.equal(text(view.chip()), url);
  } finally { await view.close(); }
});
