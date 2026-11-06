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

// ---- The rest of Conductor's row kinds (REA: renderApp-D_fmY7hW.js D1o/P1o, Tpo ... Kpo) ----
import {
  askUserState,
  backgroundStatus,
  collabCall,
  isTypedSubagent,
  lastTwoSegments,
  parseTask,
  parseTaskList,
  scheduleWakeupLabel,
  sendMessageLabel,
  skillLabel,
  slashCommandLabel,
  subagentDescription,
  taskUpdateLabel,
  terminalOutput,
  toolKind,
} from "./conductorTools.ts";

test("every kind in Conductor's registry resolves by name or prefix (D1o, P1o)", () => {
  const cases: Record<string, string> = {
    AskUserQuestion: "ask-user-question",
    mcp__conductor__AskUserQuestion: "ask-user-question",
    EnterPlanMode: "enter-plan-mode",
    ExitPlanMode: "exit-plan-mode",
    Skill: "skill",
    SlashCommand: "slash-command",
    Thinking: "thinking",
    TaskCreate: "task-create",
    TaskGet: "task-get",
    TaskList: "task-list",
    TaskUpdate: "task-update",
    Teammate: "teammate",
    SendMessage: "send-message",
    ScheduleWakeup: "schedule-wakeup",
    ImageGeneration: "image-generation",
    mcp__conductor__DiffComment: "diff-comment",
    mcp__conductor__GetDiffComments: "get-diff-comments",
    mcp__conductor__GetTerminalOutput: "get-terminal-output",
    mcp__conductor__GetWorkspaceDiff: "get-workspace-diff",
    mcp__conductor__RunLocalCommand: "run-local-command",
    mcp__node_repl__js: "node-repl-js",
    collab__spawn_agent: "codex-collab",
    mcp__context7__get_library_docs: "context7-mcp",
    mcp__linear__get_issue: "linear-mcp",
    mcp__github__get_pr: "other",
  };
  for (const [name, kind] of Object.entries(cases)) assert.equal(toolKind(name), kind, name);
});

test("Skill and SlashCommand labels (_po, Cpo)", () => {
  assert.equal(skillLabel("pstack:poteto-mode"), "Poteto Mode");
  assert.equal(slashCommandLabel("/review:pr-comments"), "Pr Comments");
  assert.equal(slashCommandLabel(""), "Slash Command");
});

test("a sub-agent row needs a type other than general-purpose (bpo vs Ypo)", () => {
  assert.equal(isTypedSubagent({ subagent_type: "Explore" }), true);
  assert.equal(isTypedSubagent({ subagent_type: "general-purpose" }), false);
  assert.equal(isTypedSubagent({ description: "x" }), false);
  assert.equal(subagentDescription("Find the bug (opus)", "opus"), "Find the bug");
});

test("AskUserQuestion results (Tpo)", () => {
  assert.deepEqual(askUserState(2, "User responses:\n1. Yes\n2. Blue", false), { state: "answered", answers: ["Yes", "Blue"] });
  assert.deepEqual(askUserState(1, "User cancelled the question", false), { state: "cancelled" });
  assert.deepEqual(askUserState(1, "boom", false), { state: "failed", text: "boom" });
  assert.deepEqual(askUserState(1, undefined, false), { state: "waiting" });
});

test("task results parse from JSON and from Claude Code's text (epo, jki)", () => {
  assert.deepEqual(parseTaskList("#1 [completed] Write tests\n#2 [pending] Ship [blocked by #1]"), [
    { id: "1", status: "completed", subject: "Write tests" },
    { id: "2", status: "pending", subject: "Ship" },
  ]);
  assert.deepEqual(parseTaskList('{"tasks":[{"id":"3","status":"in_progress"}]}'), [{ id: "3", status: "in_progress" }]);
  assert.deepEqual(parseTask("Task #4 [pending]: Do it\nDescription: more\nOwner: me"), { id: "4", status: "pending", subject: "Do it", description: "more", owner: "me" });
  assert.deepEqual(taskUpdateLabel({ status: "completed" }), { label: "Task completed" });
  assert.deepEqual(taskUpdateLabel({ addBlockedBy: ["1", "2"] }), { label: "Task dependency added", note: "Blocked by tasks #1, #2" });
});

test("terminal output, background status and file names (Dpo, R0o, xZe)", () => {
  assert.deepEqual(terminalOutput({ source: "run", maxLines: 50 }, '[{"type":"text","text":"a"},{"type":"text","text":"b"}]'), { text: "a\nb", note: "Source: run \u00b7 50 lines" });
  assert.equal(backgroundStatus("<status>running</status>"), "running");
  assert.equal(lastTwoSegments("src/a/b.ts"), "a/b.ts");
});

test("swarm messages and wake-ups (qpo, Spo)", () => {
  assert.deepEqual(sendMessageLabel({ recipient: "ana", summary: "hi" }), { label: "Send message to swarm", summary: "@ana \u2014 hi" });
  assert.equal(sendMessageLabel({ type: "plan_approval_response", approve: true }).label, "Approved plan");
  const at = (ms: number) => String(ms);
  assert.equal(scheduleWakeupLabel({ delaySeconds: 120 }, undefined, undefined, 0, at), "Scheduling wake-up");
  assert.equal(scheduleWakeupLabel({ delaySeconds: 120 }, "ok (in 90s)", 1000, 2000, at), "Waiting until 91000");
  assert.equal(scheduleWakeupLabel({ delaySeconds: 10 }, "ok", 0, 100_000, at), "Waited until 60000");
  assert.equal(scheduleWakeupLabel({ stop: true }, "ok", 0, 0, at), "Stopped scheduled wake-ups");
});

test("Codex collaboration calls (_0o)", () => {
  const spawning = collabCall("collab__spawnAgent", { receiver_thread_ids: ["019a-77b2-ffff"], agent_nickname: "scout", agent_role: "explorer", prompt: "look  around", model: "gpt-5" }, undefined, false);
  assert.equal(spawning.status, "inProgress");
  assert.equal(spawning.action, "Spawning");
  assert.equal(spawning.agents[0]!.name, "scout");
  assert.equal(spawning.agents[0]!.role, "Explorer");
  assert.equal(spawning.prompt, "look around");
  const waited = collabCall("collab__wait", { receiver_thread_ids: ["019a-77b2-ffff", "019b-1"] }, '{"status":"completed","agentsStates":{"019b-1":{"status":"errored","message":"bad"}}}', false);
  assert.equal(waited.action, "Finished waiting for");
  assert.equal(waited.countLabel, "2 agents");
  assert.equal(waited.agents[0]!.name, "019a-77b2");
  assert.equal(waited.agents[1]!.state, "Error - bad");
  assert.equal(waited.listAgents, true);
});
