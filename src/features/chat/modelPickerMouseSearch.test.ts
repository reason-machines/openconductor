import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_REGRESSION_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");
const resultsStart = source.indexOf("{items.map((f, index) => {");
const resultsEnd = source.indexOf("{!searching ? children : null}", resultsStart);
assert.ok(resultsStart >= 0 && resultsEnd > resultsStart, "model result rows are present");
const resultRows = source.slice(resultsStart, resultsEnd);
const click = resultRows.match(/onClick=\{\(\) => \{([\s\S]*?)\n\s*\}\}/);
assert.ok(click, "model result rows expose their click callback");
const queryChange = source.match(/const changeQuery = \(next: string\) => \{([\s\S]*?)\n  \};/);
const transition = queryChange ? new Function("next", "query", "menuInner", "setSearchHeight", "setQuery", "setSearchIndex", queryChange[1]) : undefined;
const activate = new Function("selected", "f", "onChange", "searching", "setQuery", "setOpen", "changeQuery", click[1]);

for (const selected of [false, true]) {
  for (const query of ["sonnet", " sonnet ", "", " \t"]) {
    test(`source-only: clicking ${selected ? "the current" : "another"} model with query ${JSON.stringify(query)}`, () => {
      const choice = { model: "sonnet-5", effort: "high" };
      const changes: typeof choice[] = [];
      const state = { query, open: true };
      const searching = query.trim() !== "";
      const searchState: { height: number | undefined; index: number } = { height: searching ? 248.5 : undefined, index: 3 };
      activate(
        selected,
        choice,
        (next: typeof choice) => changes.push(next),
        searching,
        (next: string) => { state.query = next; },
        (next: boolean) => { state.open = next; },
        (next: string) => {
          assert.ok(transition, "the click callback's query transition is present");
          transition(
            next,
            query,
            { current: null },
            (height: number | undefined) => { searchState.height = height; },
            (value: string) => { state.query = value; },
            (index: number) => { searchState.index = index; },
          );
        },
      );
      assert.deepEqual(state, searching ? { query: "", open: true } : { query, open: false });
      assert.deepEqual(changes, selected ? [] : [choice]);
      if (transition) assert.deepEqual(searchState, { height: undefined, index: searching ? 0 : 3 });
    });
  }
}
