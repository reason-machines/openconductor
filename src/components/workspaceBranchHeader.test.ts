import assert from "node:assert/strict";
import test from "node:test";
import { createBranchHeaderController, sanitizeHeaderBranch } from "./branchHeaderController.ts";

function deferred() {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(branch = "sven/full.branch", workspaceId = "ws1") {
  const calls: unknown[] = [];
  const errors: string[] = [];
  const rename = deferred();
  let markerError: Error | undefined;
  const controller = createBranchHeaderController({
    repoId: "repo1", workspace: { id: workspaceId, branch },
    renameBranch: async (...args) => { calls.push(["rename", ...args]); await rename.promise; },
    markUserSetBranchName: async (id) => { calls.push(["mark", id]); if (markerError) throw markerError; },
    dispatch: (action) => { calls.push(action); },
    copyText: async (text) => { calls.push(["copy", text]); },
    onError: (message) => { errors.push(message); },
    onChange: () => {},
  });
  return { controller, calls, errors, rename, failMarker: () => { markerError = new Error("disk error"); } };
}

function key(key: string) {
  return { key, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
}

test("inline edit starts with the full branch and sanitizes only disallowed runs", () => {
  const { controller } = fixture();
  controller.startEditing();
  assert.equal(controller.state.value, "sven/full.branch");
  controller.change("Feature/a b!!_C.D-e/f");
  assert.equal(controller.state.value, "Feature/a-b-_C.D-e/f");
  assert.equal(sanitizeHeaderBranch("é 🐬 ?"), "-");
});

test("Enter followed by blur submits once, persists user-set and dispatches branch only", async () => {
  const { controller, calls, rename } = fixture();
  controller.startEditing();
  controller.change("full/new branch");
  const event = key("Enter");
  const submitted = controller.inputKey(event);
  await controller.blur();
  assert.equal(event.prevented, true);
  assert.equal(controller.state.pending, true);
  assert.deepEqual(calls, [["rename", "ws1", "full/new-branch"]]);
  rename.resolve();
  await submitted;
  assert.deepEqual(calls, [
    ["rename", "ws1", "full/new-branch"],
    { type: "renameWorkspace", repoId: "repo1", workspaceId: "ws1", branch: "full/new-branch", userSet: true },
    ["mark", "ws1"],
  ]);
  await controller.blur();
  assert.equal(calls.length, 3);
  assert.equal(controller.state.editing, false);
  assert.equal(controller.state.pending, false);
});

test("blur submits; Escape stops propagation and cancels without blur mutation", async () => {
  const first = fixture();
  first.controller.startEditing();
  first.controller.change("next");
  const submitted = first.controller.blur();
  first.rename.resolve();
  await submitted;
  assert.deepEqual(first.calls[0], ["rename", "ws1", "next"]);
  const second = fixture();
  second.controller.startEditing();
  second.controller.change("discard");
  const event = key("Escape");
  await second.controller.inputKey(event);
  await second.controller.blur();
  assert.equal(event.stopped, true);
  assert.equal(second.controller.state.editing, false);
  assert.deepEqual(second.calls, []);
});

test("empty input stays open, unchanged input exits, neither mutates", async () => {
  const { controller, calls } = fixture();
  controller.startEditing();
  controller.change("");
  await controller.blur();
  assert.equal(controller.state.editing, true);
  controller.change("sven/full.branch");
  await controller.inputKey(key("Enter"));
  assert.equal(controller.state.editing, false);
  assert.deepEqual(calls, []);
});

test("copy writes the full original branch, not the current draft; C and R work", async () => {
  const { controller, calls } = fixture();
  const renameKey = key("R");
  assert.equal(await controller.menuKey(renameKey), true);
  controller.change("draft");
  const copyKey = key("c");
  assert.equal(await controller.menuKey(copyKey), true);
  assert.equal(copyKey.prevented, true);
  assert.deepEqual(calls, [["copy", "sven/full.branch"]]);
  assert.equal(await controller.menuKey(key("x")), false);
});

test("missing and detached branches never enter editing or rename", async () => {
  for (const branch of ["", "(detached HEAD)"]) {
    const { controller, calls } = fixture(branch);
    assert.equal(controller.canRename, false);
    controller.startEditing();
    await controller.menuKey(key("r"));
    controller.change("not-allowed");
    await controller.inputKey(key("Enter"));
    await controller.blur();
    assert.equal(controller.state.editing, false);
    assert.deepEqual(calls, []);
    await controller.copy();
    assert.deepEqual(calls, branch ? [["copy", branch]] : []);
  }
});

test("pending blocks edits and repeated submits; rename error resets pending truthfully", async () => {
  const { controller, calls, errors, rename } = fixture();
  controller.startEditing();
  controller.change("next");
  const submitted = controller.blur();
  controller.startEditing();
  controller.change("other");
  await controller.inputKey(key("Enter"));
  rename.reject(new Error("branch exists"));
  await submitted;
  assert.deepEqual(calls, [["rename", "ws1", "next"]]);
  assert.deepEqual(errors, ["Failed to rename branch: branch exists"]);
  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.editing, false);
  controller.startEditing();
  assert.equal(controller.state.value, "sven/full.branch");
});

test("marker failure does not hide a successful Git branch rename", async () => {
  const { controller, calls, errors, rename, failMarker } = fixture();
  failMarker();
  controller.startEditing();
  controller.change("next");
  const submitted = controller.blur();
  rename.resolve();
  await submitted;
  assert.deepEqual(calls[1], { type: "renameWorkspace", repoId: "repo1", workspaceId: "ws1", branch: "next", userSet: true });
  assert.deepEqual(errors, ["Branch renamed, but failed to save branch-name preference: disk error"]);
  assert.equal(controller.state.pending, false);
});

test("in-flight rename keeps its workspace identity separate from another header", async () => {
  const first = fixture("old/one", "one");
  const second = fixture("old/two", "two");
  first.controller.startEditing();
  first.controller.change("new/one");
  const submitted = first.controller.blur();
  second.controller.startEditing();
  assert.equal(second.controller.state.value, "old/two");
  first.rename.resolve();
  await submitted;
  assert.deepEqual(first.calls[1], { type: "renameWorkspace", repoId: "repo1", workspaceId: "one", branch: "new/one", userSet: true });
  assert.deepEqual(second.calls, []);
});

test("clipboard rejection is reported without renaming", async () => {
  const errors: string[] = [];
  const controller = createBranchHeaderController({
    repoId: "repo1", workspace: { id: "ws1", branch: "full/name" },
    renameBranch: async () => { assert.fail("must not rename"); },
    markUserSetBranchName: async () => { assert.fail("must not mark"); },
    dispatch: () => { assert.fail("must not dispatch"); },
    copyText: async () => { throw new Error("denied"); },
    onError: (message) => { errors.push(message); }, onChange: () => {},
  });
  await controller.copy();
  assert.deepEqual(errors, ["Failed to copy to clipboard"]);
});
