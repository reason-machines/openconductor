import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import fixtures from "./typedSubagentErrorResult.inputs.json" with { type: "json" };
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { Markdown } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const fixtureBytes = readFileSync(new URL("./typedSubagentErrorResult.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(fixtureBytes).digest("hex"), "822dd89682e766b9dfa4fae06bdd63cb2e9984ca4f368cf2f54a9198dceea5ce");
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
const hasClass = (node: Node, name: string): boolean => name.split(" ").every((part) => String(node.props.className).split(" ").includes(part));
const all = (root: Node, className: string): Node[] => root.findAll((node) => typeof node.type === "string" && hasClass(node, className));
const one = (root: Node, className: string): Node => {
  const nodes = all(root, className);
  assert.equal(nodes.length, 1, className);
  const node = nodes[0];
  assert.ok(node);
  return node;
};
const unrelated = () => { throw new Error("Unrelated typed-subagent dependency executed"); };
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((diagnostic: { category: number }) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);

for (const input of fixtures.cases) {
  test(`Typed subagent failed-result disclosure: ${input.id}`, async () => {
    const copied: string[] = [];
    const timers: Array<() => void> = [];
    const production: Record<string, unknown> = {};
    runInNewContext(compiled.outputText, {
      exports: production,
      navigator: { clipboard: { writeText: async (value: string) => { copied.push(value); } } },
      setTimeout(callback: () => void, delay: number) {
        assert.equal(delay, 1500, "Only the copy confirmation timer reaches this boundary");
        timers.push(callback);
        return timers.length;
      },
      require(name: string) {
        switch (name) {
          case "react": case "react/jsx-runtime": return dependencies(name);
          case "./conductorTools.ts": return tools;
          case "./toolIconData.ts": return icons;
          case "./thinkingChip.ts": return { thinkingChipText };
          case "./markdown.ts": return { Markdown, highlight: unrelated };
          case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
          case "../../backend.ts": return { openUrl: unrelated };
          default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
        }
      },
    }, { filename: "ToolRows.tsx" });
    assert.ok(typeof production.ConductorToolRow === "function");
    const chatId = `typed-subagent-error:${input.id}`;
    const at = new Date(0);
    const started = startTurn(reasonChat(chatId), "Inspect configuration", at);
    const pending = input.result === undefined;
    const step = applyReasonPayload(started.state, {
      chatId, type: "tool", id: input.id, title: input.tool, kind: "other", toolName: input.tool,
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
    assert.deepEqual(call.tool, { name: input.tool, input: input.input });
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
    async function event(node: Node, name: string, value?: unknown) {
      const handler = node.props[name];
      assert.ok(typeof handler === "function", `Production ${name} exists`);
      await act(async () => { await handler(value); });
    }
    async function tab(row: Node, label: string) {
      const nodes = all(row, "oc-subagent-tab").filter((node) => text(node) === label);
      assert.equal(nodes.length, 1, label);
      const node = nodes[0];
      assert.ok(node);
      await event(node, "onClick");
    }
    try {
      const row = one(renderer.root, "oc-tool");
      const head = one(row, "oc-tool-head");
      assert.equal(row.props["data-status"], status);
      assert.equal(all(row, "oc-subagent-type").length, input.expected.typed ? 1 : 0);
      assert.equal(all(row, "oc-tool-content").length, 0);
      assert.equal(head.props["aria-expanded"], input.expected.expandable ? false : undefined, `TYPED_SUBAGENT_DISCLOSURE_${input.id}`);
      if (!input.expected.expandable) {
        assert.equal(head.props.onClick, undefined);
        assert.equal(all(row, "oc-subagent-tabs").length, 0);
        assert.equal(all(row, "oc-copy-icon").length, 0);
        assert.equal(toggles, 0);
      } else if (input.expected.typed) {
        assert.equal(text(one(row, "oc-subagent-type")), "Explore\u2022Sonnet");
        await event(head, "onClick");
        assert.equal(one(row, "oc-tool-head").props["aria-expanded"], true);
        assert.equal(text(one(row, "oc-subagent-tab active")), "Formatted");
        assert.equal(all(row, "oc-subagent-tab").length, 2);
        assert.equal(text(one(row, "oc-subagent-body")), input.expected.text);
        assert.equal(all(row, "oc-subagent-raw").length, 0);
        let stopped = 0;
        await event(one(row, "oc-copy-icon"), "onClick", { stopPropagation: () => { stopped++; } });
        assert.equal(stopped, 1);
        assert.deepEqual(copied, [input.result]);
        assert.equal(toggles, 1, "Copy does not toggle the result");
        await act(async () => { for (const callback of timers.splice(0)) callback(); });
        await tab(row, "Raw");
        assert.equal(text(one(row, "oc-subagent-raw")), input.result);
        await event(one(row, "oc-tool-head"), "onClick");
        assert.equal(all(row, "oc-tool-content").length, 0);
        await event(one(row, "oc-tool-head"), "onClick");
        assert.equal(text(one(row, "oc-subagent-tab active")), "Raw");
        assert.equal(text(one(row, "oc-subagent-raw")), input.result);
        await tab(row, "Formatted");
        assert.equal(text(one(row, "oc-subagent-body")), input.expected.text);
        await event(one(row, "oc-tool-head"), "onClick");
        assert.equal(all(row, "oc-tool-content").length, 0);
        assert.equal(toggles, 4);
      } else {
        await event(head, "onClick");
        const outputs = all(row, "oc-io-pre");
        const output = outputs[outputs.length - 1];
        assert.ok(output);
        assert.equal(text(output), input.expected.text);
        assert.equal(hasClass(output, "error"), true);
        assert.equal(all(row, "oc-subagent-tabs").length, 0);
        assert.equal(all(row, "oc-copy-icon").length, 0);
        assert.deepEqual(copied, []);
        await event(one(row, "oc-tool-head"), "onClick");
        assert.equal(all(row, "oc-tool-content").length, 0);
        assert.equal(toggles, 2);
      }
      assert.equal(call.result, input.result, "Original accepted-string result is retained byte-for-byte");
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
