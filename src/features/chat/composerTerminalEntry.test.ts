import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { fileMentionQuery } from "./fileMentions.ts";
import { ComposerSession } from "./composerSession.ts";
import { terminalOutputFiles, terminalOutputRequest } from "./composerTerminal.ts";

function source(path: string) {
  return process.env.COMPOSER_TERMINAL_REF
    ? execFileSync("git", ["show", `${process.env.COMPOSER_TERMINAL_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}
const composer = () => source("src/features/chat/Composer.tsx");
function pick(bindings: Record<string, unknown>) {
  const text = composer();
  const name = text.includes("function pickMention(") ? "pickMention" : "pickFile";
  const start = text.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1);
  const end = text.indexOf("\n  }", start) + "\n  }".length;
  const code = stripTypeScriptTypes(text.slice(start, end));
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings));
}

test("actual Composer offers the terminal action even when the file search returns nothing", () => {
  const line = composer().split("\n").find((line) => line.startsWith("  const mentionMatches = "));
  assert.ok(line);
  const value = line.slice(line.indexOf(" = ") + 3).replace(/;$/, "");
  const result = new Function("files", "workspacePath", "mentionQuery", "fileMatches", "onAttachTerminalOutput", "onLinkWorkspaces", "mentionItems", `return ${value}`)(
    { workspacePath: "/fixture", query: "terminal", matches: [] }, "/fixture", "terminal", [], () => {}, undefined,
    () => [{ kind: "terminal" }],
  );
  assert.deepEqual(result, [{ kind: "terminal" }]);
});

test("actual terminal pick deletes only the live query, calls attachment once, and never inserts a file atom or sends", () => {
  const calls: unknown[] = [];
  let document = "\ufffc keep @terminal\ufffc tail";
  const box = {
    composing: () => false,
    selection: () => ({ text: document, start: 16, end: 16 }),
    deleteRange: (range: { start: number; end: number }) => { calls.push(["delete", range]); document = document.slice(0, range.start) + document.slice(range.end); return true; },
    insertFile: () => calls.push("file atom"),
  };
  pick({ inputRef: { current: box }, fileMentionQuery, mentionKey: "7:terminal", setMentionDismissed: () => {},
    onAttachTerminalOutput: () => calls.push("attach"), onSubmit: () => calls.push("send") })({ kind: "terminal" });
  assert.deepEqual(calls, [["delete", { start: 7, end: 16, query: "terminal" }], "attach"]);
  assert.equal(document, "\ufffc keep \ufffc tail");
});

test("actual editor range removal maps offsets to a single undoable transaction", () => {
  const text = source("src/features/chat/ComposerEditor.tsx");
  const start = text.indexOf("      deleteRange: (range) => {");
  assert.notEqual(start, -1);
  const code = text.slice(start, text.indexOf("      newline:", start));
  const calls: unknown[] = [];
  const transaction = {};
  const chain = { focus: () => chain, deleteRange: (range: unknown) => { calls.push(range); return chain; }, run: () => true };
  const editor = { view: { composing: false, state: { doc: {}, tr: transaction }, dispatch: () => calls.push("history") }, state: { doc: {}, tr: transaction }, chain: () => chain };
  const positions = Array.from({ length: 24 }, (_, i) => i + 1);
  const remove = new Function("editor", "linearDocument", "closeHistory", `return ({${code}}).deleteRange`)(editor, () => ({ positions }), (value: unknown) => value);
  assert.equal(remove({ start: 7, end: 16 }), true);
  assert.deepEqual(calls, ["history", { from: 8, to: 17 }, "history"], "no whole-document replacement or trailing atom deletion");
  calls.length = 0; editor.view.composing = true;
  assert.equal(remove({ start: 7, end: 16 }), false);
  assert.deepEqual(calls, []);
});

test("actual ChatPanel callback uses the pending session loader and native workspace staging", async () => {
  const text = source("src/components/WorkspaceView.tsx");
  const start = text.indexOf("  async function attachTerminalOutput()");
  assert.notEqual(start, -1);
  const code = stripTypeScriptTypes(text.slice(start, text.indexOf("\n  }", start) + "\n  }".length));
  const session = new ComposerSession("origin-chat", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect(); session.setDraft("keep");
  let resolve!: (value: unknown) => void;
  const read = new Promise<unknown>((yes) => { resolve = yes; });
  const calls: unknown[] = [];
  const handler = new Function("session", "invoke", "workspace", "getTabs", "terminalOutputRequest", "terminalOutputFiles", "reason", "draftAttachmentsApi", `${code}; return attachTerminalOutput;`)(
    session, (command: string, args: unknown) => { calls.push({ command, args }); return read; }, { id: "native-workspace" }, () => ({ tabs: [], activeId: null, next: 1 }), terminalOutputRequest, terminalOutputFiles, true,
    { write: async (args: { draftWorkspaceId: string; relativePath: string; data: Uint8Array }) => { calls.push({ workspace: args.draftWorkspaceId, text: new TextDecoder().decode(args.data) }); } },
  );
  const attaching = handler();
  assert.equal(await session.send(async () => {}, () => assert.fail("sent during capture")), false);
  resolve({ source: "terminal", output: "hello", isRunning: true }); await attaching;
  assert.deepEqual(calls[0], { command: "get_terminal_output", args: { request: { workspaceId: "native-workspace", source: "auto", maxLines: 1000, panelTerminalIds: [], tabTerminalIds: [], activeTerminalId: null, preferredTerminalId: null } } });
  assert.deepEqual(calls[1], { workspace: "native-workspace", text: "Source: Terminal\nStatus: running\n\nhello" });
  assert.equal(session.snapshot().draft, "keep");
  assert.equal(session.snapshot().attachments.length, 1);
  session.disconnect();
});

test("actual terminal pick ignores composition and a stale query", () => {
  for (const composing of [true, false]) {
    const handler = pick({
      inputRef: { current: { composing: () => composing, selection: () => ({ text: "changed", start: 7, end: 7 }), deleteRange: () => assert.fail("deleted"), insertFile: () => assert.fail("atom") } },
      fileMentionQuery, mentionKey: "0:terminal", setMentionDismissed: () => assert.fail("dismissed"), onAttachTerminalOutput: () => assert.fail("attached"),
    });
    handler({ kind: "terminal" });
  }
});
