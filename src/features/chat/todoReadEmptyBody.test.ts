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
type Todo = { content: string; status: string };
type Input = {
  id: string;
  name: "TodoRead" | "TodoWrite";
  input: Record<string, unknown>;
  isError: boolean;
  running: boolean;
  output?: string;
  rawResult?: unknown;
  expected_todos: Todo[];
  expected_current_projection: string;
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTodo(value: unknown): value is Todo {
  return isRecord(value) && typeof value.content === "string" && typeof value.status === "string";
}
function isInput(value: unknown): value is Input {
  return isRecord(value) && typeof value.id === "string"
    && (value.name === "TodoRead" || value.name === "TodoWrite")
    && isRecord(value.input) && typeof value.isError === "boolean" && typeof value.running === "boolean"
    && (value.output === undefined || typeof value.output === "string")
    && Array.isArray(value.expected_todos) && value.expected_todos.every(isTodo)
    && typeof value.expected_current_projection === "string";
}
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const inputBytes = readFileSync(new URL("./todoReadResult.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(inputBytes).digest("hex"), "16a3503a1260bf448a01c790e44d7edcbe88a1b6ccf759aac4a3d51bbc16a41a");
const declared: unknown = JSON.parse(inputBytes.toString("utf8"));
assert.ok(isRecord(declared) && Array.isArray(declared.cases));
const cases = declared.cases.map((entry: unknown) => { assert.ok(isInput(entry)); return entry; });
assert.equal(cases.length, 22);

const unrelated = () => { throw new Error("Unrelated TodoRead empty-body dependency executed"); };
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
  test(`TodoRead empty-body successor: ${entry.id}`, async () => {
    const chatId = `todo-read-empty:${entry.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Read the todo list", at);
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: entry.id, title: entry.name, kind: "other",
      toolName: entry.name, rawInput: entry.input,
      status: entry.running ? "running" : entry.isError ? "failed" : "completed",
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
        isError: call.status === "error", open,
        onToggle: () => setOpen((value: boolean) => !value), onOpenFile: unrelated,
      };
      return React.createElement(production.ConductorToolRow, props);
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Scene)); });
    const all = (className: string): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && hasClass(node, className));
    const firstHeader = (): Node => { const node = all("oc-tool-head")[0]; assert.ok(node); return node; };
    const emptyRead = entry.name === "TodoRead" && entry.expected_todos.length === 0;
    const expandable = emptyRead || entry.expected_todos.length > 0;
    const expectedBody = emptyRead ? "No todos" : entry.expected_current_projection;
    const rowCount = entry.name === "TodoWrite" && entry.expected_todos.some((todo) => todo.status === "in_progress")
      && entry.expected_todos.some((todo) => todo.status === "completed") ? 2 : 1;
    const toggle = async () => {
      const callback = firstHeader().props.onClick;
      assert.equal(typeof callback, "function", "the selected body is reachable through its disclosure");
      if (typeof callback !== "function") throw new Error("Missing disclosure callback");
      await act(async () => { callback(); });
    };
    const assertOpenBody = () => {
      assert.equal(firstHeader().props["aria-expanded"], true);
      assert.deepEqual(all("oc-tool-content").map(text), Array.from({ length: rowCount }, () => expectedBody));
      const paragraphs = all("oc-task-empty");
      assert.equal(paragraphs.length, emptyRead ? 1 : 0);
      if (emptyRead) {
        const paragraph = paragraphs[0];
        assert.ok(paragraph);
        assert.equal(paragraph.type, "p");
        assert.equal(text(paragraph), "No todos");
      }
    };
    try {
      assert.equal(all("oc-tool").length, rowCount);
      for (const node of all("oc-tool")) assert.equal(node.props["data-status"], call.status);
      assert.equal(all("oc-tool-content").length, 0);
      assert.equal(all("oc-task-empty").length, 0);
      if (expandable) {
        assert.equal(firstHeader().props["aria-expanded"], false, "the disclosure starts collapsed");
        await toggle();
        assertOpenBody();
        await toggle();
        assert.equal(firstHeader().props["aria-expanded"], false);
        assert.equal(all("oc-tool-content").length, 0);
        assert.equal(all("oc-task-empty").length, 0);
        await toggle();
        assertOpenBody();
      } else {
        assert.equal(entry.name, "TodoWrite");
        assert.equal(firstHeader().props["aria-expanded"], undefined);
        assert.equal(firstHeader().props.onClick, undefined);
      }
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
