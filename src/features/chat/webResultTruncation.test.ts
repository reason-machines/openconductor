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


type DeclaredCase = {
  id: string;
  tool: "WebSearch" | "WebFetch";
  output: string;
  prompt: string;
  expected_output: string;
  original_utf16_units: number;
  expected_utf16_units: number;
  truncated: boolean;
};
function isDeclaredCase(value: unknown): value is DeclaredCase {
  return typeof value === "object" && value !== null
    && "id" in value && typeof value.id === "string"
    && "tool" in value && (value.tool === "WebSearch" || value.tool === "WebFetch")
    && "output" in value && typeof value.output === "string"
    && "prompt" in value && typeof value.prompt === "string"
    && "expected_output" in value && typeof value.expected_output === "string"
    && "original_utf16_units" in value && typeof value.original_utf16_units === "number"
    && "expected_utf16_units" in value && typeof value.expected_utf16_units === "number"
    && "truncated" in value && typeof value.truncated === "boolean";
}
const declared: unknown = JSON.parse(readFileSync(new URL("./webResultTruncation.inputs.json", import.meta.url), "utf8"));
assert.ok(typeof declared === "object" && declared !== null && "cases" in declared && Array.isArray(declared.cases));
const declaredCases = declared.cases.map((entry: unknown) => { assert.ok(isDeclaredCase(entry)); return entry; });
const target = "https://example.com/docs";
for (const entry of declaredCases) {
  test(`web result cap matches shipped UTF-16 boundary: ${entry.id}`, async () => {
    const web: Web = entry.tool === "WebSearch"
      ? { name: "WebSearch", input: { query: "supported configuration keys" }, output: entry.output }
      : { name: "WebFetch", input: { url: target, ...(entry.prompt ? { prompt: entry.prompt } : {}) }, output: entry.output };
    assert.equal(entry.output.length, entry.original_utf16_units);
    assert.equal(entry.expected_output.length, entry.expected_utf16_units);
    const view = await fixture(web);
    try {
      const wantedChip = web.name === "WebSearch" ? web.input.query : target;
      assert.equal(text(view.chip()), wantedChip);
      assert.deepEqual(view.bodies(), []);
      if (entry.output === "") {
        assert.equal(view.header().props.onClick, undefined);
        assert.equal(view.header().props["aria-expanded"], undefined);
      } else {
        assert.equal(view.header().props["aria-expanded"], false);
        await view.toggle();
        assert.equal(view.header().props["aria-expanded"], true);
        const notice = entry.truncated ? `Content truncated (${entry.original_utf16_units.toLocaleString()} chars total)` : "";
        const promptText = entry.prompt ? `Prompt: ${entry.prompt}` : "";
        const body = view.bodies();
        assert.equal(body.length, 1);
        assert.equal(text(body[0]!), `${promptText}${entry.expected_output}${notice}`, "expanded real web row must cap only its result and conditionally report original UTF-16 length");
        const notices = view.all((node) => node.type === "div" && text(node) === notice && notice !== "");
        assert.equal(notices.length, entry.truncated ? 1 : 0);
        assert.equal(view.all((node) => ["script", "img"].includes(String(node.type)) || "dangerouslySetInnerHTML" in node.props).length, 0);
        if (!entry.prompt && !entry.truncated) assert.deepEqual(body[0]!.children, [entry.output]);
        if (entry.prompt) {
          const item = view.one((node) => node.type === "li");
          assert.equal(text(item), `Prompt: ${entry.prompt}`);
        }
        await view.toggle();
        assert.equal(view.header().props["aria-expanded"], false);
        assert.deepEqual(view.bodies(), []);
        assert.equal(text(view.chip()), wantedChip);
      }
    } finally { await view.close(); }
  });
}
