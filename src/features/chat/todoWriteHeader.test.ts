import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { ToolRowProps } from "./ToolRows.tsx";
import type { TranscriptProps } from "./Transcript.tsx";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import * as view from "./view.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { userMessageCopyText } from "./userMessageCopy.ts";
import { assistantDisplayText } from "./assistantText.ts";

interface Instance {
  type: string | React.ComponentType;
  props: { className?: string; "aria-expanded"?: boolean; onClick?: () => void };
  children: (Instance | string)[];
  findAll: (predicate: (node: Instance) => boolean) => Instance[];
}
interface Mounted { root: Instance; unmount: () => void }
interface Todo { content: string; status: string }
interface Case {
  id: string;
  name?: "TodoRead";
  status?: "running" | "failed";
  todos: Todo[];
  headers: [string, string | null][];
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
      case "./markdown.ts": return { Markdown: unexpected("Markdown"), highlight: unexpected("highlight") };
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
const selected = ["toolDisclosure", "Transcript", "rowTurn", "groupTurns", "Row", "Agent", "SummaryRow", "Part"].map((name) => {
  const node = ast.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
  assert.ok(node, `${name} exists in production source`);
  return node.getText(ast);
}).join("\n");
function productionTranscript() {
  const exports: { Transcript?: React.ComponentType<TranscriptProps> } = {};
  runInNewContext(compile(selected, "Transcript.tsx"), {
    exports,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return localRequire(name); },
    React, Fragment: React.Fragment,
    useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    useBoolPref: () => false, assistantDisplayText,
    ...view, ...groups, ...time, ...toolExports, userMessageCopyText,
    LinkMenuNotify: React.createContext(undefined),
    TurnFooter: () => null, MessageActions: () => null,
    UserText: ({ text }: { text: string }) => React.createElement("span", null, text),
    Markdown: unexpected("Transcript Markdown"), Lucide: () => null, ToolIcon: () => null,
    ThinkingRow: unexpected("ThinkingRow"), SentUserContent: unexpected("SentUserContent"), LinkWithMenu: unexpected("LinkWithMenu"),
    setTimeout, clearTimeout,
  }, { filename: "Transcript.tsx" });
  assert.ok(exports.Transcript);
  return exports.Transcript;
}
const inputBytes = readFileSync(new URL("./todoWriteHeader.inputs.json", import.meta.url));
const inputHash = createHash("sha256").update(inputBytes).digest("hex");
assert.equal(inputHash, "8baed89bb331a64fa96f6de8019c7116d55c0e1b7c8d31efd16dc2090d95f901");
const declared = JSON.parse(inputBytes.toString("utf8")) as { cases: Case[] };
assert.equal(declared.cases.length, 20);
const text = (node: Instance | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Instance, name: string): boolean => node.props.className?.split(" ").includes(name) ?? false;

for (const entry of declared.cases) {
  test(`TodoWrite nonmixed header: ${entry.id}`, () => {
    const chatId = `todo-write-header:${entry.id}`;
    const at = new Date("2026-11-17T00:00:00Z");
    const started = startTurn(reasonChat(chatId), "Update the plan", at, `turn:${entry.id}`);
    const name = entry.name ?? "TodoWrite";
    const input = name === "TodoRead" ? { todos: [{ content: "STALE INPUT", status: "pending" }] } : { todos: entry.todos };
    const step = applyReasonPayload(started.state, {
      type: "tool", chatId, id: entry.id, title: name, kind: "other", status: entry.status ?? "completed",
      output: name === "TodoRead" ? JSON.stringify(entry.todos) : "updated",
      ...(name === "TodoRead" ? { rawResult: entry.todos } : {}),
      toolName: name, rawInput: input, diffs: [], locations: [],
    }, at);
    const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
    assert.ok(reduced.ok);
    const parts = view.buildRows(reduced.transcript).flatMap((row) => row.kind === "assistant" ? row.parts : []);
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.kind, "tool");
    const part = parts[0];
    assert.ok(part?.kind === "tool");
    assert.deepEqual(part.call.tool, { name, input });
    const ProductionTranscript = productionTranscript();
    let mounted: Mounted | undefined;
    act(() => { mounted = renderer.create(React.createElement(ProductionTranscript, { transcript: reduced.transcript, now: () => at.getTime() })); });
    assert.ok(mounted);
    const result = mounted;
    const all = (className: string): Instance[] => result.root.findAll((node) => typeof node.type === "string" && hasClass(node, className));
    const headers = (): [string, string | null][] => all("oc-tool-head").map((header) => {
      const left = header.findAll((node) => hasClass(node, "oc-tool-left"));
      const right = header.findAll((node) => hasClass(node, "oc-tool-right"));
      assert.equal(left.length, 1);
      return [text(left[0]!), right.length ? text(right[0]!) : null];
    });
    try {
      assert.deepEqual(headers(), entry.headers, "input todo states select the reference header");
      assert.equal(all("oc-tool-content").length, 0, "todo content starts collapsed");
      if (entry.todos.length > 0) {
        const first = all("oc-tool-head")[0]!;
        assert.equal(first.props["aria-expanded"], false);
        assert.equal(typeof first.props.onClick, "function");
        act(() => { first.props.onClick!(); });
        assert.deepEqual(headers(), entry.headers, "opening does not rewrite header text");
        const bodies = all("oc-tool-content");
        assert.equal(bodies.length, 1, "a mixed row toggle remains independent");
        assert.equal(text(bodies[0]!), entry.todos.map((todo) => `${todo.status === "completed" ? "✓" : "○"} ${todo.content}`).join("\n"));
        assert.equal(hasClass(all("oc-tool-right")[0]!, "hidden"), true);
        act(() => { all("oc-tool-head")[0]!.props.onClick!(); });
        assert.equal(all("oc-tool-content").length, 0);
        assert.deepEqual(headers(), entry.headers);
        assert.equal(hasClass(all("oc-tool-right")[0]!, "hidden"), false);
      }
    } finally { act(() => { result.unmount(); }); }
  });
}
