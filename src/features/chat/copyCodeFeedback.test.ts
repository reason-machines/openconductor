import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type * as MarkdownModule from "./markdown.ts";
import type { TranscriptProps } from "./Transcript.tsx";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";
import * as view from "./view.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { assistantDisplayText } from "./assistantText.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const markdownSource = readFileSync(new URL("./markdown.ts", import.meta.url), "utf8");
const markdownImports = new Map<string, unknown>();
for (const statement of ts.createSourceFile("markdown.ts", markdownSource, ts.ScriptTarget.Latest, true).statements) {
  if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
  const name = statement.moduleSpecifier.text;
  markdownImports.set(name, await import(name.startsWith(".") ? new URL(name, import.meta.url).href : name));
}

function compile(source: string, filename: string) {
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
}

const transcriptSource = ts.createSourceFile("Transcript.tsx", readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const transcriptCode = compile(["toolDisclosure", "Transcript", "rowTurn", "groupTurns", "Row", "Agent", "Part"].map((name) => {
  const node = transcriptSource.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
  assert.ok(node, `Production ${name} exists`);
  return node.getText(transcriptSource);
}).join("\n"), "Transcript.tsx");

type Feedback = [kind: "info" | "error", message: string, options?: { description?: string }];
type Button = { props: { children: string; title: string; "aria-label": string; disabled?: boolean; onClick: () => void } };
const code = "const answer = 42;\n";
const fenced = `\`\`\`js\n${code}\`\`\``;

async function fixture({ text = fenced, withNotify = true }: { text?: string; withNotify?: boolean } = {}) {
  const writes: string[] = [], feedback: Feedback[] = [];
  const pending: { fulfill: () => void; reject: (reason: Error) => void }[] = [];
  let now = 0, nextTimer = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const markdown: Partial<typeof MarkdownModule> = {};
  runInNewContext(compile(markdownSource, "markdown.ts"), {
    exports: markdown,
    require(name: string) {
      assert.ok(markdownImports.has(name), `Known markdown dependency ${name}`);
      return markdownImports.get(name);
    },
    navigator: { clipboard: { writeText: (text: string) => {
      writes.push(text);
      return new Promise<void>((fulfill, reject) => { pending.push({ fulfill, reject }); });
    } } },
    setTimeout: (callback: () => void, ms: number) => { const id = ++nextTimer; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  }, { filename: "markdown.ts" });
  assert.ok(markdown.Markdown);
  const production: { Transcript?: React.ComponentType<TranscriptProps> } = {};
  const unrelated = () => { throw new Error("Unrelated Transcript branch reached"); };
  runInNewContext(transcriptCode, {
    exports: production,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return dependencies(name); },
    Fragment: React.Fragment, useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    useBoolPref: () => false, assistantDisplayText,
    ...view, ...groups, ...time,
    Markdown: markdown.Markdown,
    LinkMenuNotify: React.createContext(undefined),
    LinkWithMenu: unrelated, TurnFooter: unrelated, SummaryRow: unrelated, ThinkingRow: unrelated,
    UserText: unrelated, SentUserContent: unrelated, MessageActions: unrelated,
  }, { filename: "Transcript.tsx" });
  assert.ok(production.Transcript);
  const result = applyChatEvents(emptyTranscript("copy-code-feedback"), [
    { type: "turn_status", sessionId: "copy-code-feedback", turnId: "turn", status: "running" },
    { type: "upsert", message: {
      id: "assistant", sessionId: "copy-code-feedback", turnId: "turn", role: "assistant", createdAt: "2026-11-11T00:00:00Z",
      blocks: [{ type: "text", text }],
    } },
  ]);
  assert.ok(result.ok);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(production.Transcript!, {
    transcript: result.transcript,
    now: () => Date.parse("2026-11-11T00:00:00Z"),
    notify: withNotify ? (...args: Feedback) => { feedback.push(args); } : undefined,
  })); });
  const buttons = (): Button[] => renderer.root.findAllByType("button").filter((node: { props: { className?: string } }) => node.props.className === "md-code-copy");
  return {
    writes, feedback, buttons, timers,
    async click() { assert.equal(buttons().length, 1); await act(async () => { buttons()[0]!.props.onClick(); }); },
    async settle(outcome: "fulfilled" | "rejected") {
      const next = pending.shift();
      assert.ok(next, "A real CopyCode clipboard request is pending");
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

function copyState(button: Button, copied: boolean) {
  assert.equal(button.props.children, copied ? "Copied" : "Copy");
  assert.equal(button.props.title, copied ? "Copied" : "Copy");
  assert.equal(button.props["aria-label"], copied ? "Copied" : "Copy code");
}

test("rejected fenced-code copy requests the source-proven error title and description", async () => {
  const f = await fixture();
  try {
    await f.click();
    assert.deepEqual(f.writes, [code.trim()]);
    copyState(f.buttons()[0]!, false);
    assert.deepEqual(f.feedback, [], "No feedback before the clipboard promise settles");
    assert.equal(f.timers.size, 0);
    await f.settle("rejected");
    assert.deepEqual(JSON.parse(JSON.stringify(f.feedback)), [["error", "Failed to copy", { description: "Please try again." }]], "Rejected CopyCode must request the existing notifier's failure feedback");
    copyState(f.buttons()[0]!, false);
    assert.equal(f.timers.size, 0, "Rejection must not start the Copied reset timer");
    await f.advance(2000);
    copyState(f.buttons()[0]!, false);
    assert.equal(f.feedback.length, 1, "No new Copied confirmation");
  } finally { await f.close(); }
});

test("ordinary fenced-code success confirms only after fulfillment and resets at two seconds without feedback", async () => {
  const f = await fixture();
  try {
    await f.click();
    assert.deepEqual(f.writes, [code.trim()]);
    copyState(f.buttons()[0]!, false);
    assert.deepEqual(f.feedback, []);
    assert.equal(f.timers.size, 0);
    await f.settle("fulfilled");
    copyState(f.buttons()[0]!, true);
    assert.deepEqual(f.feedback, [], "Successful code copy keeps its existing inline confirmation only");
    assert.equal(f.timers.size, 1);
    await f.advance(1999);
    copyState(f.buttons()[0]!, true);
    await f.advance(1);
    copyState(f.buttons()[0]!, false);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.feedback, []);
  } finally { await f.close(); }
});

test("rejected code copy without an installed notifier remains handled and never claims success", async () => {
  const f = await fixture({ withNotify: false });
  try {
    await f.click();
    await f.settle("rejected");
    assert.deepEqual(f.writes, [code.trim()]);
    copyState(f.buttons()[0]!, false);
    assert.deepEqual(f.feedback, []);
    assert.equal(f.timers.size, 0);
  } finally { await f.close(); }
});

test("plain assistant text and inline code request no copy feedback", async () => {
  const f = await fixture({ text: "An ordinary answer with `inline code`." });
  try {
    assert.equal(f.buttons().length, 0);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.feedback, []);
    assert.equal(f.timers.size, 0);
  } finally { await f.close(); }
});

test("overlapping fenced-code successes retain every two-second reset at 2000, 3000, and 4500 ms", async () => {
  const f = await fixture();
  try {
    // Retained REA t0 schedules a timeout for every fulfilled copy. WJe supplies
    // no tooltip: this tests reset timing via existing labels, not label parity.
    assert.equal(f.buttons().length, 1);
    const button = f.buttons()[0]!;
    assert.notEqual(button.props.disabled, true);
    await f.click();
    copyState(f.buttons()[0]!, false);
    await f.settle("fulfilled"); // Successful fulfillment at 0 ms.
    copyState(f.buttons()[0]!, true);

    await f.advance(1000);
    assert.equal(f.buttons()[0], button, "The ordinary code block stays mounted");
    assert.notEqual(f.buttons()[0]!.props.disabled, true);
    await f.click();
    await f.settle("fulfilled"); // Successful fulfillment at 1000 ms.
    copyState(f.buttons()[0]!, true);
    await f.advance(999);
    copyState(f.buttons()[0]!, true); // 1999 ms: first reset has not fired.
    await f.advance(1);
    copyState(f.buttons()[0]!, false); // Exact first reset at 2000 ms.

    await f.advance(500);
    assert.equal(f.buttons()[0], button, "The third copy uses the same real button");
    assert.notEqual(f.buttons()[0]!.props.disabled, true);
    await f.click();
    copyState(f.buttons()[0]!, false);
    await f.settle("fulfilled"); // Successful fulfillment at 2500 ms.
    copyState(f.buttons()[0]!, true);
    await f.advance(499);
    copyState(f.buttons()[0]!, true); // 2999 ms: second reset has not fired.
    await f.advance(1);
    const at3000 = f.buttons()[0]!.props;
    const secondReset = [at3000.children, at3000.title, at3000["aria-label"]];
    await f.advance(1499);
    const at4499 = f.buttons()[0]!.props;
    const beforeThirdReset = [at4499.children, at4499.title, at4499["aria-label"]];
    await f.advance(1);
    copyState(f.buttons()[0]!, false); // Exact third reset at 4500 ms.
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.writes, [code.trim(), code.trim(), code.trim()]);
    assert.deepEqual(f.feedback, [], "Repeated successes request no notifier feedback");
    // Assert after visiting 4500 so even the RED run samples every boundary.
    assert.deepEqual(secondReset, ["Copy", "Copy", "Copy code"], "The 1000-ms success must still reset the third success at exactly 3000 ms");
    assert.deepEqual(beforeThirdReset, ["Copy", "Copy", "Copy code"], "The stale second reset stays clear until the third reset at 4500 ms");
  } finally { await f.close(); }
});
