import { test } from "node:test";
import assert from "node:assert/strict";
import { editableContents } from "./editable.ts";
import type { FileDiff } from "./types.ts";

const file = (over: Partial<FileDiff> = {}): FileDiff => ({
  path: "a.ts",
  old_path: null,
  status: "modified",
  binary: false,
  additions: 1,
  deletions: 1,
  hunks: [
    {
      old_start: 1,
      new_start: 1,
      old_lines: 2,
      new_lines: 2,
      section: "",
      lines: [
        { kind: "context", old_line: 1, new_line: 1, text: "keep" },
        { kind: "deletion", old_line: 2, new_line: null, text: "old" },
        { kind: "addition", old_line: null, new_line: 2, text: "new", no_newline_at_eof: true },
      ],
    },
  ],
  ...over,
});

test("the entire-file view edits the new file's full text, keeping a missing final newline", () => {
  assert.equal(editableContents(file(), "file", false), "keep\nnew");
});

test("hunk layouts, hidden whitespace, binary and deleted files are not editable", () => {
  assert.equal(editableContents(file(), "unified", false), null);
  assert.equal(editableContents(file(), "split", false), null);
  assert.equal(editableContents(file(), "file", true), null, "a -w diff's text is not the file's");
  assert.equal(editableContents(file({ binary: true }), "file", false), null);
  assert.equal(editableContents(file({ status: "deleted" }), "file", false), null);
  assert.equal(editableContents(file({ hunks: [] }), "file", false), null);
});
