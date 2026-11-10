import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { composerPrompt, writeComposerDraft, type ComposerPart } from "./composerDocument.ts";
import { completeTranscript, forkTranscript } from "./fork.ts";
import * as queue from "./queue.ts";
import { reasonChat, startTurn, type PromptAttachment } from "./reason.ts";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { turnMenuItems } from "./turnMenu.ts";
import { turnTime } from "./turnTime.ts";
import { plainText, type ChatMessage } from "./types.ts";
import { retryUserPrompt, submittedUserPrompt } from "./userContent.ts";
import { buildRows, type DisplayRow } from "./view.ts";

const sourceText = readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("Transcript.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ["Row", "MessageActions", "CopyButton", "TurnFooter"].map((name) => {
  const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `${name} exists in production Transcript`);
  return node.getText(source);
}).join("\n");
const helperImport = source.statements.find((node) => ts.isImportDeclaration(node)
  && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "./userMessageCopy.ts");
const helperBindings: Record<string, unknown> = helperImport
  ? await import(new URL("./userMessageCopy.ts", import.meta.url).href)
  : {};
const compiled = ts.transpileModule(`${selected}
function find(node, type) {
  if (!React.isValidElement(node)) return undefined;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = find(child, type);
    if (found) return found;
  }
}
async function activate(copyElement) {
  if (!copyElement) throw new Error("Production copy button was not reached");
  const button = find(CopyButton(copyElement.props), "button");
  if (!button) throw new Error("Production clipboard callback was not reached");
  await button.props.onClick();
}
exports.copyUser = async (row) => {
  const actions = find(Row({ row, ctx: {} }), MessageActions);
  if (!actions) throw new Error("User MessageActions was not reached");
  await activate(MessageActions(actions.props).props.children);
};
exports.copyFinal = async (row) => {
  const tree = TurnFooter({ row, ctx: { now: () => 0 } });
  await activate(find(tree, CopyButton));
};`, {
  fileName: "Transcript.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
const localRequire = createRequire(import.meta.url);
type UserRow = Extract<DisplayRow, { kind: "user" }>;
type FooterRow = Extract<DisplayRow, { kind: "turn_end" }>;

function clipboard() {
  const writes: string[] = [];
  const api: { copyUser?: (row: UserRow) => Promise<void>; copyFinal?: (row: FooterRow) => Promise<void> } = {};
  runInNewContext(compiled.outputText, {
    exports: api,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return localRequire(name); },
    React,
    ...helperBindings,
    useState: (initial: unknown) => [initial, () => {}],
    setTimeout: () => 0,
    navigator: { clipboard: { writeText: async (text: string) => { writes.push(text); } } },
    Tooltip: () => null,
    Lucide: () => null,
    SentUserContent: () => null,
    UserText: () => null,
    turnMenuItems,
    turnTime,
    TurnDetails: () => null,
    TurnMenu: () => null,
    ChatSignInCard: () => null,
  }, { filename: "Transcript.tsx" });
  assert.ok(api.copyUser);
  assert.ok(api.copyFinal);
  return { writes, copyUser: api.copyUser, copyFinal: api.copyFinal };
}

const now = new Date("2026-11-10T00:00:00Z");
const file = (path: string, label = path, directory = false): ComposerPart => ({ kind: "file", path, label, directory });
const text = (text: string): ComposerPart => ({ kind: "text", text });
function transcript(message: ChatMessage): ChatTranscript {
  const result = applyChatEvents(emptyTranscript("copy"), [{ type: "upsert", message }]);
  assert.ok(result.ok);
  return result.transcript;
}
function sent(parts: ComposerPart[], attachments: PromptAttachment[] = []) {
  const draft = writeComposerDraft(parts);
  const input = submittedUserPrompt(draft);
  const submitted = queue.submit(queue.emptyQueue(), input, "queue", undefined, attachments);
  const effect = submitted.effects[0];
  assert.equal(effect?.kind, "start");
  if (effect?.kind !== "start") assert.fail("Real submission must start a turn");
  assert.equal(effect.text, composerPrompt(draft).trim());
  const step = startTurn(reasonChat("copy"), effect.text, now, "turn", effect.attachments, effect.userContent);
  return step.state.open[0]!.user;
}
async function copied(message: ChatMessage) {
  const before = structuredClone(message);
  const retry = retryUserPrompt(message);
  const tr = transcript(message);
  const exported = completeTranscript(tr);
  const forked = forkTranscript(tr);
  const row = buildRows(tr).find((row): row is UserRow => row.kind === "user");
  assert.ok(row);
  const c = clipboard();
  await c.copyUser(row);
  assert.equal(c.writes.length, 1, "Actual CopyButton must write once");
  assert.deepEqual(message, before, "Clipboard display cannot mutate the provider message");
  assert.equal(plainText(message), plainText(before), "Provider text remains byte-identical");
  assert.deepEqual(retryUserPrompt(message), retry, "Retry payload remains byte-identical");
  assert.equal(completeTranscript(tr), exported, "Export remains byte-identical");
  assert.equal(forkTranscript(tr), forked, "Fork text remains byte-identical");
  return c.writes[0];
}

for (const [name, parts, expected] of [
  ["picker-produced whitespace path", [text("Review "), file("src/a file.ts")], "Review @src/a file.ts"],
  ["non-whitespace path", [text("Review "), file("src/a.ts")], "Review @src/a.ts"],
  ["authoritative display label", [file("src/a.ts", "Readable label")], "@Readable label"],
  ["repeated atoms without rewriting literal mentions", [text("@src/a.ts + "), file("src/a.ts", "First"), text(" and "), file("src/a.ts", "Second")], "@src/a.ts + @First and @Second"],
  ["multiline Markdown and HTML-like literals", [text('<b>"@literal"</b>\n**Review** '), file('src/a "quoted" file.ts', 'a "quoted" file.ts'), text(".\nThen `@src/a.ts`!")], '<b>"@literal"</b>\n**Review** @a "quoted" file.ts.\nThen `@src/a.ts`!'],
  ["directory atom", [file("docs/my folder", "my folder", true), text("/next")], "@my folder/next"],
  ["label whitespace is content", [file("src/a.ts", " Label ")], "@ Label "],
  ["submission whitespace trimming", [text(" \nReview "), file("src/a file.ts"), text(" now\n ")], "Review @src/a file.ts now"],
] satisfies [string, ComposerPart[], string][]) {
  test(`sent-user copy uses ${name}`, async () => {
    const message = sent(parts);
    if (name === "picker-produced whitespace path") assert.equal(plainText(message), 'Review @"src/a file.ts"');
    assert.equal(await copied(message), expected);
  });
}

test("copy retains all later attachment captions and text blocks", async () => {
  const message = sent([text("Read "), file("src/a file.ts")], [
    { name: "notes.md", text: "attachment bytes" },
    { name: "another file.txt", text: "more bytes" },
  ]);
  message.blocks.push({ type: "text", text: "" }, { type: "text", text: "Last paragraph" });
  assert.equal(await copied(message), "Read @src/a file.ts\n\nAttached: notes.md\n\nAttached: another file.txt\n\nLast paragraph");
});

for (const value of ['Literal @"src/a file.ts"', "@src/a.ts", "person@example.test\n<file>literal</file>", "  preserve legacy whitespace\n"]) {
  test(`legacy unstructured copy is unchanged: ${JSON.stringify(value)}`, async () => {
    const message = sent([text("placeholder")]);
    message.blocks = [{ type: "text", text: value }];
    assert.equal(await copied(message), value);
  });
}

test("metadata for another body is not grafted onto the copied text", async () => {
  const message = sent([file("src/a file.ts", "Label")]);
  message.blocks = [{ type: "text", text: 'Different literal @"src/a file.ts"' }];
  assert.equal(await copied(message), plainText(message));
});

for (const bad of [
  null,
  { version: 2, parts: [], attachments: [] },
  { version: 1, parts: [{ kind: "file", path: "../outside", label: "Label", directory: false }], attachments: [] },
  { version: 1, parts: [{ kind: "file", path: "src/a file.ts", directory: false }], attachments: [] },
]) {
  test(`malformed metadata falls back unchanged: ${JSON.stringify(bad)}`, async () => {
    const message: ChatMessage = JSON.parse(JSON.stringify({ ...sent([file("src/a file.ts")]), userContent: bad }));
    assert.equal(await copied(message), plainText(message));
  });
}

test("an empty first body cannot consume a later unrelated text block", async () => {
  const message = sent([file("src/a file.ts", "Label")]);
  message.blocks = [{ type: "text", text: "" }, { type: "text", text: '@"src/a file.ts"' }];
  assert.equal(await copied(message), plainText(message));
});

test("assistant final copy keeps literal file-looking text byte-identical", async () => {
  const message = sent([text("Prompt")]);
  const finalText = 'Assistant @"src/a file.ts"\n<literal>**text**</literal>';
  const result = applyChatEvents(transcript(message), [
    { type: "upsert", message: { ...message, id: "assistant", role: "assistant", blocks: [{ type: "text", text: finalText }] } },
    { type: "turn_status", sessionId: "copy", turnId: "turn", status: "completed" },
  ]);
  assert.ok(result.ok);
  const footer = buildRows(result.transcript).find((row): row is FooterRow => row.kind === "turn_end");
  assert.ok(footer);
  const c = clipboard();
  await c.copyFinal(footer);
  assert.deepEqual(c.writes, [finalText]);
});
