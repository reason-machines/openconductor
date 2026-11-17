import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const path = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_REGRESSION_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

const from = source.indexOf("{efforts.options.map");
const to = source.indexOf("\n                    ))}", from);
assert.ok(from !== -1 && to > from, "ModelPicker contains the effort option map");
const handlers = [...source.slice(from, to).matchAll(/onClick=\{\(\) => \{([\s\S]*?)\n\s*\}\}/g)];
assert.equal(handlers.length, 1, "the effort option has one inline mouse handler");

// Executes the checked-in handler in isolation, not a rendered React menu.
const selectEffort = new Function("onChange", "setOpen", "setEffortOpen", "value", "o", handlers[0][1]);

for (const effort of ["high", "medium"]) {
  for (const fast of [true, false]) {
    test(`source-only: clicking effort ${effort} with fast=${fast} applies once and closes only the submenu`, () => {
      const value = Object.freeze({ model: "gpt-6-sol", effort: "medium", fast });
      const state = { open: true, effortOpen: true };
      const applied: unknown[] = [];

      selectEffort(
        (next: unknown) => applied.push(next),
        (open: boolean) => { state.open = open; },
        (open: boolean) => { state.effortOpen = open; },
        value,
        { value: effort },
      );

      assert.equal(applied.length, 1, "one click applies exactly once, including the current effort");
      assert.deepEqual(applied[0], { model: "gpt-6-sol", effort, fast }, "preserves model and fast fields");
      assert.equal(state.open, true, "the parent model picker stays open");
      assert.equal(state.effortOpen, false, "the effort submenu closes");
    });
  }
}
