import { test } from "node:test";
import assert from "node:assert/strict";
import { acknowledgeEditorSave, changeEditorDraft, observeEditorContents, persistEditorDraft, type EditorContents, type EditorDraftState } from "./editorContents.ts";

const key = "/worktree/a\u0000file.ts";
const initial = (onDisk: string | null = "before"): EditorContents => ({ key, onDisk, generation: 3, saved: null });
const draftState = (): EditorDraftState => ({ contents: new Map(), pendingSaves: new Map() });

function deferredWrite() {
  let resolve: () => void;
  let reject: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve: () => resolve(), reject: (reason: unknown) => reject(reason) };
}

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

for (const baseline of ["before", ""]) {
  test(`an idle edit to the ${baseline === "" ? "empty" : "nonempty"} baseline clears the draft`, () => {
    const state = draftState();
    changeEditorDraft(state, key, baseline, "edit");
    assert.equal(state.contents.get(key), "edit");
    changeEditorDraft(state, key, baseline, baseline);
    assert.equal(state.contents.has(key), false);
    assert.equal(state.pendingSaves.has(key), false);
  });

  test(`editing to the old ${baseline === "" ? "empty" : "nonempty"} baseline during a different save retains that draft through refresh`, async () => {
    const state = draftState();
    const write = deferredWrite();
    changeEditorDraft(state, key, baseline, "saved B");
    const saving = persistEditorDraft(state, key, "saved B", () => write.promise);
    changeEditorDraft(state, key, baseline, baseline);
    const beforeSuccess = { present: state.contents.has(key), contents: state.contents.get(key) };
    write.resolve();
    await saving;
    const afterSuccess = { present: state.contents.has(key), contents: state.contents.get(key) };
    const acknowledged = acknowledgeEditorSave(initial(baseline), key, "saved B");
    const refreshed = observeEditorContents(acknowledged, key, "saved B", state.contents);
    assert.deepEqual({ beforeSuccess, afterSuccess }, {
      beforeSuccess: { present: true, contents: baseline },
      afterSuccess: { present: true, contents: baseline },
    });
    assert.equal(state.contents.get(key), baseline);
    assert.equal(refreshed.saved, null);
    assert.equal(refreshed.generation, 3);
    assert.equal(state.pendingSaves.has(key), false);
    changeEditorDraft(state, key, refreshed.onDisk, "saved B");
    assert.equal(state.contents.has(key), false, "an idle edit to the new baseline clears normally");
  });
}

for (const submitted of ["saved B", ""]) {
  test(`a successful save clears only its unchanged ${submitted === "" ? "empty" : "nonempty"} submitted draft`, async () => {
    const state = draftState();
    const write = deferredWrite();
    changeEditorDraft(state, key, "before", submitted);
    const saving = persistEditorDraft(state, key, submitted, () => write.promise);
    assert.equal(state.contents.get(key), submitted);
    write.resolve();
    await saving;
    assert.equal(state.contents.has(key), false);
    assert.equal(state.pendingSaves.has(key), false);
  });
}

test("a successful save retains a newer distinct draft", async () => {
  const state = draftState();
  const write = deferredWrite();
  changeEditorDraft(state, key, "before", "saved B");
  const saving = persistEditorDraft(state, key, "saved B", () => write.promise);
  changeEditorDraft(state, key, "before", "newer C");
  write.resolve();
  await saving;
  assert.equal(state.contents.get(key), "newer C");
  assert.equal(state.pendingSaves.has(key), false);
});

test("a rejected write propagates its error, retains the current draft and releases pending state", async () => {
  const state = draftState();
  const write = deferredWrite();
  const error = new Error("disk refused the write");
  changeEditorDraft(state, key, "before", "saved B");
  const saving = persistEditorDraft(state, key, "saved B", () => write.promise);
  const rejected = assert.rejects(saving, (actual) => actual === error);
  changeEditorDraft(state, key, "before", "newer C");
  write.reject(error);
  await rejected;
  assert.equal(state.contents.get(key), "newer C");
  assert.equal(state.pendingSaves.has(key), false);
  changeEditorDraft(state, key, "before", "before");
  assert.equal(state.contents.has(key), false);
});

test("the write port observes pending state synchronously, including a synchronous throw", async () => {
  const state = draftState();
  const error = new Error("write threw before returning a promise");
  changeEditorDraft(state, key, "before", "saved B");
  let invoked = false;
  const saving = persistEditorDraft(state, key, "saved B", () => {
    invoked = true;
    assert.equal(state.pendingSaves.get(key), 1);
    throw error;
  });
  assert.equal(invoked, true);
  await assert.rejects(saving, (actual) => actual === error);
  assert.equal(state.contents.get(key), "saved B");
  assert.equal(state.pendingSaves.has(key), false);
});

for (const otherKey of ["/worktree/a\u0000other.ts", "/worktree/b\u0000file.ts"]) {
  test(`pending saves and completion cleanup are isolated from ${JSON.stringify(otherKey)}`, async () => {
    const state = draftState();
    const firstWrite = deferredWrite();
    const otherWrite = deferredWrite();
    changeEditorDraft(state, key, "before", "saved B");
    changeEditorDraft(state, otherKey, "other baseline", "saved B");
    const first = persistEditorDraft(state, key, "saved B", () => firstWrite.promise);
    changeEditorDraft(state, otherKey, "other baseline", "other baseline");
    assert.equal(state.contents.has(otherKey), false, "the first key's pending save cannot retain another key's clean draft");
    changeEditorDraft(state, otherKey, "other baseline", "saved B");
    const other = persistEditorDraft(state, otherKey, "saved B", () => otherWrite.promise);
    firstWrite.resolve();
    await first;
    assert.equal(state.contents.has(key), false);
    assert.equal(state.contents.get(otherKey), "saved B", "success clears only the captured save key");
    assert.equal(state.pendingSaves.has(key), false);
    assert.equal(state.pendingSaves.get(otherKey), 1);
    changeEditorDraft(state, otherKey, "other baseline", "other baseline");
    assert.equal(state.contents.get(otherKey), "other baseline");
    otherWrite.resolve();
    await other;
    assert.equal(state.contents.get(otherKey), "other baseline");
    assert.equal(state.pendingSaves.size, 0);
  });
}

for (const completionOrder of [[0, 1], [1, 0]]) {
  test(`concurrent saves start immediately and remain pending in completion order ${completionOrder.join(",")}`, async () => {
    const state = draftState();
    const writes = [deferredWrite(), deferredWrite()];
    const started: number[] = [];
    changeEditorDraft(state, key, "before", "saved B");
    const saves = writes.map((write, index) => persistEditorDraft(state, key, `saved ${index}`, () => {
      started.push(index);
      assert.equal(state.pendingSaves.get(key), index + 1, "pending is established before each write begins");
      return write.promise;
    }));
    assert.deepEqual(started, [0, 1], "writes are not serialized");
    assert.equal(state.pendingSaves.get(key), 2);
    const [first, last] = completionOrder;
    writes[first].resolve();
    await saves[first];
    assert.equal(state.pendingSaves.get(key), 1);
    changeEditorDraft(state, key, "before", "before");
    assert.equal(state.contents.get(key), "before", "one completed write cannot release the remaining save's guard");
    writes[last].resolve();
    await saves[last];
    assert.equal(state.contents.get(key), "before");
    assert.equal(state.pendingSaves.has(key), false);
    changeEditorDraft(state, key, `saved ${last}`, `saved ${last}`);
    assert.equal(state.contents.has(key), false);
  });
}

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
