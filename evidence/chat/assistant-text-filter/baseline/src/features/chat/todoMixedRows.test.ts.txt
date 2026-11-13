import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { ToolRowProps } from "./ToolRows.tsx";
import type { TranscriptProps } from "./Transcript.tsx";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { applyReasonPayload, reasonChat, startTurn, type ReasonPayload } from "./reason.ts";
import * as view from "./view.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { userMessageCopyText } from "./userMessageCopy.ts";

interface Instance {
  type: string | React.ComponentType;
  props: { className?: string; "aria-expanded"?: boolean; onClick?: () => void };
  children: (Instance | string)[];
  findAll: (predicate: (node: Instance) => boolean) => Instance[];
}
interface Mounted {
  root: Instance;
  update: (element: React.ReactElement) => void;
  unmount: () => void;
}
const localRequire = createRequire(import.meta.url);
const renderer: { act: (callback: () => void) => void; create: (element: React.ReactElement) => Mounted } = localRequire("react-test-renderer");
const { act } = renderer;
const unexpected = (name: string) => () => { throw new Error(`Unrelated leaf rendered: ${name}`); };

function compile(source: string, fileName: string): string {
  const result = ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
}
const toolExports: { ConductorToolRow?: React.ComponentType<ToolRowProps>; opensByDefault?: (tool: tools.ConductorTool) => boolean } = {};
runInNewContext(compile(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), "ToolRows.tsx"), {
  exports: toolExports,
  require(name: string) {
    switch (name) {
      case "react": return React;
      case "react/jsx-runtime": return localRequire(name);
      case "./conductorTools.ts": return tools;
      case "./toolIconData.ts": return icons;
      case "./thinkingChip.ts": return { thinkingChipText };
      case "./markdown.ts": return { Markdown: unexpected("Markdown in todo row") };
      case "./LinkMenu.tsx": return { LinkWithMenu: unexpected("LinkWithMenu") };
      case "../../backend.ts": return { openUrl: unexpected("openUrl") };
      default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
    }
  },
}, { filename: "ToolRows.tsx" });
assert.ok(toolExports.ConductorToolRow);
assert.ok(toolExports.opensByDefault);

const transcriptSource = readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("Transcript.tsx", transcriptSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ["Transcript", "rowTurn", "groupTurns", "Row", "Agent", "SummaryRow", "Part"].map((name) => {
  const node = ast.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
  assert.ok(node, `${name} exists in production source`);
  return node.getText(ast);
}).join("\n");
const transcriptExports: { Transcript?: React.ComponentType<TranscriptProps> } = {};
runInNewContext(compile(selected, "Transcript.tsx"), {
  exports: transcriptExports,
  require(name: string) { assert.equal(name, "react/jsx-runtime"); return localRequire(name); },
  React, Fragment: React.Fragment,
  useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
  ...view, ...groups, ...time, ...toolExports, userMessageCopyText,
  LinkMenuNotify: React.createContext(undefined),
  TurnFooter: () => null,
  MessageActions: () => null,
  UserText: ({ text }: { text: string }) => React.createElement("span", null, text),
  Markdown: ({ text }: { text: string }) => React.createElement("span", null, text),
  Lucide: () => null, ToolIcon: () => null,
  ThinkingRow: unexpected("ThinkingRow"), SentUserContent: unexpected("SentUserContent"), LinkWithMenu: unexpected("LinkWithMenu"),
  setTimeout, clearTimeout,
}, { filename: "Transcript.tsx" });
assert.ok(transcriptExports.Transcript);
const ProductionTranscript = transcriptExports.Transcript;

interface Todo { content: string; status: string }
const mixed = [
  { content: "Inspect parser", status: "completed" },
  { content: "Add regression", status: "in_progress" },
  { content: "Run checks", status: "pending" },
];
const sessionId = "todo-mixed:claude";
const now = new Date("2026-11-11T00:00:00Z");
function fixture(todos: Todo[] = mixed, ids = ["todo-a"], toolName = "TodoWrite"): ChatTranscript {
  const initial = startTurn(reasonChat(sessionId), "Update the plan", now, "todo-turn");
  let state = initial.state;
  let transcript = emptyTranscript(sessionId);
  const apply = (events: Parameters<typeof applyChatEvents>[1]) => {
    const result = applyChatEvents(transcript, events);
    assert.ok(result.ok);
    transcript = result.transcript;
  };
  apply(initial.events);
  for (const id of ids) {
    const payload: ReasonPayload = {
      type: "tool", chatId: sessionId, id, title: "TodoWrite", kind: "other", status: "completed", output: "updated",
      diffs: [], locations: [], toolName, rawInput: { todos },
    };
    const step = applyReasonPayload(state, payload, now);
    state = step.state;
    apply(step.events);
  }
  const rows = view.buildRows(transcript);
  const parts = rows.flatMap((r) => r.kind === "assistant" ? r.parts : []);
  assert.equal(parts.length, ids.length, "actual provider mapping, reducer and normalizer preserve ordinary tool calls");
  for (const part of parts) {
    assert.equal(part.kind, "tool");
    if (part.kind !== "tool") continue;
    assert.equal(part.call.tool.name, toolName);
    assert.deepEqual(part.call.tool.input, { todos });
  }
  return transcript;
}
function mount(t: { after: (callback: () => void) => void }, transcript = fixture(), props: Partial<TranscriptProps> = {}): Mounted {
  let mounted: Mounted | undefined;
  act(() => { mounted = renderer.create(React.createElement(ProductionTranscript, { transcript, now: () => now.getTime(), ...props })); });
  assert.ok(mounted);
  const result = mounted;
  t.after(() => act(() => result.unmount()));
  return result;
}
const hasClass = (node: Instance, name: string): boolean => node.props.className?.split(" ").includes(name) ?? false;
function text(node: Instance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
function all(root: Instance, className: string): Instance[] { return root.findAll((node) => hasClass(node, className)); }
function headers(mounted: Mounted): Instance[] { return all(mounted.root, "oc-tool-head"); }
function labelled(mounted: Mounted, label: string, index = 0): Instance {
  const node = headers(mounted).filter((node) => text(all(node, "oc-tool-left")[0]!) === label)[index];
  assert.ok(node, `production ${label} row exists`);
  return node;
}
function click(node: Instance): void { assert.ok(node.props.onClick); act(() => node.props.onClick?.()); }
const contents = (mounted: Mounted): string[] => all(mounted.root, "oc-tool-content").map(text);

// These are mounted production React components, not browser or native evidence.
test("ordinary mixed TodoWrite renders completed and started rows with the original active index", (t) => {
  const mounted = mount(t);
  assert.equal(headers(mounted).length, 2);
  assert.equal(text(labelled(mounted, "Todo completed")), "Todo completed1/3 completed");
  assert.equal(text(labelled(mounted, "Todo started")), "Todo started2. Add regression");
  assert.deepEqual(headers(mounted).map((node) => node.props["aria-expanded"]), [false, false]);
  assert.deepEqual(contents(mounted), []);
});

test("completed and started disclosures toggle independently and show the same complete list", (t) => {
  const mounted = mount(t);
  click(labelled(mounted, "Todo completed"));
  assert.equal(labelled(mounted, "Todo completed").props["aria-expanded"], true);
  assert.equal(labelled(mounted, "Todo started").props["aria-expanded"], false);
  assert.deepEqual(contents(mounted), ["✓ Inspect parser\n○ Add regression\n○ Run checks"]);
  click(labelled(mounted, "Todo started"));
  assert.equal(contents(mounted).length, 2);
  click(labelled(mounted, "Todo completed"));
  assert.equal(labelled(mounted, "Todo completed").props["aria-expanded"], false);
  assert.equal(labelled(mounted, "Todo started").props["aria-expanded"], true);
  assert.equal(contents(mounted).length, 1);
});

test("different tool-use identities do not share either disclosure entry", (t) => {
  const mounted = mount(t, fixture(mixed, ["todo-a", "todo-b"]));
  click(labelled(mounted, "Todo completed", 0));
  assert.equal(headers(mounted).length, 4);
  assert.deepEqual(headers(mounted).map((node) => node.props["aria-expanded"]), [true, false, false, false]);
});

test("summary unmount and remount retains independent entries in the existing Transcript map", (t) => {
  const original = fixture();
  const assistant = original.messages.find((m) => m.role === "assistant");
  assert.ok(assistant);
  const result = applyChatEvents(original, [
    ...["Step two", "Step three", "Final response"].map((content, i) => ({ type: "upsert", message: {
      ...assistant, id: `extra-${i}`, blocks: [{ type: "text", text: content }],
    } } satisfies Parameters<typeof applyChatEvents>[1][number])),
    { type: "turn_status", sessionId, turnId: "todo-turn", status: "completed" },
  ]);
  assert.ok(result.ok);
  const mounted = mount(t, result.transcript);
  const summary = () => all(mounted.root, "oc-summary")[0]!;
  assert.equal(headers(mounted).length, 0);
  click(summary());
  const before = labelled(mounted, "Todo started");
  click(before);
  click(summary());
  assert.equal(headers(mounted).length, 0);
  click(summary());
  assert.notEqual(labelled(mounted, "Todo started"), before, "the row really remounted");
  assert.equal(labelled(mounted, "Todo completed").props["aria-expanded"], false);
  assert.equal(labelled(mounted, "Todo started").props["aria-expanded"], true);
  assert.equal(contents(mounted).length, 1);
});

test("mixed active item uses its actual position and the source fallback label", (t) => {
  const mounted = mount(t, fixture([
    { content: "Waiting", status: "pending" },
    { content: "Done", status: "completed" },
    { content: "", status: "in_progress" },
  ]));
  assert.equal(text(labelled(mounted, "Todo started")), "Todo started3. todo");
});

for (const [name, statuses] of [
  ["empty", []], ["only active", ["in_progress"]], ["no active", ["completed", "pending"]],
  ["all completed", ["completed", "completed"]], ["only pending", ["pending"]],
] satisfies [string, string[]][]) {
  test(`nonmixed ${name} input retains one ordinary row`, (t) => {
    const mounted = mount(t, fixture(statuses.map((status, i) => ({ content: `Item ${i}`, status }))));
    assert.equal(headers(mounted).length, 1);
    assert.equal(text(headers(mounted)[0]!).includes("Todo started"), false);
  });
}

test("TodoRead is outside this ordinary TodoWrite change", (t) => {
  const mounted = mount(t, fixture(mixed, ["todo-read"], "TodoRead"));
  assert.equal(headers(mounted).length, 1);
});

test("existing expand-tools preference applies independently to both mixed disclosures", (t) => {
  const mounted = mount(t, fixture(), { expandToolsByDefault: true });
  assert.equal(headers(mounted).length, 2);
  assert.deepEqual(headers(mounted).map((node) => node.props["aria-expanded"]), [true, true]);
  click(labelled(mounted, "Todo started"));
  assert.deepEqual(headers(mounted).map((node) => node.props["aria-expanded"]), [true, false]);
});
