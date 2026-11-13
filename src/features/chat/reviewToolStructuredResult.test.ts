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
type Input = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  isError: boolean;
  output?: string;
  rawResult?: unknown;
  expected_label: string;
  expected_right: string;
  expected_output: string;
  predicted_red: boolean;
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isInput(value: unknown): value is Input {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string"
    && isRecord(value.input) && typeof value.isError === "boolean" && typeof value.expected_label === "string"
    && typeof value.expected_right === "string" && typeof value.predicted_red === "boolean"
    && (value.output === undefined || typeof value.output === "string")
    && typeof value.expected_output === "string";
}
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const inputBytes = readFileSync(new URL("./reviewToolStructuredResult.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(inputBytes).digest("hex"), "772ca0e4f9ac5b5fa3c0f6c71ac492f9255f8f0e4db6b23781ff1ea026d08205");
const declared: unknown = JSON.parse(inputBytes.toString("utf8"));
assert.ok(isRecord(declared) && Array.isArray(declared.cases));
const cases = declared.cases.map((entry: unknown) => { assert.ok(isInput(entry)); return entry; });
assert.equal(cases.length, 28);

const unrelated = () => { throw new Error("Unrelated structured-review-tool dependency executed"); };
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
  test(`Review tool structured result body: ${entry.id}`, async () => {
    const output = entry.output;
    const rawResult = entry.rawResult;
    const expected = entry.expected_output;
    const pending = output === undefined;
    const chatId = `review-tool-structured:${entry.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Inspect tool output", at);
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: entry.id, title: entry.name, kind: "other",
      toolName: entry.name, rawInput: entry.input,
      status: pending ? "running" : entry.isError ? "failed" : "completed",
      output: output ?? null, ...(rawResult !== undefined ? { rawResult } : {}), diffs: [], locations: [],
    }, at);
    const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
    assert.ok(reduced.ok);
    const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
    assert.ok(assistant?.kind === "assistant");
    const part = assistant.parts.find((part) => part.kind === "tool");
    assert.ok(part?.kind === "tool");
    const call = part.call;
    assert.deepEqual(call.tool, { name: entry.name, input: entry.input });
    assert.equal(call.result, output);
    assert.deepEqual(call.rawResult, rawResult);
    assert.equal(call.status, pending ? "running" : entry.isError ? "error" : "done");
    let toggles = 0;
    function Scene() {
      const [open, setOpen] = React.useState(false);
      const props: ToolRowProps = {
        tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
        isError: call.status === "error", open,
        onToggle: () => { toggles++; setOpen((value: boolean) => !value); }, onOpenFile: unrelated,
      };
      return React.createElement(production.ConductorToolRow, props);
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Scene)); });
    const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
    const one = (className: string): Node => {
      const found = all((node) => hasClass(node, className));
      assert.equal(found.length, 1, className);
      const match = found[0]; assert.ok(match); return match;
    };
    const byClass = (className: string) => all((node) => hasClass(node, className));
    const toggle = async () => {
      const callback = one("oc-tool-head").props.onClick;
      assert.equal(typeof callback, "function");
      if (typeof callback === "function") await act(async () => { callback(); });
    };
    const assertBody = () => {
      assert.equal(byClass("oc-tool-content").length, 1);
      assert.equal(text(one("oc-tool-content")), expected);
      assert.deepEqual(byClass("oc-io-pre"), []);
      assert.deepEqual(byClass("oc-io-label"), []);
      assert.deepEqual(byClass("oc-io-truncated"), []);
      assert.equal(hasClass(one("oc-tool-right"), "hidden"), true);
    };
    try {
      assert.equal(text(one("oc-tool-left")), entry.expected_label);
      assert.equal(one("oc-tool").props["data-status"], call.status);
      assert.equal(one("oc-tool").props["data-tone"], undefined);
      assert.deepEqual(byClass("oc-error-chip").map(text), []);
      assert.deepEqual(byClass("oc-tool-right").map(text), [entry.expected_right]);
      assert.equal(byClass("oc-tool-content").length, 0);
      assert.equal(byClass("oc-tool").length, 1);
      const hasBody = expected.length > 0;
      if (!hasBody) {
        const callback = one("oc-tool-head").props.onClick;
        if (typeof callback === "function") await act(async () => { callback(); });
        assert.equal(byClass("oc-tool-content").filter((node) => text(node).length > 0).length, 0);
      } else {
        assert.equal(one("oc-tool-head").props["aria-expanded"], false);
        await toggle();
        assert.equal(one("oc-tool-head").props["aria-expanded"], true);
        assertBody();
        await toggle();
        assert.equal(one("oc-tool-head").props["aria-expanded"], false);
        assert.equal(byClass("oc-tool-content").length, 0);
        await toggle();
        assert.equal(one("oc-tool-head").props["aria-expanded"], true);
        assertBody();
        assert.equal(toggles, 3);
      }
      assert.equal(text(one("oc-tool-left")), entry.expected_label);
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
