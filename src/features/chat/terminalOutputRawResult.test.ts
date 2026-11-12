import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import fixtures from "./terminalOutputRawResult.inputs.json" with { type: "json" };
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const inputBytes = readFileSync(new URL("./terminalOutputRawResult.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(inputBytes).digest("hex"), "f74e08121b76dc08240926a0054f3aca5349d50e46856b18a4334683b9cac54c");
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<Node | string>;
  findAll: (predicate: (node: Node) => boolean) => Node[];
};
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const all = (root: Node, className: string): Node[] => root.findAll((node) => typeof node.type === "string" && hasClass(node, className));
const one = (root: Node, className: string): Node => {
  const matches = all(root, className);
  assert.equal(matches.length, 1, className);
  const match = matches[0];
  assert.ok(match);
  return match;
};
const unrelated = () => { throw new Error("Unrelated terminal-output dependency executed"); };
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
assert.ok(typeof production.ConductorToolRow === "function");

for (const input of fixtures.cases) {
  test(`Terminal output raw-result disclosure: ${input.id}`, async () => {
    const chatId = `terminal-output:${input.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Inspect terminal output", at);
    const output = "output" in input ? input.output : undefined;
    const rawResult = "rawResult" in input ? input.rawResult : undefined;
    const pending = output === undefined;
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: input.id, title: "Get terminal output", kind: "other",
      toolName: "mcp__conductor__GetTerminalOutput", rawInput: input.input,
      status: pending ? "running" : input.isError ? "failed" : "completed",
      output: output ?? null, ...(rawResult !== undefined ? { rawResult } : {}), diffs: [], locations: [],
    }, at);
    const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
    assert.ok(reduced.ok);
    const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
    assert.ok(assistant?.kind === "assistant");
    const part = assistant.parts.find((part) => part.kind === "tool");
    assert.ok(part?.kind === "tool");
    const call = part.call;
    const status = pending ? "running" : input.isError ? "error" : "done";
    assert.deepEqual(call.tool, { name: "mcp__conductor__GetTerminalOutput", input: input.input });
    assert.equal(call.status, status);
    assert.equal(call.result, output);
    assert.deepEqual(call.rawResult, rawResult);
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
    try {
      const row = one(renderer.root, "oc-tool");
      const head = one(row, "oc-tool-head");
      assert.equal(row.props["data-status"], status);
      assert.equal(text(one(row, "oc-tool-left")), "Get terminal output");
      assert.equal(text(one(row, "oc-tool-count")), input.expected.note);
      assert.equal(all(renderer.root, "oc-error-chip").length, 0);
      assert.equal(all(renderer.root, "oc-tool-content").length, 0);
      const handler = head.props.onClick;
      const observedExpandable = typeof handler === "function";
      let observedText = "";
      if (typeof handler === "function") {
        assert.equal(head.props["aria-expanded"], false);
        assert.equal(head.props.role, "button");
        await act(async () => { handler(); });
        assert.equal(one(row, "oc-tool-head").props["aria-expanded"], true);
        observedText = text(one(row, "oc-tool-content"));
        assert.ok(hasClass(one(row, "oc-tool-right"), "hidden"));
        await act(async () => { handler(); });
        assert.equal(one(row, "oc-tool-head").props["aria-expanded"], false);
        assert.equal(all(row, "oc-tool-content").length, 0);
        assert.equal(hasClass(one(row, "oc-tool-right"), "hidden"), false);
        await act(async () => { handler(); });
        assert.equal(text(one(row, "oc-tool-content")), observedText);
        await act(async () => { handler(); });
        assert.equal(all(row, "oc-tool-content").length, 0);
        assert.equal(toggles, 4);
      } else {
        assert.equal(head.props["aria-expanded"], undefined);
        assert.equal(head.props.role, undefined);
        assert.equal(toggles, 0);
      }
      assert.equal(call.result, output, "flattened output bytes stay unchanged");
      assert.deepEqual(call.rawResult, rawResult, "raw content stays unchanged");
      assert.deepEqual({ expandable: observedExpandable, text: observedText }, {
        expandable: input.expected.expandable, text: input.expected.text,
      }, `TERMINAL_RAW_RESULT_${input.id}`);
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
