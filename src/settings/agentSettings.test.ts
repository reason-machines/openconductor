import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAppearance } from "./appearance.ts";
import { executablePaths, visibleModels, withAgentModel, withTopLevel, withVisibleModels } from "./agentSettings.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";
import { bigTabRequest, currentBigTerminal } from "../features/terminal/bigTerminal.ts";

const withVisible = (v: string | null): Settings => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, visible_provider_models: v } });

test("visible provider models are read the way Conductor reads them", () => {
  const s = withVisible('{"opencode":["opencode:anthropic/x"," openrouter/y ","opencode:anthropic/x",3],"codex":"nope","zed":["a"]}');
  assert.deepEqual(visibleModels(s).opencode, ["anthropic/x", "openrouter/y"]);
  assert.deepEqual(visibleModels(s).codex, []);
  for (const bad of [null, "", "not json", "[1]", "null"]) assert.deepEqual(visibleModels(withVisible(bad)).opencode, []);
});

test("writing visible models uses Conductor's provider-prefixed JSON and clears when empty", () => {
  const s = withVisibleModels(DEFAULT_SETTINGS, "opencode", [" anthropic/x", "anthropic/x", "", "b/c"]);
  assert.deepEqual(JSON.parse(s.models.visible_provider_models as string), {
    claude: [],
    codex: [],
    cursor: [],
    opencode: ["opencode:anthropic/x", "opencode:b/c"],
    pi: [],
  });
  assert.deepEqual(visibleModels(s).opencode, ["anthropic/x", "b/c"]);
  assert.equal(withVisibleModels(s, "opencode", []).models.visible_provider_models, null);
});

test("top-level paths trim, blank clears, and other keys are kept", () => {
  const s = withTopLevel({ ...DEFAULT_SETTINGS, future: 1 } as Settings, "codex_executable_path", "  /x/codex ");
  assert.equal(s.codex_executable_path, "/x/codex");
  assert.equal((s as Record<string, unknown>).future, 1);
  assert.equal(withTopLevel(s, "codex_executable_path", " ").codex_executable_path, null);
  assert.deepEqual(executablePaths(s), { claude: undefined, codex: "/x/codex", opencode: undefined });
});

test("agent model fields keep the rest of their section", () => {
  const s = withAgentModel(DEFAULT_SETTINGS, "codex", "tool_approval_policy", "always_approve");
  assert.equal(s.models.codex.tool_approval_policy, "always_approve");
  assert.equal(s.models.codex.default_thinking_level, "medium");
  const c = withAgentModel(s, "claude_code", "personality", "learning");
  assert.equal(c.models.claude_code?.personality, "learning");
  assert.equal(c.models.codex.tool_approval_policy, "always_approve");
});

test("settings push tool approvals and executable paths into the big terminal", () => {
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    tool_approvals_enabled: true,
    claude_code_executable_path: "/opt/claude",
    experimental: { experimental_big_terminal_mode: true },
  };
  const g = globalThis as { document?: unknown; window?: unknown };
  g.document = { documentElement: { style: { setProperty() {}, removeProperty() {} }, dataset: {}, classList: { toggle() {} } } };
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
  try {
    applyAppearance(s);
  } finally {
    delete g.document;
    delete g.window;
  }
  assert.equal(currentBigTerminal().requiresToolApprovals, true);
  assert.deepEqual(bigTabRequest(), { command: "'/opt/claude'" });
});
