import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { codexChat, failTurn, startTurn } from "./codex.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows, type RowView } from "./view.ts";
import { turnMenuItems } from "./turnMenu.ts";
import { turnTime } from "./turnTime.ts";
import { isSignInFailure, signInCopy } from "./agentSignIn.ts";
import type { ChatAgentId } from "./agentChoice.ts";
import type { TurnStatus } from "./types.ts";
import type { UserPrompt } from "./userContent.ts";

type FooterRow = Extract<RowView, { kind: "turn_end" }>;
type Context = { now(): number; resetDisabled: boolean; forkDisabled: boolean; chatAgent?: ChatAgentId; onRetry?: (prompt: UserPrompt, turnId: string) => void };
const path = "src/features/chat/Transcript.tsx";
const text = process.env.TURN_FOOTER_REF
  ? execFileSync("git", ["show", `${process.env.TURN_FOOTER_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hasInlineNotice = source.statements.some((node) => ts.isFunctionDeclaration(node) && node.name?.text === "SignInNotice");
const noticeSource = hasInlineNotice ? source : ts.createSourceFile(
  "ChatSignInCard.tsx", readFileSync(new URL("./ChatSignInCard.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
const functions = [
  { source, name: "TurnFooter" },
  { source: noticeSource, name: hasInlineNotice ? "SignInNotice" : "ChatSignInCard" },
].map(({ source, name }) => {
  const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `${name} is a production function`);
  return node.getText(source);
});
const compiled = ts.transpileModule(`${functions.join("\n")}\nexports.render = TurnFooter;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported: { render?: (props: { row: FooterRow; ctx: Context }) => ReactElement<{ children: unknown[] }> } = {};
const require = createRequire(import.meta.url);
runInNewContext(compiled, {
  exports: exported,
  require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return require(name); },
  turnMenuItems, turnTime, isSignInFailure, signInCopy,
});
assert.ok(exported.render);
const renderFooter = exported.render;
const ctx: Context = { now: () => Date.parse("2026-11-10T00:00:00Z"), resetDisabled: false, forkDisabled: false };

function footer(status: TurnStatus, error?: string): FooterRow {
  const started = startTurn(codexChat("interruption-chat"), "Keep this prompt");
  const turnId = started.state.open[0]!.turnId;
  const events = status === "failed" && error !== undefined
    ? failTurn(started.state, turnId, error).events
    : [{ type: "turn_status" as const, sessionId: "interruption-chat", turnId, status, ...(error !== undefined ? { error } : {}) }];
  const result = applyChatEvents(emptyTranscript("interruption-chat"), [...started.events, ...events]);
  assert.ok(result.ok);
  const row = buildRows(result.transcript).find((row): row is FooterRow => row.kind === "turn_end");
  assert.ok(row);
  assert.equal(result.transcript.turns[turnId]?.status, status);
  assert.equal(result.transcript.turns[turnId]?.error, error);
  assert.equal(row.status, status);
  assert.equal(row.error, error);
  return row;
}
const markup = (row: FooterRow, context = ctx) => renderToStaticMarkup(createElement(renderFooter, { row, ctx: context }));

for (const error of ["Request aborted by user", "Interrupted by user"]) {
  test(`actual failed-turn footer presents ${JSON.stringify(error)} as an outline interruption`, () => {
    const row = footer("failed", error);
    const html = markup(row);
    assert.match(html, /class="chat-badge">Interrupted by user<\/span>/);
    assert.doesNotMatch(html, /chat-turn-error/);
    assert.match(html, /status-failed/);
    assert.deepEqual(row.retryPrompt, { text: "Keep this prompt" });
  });
}

for (const error of ["Provider unavailable", "Aborted by user", "interrupted by user", "Session cancelled: stopped", "request cancelled", "[codex-mcp-consent] user_canceled", ""]) {
  test(`actual footer preserves nonmatching failure ${JSON.stringify(error)}`, () => {
    const html = markup(footer("failed", error));
    assert.match(html, /class="chat-turn-error"/);
    assert.doesNotMatch(html, /class="chat-badge"/);
    assert.ok(html.includes(`>${error}</span>`));
  });
}

test("actual footer retains the missing-error fallback", () => {
  assert.match(markup(footer("failed")), /class="chat-turn-error">The turn failed\.<\/span>/);
});

test("actual cancelled footer keeps exactly one interruption badge and no raw error", () => {
  const html = markup(footer("cancelled", "Provider unavailable"));
  assert.equal((html.match(/class="chat-badge"/g) ?? []).length, 1);
  assert.match(html, />Interrupted by user<\/span>/);
  assert.doesNotMatch(html, /chat-turn-error|Provider unavailable/);
});

test("a completed turn does not gain an interruption badge from its error field", () => {
  const html = markup(footer("completed", "Interrupted by user"));
  assert.doesNotMatch(html, /chat-badge|chat-turn-error|Interrupted by user/);
});

test("actual footer keeps ordinary Codex sign-in guidance", () => {
  const html = markup(footer("failed", "401 Unauthorized"), { ...ctx, chatAgent: "codex" });
  assert.match(html, /class="chat-turn-error">401 Unauthorized<\/span>/);
  assert.match(html, /data-testid="chat-sign-in" data-agent="codex"/);
  assert.match(html, /Open Codex settings/);
});

test("actual interruption footer retries the unchanged prompt and turn id", () => {
  const row = footer("failed", "Request aborted by user");
  const calls: unknown[] = [];
  const tree = renderFooter({ row, ctx: { ...ctx, onRetry: (prompt, turnId) => calls.push([prompt, turnId]) } });
  const actions = tree.props.children.find((child) => isValidElement<{ className?: string; children: unknown[] }>(child) && child.props.className === "chat-turn-actions");
  assert.ok(isValidElement<{ children: unknown[] }>(actions));
  const retry = actions.props.children.find((child) => isValidElement<{ children?: string }>(child) && child.type === "button" && child.props.children === "Retry");
  assert.ok(isValidElement<{ onClick(): void }>(retry));
  retry.props.onClick();
  assert.deepEqual(calls, [[{ text: "Keep this prompt" }, row.turnId]]);
});
