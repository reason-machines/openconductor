import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

type Request = { chatId: string; cwd: string; text: string; attachments: readonly { name: string; text: string; commentId?: string }[]; turn: { sessionId: string; turnId: string }; firstMessage: boolean; repoPath: null; workspaceId: string; onHandoff(): void };

function adapter(path: string, binding: string) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.flatMap((statement) => ts.isVariableStatement(statement) ? statement.declarationList.declarations : [])
    .find((entry) => entry.name.getText(source) === binding);
  const initializer = declaration?.initializer;
  assert.ok(initializer && ts.isObjectLiteralExpression(initializer));
  const prompt = initializer.properties.find((entry) => entry.name?.getText(source) === "prompt");
  assert.ok(prompt && ts.isMethodDeclaration(prompt));
  class Channel { onmessage: (value: null) => void = () => undefined; }
  const calls: { command: string; args: { chatId: string; onHandoff?: Channel }; resolve(): void; reject(error: Error): void }[] = [];
  const invoke = (command: string, args: { chatId: string; onHandoff?: Channel }) => new Promise<void>((resolve, reject) => calls.push({ command, args, resolve, reject }));
  const javascript = ts.transpileModule(`(${`{ ${prompt.getText(source)} }`}).prompt`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const method: (request: Request) => Promise<void> = runInNewContext(javascript, {
    Channel, invoke, localModelOptions: () => ({}),
    withAttachments: (text: string, attachments: Request["attachments"]) => [text, ...attachments.map((attachment) => attachment.text)].join("\n"),
    withGeneral: () => assert.fail("first-message preferences not involved in handoff"),
  });
  return { method, calls };
}

for (const [path, binding, command] of [
  ["src/features/chat/reasonChat.ts", "reasonBackend", "reason_prompt"],
  ["src/features/chat/claudeChat.ts", "claudeBackend", "claude_prompt"],
]) {
  test(`${command} uses the request-scoped channel, not invocation completion`, async () => {
    const f = adapter(path, binding);
    let handoffs = 0;
    const request = { chatId: "one", cwd: "/one", text: "review", attachments: [{ name: "comment.md", text: "review", commentId: "c1" }], turn: { sessionId: "one", turnId: "turn1" }, firstMessage: false, repoPath: null, workspaceId: "one", onHandoff: () => { handoffs++; } } satisfies Request;
    const completed = f.method(request);
    assert.equal(f.calls[0].command, command);
    f.calls[0].resolve();
    await completed;
    assert.equal(handoffs, 0, "command completion is not handoff");
    const next = f.method({ ...request, chatId: "two", onHandoff: () => { handoffs += 10; } });
    const channel = f.calls[1].args.onHandoff;
    assert.ok(channel, "actual adapter provides a native IPC channel");
    channel.onmessage(null);
    assert.equal(handoffs, 10, "second invocation cannot commit first invocation identities");
    f.calls[1].reject(new Error("later native turn failed"));
    await assert.rejects(next);
    assert.equal(handoffs, 10, "later failure does not erase the handoff");
  });
}
