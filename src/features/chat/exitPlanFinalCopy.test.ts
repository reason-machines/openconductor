import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { CHAT_ID, exitPlanCopyCases } from "./exitPlanFinalCopy.inputs.ts";
import { completeTranscript, forkTranscript } from "./fork.ts";
import { diffForSave } from "./persist.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { turnMenuItems } from "./turnMenu.ts";
import { turnTime } from "./turnTime.ts";
import { plainText } from "./types.ts";
import { buildRows, type RowView } from "./view.ts";

type FooterRow = Extract<RowView, { kind: "turn_end" }>;

const sourceText = readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("Transcript.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ["TurnFooter", "CopyButton"].map((name) => {
  const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `${name} exists in production Transcript`);
  return node.getText(source);
}).join("\n");
const compiled = ts.transpileModule(`${selected}
function find(node, type) {
  if (!React.isValidElement(node)) return undefined;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = find(child, type);
    if (found) return found;
  }
}
exports.copyFinal = async (row) => {
  const tree = TurnFooter({ row, ctx: { now: () => 0 } });
  const element = find(tree, CopyButton);
  if (!element) return;
  if (element.props.label !== "Copy final message") throw new Error("Wrong production copy control");
  const button = find(CopyButton(element.props), "button");
  if (!button) throw new Error("Production clipboard callback was not reached");
  await button.props.onClick();
};`, {
  fileName: "Transcript.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
const localRequire = createRequire(import.meta.url);

function clipboard() {
  const writes: string[] = [];
  const api: { copyFinal?: (row: FooterRow) => Promise<void> } = {};
  runInNewContext(compiled.outputText, {
    exports: api,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return localRequire(name); },
    React,
    useState: (initial: unknown) => [initial, () => {}],
    setTimeout: () => 0,
    navigator: { clipboard: { writeText: async (text: string) => { writes.push(text); } } },
    Tooltip: () => null,
    Lucide: () => null,
    turnMenuItems,
    turnTime,
    TurnDetails: () => null,
    TurnMenu: () => null,
    ChatSignInCard: () => null,
  }, { filename: "Transcript.tsx" });
  assert.ok(api.copyFinal);
  return { writes, copyFinal: api.copyFinal };
}

for (const entry of exitPlanCopyCases) {
  test(`exit plan footer clipboard: ${entry.id}`, async () => {
    const now = new Date("2026-11-12T00:00:00Z");
    const started = startTurn(reasonChat(CHAT_ID), "Original prompt", now, "turn");
    let state = started.state;
    const events = [...started.events];
    for (const payload of [...entry.payloads, { chatId: CHAT_ID, type: "turnEnded", end: { outcome: "completed" } } satisfies Parameters<typeof applyReasonPayload>[1]]) {
      const step = applyReasonPayload(state, payload, now);
      state = step.state;
      events.push(...step.events);
    }
    const result = applyChatEvents(emptyTranscript(CHAT_ID), events);
    assert.ok(result.ok);
    const transcript = result.transcript;
    const before = structuredClone(transcript);
    const storedText = transcript.messages.map(plainText);
    const exported = completeTranscript(transcript);
    const forked = forkTranscript(transcript);
    const saved = diffForSave(null, transcript);
    const rows = buildRows(transcript);
    const footer = rows.find((row): row is FooterRow => row.kind === "turn_end");
    assert.ok(footer, "Finished production turn reaches its real footer");
    const c = clipboard();
    await c.copyFinal(footer);
    assert.deepEqual(transcript, before, "Copy projection must not mutate stored messages");
    assert.deepEqual(transcript.messages.map(plainText), storedText, "Provider-visible text remains unchanged");
    assert.equal(completeTranscript(transcript), exported, "Export retains every text block");
    assert.equal(forkTranscript(transcript), forked, "Fork retains every text block");
    assert.deepEqual(diffForSave(null, transcript), saved, "Persistence retains every text block");
    const assistant = rows.find((row) => row.kind === "assistant");
    const storedAssistant = transcript.messages.find((message) => message.role === "assistant");
    if (assistant?.kind === "assistant" && storedAssistant) {
      assert.deepEqual(assistant.parts.filter((part) => part.kind === "text").map((part) => part.text),
        storedAssistant.blocks.filter((block) => block.type === "text").map((block) => block.text),
        "Transcript text rendering remains complete");
    }
    const storedTools = storedAssistant?.blocks.filter((block) => block.type === "tool_use") ?? [];
    if (assistant?.kind === "assistant") {
      assert.equal(assistant.parts.filter((part) => part.kind === "tool").length, storedTools.length,
        "Footer suppression must not remove or mutate the plan/tool row");
    }
    assert.deepEqual(c.writes, entry.expectedClipboard, "Production footer suppresses only the selected reply with exact ExitPlanMode, preserving other clipboard bytes");
  });
}
