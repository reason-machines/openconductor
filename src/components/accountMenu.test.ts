import { test } from "node:test";
import assert from "node:assert/strict";
import { accountMenuModel, computerLabel, personIcon } from "./accountMenu.ts";

test("the personal organization reads as the person's Mac, or My Mac without a name", () => {
  assert.equal(computerLabel("Ada Lovelace"), "Ada Lovelace's Mac");
  assert.equal(computerLabel(""), "My Mac");
});

test("the avatar falls back to the upper-cased initial, and to no initial without a name", () => {
  assert.deepEqual(personIcon("ada"), { fallbackInitial: "A", imageUrl: undefined, imageAlt: "ada" });
  assert.deepEqual(personIcon(""), { fallbackInitial: undefined, imageUrl: undefined, imageAlt: "" });
  assert.equal(personIcon("Ada", "https://example.invalid/a.png").imageUrl, "https://example.invalid/a.png");
});

test("the menu heads with the email, then Settings; no organization rows for one organization", () => {
  const m = accountMenuModel({ name: "Ada Lovelace", email: "ada@example.com" });
  assert.equal(m.triggerLabel, "Ada Lovelace's Mac");
  assert.deepEqual(m.entries, [
    { kind: "email", email: "ada@example.com" },
    { kind: "separator" },
    { kind: "item", id: "settings", label: "Settings" },
  ]);
});

test("without an email the menu is Settings alone, and never Log out", () => {
  assert.deepEqual(accountMenuModel({ name: "", email: null }).entries, [{ kind: "item", id: "settings", label: "Settings" }]);
  const labels = accountMenuModel({ name: "Ada", email: "a@b.c" }).entries.map((e) => (e.kind === "item" ? e.label : e.kind));
  assert.ok(!labels.includes("Log out"));
});
