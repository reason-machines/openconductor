import { test } from "node:test";
import assert from "node:assert/strict";
import { canRenameBranch, directoryNameError, directoryNameFor, planRename, renameDefault, renamedBranch } from "./workspaceRename.ts";

test("directory name: trimmed, lower-case, spaces to hyphens, other symbols dropped", () => {
  assert.equal(directoryNameFor("  Fix Login  Redirect! "), "fix-login-redirect");
  assert.equal(directoryNameFor("Café_2 (beta)"), "café_2-beta");
  // NFC: a decomposed é becomes the composed letter, not e + a dropped mark.
  assert.equal(directoryNameFor("Cafe\u0301"), "caf\u00e9");
  assert.equal(directoryNameFor("../etc"), "etc");
});

test("validation messages match Conductor's", () => {
  assert.equal(directoryNameError(""), "Invalid workspace name");
  assert.equal(directoryNameError("ok-name_1"), undefined);
});

test("plan: unchanged, invalid, and what workspace_name becomes", () => {
  const lisbon = { directoryName: "lisbon", workspaceName: null };
  assert.deepEqual(planRename(lisbon, "lisbon"), { kind: "unchanged" });
  assert.deepEqual(planRename(lisbon, "!!!"), { kind: "invalid", message: "Invalid workspace name" });
  // A name that is already a directory name is not stored as workspace_name.
  assert.deepEqual(planRename(lisbon, "porto"), { kind: "rename", newDirectoryName: "porto", workspaceName: null });
  assert.deepEqual(planRename(lisbon, "Login fix"), { kind: "rename", newDirectoryName: "login-fix", workspaceName: "Login fix" });
  // Same directory, different display text: still a rename.
  assert.deepEqual(planRename(lisbon, "Lisbon"), { kind: "rename", newDirectoryName: "lisbon", workspaceName: "Lisbon" });
  assert.deepEqual(planRename({ directoryName: "lisbon", workspaceName: "Lisbon" }, "Lisbon"), { kind: "unchanged" });
});

test("dialog default: stored name, else directory name", () => {
  assert.equal(renameDefault({ directoryName: "lisbon", workspaceName: null }), "lisbon");
  assert.equal(renameDefault({ directoryName: "lisbon", workspaceName: "Login fix" }), "Login fix");
});

test("Also rename branch keeps the prefix up to the last slash", () => {
  assert.equal(renamedBranch("ada/fix-login-redirect", "Login fix"), "ada/login-fix");
  assert.equal(renamedBranch("team/ada/x", "Y z"), "team/ada/y-z");
  assert.equal(renamedBranch("lisbon", "Porto"), "porto");
  assert.equal(canRenameBranch("ada/x"), true);
  assert.equal(canRenameBranch("(detached HEAD)"), false);
  assert.equal(canRenameBranch(""), false);
});
