import { test } from "node:test";
import assert from "node:assert/strict";
import { processFile } from "@pierre/diffs";
import { fullContents, loadedFiles, toPatch, fromPierreSide, toPierreSide } from "./pierre.ts";
import type { FileDiff } from "./types.ts";

const modified: FileDiff = {
  path: "src/a.ts",
  old_path: null,
  status: "modified",
  binary: false,
  additions: 1,
  deletions: 1,
  hunks: [
    {
      old_start: 10,
      old_lines: 3,
      new_start: 10,
      new_lines: 3,
      section: "function f() {",
      lines: [
        { kind: "context", old_line: 10, new_line: 10, text: "  const x = 1;" },
        { kind: "deletion", old_line: 11, new_line: null, text: "  return x;" },
        { kind: "addition", old_line: null, new_line: 11, text: "  return x + 1;" },
        { kind: "context", old_line: 12, new_line: 12, text: "}" },
      ],
    },
  ],
};

test("toPatch round-trips through Pierre's parser with the same hunk ranges", () => {
  const meta = processFile(toPatch(modified), { isGitDiff: true, throwOnError: true });
  assert.ok(meta);
  assert.equal(meta.name, "src/a.ts");
  assert.equal(meta.type, "change");
  assert.equal(meta.isPartial, true);
  assert.equal(meta.hunks.length, 1);
  const h = meta.hunks[0];
  assert.equal(h.deletionStart, 10);
  assert.equal(h.additionStart, 10);
  assert.equal(h.additionCount, 3);
  assert.equal(h.deletionCount, 3);
  assert.deepEqual(meta.additionLines.map((l) => l.replace(/\n$/, "")), ["  const x = 1;", "  return x + 1;", "}"]);
});

test("added, deleted and renamed files get the matching git headers", () => {
  const added: FileDiff = { ...modified, status: "added", hunks: [{ ...modified.hunks[0], old_start: 0, old_lines: 0, lines: [{ kind: "addition", old_line: null, new_line: 1, text: "x" }] }] };
  assert.match(toPatch(added), /new file mode 100644\n--- \/dev\/null\n\+\+\+ b\/src\/a\.ts/);
  assert.equal(processFile(toPatch(added), { isGitDiff: true })?.type, "new");
  const deleted: FileDiff = { ...modified, status: "deleted", hunks: [{ ...modified.hunks[0], new_start: 0, new_lines: 0, lines: [{ kind: "deletion", old_line: 1, new_line: null, text: "x" }] }] };
  assert.equal(processFile(toPatch(deleted), { isGitDiff: true })?.type, "deleted");
  const renamed: FileDiff = { ...modified, status: "renamed", old_path: "src/old.ts" };
  const meta = processFile(toPatch(renamed), { isGitDiff: true });
  assert.equal(meta?.prevName, "src/old.ts");
  assert.equal(meta?.name, "src/a.ts");
});

test("a missing newline at end of file is kept in the patch and in the contents", () => {
  const f: FileDiff = {
    ...modified,
    hunks: [{ old_start: 1, old_lines: 1, new_start: 1, new_lines: 1, section: "", lines: [
      { kind: "deletion", old_line: 1, new_line: null, text: "a", no_newline_at_eof: true },
      { kind: "addition", old_line: null, new_line: 1, text: "b", no_newline_at_eof: true },
    ] }],
  };
  assert.equal(toPatch(f).split("\\ No newline at end of file").length - 1, 2);
  assert.deepEqual(fullContents(f), { old: "a", new: "b" });
});

test("full contents split a whole-file hunk into the old and new file", () => {
  assert.deepEqual(fullContents(modified), { old: "  const x = 1;\n  return x;\n}\n", new: "  const x = 1;\n  return x + 1;\n}\n" });
  const added: FileDiff = { ...modified, status: "added" };
  assert.equal(fullContents(added).old, null);
  const renamed = loadedFiles({ ...modified, status: "renamed", old_path: "src/old.ts" });
  assert.equal(renamed.oldFile.name, "src/old.ts");
  assert.equal(renamed.newFile.name, "src/a.ts");
});

test("comment sides map to Pierre's annotation sides and back", () => {
  assert.equal(toPierreSide("old"), "deletions");
  assert.equal(toPierreSide("new"), "additions");
  assert.equal(fromPierreSide("deletions"), "old");
  assert.equal(fromPierreSide(undefined), "new");
});
