import { test } from "node:test";
import assert from "node:assert/strict";
import { acknowledgeEditorSave, observeEditorContents, type EditorContents } from "./editorContents.ts";

const key = "/worktree/a\u0000file.ts";
const initial = (onDisk: string | null = "before"): EditorContents => ({ key, onDisk, generation: 3, saved: null });

for (const draft of ["unsaved edit", ""]) {
  test(`external refresh preserves a pending ${draft === "" ? "empty" : "nonempty"} draft without remounting`, () => {
    const drafts = new Map([[key, draft]]);
    const next = observeEditorContents(initial(), key, "after", drafts);
    assert.equal(drafts.has(key), true);
    assert.equal(drafts.get(key), draft);
    assert.equal(next.generation, 3);
    assert.equal(next.onDisk, "after");
  });
}

test("a clean editor adopts an external revision and advances generation once", () => {
  const drafts = new Map<string, string>();
  const next = observeEditorContents(initial(), key, "after", drafts);
  assert.deepEqual(next, { key, onDisk: "after", generation: 4, saved: null });
  assert.equal(observeEditorContents(next, key, "after", drafts), next);
});

test("a pending draft equal to the new disk text still prevents a remount", () => {
  const drafts = new Map([[key, "after"]]);
  const next = observeEditorContents(initial(), key, "after", drafts);
  assert.equal(next.generation, 3);
  assert.equal(drafts.get(key), "after");
});

test("loading keeps the last loaded revision and draft", () => {
  const drafts = new Map([[key, "draft"]]);
  const before = initial();
  const loading = observeEditorContents(before, key, null, drafts);
  assert.equal(loading, before);
  const next = observeEditorContents(loading, key, "after", drafts);
  assert.equal(next.onDisk, "after");
  assert.equal(next.generation, 3);
  assert.equal(drafts.get(key), "draft");
});

test("loading does not hide a clean external revision", () => {
  const drafts = new Map<string, string>();
  const before = initial();
  const loading = observeEditorContents(before, key, null, drafts);
  assert.equal(observeEditorContents(loading, key, "before", drafts), before);
  assert.equal(observeEditorContents(loading, key, "after", drafts).generation, 4);
});

test("first loaded contents, including an empty file, do not invent a revision", () => {
  for (const text of ["loaded", ""]) {
    const next = observeEditorContents(initial(null), key, text, new Map());
    assert.equal(next.onDisk, text);
    assert.equal(next.generation, 3);
  }
});

test("a clean external empty file is a real revision", () => {
  const next = observeEditorContents(initial(), key, "", new Map());
  assert.equal(next.onDisk, "");
  assert.equal(next.generation, 4);
});

for (const contents of ["saved", ""]) {
  test(`own-save refresh acknowledges ${contents === "" ? "empty" : "nonempty"} contents once without remounting`, () => {
    const saved = acknowledgeEditorSave(initial(), key, contents);
    assert.equal(saved.saved, contents);
    assert.equal(observeEditorContents(saved, key, null, new Map()), saved);
    const next = observeEditorContents(saved, key, contents, new Map());
    assert.equal(next.onDisk, contents);
    assert.equal(next.generation, 3);
    assert.equal(next.saved, null);
  });
}

test("edits made while saving survive the saved-content refresh", () => {
  const drafts = new Map([[key, "newer draft"]]);
  const next = observeEditorContents(acknowledgeEditorSave(initial(), key, "saved"), key, "saved", drafts);
  assert.equal(drafts.get(key), "newer draft");
  assert.equal(next.generation, 3);
  assert.equal(next.saved, null);
});

test("an external revision consumes a stale save acknowledgement", () => {
  const saved = acknowledgeEditorSave(initial(), key, "saved");
  const external = observeEditorContents(saved, key, "external", new Map());
  assert.equal(external.onDisk, "external");
  assert.equal(external.saved, null, "dirty comparisons use the latest disk revision");
  assert.equal(external.generation, 4);
  const back = observeEditorContents(external, key, "saved", new Map());
  assert.equal(back.generation, 5, "old saved text is now an external revision");
});

test("switching file or worktree isolates drafts, generation and save acknowledgement", () => {
  for (const otherKey of ["/worktree/a\u0000other.ts", "/worktree/b\u0000file.ts"]) {
    const drafts = new Map([[key, "first draft"], [otherKey, "second draft"]]);
    const saved = acknowledgeEditorSave(initial(), key, "saved");
    const other = observeEditorContents(saved, otherKey, null, drafts);
    assert.deepEqual(other, { key: otherKey, onDisk: null, generation: 4, saved: null });
    assert.equal(acknowledgeEditorSave(other, key, "late first save"), other);
    const otherSaved = acknowledgeEditorSave(other, otherKey, "other save");
    assert.equal(acknowledgeEditorSave(otherSaved, key, "late first save"), otherSaved);
    const loaded = observeEditorContents(otherSaved, otherKey, "other save", drafts);
    assert.equal(loaded.generation, 4);
    const back = observeEditorContents(loaded, key, "saved", drafts);
    assert.equal(back.generation, 5);
    assert.equal(back.saved, null);
    assert.equal(drafts.get(key), "first draft");
    assert.equal(drafts.get(otherKey), "second draft");
  }
});
