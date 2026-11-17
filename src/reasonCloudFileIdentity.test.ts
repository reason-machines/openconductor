// Frozen regression: source-valid ACP -> actual Rust routing/parser/wire -> actual
// Reason event adapter/reducer/save-replay -> mounted Transcript/FileBadge click ->
// exact extracted production ChatPanel and workspace file-open callbacks.
// No provider, application, browser, file read/write IPC or user data is used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { applyReasonPayload, permissionPrompt, reasonChat, startTurn, type ReasonChatState, type ReasonPayload, type ReasonPath } from "./features/chat/reason.ts";
import { applyChatEvents, emptyTranscript } from "./features/chat/reducer.ts";
import { diffForSave, restoreEvents } from "./features/chat/persist.ts";
import type { TranscriptProps } from "./features/chat/Transcript.tsx";
import type { ToolRowProps } from "./features/chat/ToolRows.tsx";
import * as view from "./features/chat/view.ts";
import * as groups from "./features/chat/toolGroups.ts";
import * as time from "./features/chat/turnTime.ts";
import * as tools from "./features/chat/conductorTools.ts";
import * as icons from "./features/chat/toolIconData.ts";
import { thinkingChipText } from "./features/chat/thinkingChip.ts";
import { userMessageCopyText } from "./features/chat/userMessageCopy.ts";
import { assistantDisplayText } from "./features/chat/assistantText.ts";

interface Instance {
  type: string | React.ComponentType;
  props: Record<string, unknown> & { className?: string; onClick?: (e: { stopPropagation: () => void }) => void };
  children: (Instance | string)[];
  findAll: (predicate: (node: Instance) => boolean) => Instance[];
}
interface Mounted { root: Instance; unmount: () => void }
interface Case {
  id: string;
  kind: string;
  mode: "diff" | "viewer";
  paths: ReasonPath[];
  output: string;
  notifications: unknown[];
}
const localRequire = createRequire(import.meta.url);
const renderer: { act: (callback: () => void) => void; create: (element: React.ReactElement) => Mounted } = localRequire("react-test-renderer");
const { act } = renderer;
const evidence = new URL("../evidence/chat/reason-cloud-file-identity/", import.meta.url);
const bytes = (name: string) => readFileSync(new URL(name, evidence));
const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
assert.equal(digest(bytes("inputs.json")), "4f90d373a92b0a9f99b7a458a3805761dbd2b257f98da188d47b4e02c3f629ca");
const declared = JSON.parse(bytes("inputs.json").toString()) as { chatId: string; sessionId: string; cwd: string; cases: Case[] };
const payloadBytes = bytes("wire.json");
const payloads = JSON.parse(payloadBytes.toString()) as ReasonPayload[];
const captures: { name: string; text: string; sha256: string }[] = [];
function capture(name: string, text: string): string {
  captures.push({ name, text, sha256: digest(text) });
  return text;
}
function source(path: string): string { return readFileSync(new URL(path, import.meta.url), "utf8"); }
function compile(text: string, fileName: string): string {
  const compiled = ts.transpileModule(text, {
    fileName, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, fileName);
  return compiled.outputText;
}
function astFor(text: string, name: string) { return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function nodes(ast: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  return found;
}
function evaluate<T>(expression: string, globals: Record<string, unknown>, fileName: string): T {
  const exports: { value?: T } = {};
  runInNewContext(compile(`export const value = (${expression});`, fileName), { exports, ...globals }, { filename: fileName });
  assert.ok(exports.value);
  return exports.value;
}
const unexpected = (name: string) => () => { throw new Error(`Unrelated leaf executed: ${name}`); };

const toolExports: { ConductorToolRow?: React.ComponentType<ToolRowProps>; opensByDefault?: (tool: tools.ConductorTool) => boolean } = {};
runInNewContext(compile(source("./features/chat/ToolRows.tsx"), "ToolRows.tsx"), {
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
  }, setTimeout, clearTimeout,
}, { filename: "ToolRows.tsx" });
assert.ok(toolExports.ConductorToolRow);
const transcriptAst = astFor(source("./features/chat/Transcript.tsx"), "Transcript.tsx");
const selected = ["toolDisclosure", "Transcript", "rowTurn", "groupTurns", "Row", "Agent", "SummaryRow", "Part"].map((name) => {
  const found = transcriptAst.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
  assert.equal(found.length, 1, `${name}: exactly one production declaration`);
  return capture(`Transcript.${name}`, found[0]!.getText(transcriptAst));
}).join("\n");
function productionTranscript() {
  const exports: { Transcript?: React.ComponentType<TranscriptProps> } = {};
  runInNewContext(compile(selected, "Transcript.tsx"), {
    exports, require(name: string) { assert.equal(name, "react/jsx-runtime"); return localRequire(name); },
    React, Fragment: React.Fragment,
    useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    useBoolPref: () => false, assistantDisplayText,
    ...view, ...groups, ...time, ...toolExports, userMessageCopyText,
    LinkMenuNotify: React.createContext(undefined),
    TurnFooter: () => null, MessageActions: () => null,
    UserText: ({ text }: { text: string }) => React.createElement("span", null, text),
    Markdown: unexpected("Transcript Markdown"), ThinkingRow: unexpected("ThinkingRow"),
    SentUserContent: unexpected("SentUserContent"), LinkWithMenu: unexpected("LinkWithMenu"),
    setTimeout, clearTimeout,
  }, { filename: "Transcript.tsx" });
  assert.ok(exports.Transcript);
  return exports.Transcript;
}
// Execute the existing backend event listener, not a hand-written payload-to-step formatter.
const reasonAst = astFor(source("./features/chat/reasonChat.ts"), "reasonChat.ts");
const backends = nodes(reasonAst, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "reasonBackend") as ts.VariableDeclaration[];
assert.equal(backends.length, 1);
const backend = backends[0]!.initializer;
assert.ok(backend && ts.isObjectLiteralExpression(backend));
const listener = backend.properties.filter((n) => ts.isPropertyAssignment(n) && n.name.getText(reasonAst) === "listen") as ts.PropertyAssignment[];
assert.equal(listener.length, 1);
const listenerExpression = capture("reasonBackend.listen", listener[0]!.initializer.getText(reasonAst));
const eventDeclarations = nodes(reasonAst, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "EVENT") as ts.VariableDeclaration[];
assert.equal(eventDeclarations.length, 1);
assert.ok(eventDeclarations[0]!.initializer);
const eventName = evaluate<string>(capture("reasonChat.EVENT", eventDeclarations[0]!.initializer.getText(reasonAst)), {}, "reasonChat.EVENT.ts");

const workspaceAst = astFor(source("./components/WorkspaceView.tsx"), "WorkspaceView.tsx");
function callback(name: string): string {
  const found = nodes(workspaceAst, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) as ts.VariableDeclaration[];
  assert.equal(found.length, 1, name);
  const init = found[0]!.initializer;
  assert.ok(init && ts.isCallExpression(init) && init.expression.getText(workspaceAst) === "useCallback");
  assert.ok(init.arguments[0] && ts.isArrowFunction(init.arguments[0]));
  return capture(`WorkspaceView.${name}`, init.arguments[0].getText(workspaceAst));
}
const openAnyFileText = callback("openAnyFile");
const openFileOrViewerText = callback("openFileOrViewer");
const normalizeAttrs = nodes(workspaceAst, (n) => ts.isJsxAttribute(n) && n.name.getText(workspaceAst) === "onOpenFile" && n.getText(workspaceAst).includes("path.startsWith(`${cwd}/`)")) as ts.JsxAttribute[];
assert.equal(normalizeAttrs.length, 1, "exact ChatPanel Transcript file-open binding");
const attr = normalizeAttrs[0]!.initializer;
assert.ok(attr && ts.isJsxExpression(attr) && attr.expression);
const normalizeText = capture("ChatPanel.Transcript.onOpenFile", attr.expression.getText(workspaceAst));

let state = reasonChat(declared.chatId);
let transcript = emptyTranscript(declared.chatId);
const at = new Date("2026-11-17T17:00:00Z");
const started = startTurn(state, "Inspect the same relative file locally, on cloud, then locally again", at, "fixture-turn");
state = started.state;
const begin = applyChatEvents(transcript, started.events);
assert.ok(begin.ok);
transcript = begin.transcript;
const sessionIds: string[] = [];
const deliveredChats: string[] = [];
let receive: ((event: { payload: ReasonPayload }) => void) | undefined;
const attachListener = evaluate<(deliver: (chat: string, step: (state: ReasonChatState) => ReturnType<typeof applyReasonPayload>) => void, permissions: object) => unknown>(listenerExpression, {
  listen(event: string, receiveEvent: typeof receive) { assert.equal(event, "reason-chat-event"); receive = receiveEvent; return Promise.resolve(() => {}); },
  applyReasonPayload, permissionPrompt, setRunningModel: () => {}, EVENT: eventName,
}, "reasonChat.listen.ts");
attachListener((chat, step) => {
  deliveredChats.push(chat);
  assert.equal(chat, declared.chatId);
  const next = step(state);
  state = next.state;
  if (next.sessionId) sessionIds.push(next.sessionId);
  const reduced = applyChatEvents(transcript, next.events);
  assert.ok(reduced.ok);
  transcript = reduced.transcript;
}, { requested: unexpected("permission"), resolved: unexpected("permission resolved") });
assert.ok(receive);
for (const payload of payloads) receive({ payload });
const saved = diffForSave(null, transcript).upserts.map((m) => m.fullMessage);
const restore = applyChatEvents(emptyTranscript(declared.chatId), restoreEvents(declared.chatId, saved));
assert.ok(restore.ok);
const replay = restore.transcript;
const parts = (t: typeof transcript) => view.buildRows(t).flatMap((r) => r.kind === "assistant" ? r.parts : []).flatMap((p) => p.kind === "tool" ? [p.call] : []);

function assertIdentity(t: typeof transcript) {
  for (const entry of declared.cases) {
    const calls = parts(t).filter((c) => c.id === entry.id || c.id.startsWith(`${entry.id}#`));
    assert.equal(calls.length, entry.paths.length, entry.id);
    calls.forEach((call, index) => {
      const input = call.input as { paths: ReasonPath[]; diffs?: { path: ReasonPath }[] };
      assert.deepEqual(input.paths[0], entry.paths[0], `${call.id}: exact primary location identity`);
      if (entry.kind !== "read") assert.deepEqual(input.diffs?.[index]?.path, entry.paths[index], `${call.id}: exact diff target identity`);
      assert.equal(call.result, entry.output, `${call.id}: exact output text`);
      assert.equal(call.tool.input.file_path, entry.paths[index]!.raw);
      assert.equal(call.status, "done");
    });
  }
}
const observations: unknown[] = [];
test("frozen source-valid inputs retain all local/cloud and return-to-local controls", () => {
  assert.equal(declared.cases.length, 12);
  assert.equal(declared.cases.reduce((sum, c) => sum + c.paths.length, 0), 13);
});
test("actual Rust routing/wire and Reason listener keep one chat/session, reject unknown session", () => {
  assert.equal(payloads.length, 25, "one sessionStarted plus pending/completed for twelve valid tools; unknown-session row excluded");
  assert.equal(deliveredChats.length, 25);
  assert.deepEqual([...new Set(deliveredChats)], [declared.chatId]);
  assert.deepEqual(sessionIds, [declared.sessionId]);
  assert.equal(payloads.some((p) => p.type === "tool" && p.id === "must-not-route"), false);
});
test("adapter/reducer preserve local/cloud path, parent/child session and result identity", () => assertIdentity(transcript));
test("save/restore preserves path and output identity in the same conversation", () => assertIdentity(replay));

for (const phase of ["live", "restored"] as const) for (const entry of declared.cases) {
  for (const [index, path] of entry.paths.entries()) test(`${phase} file target: ${entry.id}#${index} (${path.place}, ${entry.mode})`, () => {
    const target = phase === "live" ? transcript : replay;
    const effects: { kind: string; path?: string; value?: unknown }[] = [];
    const notifications: { kind: string; message: string }[] = [];
    const workspace = { id: "fixture-workspace", path: declared.cwd };
    const openAnyFile = evaluate<(path: string, line?: number) => boolean>(openAnyFileText, {
      workspace,
      setFileTarget(value: unknown) { effects.push({ kind: "viewer", value }); },
      setMainTab(value: string) { effects.push({ kind: "tab", value }); },
    }, "WorkspaceView.openAnyFile.ts");
    const openFile = evaluate<(path: string) => void>(openFileOrViewerText, {
      workspace, openAnyFile,
      diff: { files: entry.mode === "diff" ? [{ path: path.relative }] : [], openPath(value: string) { effects.push({ kind: "diff", path: value }); } },
      notify(kind: string, message: string) { notifications.push({ kind, message }); },
    }, "WorkspaceView.openFileOrViewer.ts");
    const onOpenFile = evaluate<(path: string) => void>(normalizeText, { cwd: declared.cwd, openFile }, "ChatPanel.onOpenFile.ts");
    const ProductionTranscript = productionTranscript();
    let mounted: Mounted | undefined;
    act(() => { mounted = renderer.create(React.createElement(ProductionTranscript, {
      transcript: target, workspacePath: declared.cwd, onOpenFile,
      notify: (kind: string, message: string) => notifications.push({ kind, message }),
      dontCollapseToolCalls: true, now: () => at.getTime(),
    })); });
    assert.ok(mounted);
    const instance = mounted;
    try {
      const wrappers = instance.root.findAll((node) => typeof node.type === "string" && String(node.props.className ?? "").split(" ").includes("chat-tool"));
      assert.equal(wrappers.length, 13);
      const position = declared.cases.slice(0, declared.cases.indexOf(entry)).reduce((sum, c) => sum + c.paths.length, 0) + index;
      const wrapper = wrappers[position]!;
      const upstream = JSON.parse(String(wrapper.props["data-tool-input"])) as { paths: ReasonPath[]; diffs?: { path: ReasonPath }[] };
      const actualPath = entry.kind === "read" ? upstream.paths[0] : upstream.diffs?.[index]?.path;
      assert.deepEqual(actualPath, path, "mounted consumer still has the exact source path identity");
      const badges = wrapper.findAll((node) => node.type === "button" && String(node.props.className ?? "").split(" ").includes("oc-file-badge"));
      assert.equal(badges.length, 1);
      assert.equal(badges[0]!.props.title, path.raw);
      let stopped = 0;
      act(() => badges[0]!.props.onClick!({ stopPropagation: () => { stopped++; } }));
      assert.equal(stopped, 1, "actual FileBadge click ran");
      observations.push({ phase, case: entry.id, index, declaredTarget: path, effects, notifications });
      if (path.place === "cloud") {
        assert.deepEqual(effects, [], `cloud target from Session ${path.sessionId} must never open its local same-relative-path counterpart`);
        assert.ok(notifications.some((n) => /cloud/i.test(n.message)), "unavailable cloud target is explained to the user");
      } else if (entry.mode === "diff") {
        assert.deepEqual(effects, [{ kind: "diff", path: path.relative }], "known local path still opens existing diff");
        assert.deepEqual(notifications, []);
      } else {
        // Cross-realm callback output is intentionally compared without normalizing any field.
        assert.equal(effects.length, 2);
        assert.equal(effects[0]?.kind, "viewer");
        assert.equal(JSON.stringify(effects[0]?.value), JSON.stringify({ path: path.relative, workspaceId: workspace.id }));
        assert.equal(effects[1]?.kind, "tab");
        assert.equal(effects[1]?.value, "file");
        assert.deepEqual(notifications, []);
      }
    } finally { act(() => instance.unmount()); }
  });
}
test("write frozen reproduction witnesses and exact extracted callback identities", () => {
  assert.equal(observations.length, 26, "every live/restored click ran, including intended failures");
  writeFileSync(new URL("observations.json", evidence), JSON.stringify({ wire_sha256: digest(payloadBytes), observations, executed_source: captures }, null, 2) + "\n");
});
