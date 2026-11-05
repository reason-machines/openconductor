import assert from "node:assert/strict";
import test from "node:test";
import fuzzysort from "fuzzysort";
import { groupRows, helpRows, highlightSegments, noResultsText, searchRows } from "./help.ts";
import { COMMANDS } from "./registry.ts";
import { CATEGORIES, logical } from "./types.ts";

test("lists the 104 commands that are neither hidden nor dialog-only", () => {
  const rows = helpRows();
  assert.equal(rows.length, 104);
  const hidden = COMMANDS.filter((c) => c.hidden).map((c) => c.id);
  const dialogOnly = COMMANDS.filter((c) => c.when?.enableOnDialogIds?.length).map((c) => c.id);
  assert.ok(hidden.length > 0 && dialogOnly.length > 0);
  for (const id of [...hidden, ...dialogOnly]) assert.ok(!rows.some((r) => r.id === id), id);
});

test("rows show effective shortcuts, overrides applied", () => {
  const help = helpRows().find((r) => r.id === "openKeyboardShortcuts");
  assert.equal(help?.title, "Shortcuts help");
  assert.equal(help?.shortcuts.length, 1);
  const custom = [logical("h", ["meta", "shift"]), logical("F1")];
  const overridden = helpRows({ openKeyboardShortcuts: custom }).find((r) => r.id === "openKeyboardShortcuts");
  assert.deepEqual(overridden?.shortcuts, custom);
});

test("groups follow category order and skip empty categories", () => {
  const groups = groupRows(helpRows());
  const order = groups.map((g) => g.category);
  assert.deepEqual(order, CATEGORIES.filter((c) => order.includes(c)));
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), 104);
  assert.deepEqual(groupRows(helpRows().filter((r) => r.category === "Terminal")).map((g) => g.category), ["Terminal"]);
});

test("a blank query means no search (the dialog shows groups)", () => {
  assert.equal(searchRows(helpRows(), ""), undefined);
  assert.equal(searchRows(helpRows(), "   "), undefined);
});

test("title matches rank first and carry highlight indexes", () => {
  const results = searchRows(helpRows(), "shortcuts help") ?? [];
  assert.equal(results[0]?.row.id, "openKeyboardShortcuts");
  assert.deepEqual(
    highlightSegments(results[0].row.title, results[0].titleIndexes ?? []).filter((s) => s.matched).map((s) => s.text).join(""),
    "Shortcuts help",
  );
});

test("a category match lists the row without a title highlight", () => {
  const results = searchRows(helpRows(), "Terminal") ?? [];
  const byCategory = results.filter((m) => m.row.category === "Terminal" && !/terminal/i.test(m.row.title));
  assert.ok(byCategory.length > 0);
  for (const m of byCategory) assert.equal(m.titleIndexes, undefined);
});

test("weak matches below the 0.5 threshold are dropped", () => {
  assert.deepEqual(searchRows(helpRows(), "qqqzzz"), []);
  const rows = helpRows();
  const query = "tgl";
  const listed = new Set((searchRows(rows, query) ?? []).map((m) => m.row.id));
  const best = (id: string) => {
    const row = rows.find((r) => r.id === id)!;
    return Math.max(...[row.title, row.category].map((t) => fuzzysort.single(query, t)?.score ?? -1));
  };
  const weak = rows.filter((r) => best(r.id) >= 0 && best(r.id) < 0.5);
  assert.ok(weak.length > 0, "some rows match fuzzily but below the threshold");
  for (const r of weak) assert.ok(!listed.has(r.id), r.id);
  for (const id of listed) assert.ok(best(id) >= 0.5, id);
});

test("no-results text quotes the query", () => {
  assert.equal(noResultsText("xyz"), 'No shortcuts found for "xyz"');
});

test("highlight segments alternate matched and unmatched runs", () => {
  assert.deepEqual(highlightSegments("Zoom in", [0, 1, 5]), [
    { text: "Zo", matched: true },
    { text: "om ", matched: false },
    { text: "i", matched: true },
    { text: "n", matched: false },
  ]);
  assert.deepEqual(highlightSegments("abc", []), [{ text: "abc", matched: false }]);
});
