import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = process.env.MODEL_PICKER_SCROLL_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_SCROLL_REGRESSION_REF}:src/features/chat/ModelPicker.tsx`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

function viewport({ mounted = true, hasList = true }: { mounted?: boolean; hasList?: boolean } = {}) {
  const rows = { scrollTop: 0 };
  const outer = { scrollTop: 48 };
  const sibling = { scrollTop: 92 };
  const selectors: string[] = [];
  const root = { current: mounted ? {
    ...outer,
    querySelector: (selector: string) => {
      selectors.push(selector);
      return hasList && selector === ".oc-model-list" ? rows : null;
    },
  } : null };
  const effects = [...source.matchAll(/useLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[query\]\);/g)]
    .map((match) => new Function("root", match[1]));
  let previous: string | undefined;
  const commit = (query: string) => {
    if (query === previous) return;
    previous = query;
    for (const effect of effects) effect(root);
  };
  return { rows, root, sibling, selectors, commit };
}

test("source callback: starting model search returns a scrolled result viewport to the top", () => {
  const view = viewport();
  view.commit("");
  view.rows.scrollTop = 176;
  view.commit("opus");
  assert.equal(view.rows.scrollTop, 0, "new search must reveal the first result, not retain the old offset");
});

test("source callback: refining model search resets an independently scrolled result viewport", () => {
  const view = viewport();
  view.commit("opus");
  view.rows.scrollTop = 96;
  view.commit("opus claude");
  assert.equal(view.rows.scrollTop, 0, "refined search must reset the result viewport");
});

test("source callback: replacing the query also resets the result viewport", () => {
  const view = viewport();
  view.commit("opus");
  view.rows.scrollTop = 64;
  view.commit("no matching model");
  assert.equal(view.rows.scrollTop, 0, "query replacement must not preserve the old offset");
});

test("source callback: clearing model search resets the viewport for blank and whitespace queries", () => {
  for (const query of ["", " ", "\t\n"]) {
    const view = viewport();
    view.commit("opus");
    view.rows.scrollTop = 128;
    view.commit(query);
    assert.equal(view.rows.scrollTop, 0, "cleared search must restore the top of the default rows");
  }
});

test("source callback: rerendering an unchanged query preserves the user's scroll position", () => {
  const view = viewport();
  view.commit("opus");
  view.rows.scrollTop = 112;
  view.commit("opus");
  assert.equal(view.rows.scrollTop, 112);
});

test("source callback: query changes do not reset the outer menu or a sibling viewport", () => {
  const view = viewport();
  view.commit("opus");
  assert.equal(view.root.current?.scrollTop, 48);
  assert.equal(view.sibling.scrollTop, 92);
  assert.ok(view.selectors.every((selector) => selector === ".oc-model-list"));
});

test("source callback: query changes tolerate an unmounted picker or absent result viewport", () => {
  for (const options of [{ mounted: false }, { hasList: false }]) {
    const view = viewport(options);
    assert.doesNotThrow(() => { view.commit("opus"); view.commit(""); });
  }
});
