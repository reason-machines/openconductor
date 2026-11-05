import { test } from "node:test";
import assert from "node:assert/strict";
import type { CreateFrom } from "./createFlow.ts";
import { branchToFrom, dedupeBranches, fromLabel, matches, nextTab, parseRef, statusLine } from "./createFrom.ts";

const pr: CreateFrom = { kind: "pr", number: 128, title: "Fix login redirect", headBranch: "fix/login", baseBranch: "main" };
const gh: CreateFrom = { kind: "issue", provider: "github", key: "#42", title: "Crash on start", body: "Stack overflow in parser" };
const lin: CreateFrom = { kind: "issue", provider: "linear", key: "ENG-7", title: "Dark mode" };

test("Tab and Shift+Tab cycle the three tabs", () => {
  assert.equal(nextTab("pr"), "branch");
  assert.equal(nextTab("issue"), "pr");
  assert.equal(nextTab("pr", true), "issue");
});

test("search matches numbers, titles, branches, keys and bodies", () => {
  assert.ok(matches(pr, "#12") && matches(pr, "128") && !matches(pr, "#9"));
  assert.ok(matches(pr, "LOGIN") && matches(pr, "fix/"));
  assert.ok(matches(gh, "42") && matches(gh, "parser") && !matches(gh, "dark"));
  assert.ok(matches(lin, "eng-7") && matches(lin, "dark"));
  assert.ok(matches({ kind: "branch", name: "feature/x" }, "feat") && matches(pr, "  "));
});

test("remote branches map to their local name and duplicates collapse", () => {
  assert.deepEqual(branchToFrom({ name: "origin/feat", remote: "origin" }), { kind: "branch", name: "feat" });
  const list = dedupeBranches([
    { name: "main", remote: null },
    { name: "origin/main", remote: "origin" },
    { name: "origin/feat", remote: "origin" },
  ]);
  assert.deepEqual(list.map((b) => b.name), ["main", "origin/feat"]);
});

test("pasted GitHub and Linear references are recognised", () => {
  assert.deepEqual(parseRef("https://github.com/a/b/pull/77/files"), { kind: "pr", number: 77 });
  assert.deepEqual(parseRef("https://github.com/a/b/issues/5"), { kind: "issue", provider: "github", number: 5 });
  assert.deepEqual(parseRef("eng-12"), { kind: "issue", provider: "linear", key: "ENG-12" });
  assert.deepEqual(parseRef("https://linear.app/acme/issue/OPS-3/title"), { kind: "issue", provider: "linear", key: "OPS-3" });
  assert.equal(parseRef("fix login"), null);
});

test("status line covers loading, searching, empty, error and setup states", () => {
  assert.equal(statusLine("pr", { status: "loading" }, 0, ""), "Loading pull requests...");
  assert.equal(statusLine("pr", { status: "loading" }, 0, "x"), "Searching pull requests...");
  assert.equal(statusLine("pr", { status: "ready", items: [] }, 0, ""), "No pull requests found");
  assert.equal(statusLine("pr", { status: "ready", items: [pr] }, 1, ""), null);
  assert.equal(statusLine("branch", { status: "error", message: "boom" }, 0, ""), "Couldn't load branches.");
  assert.equal(statusLine("pr", { status: "unavailable", reason: "no_remote" }, 0, ""), "Add a GitHub repository remote to include pull requests");
  assert.equal(statusLine("issue", { status: "unavailable", reason: "no_github" }, 0, ""), "Set up GitHub in settings to include GitHub issues");
  assert.equal(statusLine("issue", { status: "unavailable", reason: "no_linear" }, 0, ""), "Linear integration required");
});

test("labels name the chosen item", () => {
  assert.equal(fromLabel(pr), "PR #128 Fix login redirect");
  assert.equal(fromLabel(lin), "ENG-7 Dark mode");
});
