// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { conductorTools, editCounts, genericSummary, grepMatches, lineCounts, mcpLabel, readContent, readLabel, splitPatch, unwrapShell } from "./conductorTools.ts";
import { lisbonBlocks, type FixtureAgent } from "../../../tools/chat/lisbon.ts";

const calls = (agent: FixtureAgent) =>
  lisbonBlocks(agent)
    .filter((b) => b.type === "tool_use")
    .flatMap((b) => (b.type === "tool_use" ? conductorTools(b.name, b.input) : []));

test("Claude Code, Reason and Codex give Conductor the same tool calls for one turn", () => {
  const claude = calls("claude");
  assert.deepEqual(
    claude.map((c) => c.name),
    ["Grep", "Read", "Edit", "Bash"],
  );
  for (const agent of ["reason", "codex"] as const) {
    const other = calls(agent);
    assert.deepEqual(
      other.map((c) => c.name),
      claude.map((c) => c.name),
      agent,
    );
    // The fields each row reads are the same.
    assert.equal(other[0]!.input.pattern, "redirectTo", agent);
    assert.equal(other[1]!.input.file_path, claude[1]!.input.file_path, agent);
    assert.equal(other[2]!.input.file_path, claude[2]!.input.file_path, agent);
    assert.deepEqual(editCounts(other[2]!.input), { added: 1, removed: 1 }, agent);
    assert.equal(other[3]!.input.command, "pnpm test src/lib/auth.test.ts", agent);
  }
});

test("Codex: the shell wrapper is dropped and single command actions become Read/Grep/LS (Conductor's Kst)", () => {
  assert.equal(unwrapShell("/bin/zsh -lc 'ls -la'"), "ls -la");
  assert.equal(unwrapShell('/bin/bash -lc "echo hi"'), "echo hi");
  assert.equal(unwrapShell("/bin/zsh -lc ls"), "ls");
  assert.deepEqual(conductorTools("ls", { command: "/bin/zsh -lc 'ls src'", cwd: "/w", commandActions: [{ type: "listFiles", path: "src" }] }), [{ name: "LS", input: { path: "src" } }]);
  assert.deepEqual(conductorTools("x", { command: "/bin/zsh -lc 'a && b'", cwd: "/w", commandActions: [{ type: "unknown", command: "a" }, { type: "unknown", command: "b" }] }), [
    { name: "Bash", input: { command: "a && b" } },
  ]);
});

test("Codex: a file change gives one Write/Edit/rm per file (Conductor's Jst)", () => {
  const out = conductorTools("Edit", {
    changes: [
      { path: "/w/a.txt", kind: { type: "add" }, diff: "+one\n+two\n" },
      { path: "/w/b.txt", kind: "update", diff: "@@ -1 +1 @@\n-b\n+c\n" },
      { path: "/w/c.txt", kind: { type: "delete" }, diff: "" },
    ],
  });
  assert.deepEqual(out, [
    { name: "Write", input: { file_path: "/w/a.txt", content: "one\ntwo\n" } },
    { name: "Edit", input: { file_path: "/w/b.txt", old_string: "b\n", new_string: "c\n" } },
    { name: "Bash", input: { command: "rm /w/c.txt" } },
  ]);
  assert.deepEqual(splitPatch(" same\n-old\n+new"), { oldString: "same\nold", newString: "same\nnew" });
});

test("Codex: MCP tool calls are mcp__server__tool with their arguments", () => {
  assert.deepEqual(conductorTools("x", { server: "linear", tool: "get_issue", arguments: { id: "ENG-1" } }), [{ name: "mcp__linear__get_issue", input: { id: "ENG-1" } }]);
  assert.equal(mcpLabel("mcp__linear__get_issue"), "Get issue");
  assert.deepEqual(conductorTools("Search the web: tauri", { query: "tauri" }), [{ name: "WebSearch", input: { query: "tauri" } }]);
  assert.equal(mcpLabel("mcp__linear__linear-search_docs"), "Search docs");
});

test("Reason: a tool with no Claude Code counterpart keeps its title for Conductor's generic row", () => {
  assert.deepEqual(conductorTools("Fetch the logs", { kind: "other", paths: [], title: "Fetch the logs" }), [{ name: "Fetch the logs", input: {} }]);
  assert.deepEqual(conductorTools("x", { kind: "fetch", paths: [], title: "https://example.com" }), [{ name: "WebFetch", input: { url: "https://example.com" } }]);
  // A new file (no old text) is a Write.
  assert.deepEqual(conductorTools("write: a.txt", { kind: "edit", paths: [], title: "write: a.txt", diffs: [{ path: { raw: "/w/a.txt" }, oldText: null, newText: "hi" }] }), [
    { name: "Write", input: { file_path: "/w/a.txt", content: "hi" } },
  ]);
});

test("row text: Read lines, Grep matches, generic summary", () => {
  assert.equal(readContent("     1→export x\n     2→y\n"), "export x\ny");
  assert.equal(readLabel("a.ts", "     1→a\n     2→b\n     3→c\n     4→d"), "Read 4 lines");
  assert.equal(readLabel("a.ts", undefined), "Reading");
  assert.equal(readLabel("a.png", "x"), "Read image");
  assert.equal(grepMatches("a:1\nb:2\n"), 2);
  assert.equal(grepMatches("No matches found"), 0);
  assert.equal(genericSummary("mcp__x__y", { query: " q " }), "q");
  assert.equal(genericSummary("mcp__x__y", {}), undefined);
  assert.equal(genericSummary("mcp__x__y", { n: 1 }), '{"n":1}');
});

test("line counts follow a line diff", () => {
  assert.deepEqual(lineCounts("a\nb\nc", "a\nB\nc\nd"), { added: 2, removed: 1 });
  assert.deepEqual(lineCounts("", "x\ny\n"), { added: 2, removed: 0 });
});
