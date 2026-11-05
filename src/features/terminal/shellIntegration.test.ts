// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendOutput, applySegments, emptyShellState, parseMark, splitMarks, tabLabel, type ShellState } from "./shellIntegration.ts";
import { emptyTabs, tabsReducer, type TabsAction } from "./tabs.ts";

const mark = (body: string, end = "\x07") => `\x1b]633;Conductor;${body}${end}`;
const at = () => "2026-11-05T00:00:00.000Z";

test("marks parse as the reference's three kinds; anything else is not a mark", () => {
  assert.deepEqual(parseMark("Prompt"), { type: "prompt" });
  assert.deepEqual(parseMark("ProgramStart;7;vim;vim notes.md"), { type: "program_start", markerId: "7", program: "vim", command: "vim notes.md" });
  // The command keeps its own semicolons; an empty command is dropped.
  assert.deepEqual(parseMark("ProgramStart;7;echo;echo a; echo b"), { type: "program_start", markerId: "7", program: "echo", command: "echo a; echo b" });
  assert.deepEqual(parseMark("ProgramStart;7;ls;"), { type: "program_start", markerId: "7", program: "ls", command: undefined });
  assert.deepEqual(parseMark("ProgramStart;7;ls"), { type: "program_start", markerId: "7", program: "ls", command: undefined });
  assert.deepEqual(parseMark("CommandDone;7"), { type: "command_done", markerId: "7" });
  for (const bad of ["CommandDone;", "ProgramStart;7", "ProgramStart;;ls", "ProgramStart;7;", "Prompt;x", "Other"]) {
    assert.equal(parseMark(bad), undefined, bad);
  }
});

test("marks are stripped from output, ended by BEL or ST, and kept in order", () => {
  const { sanitized, segments } = splitMarks(`a${mark("Prompt")}$ ${mark("ProgramStart;1;ls;ls -l", "\x1b\\")}out\r\n${mark("CommandDone;1")}`);
  assert.equal(sanitized, "a$ out\r\n");
  assert.deepEqual(segments, [
    { type: "data", data: "a" },
    { type: "event", event: { type: "prompt" } },
    { type: "data", data: "$ " },
    { type: "event", event: { type: "program_start", markerId: "1", program: "ls", command: "ls -l" } },
    { type: "data", data: "out\r\n" },
    { type: "event", event: { type: "command_done", markerId: "1" } },
  ]);
});

test("an unknown or unterminated mark passes through as text, as in the reference", () => {
  assert.equal(splitMarks(`x${mark("Nope", "\x1b\\")}y`).sanitized, `x${mark("Nope", "\x1b\\")}y`);
  assert.equal(splitMarks(`x${mark("Nope")}y`).sanitized, `x${mark("Nope")}y`);
  // Each chunk stands alone: a mark split across chunks is not reassembled.
  const half = "\x1b]633;Conductor;Pro";
  assert.deepEqual(splitMarks(`x${half}`), { sanitized: `x${half}`, segments: [{ type: "data", data: "x" }, { type: "data", data: half }] });
  // Other OSC sequences (cwd, titles) are untouched.
  assert.equal(splitMarks("\x1b]7;file://h/tmp\x07").sanitized, "\x1b]7;file://h/tmp\x07");
});

test("a command runs from ProgramStart to CommandDone; the prompt clears the program", () => {
  const s = emptyShellState();
  assert.equal(applySegments(s, splitMarks(`${mark("Prompt")}$ `).segments, at), false);
  assert.equal(s.hasObservedPromptMarker, true);
  assert.equal(applySegments(s, splitMarks(`${mark("ProgramStart;1;npm;npm test")}ok\n`).segments, at), true);
  assert.equal(s.runningProgram, "npm");
  assert.deepEqual(s.activeCommand, { command: "npm test", markerId: "1", output: "ok\n", outputByteLength: 3, program: "npm" });
  assert.equal(applySegments(s, splitMarks(`more\n${mark("CommandDone;1")}`).segments, at), true);
  assert.equal(s.completedCommandMarkerId, "1");
  assert.equal(s.activeCommand, undefined);
  assert.deepEqual(s.completedCommands, [{ command: "npm test", markerId: "1", output: "ok\nmore\n", program: "npm", completedAt: at() }]);
  // Still the program until the next prompt.
  assert.equal(s.runningProgram, "npm");
  assert.equal(applySegments(s, splitMarks(mark("Prompt")).segments, at), true);
  assert.equal(s.runningProgram, undefined);
  // A new program clears the completed marker; the command defaults to the program.
  applySegments(s, splitMarks(mark("ProgramStart;2;vim")).segments, at);
  assert.equal(s.completedCommandMarkerId, undefined);
  assert.equal((s as ShellState).activeCommand?.command, "vim"); // past assert.equal's narrowing
});

test("a prompt or a new program finishes the running command; a stray CommandDone does not", () => {
  const s = emptyShellState();
  applySegments(s, splitMarks(mark("ProgramStart;1;a")).segments, at);
  assert.equal(applySegments(s, splitMarks(mark("CommandDone;9")).segments, at), true); // marker changed
  assert.equal(s.activeCommand?.markerId, "1");
  applySegments(s, splitMarks(mark("ProgramStart;2;b")).segments, at);
  applySegments(s, splitMarks(mark("Prompt")).segments, at);
  assert.deepEqual(s.completedCommands.map((c) => c.markerId), ["2", "1"]);
});

test("only the last 5 commands and the last 1 MiB of output are kept", () => {
  const s = emptyShellState();
  for (let i = 1; i <= 7; i++) applySegments(s, splitMarks(`${mark(`ProgramStart;${i};p`)}${mark(`CommandDone;${i}`)}`).segments, at);
  assert.deepEqual(s.completedCommands.map((c) => c.markerId), ["7", "6", "5", "4", "3"]);
  // Trimmed at whole characters: "é" is 2 bytes, so 5 bytes keep "x" and two "é".
  assert.deepEqual(appendOutput("ééé", 6, "x", 5), { output: "ééx", outputByteLength: 5 });
  assert.deepEqual(appendOutput("ab", 2, "c", 3), { output: "abc", outputByteLength: 3 });
  const big = emptyShellState();
  applySegments(big, splitMarks(mark("ProgramStart;1;cat")).segments, at);
  applySegments(big, [{ type: "data", data: "a".repeat(1024 * 1024) }, { type: "data", data: "tail" }], at);
  assert.equal(big.activeCommand?.outputByteLength, 1024 * 1024);
  assert.ok(big.activeCommand?.output.endsWith("tail"));
});

test("the tab shows the running program after its title until the program ends or the shell restarts", () => {
  assert.equal(tabLabel("Terminal 2"), "Terminal 2");
  assert.equal(tabLabel("Terminal 2", "vim"), "Terminal 2 (vim)");
  const run = (actions: TabsAction[]) => actions.reduce(tabsReducer, emptyTabs());
  const opened: TabsAction[] = [{ type: "open", id: "a" }, { type: "ready", id: "a" }, { type: "program", id: "a", runningProgram: "vim" }];
  assert.equal(run(opened).tabs[0].runningProgram, "vim");
  assert.equal(run([...opened, { type: "program", id: "a" }]).tabs[0].runningProgram, undefined);
  assert.equal(run([...opened, { type: "exit", id: "a", exitCode: 0, signal: null }]).tabs[0].runningProgram, undefined);
  assert.equal(run([...opened, { type: "ready", id: "a" }]).tabs[0].runningProgram, undefined);
});
