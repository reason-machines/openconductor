import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn, type ReasonTool } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const unrelated = () => { throw new Error("Unrelated Glob dependency executed"); };
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

type Case = {
  id: string;
  name: "Glob" | "LS" | "Grep";
  input: Record<string, unknown>;
  result: string | null;
  status?: ReasonTool["status"];
};

async function fixture(input: Case) {
  const chatId = `glob-lines:${input.id}`;
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Inspect files", at);
  const status = input.status ?? "completed";
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: input.id, title: input.name, kind: "search", toolName: input.name,
    rawInput: input.input, status, output: input.result, diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  const call = part.call;
  assert.deepEqual(call.tool, { name: input.name, input: input.input });
  assert.equal(call.result, status === "running" ? undefined : input.result);
  assert.equal(call.status, status === "failed" ? "error" : status === "running" ? "running" : "done");
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
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (className: string): Node => {
    const found = all((node) => hasClass(node, className)); assert.equal(found.length, 1); return found[0]!;
  };
  return {
    all, one, call,
    bodies: () => all((node) => hasClass(node, "oc-tool-content")),
    toggles: () => toggles,
    async click() {
      const handler = one("oc-tool-head").props.onClick;
      assert.ok(typeof handler === "function");
      await act(async () => { handler(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const projected = [
  { id: "padded", result: "\n  /repo/a.ts  \n\t\n/repo/b.ts\n", lines: ["/repo/a.ts", "/repo/b.ts"] },
  { id: "interior-blanks", result: "/repo/a.ts\n\n  \n/repo/b.ts", lines: ["/repo/a.ts", "/repo/b.ts"] },
  { id: "crlf-tabs", result: "\t/repo/a.ts\t\r\n/repo/b.ts\r\n", lines: ["/repo/a.ts", "/repo/b.ts"] },
  { id: "spaces-preserved", result: "  /repo/my file.ts  \n/repo/no-space.ts", lines: ["  /repo/my file.ts  ", "/repo/no-space.ts"] },
  { id: "order-duplicates", result: "/repo/b.ts\n/repo/a.ts\n/repo/b.ts", lines: ["/repo/b.ts", "/repo/a.ts", "/repo/b.ts"] },
  { id: "whitespace-only", result: "\n \t\r\n\u00a0\n", lines: [] },
  { id: "internal-tabs", result: "\t/repo/my\tfile.ts\t", lines: ["/repo/my\tfile.ts"] },
  { id: "literal-markup", result: " <b>file</b> \n&plain.ts", lines: ["<b>file</b>", "&plain.ts"] },
];
for (const input of projected) {
  test(`Glob projected block lines: ${input.id}`, async () => {
    const view = await fixture({ ...input, name: "Glob", input: { pattern: "**/*.ts" } });
    try {
      assert.equal(text(view.one("oc-tool-left")), "Glob");
      assert.equal(text(view.one("oc-code-chip")), "**/*.ts");
      assert.equal(view.one("oc-tool-head").props["aria-expanded"], false);
      assert.equal(view.bodies().length, 0);
      await view.click();
      const body = view.one("oc-tool-content");
      assert.equal(text(body), input.lines.join(""), `GLOB_LINE_TEXT_${input.id}`);
      const blocks = view.all((node) => node.type === "code").flatMap((node) => node.children);
      assert.deepEqual(blocks.map((line) => typeof line === "string" ? line : text(line)), input.lines, `GLOB_BLOCK_LINES_${input.id}`);
      assert.ok(blocks.every((line) => typeof line !== "string" && line.type === "div"));
      assert.equal(view.all((node) => node.type === "a" || node.type === "button").length, 0, "projection adds no file actions");
      assert.equal(view.call.result, input.result, "raw provider result stays byte-identical");
      await view.click();
      assert.equal(view.bodies().length, 0);
      assert.equal(view.toggles(), 2);
    } finally { await view.close(); }
  });
}

for (const input of [
  { id: "empty", name: "Glob", input: { pattern: "**/*.ts" }, result: "" },
  { id: "pending", name: "Glob", input: { pattern: "**/*.ts" }, result: null, status: "running" },
  { id: "error", name: "Glob", input: { pattern: "**/*.ts" }, result: "  error\n\ntext ", status: "failed" },
] satisfies Case[]) {
  test(`Glob no successful body control: ${input.id}`, async () => {
    const view = await fixture(input);
    try {
      assert.equal(text(view.one("oc-tool-left")), "Glob");
      assert.equal(text(view.one("oc-code-chip")), "**/*.ts");
      assert.equal(view.bodies().length, 0);
      assert.equal(view.one("oc-tool-head").props.onClick, undefined);
      assert.equal(view.toggles(), 0);
    } finally { await view.close(); }
  });
}

for (const input of [
  { id: "ls-raw", name: "LS", input: { path: "src" }, result: "\n  /repo/a.ts  \n\n/repo/b.ts\n", label: "List files" },
  { id: "grep-raw", name: "Grep", input: { pattern: "needle", path: "/repo/packages/chat/src" }, result: "\n first\n\nsecond \n", label: "grep for 'needle' in chat/src" },
] satisfies Array<Case & { label: string }>) {
  test(`Non-Glob raw result control: ${input.id}`, async () => {
    const view = await fixture(input);
    try {
      assert.equal(text(view.one("oc-tool-left")), input.label);
      await view.click();
      assert.equal(text(view.one("oc-tool-content")), input.result);
      if (input.name === "Grep") assert.equal(text(view.one("oc-tool-count")), "2 matches");
    } finally { await view.close(); }
  });
}
