import { test } from "node:test";
import assert from "node:assert/strict";
import { branchDisplay, branchOptions } from "./targetBranch.ts";

test("branchOptions lists each branch once", () => {
  assert.deepEqual(branchOptions(["main", "dev", "main"], "main", ""), ["main", "dev"]);
});

test("branchOptions keeps the chosen branch when the list lacks it", () => {
  assert.deepEqual(branchOptions(["dev"], "main", ""), ["main", "dev"]);
});

test("branchOptions filters case-insensitively on a trimmed query", () => {
  assert.deepEqual(branchOptions(["main", "feature/Login", "dev"], "main", "  login "), ["feature/Login"]);
});

test("branchOptions returns nothing when no branch matches", () => {
  assert.deepEqual(branchOptions(["main"], "main", "zzz"), []);
});

test("branchDisplay prefixes the remote like Conductor's origin/main", () => {
  assert.equal(branchDisplay("main", [{ name: "main", remote: "origin" }]), "origin/main");
  assert.equal(branchDisplay("dev", [{ name: "main", remote: "upstream" }, { name: "dev", remote: null }]), "upstream/dev");
});

test("branchDisplay shows the bare branch without a remote", () => {
  assert.equal(branchDisplay("main", [{ name: "main", remote: null }]), "main");
  assert.equal(branchDisplay("main", []), "main");
});
