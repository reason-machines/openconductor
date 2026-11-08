import { test } from "node:test";
import assert from "node:assert/strict";
import { editableContents } from "./editable.ts";
import { processFile } from "@pierre/diffs";
import { codeViewItem, editableCodeViewItem, fullDiffMeta, toPatch } from "./pierre.ts";
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

for (const layout of ["unified", "split"] as const) {
  test(`${layout} edits the complete file, not just the visible patch`, () => {
    const partial = file({ hunks: [{ ...file().hunks[0], old_start: 12, new_start: 12 }] });
    const complete = file({ hunks: [{ ...file().hunks[0], old_lines: 4, new_lines: 4, lines: [
      { kind: "context", old_line: 1, new_line: 1, text: "untouched prefix" },
      ...file().hunks[0].lines.map((line) => ({ ...line, no_newline_at_eof: false })),
      { kind: "context", old_line: 4, new_line: 4, text: "untouched suffix", no_newline_at_eof: true },
    ] }] });
    assert.equal(editableContents(partial, layout, false), null, "wait for complete contents");
    assert.equal(editableContents(partial, layout, false, complete), "untouched prefix\nkeep\nnew\nuntouched suffix");
    assert.equal(editableContents(partial, layout, false, { ...complete, path: "other.ts" }), null);
  });
}

for (const layout of ["unified", "split", "file"] as const) {
  test(`${layout} seeds the editor with the full draft and preserves annotations and old contents`, () => {
    const whole = file({ old_path: "before.ts", status: "renamed", hunks: [{ ...file().hunks[0], old_lines: 4, new_lines: 4, lines: [
      { kind: "context", old_line: 1, new_line: 1, text: "prefix" },
      { kind: "context", old_line: 2, new_line: 2, text: "keep" },
      { kind: "deletion", old_line: 3, new_line: null, text: "old" },
      { kind: "addition", old_line: null, new_line: 3, text: "new" },
      { kind: "context", old_line: 4, new_line: 4, text: "suffix", no_newline_at_eof: true },
    ] }] });
    const draft = "prefix\nkeep\nedited\nsuffix";
    const item = codeViewItem(whole, fullDiffMeta(whole, false), layout, [{ side: "new", line: 3 }], 7);
    const edited = editableCodeViewItem(item, draft);
    assert.equal(edited.type, item.type);
    assert.equal(edited.edit, true);
    assert.equal(edited.version, 7);
    assert.equal(edited.annotations, item.annotations);
    if (edited.type === "file") assert.equal(edited.file.contents, draft);
    else {
      assert.equal(edited.fileDiff.isPartial, false);
      assert.equal(edited.fileDiff.prevName, "before.ts");
      assert.equal(edited.fileDiff.deletionLines.join(""), "prefix\nkeep\nold\nsuffix");
      assert.equal(edited.fileDiff.additionLines.join(""), draft, "save text keeps both untouched regions and EOF");
    }
  });
}

test("a partial diff never becomes an editable document", () => {
  const partial = file({ hunks: [{ ...file().hunks[0], old_start: 12, new_start: 12 }] });
  const item = codeViewItem(partial, processFile(toPatch(partial), { isGitDiff: true }), "unified", [], 1);
  assert.equal(editableCodeViewItem(item, "draft"), item);
  assert.equal(item.edit, undefined);
});

test("a new file's diff editor keeps its absent old side", () => {
  const added = file({ status: "added", hunks: [{ old_start: 0, old_lines: 0, new_start: 1, new_lines: 1, section: "", lines: [
    { kind: "addition", old_line: null, new_line: 1, text: "new", no_newline_at_eof: true },
  ] }] });
  const item = editableCodeViewItem(codeViewItem(added, fullDiffMeta(added, false), "split", [], 1), "edited\n");
  assert.ok(item.type === "diff");
  assert.equal(item.fileDiff.type, "new");
  assert.deepEqual(item.fileDiff.deletionLines, []);
  assert.equal(item.fileDiff.additionLines.join(""), "edited\n");
});

test("hidden whitespace, binary and deleted files are not editable", () => {
  assert.equal(editableContents(file(), "file", true), null, "a -w diff's text is not the file's");
  assert.equal(editableContents(file({ binary: true }), "file", false), null);
  assert.equal(editableContents(file({ status: "deleted" }), "file", false), null);
  assert.equal(editableContents(file({ hunks: [] }), "file", false), null);
});
