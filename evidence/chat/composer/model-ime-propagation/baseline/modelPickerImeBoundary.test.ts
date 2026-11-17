import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_IME_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_IME_REGRESSION_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");
const handler = source.match(/const onMenuKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n  \};/);
assert.ok(handler, "the picker's current keyboard callback is present");
const onMenuKey = new Function(
  "{ e, HTMLButtonElement, search, query, items, disabled, root, value, same, onChange, changeQuery, effortOpen, setEffortOpen, setOpen }",
  handler[1].replaceAll("querySelector<HTMLButtonElement>", "querySelector"),
);

function dispatch({ key, query = "opus", isComposing = false, nativeIsComposing = false,
  keyCode = 0, which = 0, nativeKeyCode = 0, nativeWhich = 0, defaultPrevented = false }: {
  key: string;
  query?: string;
  isComposing?: boolean;
  nativeIsComposing?: boolean;
  keyCode?: number;
  which?: number;
  nativeKeyCode?: number;
  nativeWhich?: number;
  defaultPrevented?: boolean;
}) {
  const changes: string[] = [];
  const focus: string[] = [];
  const state = { stopped: false, prevented: defaultPrevented, query, open: true, changes, focus };
  const search = { current: { focus: () => state.focus.push("search") } };
  const e = {
    key, keyCode, which, isComposing, defaultPrevented,
    target: search.current,
    nativeEvent: { isComposing: nativeIsComposing, keyCode: nativeKeyCode, which: nativeWhich },
    preventDefault: () => { state.prevented = true; },
    stopPropagation: () => { state.stopped = true; },
  };
  onMenuKey({
    e,
    HTMLButtonElement: class Button {},
    search,
    query,
    items: [{ model: "opus" }, { model: "sonnet" }],
    disabled: false,
    root: { current: { querySelector: (selector: string) => ({ focus: () => state.focus.push(selector) }) } },
    value: { model: "current" },
    same: (left: { model: string }, right: { model: string }) => left.model === right.model,
    onChange: (choice: { model: string }) => state.changes.push(choice.model),
    changeQuery: (next: string) => { state.query = next; },
    effortOpen: false,
    setEffortOpen: () => assert.fail("a composition key must not change the effort submenu"),
    setOpen: (next: boolean) => { state.open = next; },
  });
  return state;
}

function untouched(query = "opus", prevented = false) {
  return { stopped: false, prevented, query, open: true, changes: [], focus: [] };
}

for (const field of ["keyCode", "which", "nativeKeyCode", "nativeWhich"] as const) {
  for (const key of ["Enter", "Escape"]) {
    test(`source callback: ${field} 229 alone keeps composing ${key} out of model commands`, () => {
      for (const query of ["", "opus"]) {
        assert.deepEqual(dispatch({ key, query, [field]: 229 }), untouched(query));
      }
    });
  }
}

for (const field of ["isComposing", "nativeIsComposing"] as const) {
  for (const key of ["Enter", "Escape"]) {
    test(`source callback: ${field} keeps ${key} out of model commands without a 229 code`, () => {
      assert.deepEqual(dispatch({ key, [field]: true }), untouched());
    });
  }
}

test("source callback: ordinary Enter still selects the result and clears its query", () => {
  assert.deepEqual(dispatch({ key: "Enter", keyCode: 13, which: 13, nativeKeyCode: 13, nativeWhich: 13 }), {
    ...untouched(""), stopped: true, prevented: true, changes: ["opus"], focus: ["search"],
  });
});

test("source callback: ordinary Escape still clears a query or closes an empty menu", () => {
  assert.deepEqual(dispatch({ key: "Escape", keyCode: 27 }), {
    ...untouched(""), stopped: true, prevented: true,
  });
  assert.deepEqual(dispatch({ key: "Escape", query: "", keyCode: 27 }), {
    ...untouched(""), stopped: true, prevented: true, open: false,
  });
});

test("source callback: already-prevented commands remain untouched", () => {
  for (const key of ["Enter", "Escape"]) {
    assert.deepEqual(dispatch({ key, defaultPrevented: true }), untouched("opus", true));
  }
});

test("source callback: adjacent key codes do not suppress ordinary model commands", () => {
  for (const code of [228, 230]) {
    assert.deepEqual(dispatch({ key: "Enter", keyCode: code, which: code, nativeKeyCode: code, nativeWhich: code }), {
      ...untouched(""), stopped: true, prevented: true, changes: ["opus"], focus: ["search"],
    });
  }
});

test("source callback: composing navigation and editing keys do not move result focus", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Tab", "a"]) {
    assert.deepEqual(dispatch({ key, nativeKeyCode: 229 }), untouched());
  }
});

test("source callback: ordinary vertical navigation still focuses the next result", () => {
  assert.deepEqual(dispatch({ key: "ArrowDown", nativeKeyCode: 40 }), {
    ...untouched(), stopped: true, prevented: true, focus: ['[data-model-result="1"]'],
  });
});
