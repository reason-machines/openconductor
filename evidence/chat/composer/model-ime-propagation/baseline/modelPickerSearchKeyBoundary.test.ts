import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_SEARCH_KEY_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_SEARCH_KEY_REGRESSION_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");
const handler = source.match(/const onMenuKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n  \};/);
assert.ok(handler, "the picker's current keyboard callback is present");
const onMenuKey = new Function(
  "{ e, HTMLButtonElement, search, query, items, disabled, root, value, same, onChange, changeQuery, effortOpen, setEffortOpen, setOpen }",
  handler[1].replaceAll("querySelector<HTMLButtonElement>", "querySelector"),
);

function dispatch({ key, query = "opus", target = "search", composing = false, defaultPrevented = false, effortOpen = false }: {
  key: string;
  query?: string;
  target?: "search" | "result" | "other";
  composing?: boolean;
  defaultPrevented?: boolean;
  effortOpen?: boolean;
}) {
  const changes: string[] = [];
  const focus: string[] = [];
  const state = { stopped: false, prevented: defaultPrevented, query, open: true, effortOpen, changes, focus };
  const search = { current: { focus: () => state.focus.push("search") } };
  class Button {
    dataset = { modelResult: "1" };
  }
  const items = [{ model: "opus" }, { model: "sonnet" }, { model: "haiku" }];
  const e = {
    key,
    target: target === "search" ? search.current : target === "result" ? new Button() : {},
    defaultPrevented,
    nativeEvent: { isComposing: composing },
    preventDefault: () => { state.prevented = true; },
    stopPropagation: () => { state.stopped = true; },
  };
  onMenuKey({
    e,
    HTMLButtonElement: Button,
    search,
    query,
    items,
    disabled: false,
    root: { current: { querySelector: (selector: string) => ({ focus: () => state.focus.push(selector) }) } },
    value: { model: "current" },
    same: (left: { model: string }, right: { model: string }) => left.model === right.model,
    onChange: (choice: { model: string }) => state.changes.push(choice.model),
    changeQuery: (next: string) => { state.query = next; },
    effortOpen,
    setEffortOpen: (next: boolean) => { state.effortOpen = next; },
    setOpen: (next: boolean) => { state.open = next; },
  });
  return state;
}

function untouched(query = "opus", prevented = false) {
  return { stopped: false, prevented, query, open: true, effortOpen: false, changes: [], focus: [] };
}

for (const key of ["a", "Backspace", "Delete", " ", "ArrowLeft", "ArrowRight"]) {
  test(`source callback: search input contains ${JSON.stringify(key)} without preventing text editing`, () => {
    for (const query of ["", "opus"]) {
      assert.deepEqual(dispatch({ key, query }), { ...untouched(query), stopped: true });
    }
  });
}

test("source callback: ordinary keys outside the search input still propagate", () => {
  for (const target of ["result", "other"] as const) {
    for (const key of ["a", "Backspace", "ArrowLeft"]) {
      assert.deepEqual(dispatch({ key, target }), untouched());
    }
  }
});

test("source callback: Tab remains available to default menu navigation", () => {
  for (const query of ["", "opus"]) {
    assert.deepEqual(dispatch({ key: "Tab", query }), untouched(query));
  }
});

test("source callback: blank search leaves vertical arrows to default menu navigation", () => {
  for (const key of ["ArrowDown", "ArrowUp"]) {
    assert.deepEqual(dispatch({ key, query: "" }), untouched(""));
    assert.deepEqual(dispatch({ key, target: "other" }), untouched());
  }
});

test("source callback: filtered search keeps its existing vertical result navigation", () => {
  for (const [key, next] of [["ArrowDown", 1], ["ArrowUp", 2]] as const) {
    assert.deepEqual(dispatch({ key }), {
      ...untouched(), stopped: true, prevented: true, focus: [`[data-model-result="${next}"]`],
    });
  }
  assert.deepEqual(dispatch({ key: "ArrowDown", target: "result" }), {
    ...untouched(), stopped: true, prevented: true, focus: ['[data-model-result="2"]'],
  });
});

test("source callback: Enter still chooses the first search result and clears the query", () => {
  assert.deepEqual(dispatch({ key: "Enter" }), {
    ...untouched(""), stopped: true, prevented: true, changes: ["opus"], focus: ["search"],
  });
  assert.deepEqual(dispatch({ key: "Enter", target: "result" }), {
    ...untouched(""), stopped: true, prevented: true, changes: ["sonnet"], focus: ["search"],
  });
  assert.deepEqual(dispatch({ key: "Enter", query: "" }), {
    ...untouched(""), stopped: true, prevented: true,
  });
  assert.deepEqual(dispatch({ key: "Enter", target: "other" }), untouched());
});

test("source callback: Escape preserves query-clear, menu-close and submenu-close precedence", () => {
  assert.deepEqual(dispatch({ key: "Escape" }), { ...untouched(""), stopped: true, prevented: true });
  assert.deepEqual(dispatch({ key: "Escape", query: "" }), {
    ...untouched(""), stopped: true, prevented: true, open: false,
  });
  assert.deepEqual(dispatch({ key: "Escape", target: "other" }), {
    ...untouched(), stopped: true, prevented: true, open: false,
  });
  assert.deepEqual(dispatch({ key: "Escape", effortOpen: true }), {
    ...untouched(), stopped: true, prevented: true,
  });
});

test("source callback: composing search keys retain the existing early return", () => {
  for (const key of ["a", "Enter", "Escape", "ArrowDown"]) {
    assert.deepEqual(dispatch({ key, composing: true }), untouched());
  }
});

test("source callback: already-prevented keys retain the existing early return", () => {
  for (const key of ["a", "Enter", "Escape", "ArrowDown"]) {
    assert.deepEqual(dispatch({ key, defaultPrevented: true }), untouched("opus", true));
  }
});
