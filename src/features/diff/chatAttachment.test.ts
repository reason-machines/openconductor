// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { addAttachment, revertedNote, withAttachments } from "./chatAttachment.ts";

test("revertedNote names the file as Conductor does and carries its prompt", () => {
  const note = revertedNote("src/app/main.ts");
  assert.equal(note.name, "revert-src-app-main.ts.txt");
  assert.equal(note.text, 'The user undid all changes to "src/app/main.ts". Do not undo this action unless the user asks.');
});

test("addAttachment keeps one note per file name, last one last", () => {
  const a = revertedNote("a.ts");
  const b = revertedNote("b.ts");
  const list = addAttachment(addAttachment(addAttachment([], a), b), a);
  assert.deepEqual(
    list.map((x) => x.name),
    ["revert-b.ts.txt", "revert-a.ts.txt"],
  );
});

test("withAttachments appends each attachment after the message", () => {
  assert.equal(withAttachments("hi", []), "hi");
  const out = withAttachments("Fix the tests", [revertedNote("a.ts")]);
  assert.equal(
    out,
    'Fix the tests\n\n<attachment name="revert-a.ts.txt">\nThe user undid all changes to "a.ts". Do not undo this action unless the user asks.\n</attachment>',
  );
  assert.ok(withAttachments("", [revertedNote("a.ts")]).startsWith("<attachment"));
});

test("comment attachments dedupe by comment id and get unique chip names", () => {
  const one = { name: "a.ts +2", text: "1", commentId: "c1" };
  const two = { name: "a.ts +2", text: "2", commentId: "c2" };
  let list = addAttachment(addAttachment([revertedNote("a.ts")], one), two);
  assert.deepEqual(
    list.map((x) => [x.name, x.commentId]),
    [
      ["revert-a.ts.txt", undefined],
      ["a.ts +2", "c1"],
      ["a.ts +2 (2)", "c2"],
    ],
  );
  list = addAttachment(list, { ...one, text: "1 again" });
  assert.deepEqual(
    list.map((x) => [x.name, x.text]),
    [
      ["revert-a.ts.txt", "The user undid all changes to \"a.ts\". Do not undo this action unless the user asks."],
      ["a.ts +2 (2)", "2"],
      ["a.ts +2", "1 again"],
    ],
  );
});
