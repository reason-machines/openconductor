import { test } from "node:test";
import assert from "node:assert/strict";
import {
  afterDelete,
  bigTabRequest,
  bigTerminalCommand,
  customCommandsFrom,
  PRESET_OPTIONS,
  presetFrom,
  shellQuote,
} from "./bigTerminal.ts";

const run = (preset: Parameters<typeof bigTerminalCommand>[0]["preset"], extra: Partial<Parameters<typeof bigTerminalCommand>[0]> = {}) =>
  bigTerminalCommand({ preset, customCommands: [], requiresToolApprovals: false, ...extra });

test("built-in presets run Conductor's commands", () => {
  assert.equal(run("claude"), "claude --dangerously-skip-permissions");
  assert.equal(run("codex"), 'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access');
  assert.equal(run("opencode"), "opencode");
  assert.equal(run("amp"), "amp");
  assert.equal(run("pi"), "pi");
  assert.equal(run("copilot"), "copilot --allow-all");
  assert.equal(run("gemini"), "gemini -y");
  assert.equal(run("none"), undefined);
});

test("with tool approvals required, Claude and Codex drop their skip-approval flags", () => {
  assert.equal(run("claude", { requiresToolApprovals: true }), "claude");
  assert.equal(run("codex", { requiresToolApprovals: true }), 'codex -c model_reasoning_effort="high"');
  assert.equal(run("copilot", { requiresToolApprovals: true }), "copilot --allow-all");
  assert.equal(run("gemini", { requiresToolApprovals: true }), "gemini -y");
});

test("an executable path replaces the first word, quoted; blank paths and other agents are ignored", () => {
  assert.equal(run("claude", { executablePaths: { claude: " /opt/my claude/bin/claude " } }), "'/opt/my claude/bin/claude' --dangerously-skip-permissions");
  assert.equal(run("codex", { executablePaths: { codex: "   " } }), run("codex"));
  assert.equal(run("amp", { executablePaths: { claude: "/c" } }), "amp");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test("custom presets run their command trimmed, nothing when empty or deleted", () => {
  const customCommands = [
    { id: "a", command: "  my-agent --flag  " },
    { id: "b", command: "   " },
  ];
  assert.equal(run("custom:a", { customCommands }), "my-agent --flag");
  assert.equal(run("custom:b", { customCommands }), undefined);
  assert.equal(run("custom:gone", { customCommands }), undefined);
});

test("stored preset falls back to Claude unless it is a preset or custom id", () => {
  assert.equal(presetFrom(undefined), "claude");
  assert.equal(presetFrom(""), "claude");
  assert.equal(presetFrom("vim"), "claude");
  assert.equal(presetFrom("toString"), "claude");
  assert.equal(presetFrom("pi"), "pi");
  assert.equal(presetFrom("none"), "none");
  assert.equal(presetFrom("custom:x"), "custom:x");
});

test("custom commands drop malformed entries, from an array or Conductor's JSON string", () => {
  const good = { id: "a", command: "x" };
  assert.deepEqual(customCommandsFrom([good, { id: 1, command: "y" }, { id: "b" }, null, "z"]), [good]);
  assert.deepEqual(customCommandsFrom(JSON.stringify([good, { command: "y" }])), [good]);
  assert.deepEqual(customCommandsFrom("not json"), []);
  assert.deepEqual(customCommandsFrom({ id: "a", command: "x" }), []);
  assert.deepEqual(customCommandsFrom(undefined), []);
});

test("deleting the selected custom command selects the first one left, else Claude", () => {
  const customCommands = [
    { id: "a", command: "1" },
    { id: "b", command: "2" },
  ];
  assert.deepEqual(afterDelete({ preset: "custom:a", customCommands }, "a"), { preset: "custom:b", customCommands: [customCommands[1]] });
  assert.deepEqual(afterDelete({ preset: "custom:b", customCommands: [customCommands[1]] }, "b"), { preset: "claude", customCommands: [] });
  assert.deepEqual(afterDelete({ preset: "codex", customCommands }, "a"), { preset: "codex", customCommands: [customCommands[1]] });
});

test("the settings tab lists Conductor's presets in its order, without pi", () => {
  assert.deepEqual(
    PRESET_OPTIONS.map((o) => o.label),
    ["Claude", "Codex", "OpenCode", "Amp", "Copilot", "Gemini", "None"],
  );
});

test("⌘⇧T does nothing while the mode is off, else opens a tab running the preset", () => {
  assert.equal(bigTabRequest({ enabled: false, preset: "claude", customCommands: [] }), null);
  assert.deepEqual(bigTabRequest({ enabled: true, preset: "claude", customCommands: [] }), { command: "claude --dangerously-skip-permissions" });
  assert.deepEqual(bigTabRequest({ enabled: true, preset: "none", customCommands: [] }), { command: undefined });
  assert.deepEqual(bigTabRequest({ enabled: true, preset: "custom:a", customCommands: [{ id: "a", command: "htop" }] }), { command: "htop" });
});

test("⌘⇧T follows Claude Code tool approvals and the executable paths from settings", () => {
  const base = { enabled: true, customCommands: [] };
  assert.deepEqual(bigTabRequest({ ...base, preset: "claude", requiresToolApprovals: true }), { command: "claude" });
  assert.deepEqual(bigTabRequest({ ...base, preset: "claude", executablePaths: { claude: "/opt/my claude" } }), {
    command: "'/opt/my claude' --dangerously-skip-permissions",
  });
  assert.deepEqual(bigTabRequest({ ...base, preset: "codex", requiresToolApprovals: true, executablePaths: { codex: " /x/codex " } }), {
    command: `'/x/codex' -c model_reasoning_effort="high"`,
  });
});
