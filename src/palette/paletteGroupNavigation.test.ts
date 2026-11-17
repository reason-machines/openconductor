import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { Overrides } from "../keybindings/overrides.ts";
import { logical } from "../keybindings/types.ts";
import { cycleTab, type PaletteTab } from "./search/model.ts";
import * as state from "./state.ts";

// Execute only our real input handler with our real command/movement functions.
// React, the DOM, native IPC and original Conductor code are not executed.
const component = readFileSync(new URL("./CommandPalette.tsx", import.meta.url), "utf8");
const start = component.indexOf("  function onKeyDown(");
const end = component.indexOf("\n  const tabs =", start);
assert.ok(start >= 0 && end > start, "real palette handler must remain identifiable");
const handler = stripTypeScriptTypes(component.slice(start, end));

type Modifiers = { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
type FixtureOptions = { tab?: PaletteTab; active?: number; sizes?: number[]; overrides?: Overrides };

function fixture({ tab = "all", active = 1, sizes = [3, 0, 2, 0, 2], overrides = {} }: FixtureOptions = {}) {
  let nextId = 0;
  const groups = sizes.map((size, index) => ({
    id: `group-${index}`,
    items: Array.from({ length: size }, () => ({ id: `item-${nextId++}` })),
    // A disabled "No results" row is deliberately not a navigable item.
    emptyText: size === 0 ? "No results found" : undefined,
  }));
  const flat = groups.flatMap((group) => group.items);
  const selected: string[] = [];
  const tabs: PaletteTab[] = [];
  let closes = 0;
  const scope = {
    ...state,
    cycleTab,
    tab,
    active,
    groups,
    flat,
    wsRows: { active: groups[0]?.items ?? [], archived: groups[1]?.items ?? [] },
    inSectionMode: false,
    moveToSection: undefined,
    sectionFlatItems: [],
    query: "",
    overrides,
    showProjects: true,
    setActive(update: number | ((value: number) => number)) {
      scope.active = typeof update === "function" ? update(scope.active) : update;
    },
    choose(item: { id: string } | undefined) { if (item) selected.push(item.id); },
    chooseSectionAt() { throw new Error("unexpected section selection"); },
    changeTab(next: PaletteTab) { tabs.push(next); },
    onClose() { closes += 1; },
  };
  const onKeyDown = runInNewContext(`${handler}\nonKeyDown`, scope, { timeout: 1_000 }) as (event: object) => void;
  return {
    active: () => scope.active,
    selected,
    tabs,
    closes: () => closes,
    press(key: string, modifiers: Modifiers = {}) {
      const nativeEvent = { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...modifiers };
      const event = {
        ...nativeEvent,
        nativeEvent,
        prevented: 0,
        stopped: 0,
        preventDefault() { this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      onKeyDown(event);
      return { prevented: event.prevented, stopped: event.stopped };
    },
  };
}

const groupCases: { name: string; key: string; from: number; to: number; sizes?: number[]; tab?: PaletteTab }[] = [
  { name: "next sibling group skips an empty disabled-result group", key: "ArrowDown", from: 1, to: 3 },
  { name: "next sibling group starts at its first enabled row", key: "ArrowDown", from: 3, to: 5 },
  { name: "previous group selects its first row, not its last", key: "ArrowUp", from: 4, to: 0 },
  { name: "previous sibling skips empty disabled-result groups", key: "ArrowUp", from: 6, to: 3 },
  { name: "last group falls back to one row forward", key: "ArrowDown", from: 5, to: 6 },
  { name: "last row falls back to ordinary forward wrap", key: "ArrowDown", from: 6, to: 0 },
  { name: "first group falls back to one row backward", key: "ArrowUp", from: 2, to: 1 },
  { name: "first row falls back to ordinary backward wrap", key: "ArrowUp", from: 0, to: 6 },
  { name: "no selected row falls back to the first item", key: "ArrowDown", from: -1, to: 0 },
  { name: "no selected row falls back to the last item", key: "ArrowUp", from: -1, to: 6 },
  { name: "a single group moves one row forward", key: "ArrowDown", from: 1, to: 2, sizes: [3] },
  { name: "a single group moves one row backward", key: "ArrowUp", from: 1, to: 0, sizes: [3] },
  { name: "empty list consumes navigation without selecting", key: "ArrowDown", from: 0, to: 0, sizes: [0, 0] },
  { name: "leading empty groups do not shift next-group offsets", key: "ArrowDown", from: 0, to: 1, sizes: [0, 1, 0, 3] },
  { name: "leading empty groups do not shift previous-group offsets", key: "ArrowUp", from: 3, to: 0, sizes: [0, 1, 0, 3] },
  { name: "Workspaces active to Archived group", key: "ArrowDown", from: 0, to: 2, sizes: [2, 2], tab: "workspaces" },
  { name: "Workspaces Archived to active group", key: "ArrowUp", from: 3, to: 0, sizes: [2, 2], tab: "workspaces" },
  { name: "Projects single group keeps ordinary wrap", key: "ArrowDown", from: 1, to: 0, sizes: [2], tab: "projects" },
];

for (const scenario of groupCases) {
  test(`Option+${scenario.key}: ${scenario.name}`, () => {
    const view = fixture({ active: scenario.from, sizes: scenario.sizes, tab: scenario.tab });
    const event = view.press(scenario.key, { altKey: true });
    assert.equal(view.active(), scenario.to, "actual palette handler must follow retained group traversal");
    assert.deepEqual(event, { prevented: 1, stopped: 1 });
    assert.deepEqual(view.selected, []);
    assert.equal(view.closes(), 0);
    assert.deepEqual(view.tabs, []);
  });
}

const controls = [
  { key: "ArrowDown", modifiers: {}, to: 2 },
  { key: "ArrowUp", modifiers: {}, to: 0 },
  { key: "ArrowDown", modifiers: { metaKey: true }, to: 6 },
  { key: "ArrowUp", modifiers: { metaKey: true }, to: 0 },
  { key: "Home", modifiers: {}, to: 0 },
  { key: "End", modifiers: {}, to: 6 },
  { key: "n", modifiers: { ctrlKey: true }, to: 2 },
  { key: "j", modifiers: { ctrlKey: true }, to: 2 },
  { key: "p", modifiers: { ctrlKey: true }, to: 0 },
  { key: "k", modifiers: { ctrlKey: true }, to: 0 },
];
for (const { key, modifiers, to } of controls) {
  test(`control: ${JSON.stringify(modifiers)} ${key} keeps existing row/end navigation`, () => {
    const view = fixture();
    assert.deepEqual(view.press(key, modifiers), { prevented: 1, stopped: 1 });
    assert.equal(view.active(), to);
    assert.deepEqual(view.selected, []);
    assert.equal(view.closes(), 0);
    assert.deepEqual(view.tabs, []);
  });
}

for (const signal of [{ isComposing: true }, { keyCode: 229 }]) {
  for (const key of ["ArrowDown", "ArrowUp"]) {
    test(`control: composing Option+${key} ${JSON.stringify(signal)} remains unconsumed`, () => {
      const view = fixture();
      assert.deepEqual(view.press(key, { altKey: true, ...signal }), { prevented: 0, stopped: 0 });
      assert.equal(view.active(), 1);
      assert.deepEqual(view.selected, []);
      assert.equal(view.closes(), 0);
    });
  }
}

test("control: Enter selects the active item", () => {
  const view = fixture();
  assert.deepEqual(view.press("Enter"), { prevented: 1, stopped: 1 });
  assert.deepEqual(view.selected, ["item-1"]);
});

test("control: Escape closes instead of navigating", () => {
  const view = fixture();
  assert.deepEqual(view.press("Escape"), { prevented: 1, stopped: 1 });
  assert.equal(view.closes(), 1);
  assert.equal(view.active(), 1);
});

test("control: a custom Option shortcut still switches tabs", () => {
  const view = fixture({ overrides: { "commandPalette.nextTab": [logical("l", ["alt"])] } });
  assert.deepEqual(view.press("l", { altKey: true }), { prevented: 1, stopped: 1 });
  assert.deepEqual(view.tabs, ["workspaces"]);
  assert.equal(view.active(), 1);
});

test("control: unrelated Option input stays in the search field", () => {
  const view = fixture();
  assert.deepEqual(view.press("x", { altKey: true }), { prevented: 0, stopped: 0 });
  assert.equal(view.active(), 1);
  assert.deepEqual(view.selected, []);
  assert.equal(view.closes(), 0);
});
