import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { highlight } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
type Case = {
  id: string;
  name: "Grep" | "Read";
  input: Record<string, unknown>;
  result: string;
  workspacePath?: string;
  expectedResource: string | null;
};
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);

function frozenCases(file: string): Case[] {
  const contract: unknown = JSON.parse(readFileSync(new URL(`../../../evidence/chat/grep-resource-label/${file}`, import.meta.url), "utf8"));
  assert.ok(contract && typeof contract === "object" && "cases" in contract && Array.isArray(contract.cases));
  return contract.cases.map((value: unknown): Case => {
    assert.ok(value && typeof value === "object" && "id" in value && typeof value.id === "string");
    if ("name" in value) {
      assert.equal(value.name, "Read");
      assert.ok("input" in value && value.input && typeof value.input === "object");
      assert.ok("file_path" in value.input && typeof value.input.file_path === "string");
      assert.ok("offset" in value.input && typeof value.input.offset === "number");
      assert.ok("result" in value && typeof value.result === "string");
      return { id: value.id, name: "Read", input: { file_path: value.input.file_path, offset: value.input.offset }, result: value.result, expectedResource: null };
    }
    assert.ok("path" in value && typeof value.path === "string");
    assert.ok("pattern" in value && typeof value.pattern === "string");
    assert.ok("workspacePath" in value && typeof value.workspacePath === "string");
    assert.ok("expected_resource" in value && (typeof value.expected_resource === "string" || value.expected_resource === null));
    const input: Record<string, unknown> = { path: value.path, pattern: value.pattern };
    if ("include" in value) { assert.equal(typeof value.include, "string"); input.include = value.include; }
    return { id: value.id, name: "Grep", input, result: "first match\n\nsecond match", workspacePath: value.workspacePath, expectedResource: value.expected_resource };
  });
}

function normalizedCall(input: Case) {
  const chatId = `grep-resource:${input.id}`;
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Inspect the resource", at);
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: input.id, title: input.name, kind: input.name === "Read" ? "read" : "search",
    toolName: input.name, rawInput: input.input, status: "completed", output: input.result, diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.equal(part.call.id, input.id);
  assert.deepEqual(part.call.tool, { name: input.name, input: input.input }, "actual adapter and view preserve full provider input and path identity");
  assert.equal(tools.toolKind(part.call.tool.name), input.name === "Read" ? "read" : "grep");
  assert.equal(part.call.status, "done");
  assert.equal(part.call.result, input.result);
  return part.call;
}

async function fixture(input: Case) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((diagnostic: { category: number }) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
  const unrelated = () => { throw new Error("Unrelated Grep resource dependency executed"); };
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { highlight, Markdown: unrelated };
        case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
        case "../../backend.ts": return { openUrl: unrelated };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.ok(typeof production.ConductorToolRow === "function");
  const call = normalizedCall(input);
  const opened: string[] = [];
  let toggleCalls = 0;
  let setControlledOpen: (value: boolean) => void = unrelated;
  function Scene() {
    const [open, setOpen] = React.useState(false);
    setControlledOpen = (value) => setOpen(value);
    const props: ToolRowProps = {
      tool: call.tool, status: call.status, result: call.result, isError: false, workspacePath: input.workspacePath,
      open, onToggle: () => { toggleCalls++; setOpen((value: boolean) => !value); }, onOpenFile: (path) => opened.push(path),
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
    all, one, opened,
    header: () => one((node) => hasClass(node, "oc-tool-head")),
    left: () => one((node) => hasClass(node, "oc-tool-left")),
    bodies: () => all((node) => hasClass(node, "oc-tool-content")),
    toggles: () => toggleCalls,
    async click() {
      const handler = this.header().props.onClick;
      assert.ok(typeof handler === "function");
      await act(async () => { handler(); });
    },
    async setOpen(value: boolean) { await act(async () => { setControlledOpen(value); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const original = frozenCases("contract.json");
assert.deepEqual(original.map((input) => input.id), ["inside-workspace-deep-absolute", "outside-workspace-deep-absolute", "deep-relative", "short-relative-control", "pathless-control", "ordinary-read-control"]);
for (const input of [...original, ...frozenCases("boundary-cases.json")]) {
  test(`Grep resource label: ${input.id}`, async () => {
    const view = await fixture(input);
    try {
      assert.equal(view.header().props["aria-expanded"], false);
      assert.equal(view.bodies().length, 0, "explicit controlled false stays closed");
      if (input.name === "Read") {
        assert.equal(text(view.left()), "Read 2 lines");
        const badge = view.one((node) => node.type === "button" && hasClass(node, "oc-file-badge"));
        assert.equal(badge.props.title, input.input.file_path);
        assert.equal(text(badge), "example.ts");
        let stopped = 0;
        const handler = badge.props.onClick;
        assert.ok(typeof handler === "function");
        await act(async () => { handler({ stopPropagation: () => { stopped++; } }); });
        assert.equal(stopped, 1);
        assert.deepEqual(view.opened, [input.input.file_path]);
        assert.equal(view.toggles(), 0);
        assert.equal(view.header().props["aria-expanded"], false);
        await view.click();
        const lines = view.all((node) => hasClass(node, "oc-code-line"));
        assert.deepEqual(lines.map((line) => text(line.children[0]!)), ["7", "8"]);
        assert.deepEqual(lines.map((line) => text(line.children[1]!)), ["first", "second"]);
      } else {
        const resource = view.all((node) => node.type === "code" && hasClass(node, "oc-tool-inline-code"));
        assert.equal(text(view.one((node) => hasClass(node, "oc-tool-count"))), "2 matches");
        assert.equal(view.opened.length, 0);
        if (input.expectedResource === null) {
          assert.equal(resource.length, 0);
          assert.equal(text(view.left()), "grep for 'needle'", "pathless Grep has neither an in phrase nor a resource");
        } else {
          assert.equal(resource.length, 1);
          assert.equal(text(resource[0]!), input.expectedResource, `GREP_RESOURCE_LABEL_${input.id}`);
          assert.equal(text(view.left()), `grep for '${input.input.pattern}' in ${input.expectedResource}${input.input.include ? ` (include: ${input.input.include})` : ""}`);
        }
        await view.click();
        assert.equal(view.bodies().length, 1);
        assert.equal(text(view.bodies()[0]!), input.result);
      }
      assert.equal(view.toggles(), 1);
      assert.equal(view.header().props["aria-expanded"], true);
      await view.setOpen(false);
      assert.equal(view.header().props["aria-expanded"], false);
      assert.equal(view.bodies().length, 0, "external persisted false is honored without another toggle");
      assert.equal(view.toggles(), 1);
      await view.click();
      assert.equal(view.toggles(), 2);
      assert.equal(view.bodies().length, 1);
      await view.click();
      assert.equal(view.toggles(), 3);
      assert.equal(view.bodies().length, 0);
    } finally { await view.close(); }
  });
}
