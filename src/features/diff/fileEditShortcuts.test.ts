import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { bindCommands, type CommandHandlers } from "../../keybindings/bind.ts";
import { createDispatcher } from "../../keybindings/dispatcher.ts";

const path = "src/features/diff/DiffViewer.tsx";
const source = process.env.DIFF_FILE_EDIT_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.DIFF_FILE_EDIT_REGRESSION_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(path, "utf8");
const start = source.indexOf("\n  useKeybindings(", source.indexOf("function OpenFile("));
const end = source.indexOf("\n  return (", start);
assert.ok(start >= 0 && end > start, "locate OpenFile's actual shortcut registration call");
// This call is ordinary JS inside the TSX component. Evaluate the unchanged
// production call only, not a copied handler, React facade or reference code.
// Real registration, command defaults, matching and ordering are used below.
const registration = source.slice(start, end);
const key = { key: "e", code: "KeyE", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
const focus = { typing: false, inTerminal: false, activeDialogId: null };
type Kind = "code" | "preview" | "ineligible";

function file(dispatcher: ReturnType<typeof createDispatcher>, kind: Kind, initiallyVisible: boolean) {
  let isVisible = initiallyVisible;
  let editing = true;
  let previewing = true;
  let changes = 0;
  let unbind = () => {};
  function register() {
    unbind();
    let calls = 0;
    runInNewContext(registration, {
      isVisible,
      isPreviewable: kind === "preview",
      isEditableCode: kind === "code",
      setIsEditing: (update: (value: boolean) => boolean) => { editing = update(editing); changes++; },
      setIsPreviewing: (update: (value: boolean) => boolean) => { previewing = update(previewing); changes++; },
      useKeybindings: (handlers: CommandHandlers) => { calls++; unbind = bindCommands(dispatcher, handlers); },
    });
    assert.equal(calls, 1, "exercise exactly the production registration call");
  }
  register();
  return {
    state: () => ({ editing, previewing, changes }),
    visible(value: boolean) { isVisible = value; register(); },
  };
}

for (const kind of ["code", "preview"] as const) {
  test(`hidden ${kind} file neither toggles nor consumes the edit shortcut`, () => {
    const dispatcher = createDispatcher();
    const hidden = file(dispatcher, kind, false);
    assert.equal(dispatcher.dispatch(key, focus).kind, "pass");
    assert.equal(hidden.state().changes, 0);
    assert.equal(dispatcher.handlers().length, 0);
  });

  test(`visible ${kind} file still handles and toggles the edit shortcut`, () => {
    const dispatcher = createDispatcher();
    const visible = file(dispatcher, kind, true);
    assert.equal(dispatcher.dispatch(key, focus).kind, "ran");
    assert.deepEqual(visible.state(), {
      editing: kind !== "code", previewing: kind !== "preview", changes: 1,
    });
    assert.equal(dispatcher.dispatch(key, focus).kind, "ran");
    assert.deepEqual(visible.state(), { editing: true, previewing: true, changes: 2 });
  });
}

for (const hiddenKind of ["code", "preview"] as const) {
  for (const visibleKind of ["code", "preview"] as const) {
    for (const hiddenFirst of [true, false]) {
      test(`${hiddenKind} hidden / ${visibleKind} visible, ${hiddenFirst ? "hidden" : "visible"} registered first`, () => {
        const dispatcher = createDispatcher();
        const first = file(dispatcher, hiddenFirst ? hiddenKind : visibleKind, !hiddenFirst);
        const second = file(dispatcher, hiddenFirst ? visibleKind : hiddenKind, hiddenFirst);
        const hidden = hiddenFirst ? first : second;
        const visible = hiddenFirst ? second : first;
        assert.equal(dispatcher.dispatch(key, focus).kind, "ran");
        assert.equal(hidden.state().changes, 0, "retained hidden file must not intercept or toggle");
        assert.equal(visible.state().changes, 1, "only the visible file handles the key");
      });
    }
  }
}

test("no matching visible file lets the shortcut reach another owner", () => {
  const dispatcher = createDispatcher();
  const a = file(dispatcher, "code", false);
  const b = file(dispatcher, "preview", false);
  let fallback = 0;
  bindCommands(dispatcher, { "workspace.toggleFileEdit": () => { fallback++; } });
  assert.equal(dispatcher.dispatch(key, focus).kind, "ran");
  assert.equal(fallback, 1);
  assert.equal(a.state().changes + b.state().changes, 0);
});

for (const kind of ["code", "preview"] as const) {
  test(`visibility changes preserve ${kind} state and restore only the active binding`, () => {
    const dispatcher = createDispatcher();
    const a = file(dispatcher, kind, true);
    dispatcher.dispatch(key, focus);
    const retained = a.state();
    a.visible(false);
    const b = file(dispatcher, kind === "code" ? "preview" : "code", true);
    dispatcher.dispatch(key, focus);
    assert.deepEqual(a.state(), retained);
    assert.equal(b.state().changes, 1);
    b.visible(false);
    assert.equal(dispatcher.dispatch(key, focus).kind, "pass", "no-match presentation consumes nothing");
    a.visible(true);
    assert.deepEqual(a.state(), retained, "showing a retained file does not reset its mode");
    dispatcher.dispatch(key, focus);
    assert.deepEqual(a.state(), { editing: true, previewing: true, changes: 2 });
    assert.equal(b.state().changes, 1);
  });
}

test("visible ineligible file does not acquire an edit shortcut", () => {
  const dispatcher = createDispatcher();
  const visible = file(dispatcher, "ineligible", true);
  assert.equal(dispatcher.dispatch(key, focus).kind, "pass");
  assert.equal(visible.state().changes, 0);
});

test("the real DiffTab retains files and supplies no-match/selected visibility to OpenFile", () => {
  assert.ok(source.includes("path].slice(-5)"));
  assert.ok(source.includes("visited.paths.includes(file.path)"));
  assert.ok(source.includes("isVisible={!diff.noMatchingFiles && file.path === selected.path}"));
});

test("retained REA bji identity and literal hidden-file guard remain intact (not evaluated)", () => {
  const reference = readFileSync("evidence/open-in/deleted-finder/reference/bji.txt");
  assert.equal(createHash("sha256").update(reference).digest("hex"),
    "2d2b8aac64bada5ead6bc143ac6bb272544791374a9b71b38e57eab55c8f5688");
  const text = reference.toString("utf8");
  assert.ok(text.includes("isVisible:o=!0"));
  assert.ok(text.includes('oi("workspace.toggleFileEdit",()=>!o||!I&&!L?!1:'));
});
