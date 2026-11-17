import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as state from "../../../src/palette/state.ts";

// Supplemental controls only; the original 36-case qualification stays frozen.
// Execute our input handler with synthetic section state, never reference JS/UI.
const component = readFileSync(new URL("../../../src/palette/CommandPalette.tsx", import.meta.url), "utf8");
const start = component.indexOf("  function onKeyDown(");
const end = component.indexOf("\n  const tabs =", start);
assert.ok(start >= 0 && end > start);
const handler = stripTypeScriptTypes(component.slice(start, end));

type Modifiers = { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };

function fixture(query = "") {
  const selections: number[] = [];
  let backs = 0;
  const scope = {
    ...state,
    inSectionMode: true,
    moveToSection: { onBack() { backs += 1; } },
    sectionFlatItems: [{ id: "first" }, { id: "second" }, { id: "third" }],
    active: 1,
    query,
    overrides: {},
    setActive(update: (value: number) => number) { scope.active = update(scope.active); },
    chooseSectionAt(index: number) { selections.push(index); },
  };
  const onKeyDown = runInNewContext(`${handler}\nonKeyDown`, scope, { timeout: 1_000 }) as (event: object) => void;
  return {
    active: () => scope.active,
    backs: () => backs,
    selections,
    press(key: string, modifiers: Modifiers = {}) {
      const nativeEvent = { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...modifiers };
      const event = {
        ...nativeEvent, nativeEvent, prevented: 0, stopped: 0,
        preventDefault() { this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      onKeyDown(event);
      return { prevented: event.prevented, stopped: event.stopped };
    },
  };
}

for (const key of ["ArrowUp", "ArrowDown"]) {
  test(`section exclusion: Option+${key} stays unconsumed and unchanged`, () => {
    const view = fixture();
    assert.deepEqual(view.press(key, { altKey: true }), { prevented: 0, stopped: 0 });
    assert.equal(view.active(), 1);
    assert.equal(view.backs(), 0);
    assert.deepEqual(view.selections, []);
  });
}
for (const { key, modifiers, to } of [
  { key: "ArrowDown", modifiers: {}, to: 2 },
  { key: "ArrowUp", modifiers: {}, to: 0 },
  { key: "ArrowDown", modifiers: { metaKey: true }, to: 2 },
  { key: "ArrowUp", modifiers: { metaKey: true }, to: 0 },
  { key: "j", modifiers: { ctrlKey: true }, to: 2 },
  { key: "k", modifiers: { ctrlKey: true }, to: 0 },
]) {
  test(`section control: ${JSON.stringify(modifiers)} ${key} preserves movement`, () => {
    const view = fixture();
    assert.deepEqual(view.press(key, modifiers), { prevented: 1, stopped: 1 });
    assert.equal(view.active(), to);
    assert.equal(view.backs(), 0);
    assert.deepEqual(view.selections, []);
  });
}
for (const key of ["Escape", "Backspace"]) {
  test(`section control: ${key} returns to commands`, () => {
    const view = fixture();
    assert.deepEqual(view.press(key), { prevented: 1, stopped: 1 });
    assert.equal(view.backs(), 1);
    assert.equal(view.active(), 1);
  });
}
test("section control: Backspace with a query stays unconsumed", () => {
  const view = fixture("query");
  assert.deepEqual(view.press("Backspace"), { prevented: 0, stopped: 0 });
  assert.equal(view.backs(), 0);
});
test("section control: Enter selects the existing active row", () => {
  const view = fixture();
  assert.deepEqual(view.press("Enter"), { prevented: 1, stopped: 1 });
  assert.deepEqual(view.selections, [1]);
  assert.equal(view.backs(), 0);
});
for (const signal of [{ isComposing: true }, { keyCode: 229 }]) {
  test(`section control: composition ${JSON.stringify(signal)} preserves selection`, () => {
    const view = fixture();
    assert.deepEqual(view.press("ArrowDown", signal), { prevented: 0, stopped: 0 });
    assert.equal(view.active(), 1);
    assert.deepEqual(view.selections, []);
    assert.equal(view.backs(), 0);
  });
}
