import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { TranscriptProps } from "./Transcript.tsx";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { userMessageCopyText } from "./userMessageCopy.ts";
import { turnMenuItems } from "./turnMenu.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";
import * as view from "./view.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const sourceText = readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("Transcript.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = ["toolDisclosure", "Transcript", "rowTurn", "groupTurns", "Row", "MessageActions", "CopyButton", "TurnFooter"].map((name) => {
  const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
  assert.ok(node, `Production ${name} exists`);
  return node.getText(source);
}).join("\n");
const compiled = ts.transpileModule(declarations, {
  fileName: "Transcript.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);

type Feedback = [kind: "info" | "error", message: string, options?: { description?: string }];
type Target = "Copy message" | "Copy final message";
type Button = { props: { "aria-label": string; onClick: () => Promise<void> }; findByType: (type: string) => { props: { "data-icon": string } } };
const userText = "Keep this literal user message.\nSecond line.";
const finalText = "Final answer with `literal code`.\nSecond paragraph.";
const timestamp = "2026-11-17T00:00:00Z";
const transcript = applyChatEvents(emptyTranscript("message-copy-feedback"), [
  { type: "turn_status", sessionId: "message-copy-feedback", turnId: "turn", status: "running", at: timestamp },
  { type: "upsert", message: { id: "user", sessionId: "message-copy-feedback", turnId: "turn", role: "user", createdAt: timestamp, blocks: [{ type: "text", text: userText }] } },
  { type: "upsert", message: { id: "assistant", sessionId: "message-copy-feedback", turnId: "turn", role: "assistant", createdAt: timestamp, blocks: [{ type: "text", text: finalText }] } },
  { type: "turn_status", sessionId: "message-copy-feedback", turnId: "turn", status: "completed", at: timestamp },
]);
assert.ok(transcript.ok);

async function fixture(withNotify = true) {
  const writes: string[] = [], feedback: Feedback[] = [];
  const pending: Array<{ fulfill: () => void; reject: (error: Error) => void }> = [];
  const timers = new Map<number, { at: number; callback: () => void }>();
  let now = 0, nextTimer = 0;
  const production: { Transcript?: React.ComponentType<TranscriptProps> } = {};
  const unrelated = () => { throw new Error("Unrelated Transcript branch reached"); };
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return dependencies(name); },
    Fragment: React.Fragment, useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    ...view, ...groups, ...time, userMessageCopyText, turnMenuItems,
    useBoolPref: () => false,
    // Presentation-only stubs: real React still owns CopyButton state and rerenders.
    Tooltip: ({ content, children }: { content: string; children: React.ReactNode }) => React.createElement("span", { "data-copy-tooltip": content }, children),
    Lucide: ({ name }: { name: string }) => React.createElement("svg", { "data-icon": name }),
    UserText: ({ text }: { text: string }) => React.createElement("span", null, text),
    Agent: () => null,
    LinkMenuNotify: React.createContext(undefined),
    SentUserContent: unrelated, TurnDetails: () => null, TurnMenu: unrelated, ChatSignInCard: unrelated,
    navigator: { clipboard: { writeText: (text: string) => {
      writes.push(text);
      return new Promise<void>((fulfill, reject) => { pending.push({ fulfill, reject }); });
    } } },
    setTimeout: (callback: () => void, delay: number) => { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  }, { filename: "Transcript.tsx" });
  assert.ok(production.Transcript);
  assert.ok(transcript.ok);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(production.Transcript!, {
    transcript: transcript.transcript,
    now: () => Date.parse(timestamp),
    notify: withNotify ? (...args: Feedback) => { feedback.push(args); } : undefined,
  })); });
  const button = (target: Target): Button => {
    const matches = renderer.root.findAllByType("button").filter((node: Button) => node.props["aria-label"] === target);
    assert.equal(matches.length, 1, `Exactly one real ${target} button`);
    return matches[0];
  };
  const tooltip = (target: Target): string => {
    const node = renderer.root.findAll((node: { props: { "data-copy-tooltip"?: string }; findAllByType: (type: string) => Button[] }) =>
      typeof node.props["data-copy-tooltip"] === "string" && node.findAllByType("button").some((b) => b.props["aria-label"] === target));
    assert.equal(node.length, 1);
    return node[0].props["data-copy-tooltip"];
  };
  return {
    writes, feedback, timers, button, tooltip,
    async click(target: Target) { await act(async () => { void button(target).props.onClick(); }); },
    async settle(outcome: "fulfilled" | "rejected") {
      const next = pending.shift();
      assert.ok(next, "The actual button has a pending clipboard request");
      await act(async () => { if (outcome === "fulfilled") next.fulfill(); else next.reject(new Error("Synthetic clipboard rejection")); });
    },
    async advance(ms: number) {
      await act(async () => {
        now += ms;
        for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

function state(f: Awaited<ReturnType<typeof fixture>>, target: Target, copied: boolean) {
  assert.equal(f.button(target).findByType("svg").props["data-icon"], copied ? "check" : "copy");
  assert.equal(f.tooltip(target), copied ? "Copied!" : target);
}

for (const target of ["Copy message", "Copy final message"] as const) {
  const payload = target === "Copy message" ? userText : finalText;
  test(`${target}: rejection requests error feedback without confirmation or a reset timer`, async () => {
    const f = await fixture();
    try {
      await f.click(target);
      assert.deepEqual(f.writes, [payload]);
      assert.deepEqual(f.feedback, []);
      state(f, target, false);
      assert.equal(f.timers.size, 0);
      await f.settle("rejected");
      assert.deepEqual(JSON.parse(JSON.stringify(f.feedback)), [["error", "Failed to copy", { description: "Please try again." }]]);
      state(f, target, false);
      assert.equal(f.timers.size, 0, "Rejected copies do not create success-reset timers");
      await f.advance(2000);
      state(f, target, false);
      assert.equal(f.feedback.length, 1);
    } finally { await f.close(); }
  });

  test(`${target}: rejection after success preserves its confirmation and original reset deadline`, async () => {
    const f = await fixture();
    try {
      await f.click(target);
      await f.settle("fulfilled");
      state(f, target, true);
      await f.advance(1000);
      await f.click(target);
      await f.settle("rejected");
      // Check the state independently of the notifier assertion above.
      state(f, target, true);
      assert.equal(f.timers.size, 1, "Rejection cannot replace or add to the success timer");
      await f.advance(999);
      state(f, target, true);
      await f.advance(1);
      state(f, target, false);
      assert.equal(f.timers.size, 0);
      assert.deepEqual(f.writes, [payload, payload]);
      assert.deepEqual(JSON.parse(JSON.stringify(f.feedback)), [["error", "Failed to copy", { description: "Please try again." }]]);
    } finally { await f.close(); }
  });

  test(`${target}: ordinary success confirms only after fulfillment and resets at 2000ms`, async () => {
    const f = await fixture();
    try {
      await f.click(target);
      assert.deepEqual(f.writes, [payload]);
      state(f, target, false);
      assert.equal(f.timers.size, 0);
      await f.settle("fulfilled");
      state(f, target, true);
      assert.equal(f.timers.size, 1);
      await f.advance(1999);
      state(f, target, true);
      await f.advance(1);
      state(f, target, false);
      assert.equal(f.timers.size, 0);
      assert.deepEqual(f.feedback, []);
    } finally { await f.close(); }
  });

  test(`${target}: rejection without a notifier stays handled and creates no timer`, async () => {
    const f = await fixture(false);
    try {
      await f.click(target);
      await f.settle("rejected");
      assert.deepEqual(f.writes, [payload]);
      state(f, target, false);
      assert.equal(f.timers.size, 0);
      assert.deepEqual(f.feedback, []);
    } finally { await f.close(); }
  });
}
