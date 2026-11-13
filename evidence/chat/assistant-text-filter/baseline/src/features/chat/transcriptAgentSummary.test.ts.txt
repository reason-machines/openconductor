import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { TranscriptProps } from "./Transcript.tsx";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import type { Block, ChatEvent, ChatMessage, TurnStatus } from "./types.ts";
import * as view from "./view.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";
import { toolKind } from "./conductorTools.ts";
import { userMessageCopyText } from "./userMessageCopy.ts";

function statements(path: string, names: string[]): string {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map((name) => {
    const node = source.statements.find((node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === name
      || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
    assert.ok(node, `${name} exists in production source`);
    return node.getText(source);
  }).join("\n");
}

const selected = statements("./Transcript.tsx", ["Transcript", "rowTurn", "groupTurns", "Row", "Agent", "SummaryRow", "Part"]);
const toolDefault = statements("./ToolRows.tsx", ["opensByDefault"]);
const transition = `
function SummaryTransition({ summaryToggles, ...props }) {
  const [toggles, setToggles] = useState(0);
  const tree = Transcript(props);
  if (toggles < summaryToggles) {
    let changed = false;
    function visit(children) {
      React.Children.forEach(children, (child) => {
        if (changed || !React.isValidElement(child)) return;
        if (child.type === SummaryRow && child.props.onToggle) {
          changed = true;
          child.props.onToggle();
          setToggles(toggles + 1);
        } else if (child.type === Row || child.type === Agent) {
          visit(child.type(child.props));
        } else {
          visit(child.props.children);
        }
      });
    }
    visit(tree);
    if (!changed) throw new Error("No production summary toggle reached");
  }
  return tree;
}
exports.SummaryTransition = SummaryTransition;
`;
const userText = statements("./UserText.tsx", ["trimUserUrl", "isOrdinaryUserUrl", "UserText"]);
const compiled = ts.transpileModule(`${selected}\n${toolDefault}\n${userText}\n${transition}`, {
  fileName: "Transcript.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
const localRequire = createRequire(import.meta.url);
const renderers: {
  Transcript?: React.ComponentType<TranscriptProps>;
  SummaryTransition?: React.ComponentType<TranscriptProps & { summaryToggles: number }>;
} = {};
const unexpected = (name: string) => () => { throw new Error(`Unexercised leaf reached: ${name}`); };
runInNewContext(compiled.outputText, {
  exports: renderers,
  URL,
  require(name: string) { assert.equal(name, "react/jsx-runtime"); return localRequire(name); },
  React,
  Fragment: React.Fragment,
  useMemo: React.useMemo,
  useState: React.useState,
  useSyncExternalStore: React.useSyncExternalStore,
  ...view, ...groups, ...time, toolKind, userMessageCopyText,
  LinkMenuNotify: React.createContext(undefined),
  TurnFooter: () => null,
  MessageActions: () => null,
  Lucide: ({ name, className }: { name: string; className?: string }) => React.createElement("i", { "data-icon-leaf": name, className }),
  ToolIcon: ({ name, className }: { name: string; className?: string }) => React.createElement("i", { "data-tool-icon-leaf": name, className }),
  Markdown: ({ text, className }: { text: string; className?: string }) => React.createElement("span", { "data-markdown-leaf": true, className }, text),
  ConductorToolRow: ({ tool, open }: { tool: { name: string }; open: boolean }) => React.createElement("span", { "data-tool-leaf": tool.name, "data-tool-open": String(open) }, tool.name),
  LinkWithMenu: unexpected("LinkWithMenu"),
  ThinkingRow: unexpected("ThinkingRow"),
  openUrl: unexpected("openUrl"),
  reportLabel: unexpected("reportLabel"),
}, { filename: "Transcript.tsx" });
assert.equal(typeof renderers.Transcript, "function");
assert.ok(renderers.Transcript);
assert.ok(renderers.SummaryTransition);
const ProductionTranscript = renderers.Transcript;
const SummaryTransition = renderers.SummaryTransition;

const sid = "summary-probe";
const status = (turnId: string, status: TurnStatus): ChatEvent => ({ type: "turn_status", sessionId: sid, turnId, status });
const message = (turnId: string, id: string, role: ChatMessage["role"], blocks: Block[]): ChatEvent => ({ type: "upsert", message: {
  id: `${turnId}:${id}`, sessionId: sid, turnId, role, blocks, createdAt: "2026-11-10T00:00:00Z",
} });
const said = (text: string): Block => ({ type: "text", text });
function turnEvents(turnId: string, { running = false, count = 3, sameMessage = false } = {}): ChatEvent[] {
  const calls = Array.from({ length: count }, (_, i) => ({ type: "tool_use", id: `${turnId}:tool-${i}`, name: "Read", input: { file_path: `/repo/${i}.txt` } } satisfies Block));
  const steps = sameMessage
    ? [message(turnId, "tools", "assistant", calls)]
    : calls.map((call, i) => message(turnId, `step-${i}`, "assistant", [call]));
  return [
    status(turnId, "running"),
    message(turnId, "user", "user", [said(`Prompt ${turnId}`)]),
    ...steps,
    ...calls.map((call, i) => message(turnId, `result-${i}`, "user", [{ type: "tool_result", toolUseId: call.id, content: "ok" }])),
    message(turnId, "final", "assistant", [said(`Final ${turnId}`)]),
    ...(running ? [] : [status(turnId, "completed")]),
  ];
}
function transcript(events: ChatEvent[]): ChatTranscript {
  const result = applyChatEvents(emptyTranscript(sid), events);
  assert.ok(result.ok);
  return result.transcript;
}
function render(transcript: ChatTranscript, props: Omit<TranscriptProps, "transcript"> = {}, summaryToggles = 0) {
  const input = { transcript, now: () => Date.parse("2026-11-10T00:00:00Z"), ...props };
  const html = renderToStaticMarkup(summaryToggles
    ? React.createElement(SummaryTransition, { ...input, summaryToggles })
    : React.createElement(ProductionTranscript, input));
  const blocks = groups.foldAgentRows(view.buildRows(transcript), transcript.activeTurn).filter((r) => r.kind === "agent");
  return {
    blocks,
    summaryHeaders: (html.match(/class="chat-tool-summary-row oc-summary"/g) ?? []).length,
    collapsedHeaders: (html.match(/aria-expanded="false" aria-label="Expand 3 tool calls"/g) ?? []).length,
    expandedHeaders: (html.match(/aria-expanded="true" aria-label="Collapse 3 tool calls"/g) ?? []).length,
    renderedTools: (html.match(/data-tool-leaf="Read"/g) ?? []).length,
    expandedTools: (html.match(/data-tool-open="true"/g) ?? []).length,
    html,
  };
}
function finalVisible(o: ReturnType<typeof render>, id = "t1") {
  assert.ok(o.html.includes(`Final ${id}</span>`), "final text remains visible");
  assert.ok(o.html.includes('class="oc-prose chat-text'), "actual Part passes the preview class to Markdown");
  assert.doesNotMatch(o.html, /class="oc-prose chat-text muted/, "final-only text is not muted");
}
for (const [name, running, dontCollapseToolCalls] of [
  ["running default", true, false],
  ["finished dontCollapseToolCalls", false, true],
  ["running plus dontCollapseToolCalls", true, true],
] satisfies [string, boolean, boolean][]) {
  test(`${name} omits summary header and retains all parts`, () => {
    const o = render(transcript(turnEvents("t1", { running })), { dontCollapseToolCalls });
    assert.equal(o.blocks[0]?.items.filter((i) => i.kind === "summary").length, 1, "real folding creates a summary candidate");
    assert.equal(o.renderedTools, 3, "all tool parts render");
    finalVisible(o);
    assert.equal(o.summaryHeaders, 0, "noncollapsible work must not render a summary header");
  });
}

test("finished normal batch is collapsed and final text is visible", () => {
  const o = render(transcript(turnEvents("t1")));
  assert.equal(o.summaryHeaders, 1);
  assert.equal(o.collapsedHeaders, 1);
  assert.equal(o.renderedTools, 0);
  finalVisible(o);
});
for (const toggles of [1, 2]) {
  test(`normal summary preserves its real toggle after ${toggles} activation(s)`, () => {
    const o = render(transcript(turnEvents("t1")), {}, toggles);
    assert.equal(o.summaryHeaders, 1);
    assert.equal(o.expandedHeaders, toggles === 1 ? 1 : 0);
    assert.equal(o.collapsedHeaders, toggles === 2 ? 1 : 0);
    assert.equal(o.renderedTools, toggles === 1 ? 3 : 0);
    assert.equal(o.expandedTools, 0, "summary expansion does not expand individual tool bodies");
    assert.doesNotMatch(o.html, /disabled=""/, "normal summary remains toggleable");
    finalVisible(o);
  });
}
for (const running of [false, true]) {
  test(`no-summary final-only turn running=${running}`, () => {
    const o = render(transcript(turnEvents("t1", { running, count: 0 })));
    assert.equal(o.summaryHeaders, 0);
    assert.equal(o.renderedTools, 0);
    finalVisible(o);
  });
}
for (const [running, dontCollapseToolCalls] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`two-message short batch running=${running} dontCollapse=${dontCollapseToolCalls}`, () => {
    const o = render(transcript(turnEvents("t1", { running, count: 2 })), { dontCollapseToolCalls });
    assert.equal(o.summaryHeaders, 0);
    assert.equal(o.renderedTools, 2);
    finalVisible(o);
  });
}

test("earlier completed turn stays collapsed while only the latest running turn loses its header", () => {
  const o = render(transcript([...turnEvents("old"), ...turnEvents("new", { running: true })]));
  assert.deepEqual(o.blocks.map((b) => [b.turnId, b.running]), [["old", false], ["new", true]]);
  assert.equal(o.collapsedHeaders, 1, "completed turn keeps its collapsed header");
  assert.equal(o.renderedTools, 3, "only running turn tools are inline");
  finalVisible(o, "old");
  finalVisible(o, "new");
  assert.equal(o.summaryHeaders, 1, "only the earlier completed turn has a summary header");
});

test("expandToolsByDefault alone does not hide a collapsible summary", () => {
  const o = render(transcript(turnEvents("t1")), { expandToolsByDefault: true });
  assert.equal(o.summaryHeaders, 1);
  assert.equal(o.collapsedHeaders, 1);
  assert.equal(o.renderedTools, 0);
  finalVisible(o);
});
for (const running of [false, true]) {
  test(`independent expandToolsByDefault expands inline short-batch tools running=${running}`, () => {
    const o = render(transcript(turnEvents("t1", { running, count: 2 })), { expandToolsByDefault: true });
    assert.equal(o.summaryHeaders, 0);
    assert.equal(o.renderedTools, 2);
    assert.equal(o.expandedTools, 2);
    finalVisible(o);
  });
}
for (const [name, running, dontCollapseToolCalls] of [
  ["running", true, false], ["dontCollapse", false, true],
] satisfies [string, boolean, boolean][]) {
  test(`expandToolsByDefault plus ${name} keeps expanded inline tools without a summary header`, () => {
    const o = render(transcript(turnEvents("t1", { running })), { dontCollapseToolCalls, expandToolsByDefault: true });
    assert.equal(o.renderedTools, 3);
    assert.equal(o.expandedTools, 3);
    finalVisible(o);
    assert.equal(o.summaryHeaders, 0, "noncollapsible work must not render a summary header");
  });
}

test("three tools in one assistant message do not invent a summary", () => {
  const o = render(transcript(turnEvents("t1", { sameMessage: true })));
  assert.equal(o.summaryHeaders, 0);
  assert.equal(o.renderedTools, 3);
  finalVisible(o);
});
