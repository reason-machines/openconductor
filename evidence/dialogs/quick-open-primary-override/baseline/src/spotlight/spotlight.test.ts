// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_WORKSPACE_RESULTS, rankWorkspaces, tokenScore, type WorkspaceCandidate } from "./rank.ts";
import { MAX_RECENT_FILES, addRecentFile, getRecentFiles, parseRecentFiles, type RecentFile } from "./recentFiles.ts";
import { buildRows, emptyMessage, highlight, moveSelection, quickOpenKey, splitPath, type FileMatch } from "./quickOpen.ts";

const ws = (name: string, lastActiveAt = 0, extra: Partial<WorkspaceCandidate> = {}): WorkspaceCandidate => ({
  id: name,
  name,
  branch: `sven/${name}`,
  repoName: "openconductor",
  lastActiveAt,
  ...extra,
});
const names = (r: { item: WorkspaceCandidate }[]) => r.map((x) => x.item.name);

test("tokenScore prefers exact, then prefix, word start, substring, subsequence", () => {
  const s = (f: string) => tokenScore("tok", f);
  assert.ok(s("tok") > s("tokyo") && s("tokyo") > s("new-tokyo") && s("new-tokyo") > s("atokyo"));
  assert.ok(s("atokyo") > s("t-o-k") && s("t-o-k") > 0);
  assert.equal(s("osaka"), 0);
});

test("empty query lists workspaces by recency, archived last", () => {
  const got = rankWorkspaces("", [ws("old", 1), ws("new", 3), ws("gone", 9, { archived: true }), ws("mid", 2)]);
  assert.deepEqual(names(got), ["new", "mid", "old", "gone"]);
});

test("every token must match name, branch or repo", () => {
  const items = [ws("tokyo"), ws("osaka"), ws("kyoto", 0, { repoName: "website" })];
  assert.deepEqual(names(rankWorkspaces("tok", items)), ["tokyo"]);
  assert.deepEqual(names(rankWorkspaces("web ky", items)), ["kyoto"]);
  assert.deepEqual(names(rankWorkspaces("tok zzz", items)), []);
});

test("name match beats branch-only match; ties go to recency", () => {
  const items = [ws("paris", 5, { branch: "fix/login" }), ws("login", 1), ws("login-v2", 9)];
  assert.deepEqual(names(rankWorkspaces("login", items)), ["login", "login-v2", "paris"]);
  const tie = [ws("a-fix", 1), ws("b-fix", 2)];
  assert.deepEqual(names(rankWorkspaces("fix", tie)), ["b-fix", "a-fix"]);
});

test("workspace results are capped", () => {
  const many = Array.from({ length: 80 }, (_, i) => ws(`w${i}`, i));
  assert.equal(rankWorkspaces("w", many).length, MAX_WORKSPACE_RESULTS);
});

test("recent files: newest first, deduplicated per repo and path, capped", () => {
  let list: RecentFile[] = [];
  list = addRecentFile(list, { repositoryId: "r", path: "a.ts", timestamp: 1 });
  list = addRecentFile(list, { repositoryId: "r", path: "b.ts", timestamp: 2 });
  list = addRecentFile(list, { repositoryId: "x", path: "a.ts", timestamp: 3 });
  list = addRecentFile(list, { repositoryId: "r", path: "a.ts", timestamp: 4 });
  assert.deepEqual(
    getRecentFiles(list, "r").map((r) => r.path),
    ["a.ts", "b.ts"],
  );
  assert.equal(list.length, 3);
  for (let i = 0; i < MAX_RECENT_FILES + 10; i++) list = addRecentFile(list, { repositoryId: "r", path: `f${i}`, timestamp: i });
  assert.equal(list.length, MAX_RECENT_FILES);
  assert.equal(getRecentFiles(list, "r").length, 5);
});

test("parseRecentFiles tolerates bad storage", () => {
  assert.deepEqual(parseRecentFiles(null), []);
  assert.deepEqual(parseRecentFiles("{oops"), []);
  assert.deepEqual(parseRecentFiles('{"a":1}'), []);
  const raw = JSON.stringify([{ repositoryId: "r", path: "a", timestamp: 1 }, { path: 2 }, { repositoryId: "r", path: "b", timestamp: 5 }]);
  assert.deepEqual(parseRecentFiles(raw).map((r) => r.path), ["b", "a"]);
});

const match = (rel: string, idx: number[] = []): FileMatch => ({
  file: { name: rel.split("/").pop()!, path: `/ws/${rel}`, is_directory: false },
  score: 1,
  match_indices: idx,
  relative_path: rel,
});

test("rows: recents first for an empty query, without duplicates; query shows matches only", () => {
  const recents: RecentFile[] = [{ repositoryId: "r", path: "src/b.ts", timestamp: 2 }];
  const results = [match("README.md"), match("src/b.ts")];
  assert.deepEqual(
    buildRows("", results, recents).map((r) => [r.relativePath, r.recent]),
    [["src/b.ts", true], ["README.md", false]],
  );
  assert.deepEqual(buildRows("rea", [match("README.md", [0, 1, 2])], recents), [
    { relativePath: "README.md", indices: [0, 1, 2], recent: false },
  ]);
});

test("empty states depend on loading and query", () => {
  assert.equal(emptyMessage("", true, 0), "Loading files...");
  assert.equal(emptyMessage("x", true, 0), "Searching files...");
  assert.equal(emptyMessage("x", false, 0), "No files found");
  assert.equal(emptyMessage(" ", false, 0), "No files available");
  assert.equal(emptyMessage("x", true, 3), null);
});

test("highlight groups matched runs; splitPath separates dir and name", () => {
  assert.deepEqual(highlight("main.rs", [0, 1, 5]), [
    { text: "ma", match: true },
    { text: "in.", match: false },
    { text: "r", match: true },
    { text: "s", match: false },
  ]);
  assert.deepEqual(highlight("", [0]), []);
  assert.deepEqual(splitPath("src/a/b.ts"), { dir: "src/a/", name: "b.ts" });
  assert.deepEqual(splitPath("b.ts"), { dir: "", name: "b.ts" });
});

test("selection wraps at both ends", () => {
  assert.equal(moveSelection(2, 1, 3), 0);
  assert.equal(moveSelection(0, -1, 3), 2);
  assert.equal(moveSelection(1, 1, 3), 2);
  assert.equal(moveSelection(0, 1, 0), 0);
});

test("keyboard flow", () => {
  const k = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) =>
    quickOpenKey({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  assert.deepEqual(k("ArrowDown"), { kind: "move", delta: 1 });
  assert.deepEqual(k("ArrowUp"), { kind: "move", delta: -1 });
  assert.deepEqual(k("n", { ctrlKey: true }), { kind: "move", delta: 1 });
  assert.deepEqual(k("p", { ctrlKey: true }), { kind: "move", delta: -1 });
  assert.deepEqual(k("Enter"), { kind: "open", mode: "file" });
  assert.deepEqual(k("Enter", { metaKey: true }), { kind: "open", mode: "diff" });
  assert.deepEqual(k("Escape"), { kind: "close" });
  assert.deepEqual(k("End"), { kind: "edge", to: "last" });
  assert.equal(k("a"), null);
  assert.equal(k("p", { metaKey: true }), null);
});
