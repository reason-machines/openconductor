import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createChatRuntime, type ChatBackend, type ChatHost } from "./chatRuntime.ts";
import { applyReasonPayload } from "./reason.ts";

const settle = () => new Promise<void>((done) => setImmediate(done));

function fixture() {
  const path = resolve("src/features/chat/reasonChat.ts");
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const names = new Set(["sessionKey", "configKey", "parseConfig", "REASON_CAN_STEER", "PREVIEW_TURN_MS", "PREVIEW_ASKS", "previewSummary", "previewBackend"]);
  const declarations = source.statements.filter((statement) => {
    if (ts.isFunctionDeclaration(statement)) return !!statement.name && names.has(statement.name.text);
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && names.has(declaration.name.text));
    return false;
  });
  assert.equal(declarations.length, names.size, "load the actual production preview backend and its constants");
  const javascript = ts.transpileModule(`${declarations.map((declaration) => declaration.getText(source)).join("\n")}\npreviewBackend;`, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const factory: () => ChatBackend<unknown> = runInNewContext(javascript, {
    exports: {}, applyReasonPayload,
    setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  }, { filename: path });
  const values = new Map<string, string>();
  let handoffs = 0;
  const host: ChatHost & { onPromptHandoff(): Promise<void> } = {
    persist: false,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    },
    invoke: async () => assert.fail("browser preview must not invoke native commands"),
    recordTurnChanges: () => assert.fail("browser preview has no native checkpoints"),
    onPromptHandoff: async () => { handoffs++; },
  };
  return {
    runtime: createChatRuntime(factory(), host),
    handoffs: () => handoffs,
    advance: () => {
      const current = [...timers];
      timers.clear();
      for (const [, callback] of current) callback();
    },
  };
}

const attachment = { name: "comment.md", text: "Review this line", commentId: "review-one" };

test("browser stand-in completion never credits a review transport handoff", async () => {
  const f = fixture();
  f.runtime.submit("preview-review-complete", "/workspace", { text: "review this" }, "queue", [attachment], undefined, "workspace-one");
  await settle();
  assert.equal(f.handoffs(), 0, "accepting a preview prompt is not a transport write");
  f.advance();
  await settle();
  const snapshot = f.runtime.snapshot("preview-review-complete");
  assert.equal(f.handoffs(), 0, "a synthetic preview response is not a transport write");
  const text = snapshot.transcript.messages.flatMap((message) => message.blocks.flatMap((block) => block.type === "text" ? [block.text] : [])).join("\n");
  assert.match(text, /Browser preview: no agent runs here/);
  assert.match(text, /was not sent/);
});

test("cancelling the browser stand-in never credits a review transport handoff", async () => {
  const f = fixture();
  f.runtime.submit("preview-review-cancel", "/workspace", { text: "review this" }, "queue", [attachment], undefined, "workspace-one");
  await settle();
  f.runtime.stop("preview-review-cancel");
  f.advance();
  await settle();
  assert.equal(f.handoffs(), 0);
  assert.equal(f.runtime.snapshot("preview-review-cancel").queue.status, "idle");
});
