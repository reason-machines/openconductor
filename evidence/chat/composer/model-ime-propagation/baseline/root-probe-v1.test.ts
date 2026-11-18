import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Exercise the two actual product callbacks in bubbling order. This does not
// mount React, synthesize browser dispatch, or execute retained reference code.
const sourceRef = process.env.MODEL_PICKER_IME_PROPAGATION_REF;
const source = (path: string) => sourceRef
  ? execFileSync("git", ["show", `${sourceRef}:${path}`], { encoding: "utf8" })
  : readFileSync(path, "utf8");
const picker = source("src/features/chat/ModelPicker.tsx");
const dialog = source("src/components/CreateWorkspaceDialog.tsx");
const menuBody = picker.match(/const onMenuKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n  \};/);
const dialogBody = dialog.match(/onKeyDown=\{\(e\) => \{([\s\S]*?)\n            \}\}/);
assert.ok(menuBody, "the current model-menu key callback is present");
assert.ok(dialogBody, "the enclosing create dialog's key callback is present");
const onMenuKey = new Function(
  "{ e, HTMLButtonElement, search, query, items, disabled, root, value, same, onChange, changeQuery, effortOpen, setEffortOpen, setOpen }",
  menuBody[1].replaceAll("querySelector<HTMLButtonElement>", "querySelector"),
);
const onDialogKey = new Function("e", "close", dialogBody[1]);

const signals = ["isComposing", "nativeIsComposing", "keyCode", "which", "nativeKeyCode", "nativeWhich"] as const;
type Signal = typeof signals[number];

function dispatch({ key = "Escape", query = "opus", signal, code = 229, target = "search", defaultPrevented = false }: {
  key?: string;
  query?: string;
  signal?: Signal;
  code?: number;
  target?: "search" | "result" | "other";
  defaultPrevented?: boolean;
} = {}) {
  const changes: string[] = [];
  const focus: string[] = [];
  const state = { stopped: false, prevented: defaultPrevented, query, open: true, changes, focus, dialogCloses: 0 };
  const search = { current: { focus: () => focus.push("search") } };
  class Button { dataset = { modelResult: "1" }; }
  const nativeEvent = { isComposing: signal === "nativeIsComposing", keyCode: signal === "nativeKeyCode" ? code : 0, which: signal === "nativeWhich" ? code : 0 };
  const e = {
    key, target: target === "search" ? search.current : target === "result" ? new Button() : {},
    isComposing: signal === "isComposing", keyCode: signal === "keyCode" ? code : 0, which: signal === "which" ? code : 0,
    nativeEvent,
    get defaultPrevented() { return state.prevented; },
    preventDefault: () => { state.prevented = true; },
    stopPropagation: () => { state.stopped = true; },
  };
  onMenuKey({
    e, HTMLButtonElement: Button, search, query, items: [{ model: "opus" }, { model: "sonnet" }], disabled: false,
    root: { current: { querySelector: (selector: string) => ({ focus: () => focus.push(selector) }) } },
    value: { model: "current" }, same: (left: { model: string }, right: { model: string }) => left.model === right.model,
    onChange: (choice: { model: string }) => changes.push(choice.model),
    changeQuery: (next: string) => { state.query = next; }, effortOpen: false,
    setEffortOpen: () => assert.fail("the search event must not change effort"),
    setOpen: (next: boolean) => { state.open = next; },
  });
  if (!state.stopped) onDialogKey(e, () => { state.dialogCloses++; });
  return state;
}

const untouched = (query = "opus") => ({ stopped: false, prevented: false, query, open: true, changes: [], focus: [], dialogCloses: 0 });

for (const signal of signals) {
  test(`search composition ${signal} contains Escape before the actual create-dialog callback`, () => {
    for (const query of ["", "opus"]) {
      assert.deepEqual(dispatch({ signal, query }), { ...untouched(query), stopped: true });
    }
  });
}

test("search composition contains Enter, navigation and editing without preventing IME defaults", () => {
  for (const signal of signals) {
    for (const key of ["Enter", "ArrowDown", "ArrowUp", "Tab", "a"]) {
      assert.deepEqual(dispatch({ signal, key }), { ...untouched(), stopped: true });
    }
  }
});

test("ordinary Escape clears search or closes only the model menu, never the create dialog", () => {
  assert.deepEqual(dispatch(), { ...untouched(""), stopped: true, prevented: true });
  assert.deepEqual(dispatch({ query: "" }), { ...untouched(""), stopped: true, prevented: true, open: false });
});

test("ordinary Enter and adjacent key codes still select the same first result", () => {
  for (const code of [13, 228, 230]) {
    assert.deepEqual(dispatch({ key: "Enter", signal: "keyCode", code }), {
      ...untouched(""), stopped: true, prevented: true, changes: ["opus"], focus: ["search"],
    });
  }
});

test("already-prevented composing events remain untouched", () => {
  for (const signal of signals) {
    assert.deepEqual(dispatch({ signal, defaultPrevented: true }), { ...untouched(), prevented: true });
  }
});

test("composition outside the search input retains the prior propagation policy", () => {
  for (const target of ["result", "other"] as const) {
    for (const signal of signals) {
      assert.deepEqual(dispatch({ signal, key: "Enter", target }), untouched());
    }
  }
});

test("ordinary Tab and focused-result Enter preserve navigation and exact selected result", () => {
  assert.deepEqual(dispatch({ key: "Tab" }), untouched());
  assert.deepEqual(dispatch({ key: "Enter", target: "result" }), {
    ...untouched(""), stopped: true, prevented: true, changes: ["sonnet"], focus: ["search"],
  });
});
