import { test } from "node:test";
import assert from "node:assert/strict";
import { codexPersonality, executableCopy, storedExecutable, withExecutable } from "./agentOptions.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

test("executable rows use Conductor's copy per agent", () => {
  const c = executableCopy("claude");
  assert.equal(c.title, "Claude Code executable path");
  assert.equal(c.description, "Override the bundled Claude Code executable with a custom one. Leave empty to use the bundled version (recommended).");
  assert.equal(c.fallbackPlaceholder, "/usr/local/bin/claude");
  assert.equal(executableCopy("codex").useSystem, "Use system Codex");
  assert.equal(executableCopy("codex").reset, "Reset to bundled Codex");
});

test("an executable override keeps the typed text and blank unsets it", () => {
  const s = withExecutable(DEFAULT_SETTINGS, "codex", "/opt/My Tools/codex ");
  assert.equal(s.codex_executable_path, "/opt/My Tools/codex ");
  assert.equal(storedExecutable(s, "codex"), "/opt/My Tools/codex ");
  assert.equal(withExecutable(s, "codex", "  ").codex_executable_path, null);
  assert.equal(storedExecutable(DEFAULT_SETTINGS, "claude"), "");
});

test("Codex personality shows unset as Pragmatic, as xN does", () => {
  assert.equal(codexPersonality(DEFAULT_SETTINGS), "pragmatic");
  const friendly = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, codex: { ...DEFAULT_SETTINGS.models.codex, personality: "friendly" as const } } };
  assert.equal(codexPersonality(friendly), "friendly");
});
