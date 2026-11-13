import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

function changeQuery({ previous, next, height, measured = 248.5 }: {
  previous: string;
  next: string;
  height?: number;
  measured?: number;
}) {
  const handler = source.match(/const changeQuery = \(next: string\) => \{([\s\S]*?)\n  \};/);
  assert.ok(handler, "the input shares a query-change callback that owns the measured height");
  const state = { query: previous, height, index: 3, measurements: 0 };
  const events: string[] = [];
  const menuInner = { current: { getBoundingClientRect: () => {
    state.measurements++;
    events.push("measure");
    return { height: measured };
  } } };
  new Function("next", "query", "menuInner", "setSearchHeight", "setQuery", "setSearchIndex", handler[1])(
    next,
    previous,
    menuInner,
    (value: number | undefined) => { state.height = value; },
    (value: string) => { state.query = value; events.push("query"); },
    (value: number) => { state.index = value; },
  );
  return { ...state, events };
}

test("source-only: starting model search captures the default menu height before filtering", () => {
  for (const previous of ["", " ", "\t\n"]) {
    const state = changeQuery({ previous, next: "opus" });
    assert.equal(state.height, 248.5);
    assert.equal(state.measurements, 1);
    assert.equal(state.query, "opus");
    assert.equal(state.index, 0);
    assert.deepEqual(state.events, ["measure", "query"]);
  }
});

test("source-only: refining a search keeps the original height even with no matching rows", () => {
  for (const next of ["opus claude", "no matching model"]) {
    const state = changeQuery({ previous: "opus", next, height: 248.5, measured: 32 });
    assert.equal(state.height, 248.5);
    assert.equal(state.measurements, 0);
    assert.equal(state.query, next);
    assert.equal(state.index, 0);
  }
});

test("source-only: clearing search releases its height and the next search measures afresh", () => {
  for (const next of ["", " ", "\t\n"]) {
    const cleared = changeQuery({ previous: "opus", next, height: 248.5 });
    assert.equal(cleared.height, undefined);
    assert.equal(cleared.measurements, 0);
    assert.equal(cleared.query, next);
    const restarted = changeQuery({ previous: cleared.query, next: "sonnet", height: cleared.height, measured: 312.25 });
    assert.equal(restarted.height, 312.25);
    assert.equal(restarted.measurements, 1);
  }
});

test("source-only: the measured model-menu wrapper applies height only while searching", () => {
  assert.match(source, /const \[searchHeight, setSearchHeight\] = useState<number>\(\);/);
  assert.match(source, /const menuInner = useRef<HTMLDivElement>\(null\);/);
  const wrapper = source.match(/<div className="oc-model-menu-inner" ref=\{menuInner\} style=\{(.+)\}>/);
  assert.ok(wrapper, "the measured inner wrapper also consumes the search height");
  const style = new Function("searching", "searchHeight", `return ${wrapper[1]};`);
  assert.deepEqual(style(true, 248.5), { height: 248.5 });
  assert.equal(style(false, 248.5), undefined);
  assert.match(source, /<div className="oc-model-list">/);
});

test("source-only: search input uses the height-aware query transition", () => {
  assert.match(source, /aria-label="Search models"[^\n]*onChange=\{\(e\) => changeQuery\(e\.target\.value\)\}/);
});

test("source-only: selecting a model by Enter or click clears query and height together", () => {
  const enter = source.slice(source.indexOf('if (inSearch && e.key === "Enter")'), source.indexOf('if (e.key === "Escape")'));
  assert.match(enter, /if \(!same\(match, value\)\) onChange\(match\);\s*changeQuery\(""\);\s*search\.current\?\.focus\(\)/);
  assert.match(source, /if \(!selected\) onChange\(f\);\s*if \(searching\) changeQuery\(""\);\s*else setOpen\(false\)/);
});

test("source-only: Escape and menu close release the height without changing their close behavior", () => {
  assert.match(source, /else if \(e\.target === search\.current && query !== ""\) changeQuery\(""\);\s*else setOpen\(false\)/);
  assert.match(source, /if \(!open\) \{\s*setQuery\(""\);\s*setSearchHeight\(undefined\);\s*setSearchIndex\(0\);\s*setEffortOpen\(false\);/);
});
