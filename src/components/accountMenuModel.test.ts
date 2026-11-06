import { test } from "node:test";
import assert from "node:assert/strict";
import { accountMenuModel, computerLabel, personIcon } from "./accountMenuModel.ts";

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

test("with a Reason workspace, the menu lists Personal and the workspace; the trigger names the active one (Conductor's zna)", () => {
  const tide = { id: "org_1", name: "Tide Labs" };
  const personal = accountMenuModel({ name: "Ada", email: "a@b.c" }, [tide], null);
  assert.equal(personal.triggerLabel, "Ada's Mac");
  assert.equal(personal.triggerOrganization, false);
  assert.deepEqual(
    personal.entries.filter((e) => e.kind === "organization"),
    [
      { kind: "organization", organization: { id: null, label: "Ada's Mac", cloud: false, selected: true } },
      { kind: "organization", organization: { id: "org_1", label: "Tide Labs", cloud: true, selected: false } },
    ],
  );
  assert.deepEqual(personal.entries.map((e) => e.kind), ["email", "separator", "organization", "organization", "separator", "item"]);
  const org = accountMenuModel({ name: "Ada", email: null }, [tide], "org_1");
  assert.equal(org.triggerLabel, "Tide Labs");
  assert.equal(org.triggerOrganization, true);
  // A stored workspace Reason no longer lists is not active.
  assert.equal(accountMenuModel({ name: "Ada", email: null }, [tide], "gone").triggerLabel, "Ada's Mac");
});
