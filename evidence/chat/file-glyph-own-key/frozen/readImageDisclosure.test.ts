import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import fixtures from "./readImageDisclosure.inputs.json" with { type: "json" };
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const inputBytes = readFileSync(new URL("./readImageDisclosure.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(inputBytes).digest("hex"), "adada617c0395960660e37e2c6dc48b7f9340d08811360665644dfdfd900bce9");
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
const unrelated = () => { throw new Error("Unrelated Read disclosure dependency executed"); };
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
      case "./markdown.ts": return { highlight: () => undefined, Markdown: unrelated };
      case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
      case "../../backend.ts": return { openUrl: unrelated };
      default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
    }
  },
}, { filename: "ToolRows.tsx" });
assert.ok(typeof production.ConductorToolRow === "function");

for (const input of fixtures.cases) {
  test(`Read image disclosure gate: ${input.id}`, async () => {
    const chatId = `read-disclosure:${input.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Read the file", at);
    const output = "output" in input ? input.output : undefined;
    const toolInput = { file_path: input.path, offset: input.offset };
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: input.id, title: "Read file", kind: "read", toolName: "Read",
      rawInput: toolInput, status: input.state === "running" ? "running" : input.state === "error" ? "failed" : "completed",
      output: output ?? null, ...(output !== undefined ? { rawResult: output } : {}), diffs: [], locations: [],
    }, at);
    const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
    assert.ok(reduced.ok);
    const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
    assert.ok(assistant?.kind === "assistant");
    const part = assistant.parts.find((part) => part.kind === "tool");
    assert.ok(part?.kind === "tool");
    const call = part.call;
    assert.deepEqual(call.tool, { name: "Read", input: toolInput });
    assert.equal(call.status, input.state);
    assert.equal(call.result, output);
    assert.equal(call.rawResult, output);
    let toggles = 0;
    const opened: string[] = [];
    function Scene() {
      const [open, setOpen] = React.useState(false);
      const props: ToolRowProps = {
        tool: call.tool, status: call.status, result: call.result, rawResult: call.rawResult,
        isError: call.status === "error", open,
        onToggle: () => { toggles++; setOpen((value: boolean) => !value); },
        onOpenFile: (path) => { opened.push(path); },
      };
      return React.createElement(production.ConductorToolRow, props);
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Scene)); });
    try {
      const row = one(renderer.root, "oc-tool");
      const header = one(row, "oc-tool-head");
      assert.equal(row.props["data-status"], input.state);
      assert.equal(all(row, "oc-tool-content").length, 0);
      const handler = header.props.onClick;
      assert.equal(typeof handler === "function", input.expected.expandable, `READ_IMAGE_DISCLOSURE_${input.id}`);
      assert.equal(header.props.role, input.expected.expandable ? "button" : undefined);
      assert.equal(header.props["aria-expanded"], input.expected.expandable ? false : undefined);
      assert.equal(hasClass(header, "opens"), input.expected.expandable);
      const lines = () => all(row, "oc-code-line").map((line) => {
        const value = line.children[1];
        assert.ok(value !== undefined);
        return { number: text(one(line, "oc-code-ln")), text: text(value) };
      });
      if (typeof handler === "function") {
        await act(async () => { handler(); });
        assert.equal(one(row, "oc-tool-head").props["aria-expanded"], true);
        assert.deepEqual(lines(), input.expected.lines);
        await act(async () => { handler(); });
        assert.equal(all(row, "oc-tool-content").length, 0);
        await act(async () => { handler(); });
        assert.deepEqual(lines(), input.expected.lines);
        await act(async () => { handler(); });
        assert.equal(toggles, 4);
      } else {
        assert.deepEqual(lines(), []);
        assert.equal(toggles, 0);
      }
      assert.equal(all(renderer.root, "oc-error-chip").length, input.expected.errorRows);
      const badges = all(row, "oc-file-badge");
      assert.equal(badges.length, input.path ? 1 : 0);
      const badge = badges[0];
      if (badge) {
        assert.equal(badge.props.title, input.path);
        const openFile = badge.props.onClick;
        assert.ok(typeof openFile === "function");
        let stopped = false;
        await act(async () => { openFile({ stopPropagation: () => { stopped = true; } }); });
        assert.equal(stopped, true);
        assert.deepEqual(opened, [input.path]);
      }
      assert.equal(all(row, "oc-tool-content").length, 0);
      assert.equal(toggles, input.expected.expandable ? 4 : 0, "file badge does not toggle disclosure");
      assert.equal(call.result, output, "flattened output stays unchanged");
      assert.equal(call.rawResult, output, "raw output stays unchanged");
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
