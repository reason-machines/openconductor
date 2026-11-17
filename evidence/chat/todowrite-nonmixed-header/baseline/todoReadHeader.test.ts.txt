import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
type Header = { left: string; right?: string };
type Todo = { content: string; status: string };
type Input = {
  id: string;
  name: "TodoRead" | "TodoWrite";
  input: Record<string, unknown>;
  isError: boolean;
  running: boolean;
  output?: string;
  rawResult?: unknown;
  expected_headers: Header[];
  header_prefix_only: boolean;
  expected_todos: Todo[];
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTodo(value: unknown): value is Todo {
  return isRecord(value) && typeof value.content === "string" && typeof value.status === "string";
}
function isHeader(value: unknown): value is Header {
  return isRecord(value) && typeof value.left === "string" && (value.right === undefined || typeof value.right === "string");
}
function isInput(value: unknown): value is Input {
  return isRecord(value) && typeof value.id === "string"
    && (value.name === "TodoRead" || value.name === "TodoWrite") && isRecord(value.input)
    && typeof value.isError === "boolean" && typeof value.running === "boolean"
    && (value.output === undefined || typeof value.output === "string")
    && typeof value.header_prefix_only === "boolean"
    && Array.isArray(value.expected_headers) && value.expected_headers.length > 0 && value.expected_headers.every(isHeader)
    && Array.isArray(value.expected_todos) && value.expected_todos.every(isTodo);
}
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const inputBytes = readFileSync(new URL("./todoReadHeader.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(inputBytes).digest("hex"), "249b830fee9e3c8ec2e09982de0293b447b183eecfea7f7b33b1e290225d2991");
const declared: unknown = JSON.parse(inputBytes.toString("utf8"));
assert.ok(isRecord(declared) && Array.isArray(declared.cases));
const cases = declared.cases.map((entry: unknown) => { assert.ok(isInput(entry)); return entry; });
assert.equal(cases.length, 20);

const unrelated = () => { throw new Error("Unrelated TodoRead header dependency executed"); };
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
      case "./markdown.ts": return { highlight: unrelated, Markdown: unrelated };
      case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
      case "../../backend.ts": return { openUrl: unrelated };
      default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
    }
  },
}, { filename: "ToolRows.tsx" });
assert.equal(typeof production.ConductorToolRow, "function");

for (const entry of cases) {
  test(`TodoRead nonmixed header: ${entry.id}`, async () => {
    const chatId = `todo-read-header:${entry.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Read the todo list", at);
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: entry.id, title: entry.name, kind: "other", toolName: entry.name,
      rawInput: entry.input, status: entry.running ? "running" : entry.isError ? "failed" : "completed",
      output: entry.output ?? null, ...(entry.rawResult !== undefined ? { rawResult: entry.rawResult } : {}),
      diffs: [], locations: [],
    }, at);
    const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
    assert.ok(reduced.ok);
    const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
    assert.ok(assistant?.kind === "assistant");
    const part = assistant.parts.find((part) => part.kind === "tool");
    assert.ok(part?.kind === "tool");
    const call = part.call;
    assert.deepEqual(call.tool, { name: entry.name, input: entry.input });
    assert.equal(call.result, entry.output);
    assert.deepEqual(call.rawResult, entry.rawResult);
    assert.equal(call.status, entry.running ? "running" : entry.isError ? "error" : "done");
    function Scene() {
      const [open, setOpen] = React.useState(false);
      const props: ToolRowProps = {
        tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
        isError: call.status === "error", open, onToggle: () => setOpen((value: boolean) => !value), onOpenFile: unrelated,
      };
      return React.createElement(production.ConductorToolRow, props);
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Scene)); });
    const all = (className: string): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && hasClass(node, className));
    const headerText = (): Header[] => all("oc-tool-head").map((header) => {
      const left = header.children.flatMap((child) => typeof child === "string" ? [] : child.children)
        .filter((node): node is Node => typeof node !== "string")
        .find((node) => hasClass(node, "oc-tool-left"));
      const right = header.children.flatMap((child) => typeof child === "string" ? [] : child.children)
        .filter((node): node is Node => typeof node !== "string")
        .find((node) => hasClass(node, "oc-tool-right"));
      assert.ok(left);
      return { left: text(left), ...(right ? { right: text(right) } : {}) };
    });
    const assertHeaders = (opened: boolean) => {
      const headers = headerText();
      assert.deepEqual(entry.header_prefix_only ? headers.slice(0, entry.expected_headers.length) : headers,
        entry.expected_headers, "returned todo statuses select the visible label and summary");
      for (const right of all("oc-tool-right")) assert.equal(hasClass(right, "hidden"), opened);
      for (const row of all("oc-tool")) assert.equal(row.props["data-status"], call.status);
    };
    const toggle = async () => {
      const header = all("oc-tool-head")[0];
      assert.ok(header && typeof header.props.onClick === "function");
      const callback = header.props.onClick;
      await act(async () => { callback(); });
    };
    try {
      assertHeaders(false);
      assert.equal(all("oc-tool-content").length, 0);
      if (entry.expected_todos.length > 0) {
        assert.equal(all("oc-tool-head")[0]?.props["aria-expanded"], false);
        await toggle();
        assertHeaders(true);
        const projection = entry.expected_todos.map((todo) => `${todo.status === "completed" ? "✓" : "○"} ${todo.content}`).join("\n");
        const bodies = all("oc-tool-content");
        assert.ok(bodies.length >= entry.expected_headers.length);
        if (!entry.header_prefix_only) assert.equal(bodies.length, entry.expected_headers.length);
        for (const body of bodies) {
          assert.equal(text(body), projection, "the header-only fix preserves the complete plain body");
          assert.equal(body.props.className, "oc-tool-content");
        }
        await toggle();
        assertHeaders(false);
        assert.equal(all("oc-tool-content").length, 0);
        await toggle();
        assertHeaders(true);
        assert.equal(all("oc-tool-head")[0]?.props["aria-expanded"], true);
        assert.ok(all("oc-tool-content").every((body) => text(body) === projection));
      }
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
