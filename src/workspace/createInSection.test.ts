import { test } from "node:test";
import assert from "node:assert/strict";
import { CREATE_IN_SECTION, SECTION_ASSIGN_FAILED, canCreateIn, sectionChoice } from "./createInSection.ts";

const sections = [
  { id: "s1", name: "Backend", emoji: "🛠", workspaceIds: [] },
  { id: "s2", name: "Docs", workspaceIds: ["w1"] },
];

test("a preselected section labels Create with its name and hides the section menu", () => {
  assert.deepEqual(sectionChoice(sections, "s2"), { label: "Create in Docs", sectionId: "s2", menu: undefined });
});

test("with no section chosen, Create offers every section in a Create in section menu", () => {
  const c = sectionChoice(sections, undefined);
  assert.equal(c.label, "Create");
  assert.equal(c.sectionId, undefined);
  assert.deepEqual(c.menu?.map((s) => s.id), ["s1", "s2"]);
});

test("no sections: plain Create, no menu", () => {
  assert.deepEqual(sectionChoice([], undefined), { label: "Create", sectionId: undefined, menu: undefined });
});

test("a preselected section that was deleted falls back to plain Create with the menu", () => {
  const c = sectionChoice(sections, "gone");
  assert.equal(c.label, "Create");
  assert.equal(c.sectionId, undefined);
  assert.equal(c.menu?.length, 2);
});

test("a create aimed at a section that no longer exists is refused", () => {
  assert.equal(canCreateIn(sections, undefined), true);
  assert.equal(canCreateIn(sections, "s1"), true);
  assert.equal(canCreateIn(sections, "gone"), false);
});

test("Conductor's copy", () => {
  assert.equal(CREATE_IN_SECTION, "Create in section");
  assert.equal(SECTION_ASSIGN_FAILED, "Workspace created, but couldn't add it to the section. Move it from the sidebar.");
});
