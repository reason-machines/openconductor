import { test } from "node:test";
import assert from "node:assert/strict";
import { advancedAlert, codexPersonality, executableCopy, statusBadge, storedExecutable, withExecutable, type AcpAgentStatus } from "./agentOptions.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

test("executable rows use Conductor's copy per agent", () => {
  const c = executableCopy("claude");
  assert.equal(c.title, "Claude Code executable path");
  assert.equal(c.description, "Override the bundled Claude Code executable with a custom one. Leave empty to use the bundled version (recommended).");
  assert.equal(c.fallbackPlaceholder, "/usr/local/bin/claude");
  assert.equal(executableCopy("opencode").useSystem, "Use system OpenCode");
  assert.equal(executableCopy("codex").reset, "Reset to bundled Codex");
});

test("an executable override keeps the typed text and blank unsets it", () => {
  const s = withExecutable(DEFAULT_SETTINGS, "codex", "/opt/My Tools/codex ");
  assert.equal(s.codex_executable_path, "/opt/My Tools/codex ");
  assert.equal(storedExecutable(s, "codex"), "/opt/My Tools/codex ");
  assert.equal(withExecutable(s, "codex", "  ").codex_executable_path, null);
  assert.equal(storedExecutable(DEFAULT_SETTINGS, "opencode"), "");
});

test("Codex personality shows unset as Pragmatic, as xN does", () => {
  assert.equal(codexPersonality(DEFAULT_SETTINGS), "pragmatic");
  const friendly = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, codex: { ...DEFAULT_SETTINGS.models.codex, personality: "friendly" as const } } };
  assert.equal(codexPersonality(friendly), "friendly");
});

test("the OpenCode badge and Advanced alert follow gpa and ypa", () => {
  const st = (o: Partial<AcpAgentStatus>): AcpAgentStatus => ({ isInstalled: true, version: "2.0.5", isOutdated: false, error: null, executable: "/x/opencode", ...o });
  assert.deepEqual(statusBadge(null, true), { kind: "checking", label: "Checking" });
  assert.deepEqual(statusBadge(st({}), false), { kind: "installed", label: "Installed", version: "2.0.5" });
  assert.equal(statusBadge(st({ isOutdated: true }), false).label, "Update required");
  assert.equal(statusBadge(st({ isInstalled: false, version: null, executable: null }), false).label, "Missing");
  // A failed run keeps the Installed badge and opens Advanced with "Needs repair".
  assert.equal(statusBadge(st({ error: "boom" }), false).label, "Installed");
  assert.equal(advancedAlert(st({ error: "boom" })), "Needs repair");
  assert.equal(advancedAlert(st({ isOutdated: true })), "Update required");
  assert.equal(advancedAlert(st({})), null);
});
