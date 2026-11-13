import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import fixtures from "../../../evidence/chat/taskget-error-result/cases.json" with { type: "json" };
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const fixtureBytes = readFileSync(new URL("../../../evidence/chat/taskget-error-result/cases.json", import.meta.url));
assert.equal(createHash("sha256").update(fixtureBytes).digest("hex"), "b8a1e09a13afdbbcf2eb1d2012ed2519cd57754ca3989e60e16fa634f0072b02");
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
const unrelated = () => { throw new Error("Unrelated TaskGet dependency executed"); };
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
  test(`TaskGet result details: ${input.id}`, async () => {
    const chatId = `task-get:${input.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Inspect task", at);
    const pending = input.result === undefined;
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: input.id, title: input.name, kind: "other", toolName: input.name,
      rawInput: input.input, status: pending ? "running" : input.isError ? "failed" : "completed",
      output: input.result ?? null, diffs: [], locations: [],
    }, at);
    const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
    assert.ok(reduced.ok);
    const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
    assert.ok(assistant?.kind === "assistant");
    const part = assistant.parts.find((part) => part.kind === "tool");
    assert.ok(part?.kind === "tool");
    const call = part.call;
    const status = pending ? "running" : input.isError ? "error" : "done";
    assert.deepEqual(call.tool, { name: "TaskGet", input: input.input });
    assert.equal(call.result, input.result);
    assert.equal(call.status, status);
    let toggles = 0;
    function Scene() {
      const [open, setOpen] = React.useState(false);
      const props: ToolRowProps = {
        tool: call.tool, status: call.status, result: call.result, isError: call.status === "error", open,
        onToggle: () => { toggles++; setOpen((value: boolean) => !value); }, onOpenFile: unrelated,
      };
      return React.createElement(production.ConductorToolRow, props);
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Scene)); });
    async function click(row: Node) {
      const handler = one(row, "oc-tool-head").props.onClick;
      assert.ok(typeof handler === "function");
      await act(async () => { handler(); });
    }
    try {
      const rows = all(renderer.root, "oc-tool");
      assert.equal(rows.length, input.expected.error_row ? 2 : 1);
      const row = rows[0];
      assert.ok(row);
      assert.equal(text(one(row, "oc-tool-left")), "Task details");
      assert.equal(row.props["data-status"], status);
      assert.equal(one(row, "oc-tool-head").props["aria-expanded"], false);
      assert.equal(all(renderer.root, "oc-tool-content").length, 0);
      const header = text(one(row, "oc-tool-right"));
      await click(row);
      const observed = {
        header,
        subjects: all(row, "oc-task-subject").map(text),
        notes: all(row, "oc-task-note").map(text),
        loading: all(row, "oc-task-empty").map(text),
      };
      const error = rows[1];
      if (input.expected.error_row) {
        assert.ok(error);
        assert.equal(text(one(error, "oc-tool-left")), "Error");
        assert.equal(text(one(error, "oc-error-chip")), input.result);
        await click(error);
        assert.equal(text(one(error, "oc-tool-content")), input.result);
      }
      await click(row);
      assert.equal(all(row, "oc-tool-content").length, 0);
      if (error) {
        assert.equal(text(one(error, "oc-tool-content")), input.result, "TaskGet disclosure does not close its independent error");
        await click(error);
      }
      assert.equal(all(renderer.root, "oc-tool-content").length, 0);
      assert.equal(toggles, 2);
      assert.equal(call.result, input.result, "result bytes stay unchanged");
      assert.deepEqual(observed, {
        header: input.expected.subject ?? "Task ID: 17",
        subjects: input.expected.subject ? [input.expected.subject] : [],
        notes: input.expected.subject ? [input.expected.description, `Owner: ${input.expected.owner}`] : [],
        loading: input.expected.loading ? ["Loading task..."] : [],
      }, `TASKGET_RENDERED_DETAILS_${input.id}`);
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
