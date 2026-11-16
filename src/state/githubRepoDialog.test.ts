import { test } from "node:test";
import assert from "node:assert/strict";
import { canSubmit, ownersErrorMessage, repoSlug, statusLine, submitLabel } from "./githubRepoDialog.ts";

test("repo slug: lowercase, dashes for other characters, collapsed and trimmed, max 100", () => {
  assert.equal(repoSlug("My Project"), "my-project");
  assert.equal(repoSlug("  __Notes  (v2)!! "), "notes-v2");
  assert.equal(repoSlug("a--b___c"), "a-b-c");
  assert.equal(repoSlug("日本"), "");
  assert.equal(repoSlug("x".repeat(120)).length, 100);
});

test("status line follows loading, blank or invalid name, then the check for this exact slug", () => {
  const s = (ownersLoading: boolean, name: string, availability: Parameters<typeof statusLine>[0]["availability"]) =>
    statusLine({ ownersLoading, name, slug: repoSlug(name), availability })?.text ?? null;
  assert.equal(s(true, "", { kind: "idle" }), "Loading GitHub owners...");
  assert.equal(s(false, "", { kind: "idle" }), null);
  assert.equal(s(false, " !-- ", { kind: "idle" }), "Repository name must include letters or numbers.");
  assert.equal(s(false, "notes", { kind: "checking" }), "Checking repository availability...");
  assert.equal(s(false, "notes", { kind: "available", slug: "notes" }), "Repository name is available.");
  assert.equal(s(false, "notes", { kind: "taken", slug: "notes" }), "This repository already exists.");
  assert.equal(s(false, "notes", { kind: "error", slug: "notes" }), "Couldn't check repository availability.");
  // A result for an older name while the user keeps typing still reads as checking.
  assert.equal(s(false, "notes-2", { kind: "available", slug: "notes" }), "Checking repository availability...");
});

test("submit needs owners loaded, an owner, and the current slug confirmed available", () => {
  const free = { kind: "available", slug: "notes" } as const;
  assert.equal(canSubmit("me", "notes", true, free, false), true);
  assert.equal(canSubmit("", "notes", true, free, false), false);
  assert.equal(canSubmit("me", "notes", false, free, false), false);
  assert.equal(canSubmit("me", "notes-2", true, free, false), false);
  assert.equal(canSubmit("me", "notes", true, { kind: "taken", slug: "notes" }, false), false);
  assert.equal(canSubmit("me", "notes", true, free, true), false);
});

test("submit label depends on git init and pending", () => {
  assert.equal(submitLabel(true, false), "Initialize Git and create repo");
  assert.equal(submitLabel(false, false), "Create repo and add project");
  assert.equal(submitLabel(false, true), "Creating...");
});

test("owner load errors are classified as SAML, scope, auth, or generic", () => {
  assert.match(ownersErrorMessage("Resource protected by organization SAML enforcement"), /SAML/);
  assert.match(ownersErrorMessage("missing required scope 'read:user'"), /scope/);
  assert.match(ownersErrorMessage("To get started with GitHub CLI, please run:  gh auth login"), /not signed in/);
  assert.equal(ownersErrorMessage("timeout"), "Couldn't load your GitHub accounts.");
});
