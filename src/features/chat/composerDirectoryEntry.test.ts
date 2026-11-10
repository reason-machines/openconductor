import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";

function source(path: string) {
  return process.env.COMPOSER_DIRECTORY_REF
    ? execFileSync("git", ["show", `${process.env.COMPOSER_DIRECTORY_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}

const mentions = new Function(`${stripTypeScriptTypes(source("src/features/chat/fileMentions.ts")).replace(/^export /gm, "")}; return { mentionItems, fileMentionQuery };`)();
const composer = () => source("src/features/chat/Composer.tsx");

function pick(bindings: Record<string, unknown>) {
  const text = composer();
  const start = text.indexOf("  function pickMention(");
  assert.notEqual(start, -1);
  const end = text.indexOf("\n  }", start) + "\n  }".length;
  const code = stripTypeScriptTypes(text.slice(start, end));
  return new Function(...Object.keys(bindings), `${code}; return pickMention;`)(...Object.values(bindings));
}

function directoryPick({ enabled = true, composing = false, stale = false, deleted = true } = {}) {
  const calls: unknown[] = [];
  let document = "\ufffc keep @add\ufffc tail";
  const box = {
    composing: () => composing,
    selection: () => ({ text: document, start: 11, end: 11 }),
    deleteRange: (range: { start: number; end: number }) => {
      calls.push(["delete", range]);
      if (deleted) document = document.slice(0, range.start) + document.slice(range.end);
      return deleted;
    },
    insertFile: () => assert.fail("directory actions must not insert a file atom"),
  };
  const handler = pick({
    inputRef: { current: box }, fileMentionQuery: mentions.fileMentionQuery,
    mentionKey: stale ? "0:old" : "7:add",
    setMentionDismissed: (key: string) => calls.push(["dismiss", key]),
    onLinkWorkspaces: enabled ? () => calls.push("link") : undefined,
    onAttachTerminalOutput: () => assert.fail("directory actions must not attach terminal output"),
    onSubmit: () => assert.fail("directory actions must not send a message"),
    setDraft: () => assert.fail("directory actions must not replace the whole draft"),
  });
  return { select: () => handler({ kind: "add-directory" }), calls, document: () => document };
}

test("actual mentionItems offers add directory for @add even without file results", () => {
  assert.deepEqual(mentions.mentionItems("add", [], true, true), [{ kind: "add-directory" }]);
});

test("actual mentionItems omits add directory without capability and preserves existing file/terminal entries", () => {
  const file = { file: { name: "add.ts", path: "/fixture/add.ts", is_directory: false }, score: 1, match_indices: [0], relative_path: "add.ts" };
  assert.deepEqual(mentions.mentionItems("add", [file], true, false), [{ kind: "file", match: file }]);
  assert.deepEqual(mentions.mentionItems("add", [], false), []);
  assert.deepEqual(mentions.mentionItems("terminal", [], true, false), [{ kind: "terminal" }]);
});

test("actual mentionItems matches the directory label and orders terminal, directory, then existing files", () => {
  const file = { file: { name: "add.ts", path: "/fixture/add.ts", is_directory: false }, score: 1, match_indices: [0], relative_path: "add.ts" };
  assert.deepEqual(mentions.mentionItems("", [file], true, true), [{ kind: "terminal" }, { kind: "add-directory" }, { kind: "file", match: file }]);
  for (const query of ["ADD", "dir", "adr"]) assert.deepEqual(mentions.mentionItems(query, [], false, true), [{ kind: "add-directory" }]);
  assert.deepEqual(mentions.mentionItems("zzz", [file], true, true), [{ kind: "file", match: file }]);
});

test("actual Composer passes directory capability into the real mention selector", () => {
  const line = composer().split("\n").find((line) => line.startsWith("  const mentionMatches = "));
  assert.ok(line);
  const value = line.slice(line.indexOf(" = ") + 3).replace(/;$/, "");
  const select = new Function("mentionItems", "mentionQuery", "fileMatches", "files", "workspacePath", "onAttachTerminalOutput", "onLinkWorkspaces", `return ${value}`);
  assert.deepEqual(select(mentions.mentionItems, "add", [], null, "/fixture", undefined, () => {}), [{ kind: "add-directory" }]);
  assert.deepEqual(select(mentions.mentionItems, "add", [], null, "/fixture", undefined, undefined), []);
});

test("actual directory pick deletes only the live query before opening the existing picker once", () => {
  const action = directoryPick();
  action.select();
  assert.deepEqual(action.calls, [["delete", { start: 7, end: 11, query: "add" }], ["dismiss", "7:add"], "link"]);
  assert.equal(action.document(), "\ufffc keep \ufffc tail", "surrounding text and adjacent mention atoms survive");
});

test("actual directory pick ignores composition and stale queries", () => {
  for (const options of [{ composing: true }, { stale: true }]) {
    const action = directoryPick(options);
    action.select();
    assert.deepEqual(action.calls, []);
    assert.equal(action.document(), "\ufffc keep @add\ufffc tail");
  }
});

test("actual directory pick does not delete or open a picker without capability", () => {
  const action = directoryPick({ enabled: false });
  action.select();
  assert.deepEqual(action.calls, []);
  assert.equal(action.document(), "\ufffc keep @add\ufffc tail");
});

test("actual directory pick does not dismiss or open a picker when query deletion fails", () => {
  const action = directoryPick({ deleted: false });
  action.select();
  assert.deepEqual(action.calls, [["delete", { start: 7, end: 11, query: "add" }]]);
  assert.equal(action.document(), "\ufffc keep @add\ufffc tail");
});
