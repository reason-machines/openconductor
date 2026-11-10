import { test } from "node:test";
import assert from "node:assert/strict";
import { fileMentionQuery, insertFileMention, mentionHighlights, mentionItems } from "./fileMentions.ts";

test("file highlights preserve emoji in basenames and directories with UTF-16 match offsets", () => {
  assert.deepEqual(mentionHighlights("📄.md", [0, 1, 3]), [{ text: "📄", matched: true }, { text: ".", matched: false }, { text: "m", matched: true }, { text: "d", matched: false }]);
  assert.deepEqual(mentionHighlights("docs/📁", [5]), [{ text: "docs/", matched: false }, { text: "📁", matched: true }]);
  assert.deepEqual(mentionHighlights("📄.md", [5, 6], 5), [{ text: "📄", matched: true }, { text: ".md", matched: false }]);
});

test("mentions start at @ after whitespace, including multiline drafts", () => {
  assert.deepEqual(fileMentionQuery("@", 1), { start: 0, end: 1, query: "" });
  assert.deepEqual(fileMentionQuery("Review\n@src/a.ts", 16), { start: 7, end: 16, query: "src/a.ts" });
  assert.equal(fileMentionQuery("ada@example.com", 15), null);
  assert.equal(fileMentionQuery("@a", 0), null);
  assert.equal(fileMentionQuery("@a", 1, 2), null);
});

test("mentions replace the whole token when the caret is in its middle", () => {
  const draft = "Check @src/old.ts and test it";
  const range = fileMentionQuery(draft, 10);
  assert.deepEqual(range, { start: 6, end: 17, query: "src" });
  assert.deepEqual(insertFileMention(draft, range!, "src/new.ts"), { text: "Check @src/new.ts and test it", caret: 18 });
});

test("picking preserves surrounding text and adds a separating space", () => {
  assert.deepEqual(insertFileMention("@auth", { start: 0, end: 5, query: "auth" }, "src/lib/auth.ts"), { text: "@src/lib/auth.ts ", caret: 17 });
  assert.deepEqual(insertFileMention("Fix @a\nthen test", { start: 4, end: 6, query: "a" }, "a.ts"), { text: "Fix @a.ts \nthen test", caret: 10 });
});

test("mention tokens stop before existing file atoms", () => {
  assert.deepEqual(fileMentionQuery("@terminal\ufffc after", 9), { start: 0, end: 9, query: "terminal" });
  assert.equal(fileMentionQuery("@term\ufffcinal", 10), null);
  assert.deepEqual(fileMentionQuery("\ufffc before\n@terminal tail", 18), { start: 9, end: 18, query: "terminal" });
});

test("terminal suggestions are independent of file results and preserve file identities", () => {
  const file = { file: { name: "terminal.ts", path: "/work/terminal.ts", is_directory: false }, score: 1, match_indices: [0], relative_path: "terminal.ts" };
  assert.deepEqual(mentionItems("terminal", [], true), [{ kind: "terminal" }]);
  assert.deepEqual(mentionItems("trm", [file], true), [{ kind: "terminal" }, { kind: "file", match: file }]);
  assert.deepEqual(mentionItems("other", [file], true), [{ kind: "file", match: file }]);
  assert.deepEqual(mentionItems("", [], false), []);
});

test("paths with spaces are quoted, Unicode paths and later mentions remain intact", () => {
  const draft = "@first.ts @sec";
  const range = fileMentionQuery(draft, draft.length)!;
  assert.deepEqual(insertFileMention(draft, range, "docs/å report.md"), { text: '@first.ts @"docs/å report.md" ', caret: 30 });
});
