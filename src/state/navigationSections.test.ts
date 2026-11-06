import { test } from "node:test";
import assert from "node:assert/strict";
import { assignWorkspace, createSection, deleteSection, editSection, nextUpdatedAt, projectSections, reorderSection, sectionOf, type NavSection } from "./navigationSections.ts";

const s = (id: string, workspaceIds: string[] = [], extra: Partial<NavSection> = {}): NavSection => ({ id, name: id, workspaceIds, ...extra });
const ids = (list: NavSection[]) => list.map((x) => `${x.id}:${x.workspaceIds.join(",")}`);

test("create appends, or inserts before a section, and takes its members out of other sections", () => {
  const base = [s("a", ["w1"]), s("b", ["w2"])];
  assert.deepEqual(ids(createSection(base, s("c"))), ["a:w1", "b:w2", "c:"]);
  assert.deepEqual(ids(createSection(base, s("c", ["w2"]), "a")), ["c:w2", "a:w1", "b:"]);
  assert.deepEqual(ids(createSection(base, s("c"), "missing")), ["a:w1", "b:w2"]);
});

test("edit renames and sets the emoji, but an edit without an emoji keeps the stored one (Conductor's SY)", () => {
  const base = [s("a", ["w1"], { emoji: "🔥" })];
  assert.deepEqual(editSection(base, { id: "a", name: "Hot", emoji: "🚀" }), [s("a", ["w1"], { name: "Hot", emoji: "🚀" })]);
  assert.deepEqual(editSection(base, { id: "a", name: "Hot" }), [s("a", ["w1"], { name: "Hot", emoji: "🔥" })]);
});

test("delete drops the section; reorder moves it to an index of the list without it", () => {
  const base = [s("a"), s("b"), s("c")];
  assert.deepEqual(ids(deleteSection(base, "b")), ["a:", "c:"]);
  assert.deepEqual(ids(reorderSection(base, "a", 2)), ["b:", "c:", "a:"]);
  assert.deepEqual(ids(reorderSection(base, "c", 0)), ["c:", "a:", "b:"]);
});

test("assign moves a workspace to the end of one section; null takes it out", () => {
  const base = [s("a", ["w1", "w2"]), s("b", ["w3"])];
  assert.deepEqual(ids(assignWorkspace(base, "w1", "b")), ["a:w2", "b:w3,w1"]);
  assert.deepEqual(ids(assignWorkspace(base, "w1", null)), ["a:w2", "b:w3"]);
  assert.deepEqual(ids(assignWorkspace(base, "w1", "gone")), ["a:w1,w2", "b:w3"]);
  assert.equal(sectionOf(base, "w3")?.id, "b");
  assert.equal(sectionOf(base, "w9"), undefined);
});

test("the layout stamp always moves forward", () => {
  assert.equal(nextUpdatedAt(undefined, 100), 100);
  assert.equal(nextUpdatedAt(500, 100), 501);
  assert.equal(nextUpdatedAt(50, 100), 100);
});

test("projection: first section wins, unlisted rows are left out, newest activity first", () => {
  const sections = [s("a", ["w1", "w2", "w4"]), s("b", ["w2", "w3"])];
  const rows = [
    { id: "w1", updatedAt: 1, listed: true },
    { id: "w2", updatedAt: 5, listed: true },
    { id: "w3", updatedAt: 3, listed: true },
    { id: "w4", updatedAt: 9, listed: false },
    { id: "w5", updatedAt: 7, listed: true },
  ];
  const p = projectSections(sections, rows);
  assert.deepEqual(p.sections.map((g) => `${g.section.id}:${g.workspaces.map((w) => w.id).join(",")}`), ["a:w2,w1", "b:w3"]);
  assert.deepEqual([...p.sectioned].sort(), ["w1", "w2", "w3"]);
  assert.deepEqual(projectSections(undefined, rows).sections, []);
});
