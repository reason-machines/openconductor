import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { LinkSelection } from "./workspaceLinks.ts";

const source = readFileSync("src/features/chat/LinkedDirectoryPicker.tsx", "utf8");
const handler = source.match(/function keyDown\(event: KeyboardEvent\) \{([\s\S]*?)\n  \}\n\n  let index/);
assert.ok(handler, "the production keyboard handler is present");
assert.match(source, /<Dialog\.Popup[^>]*onKeyDown=\{keyDown\}/, "the popup uses this handler");
const keyDown = new Function("event", "rows", "linkedDirectoryPaths", "activeIndex", "setFocused", "choose", handler[1]);

function picker({ ids = ["workspace-a", "workspace-b"], directories = [], focused = 1 }: {
  ids?: readonly string[]; directories?: readonly string[]; focused?: number;
} = {}) {
  const selections: (LinkSelection | { kind: "browse" })[] = [];
  const rows = ids.map((id) => ({ id }));
  const state = { focused, selections };
  return {
    state,
    press(key: string, { isComposing = false, defaultPrevented = false } = {}) {
      let prevented = defaultPrevented;
      keyDown({ key, nativeEvent: { isComposing }, defaultPrevented, preventDefault() { prevented = true; } },
        rows, directories, Math.min(state.focused, rows.length + directories.length),
        (next: number) => { state.focused = next; }, (selection?: LinkSelection) => { selections.push(selection ?? { kind: "browse" }); });
      return prevented;
    },
  };
}

test("End then Enter toggles the final workspace, not the previously selected workspace", () => {
  const view = picker();
  assert.equal(view.press("End"), true);
  assert.deepEqual(view.state.selections, []);
  view.press("Enter");
  assert.deepEqual(view.state.selections, [{ kind: "workspace", id: "workspace-b" }]);
});

test("Home then Enter selects Browse without prematurely opening it", () => {
  const view = picker({ focused: 2 });
  assert.equal(view.press("Home"), true);
  assert.deepEqual(view.state.selections, []);
  view.press("Enter");
  assert.deepEqual(view.state.selections, [{ kind: "browse" }]);
});

test("End accounts for existing directory rows before workspace rows", () => {
  const view = picker({ directories: ["/fixture/linked"] });
  view.press("End");
  view.press("Enter");
  assert.deepEqual(view.state.selections, [{ kind: "workspace", id: "workspace-b" }]);
});

test("End selects the final directory when no workspace matches the search", () => {
  const view = picker({ ids: [], directories: ["/fixture/a", "/fixture/b"], focused: 0 });
  view.press("End");
  view.press("Enter");
  assert.deepEqual(view.state.selections, [{ kind: "directory", path: "/fixture/b" }]);
});

test("Home and End safely select Browse when it is the only result", () => {
  const view = picker({ ids: [], focused: 0 });
  for (const key of ["Home", "End"]) {
    assert.equal(view.press(key), true);
    assert.equal(view.state.focused, 0);
    assert.deepEqual(view.state.selections, []);
  }
});

for (const guard of [{ isComposing: true }, { defaultPrevented: true }]) {
  test(`${Object.keys(guard)[0]} keeps navigation and activation inert`, () => {
    const view = picker();
    for (const key of ["Home", "End", "ArrowDown", "ArrowUp", "Enter"]) view.press(key, guard);
    assert.deepEqual(view.state, { focused: 1, selections: [] });
  });
}

test("ordinary arrow navigation still wraps both ends", () => {
  const view = picker({ focused: 0 });
  assert.equal(view.press("ArrowUp"), true);
  view.press("Enter");
  assert.deepEqual(view.state.selections, [{ kind: "workspace", id: "workspace-b" }]);
  view.press("ArrowDown");
  view.press("Enter");
  assert.deepEqual(view.state.selections[1], { kind: "browse" });
});

test("ordinary Enter still activates the selected workspace", () => {
  const view = picker();
  assert.equal(view.press("Enter"), true);
  assert.deepEqual(view.state.selections, [{ kind: "workspace", id: "workspace-a" }]);
});

test("unrelated editing keys neither navigate nor activate", () => {
  const view = picker();
  assert.equal(view.press("a"), false);
  assert.deepEqual(view.state, { focused: 1, selections: [] });
});
