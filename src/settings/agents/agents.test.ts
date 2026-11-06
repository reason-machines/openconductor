import { test } from "node:test";
import assert from "node:assert/strict";
import { apiKeyName, authModeOf, claudeAuthState, codexAuthState, configForMode } from "./agentAuth.ts";
import { displayedLoadout, equip, isEquipped, move, parseFavorites, remove, toRows, withDefault, withReview, builtIn, type Favorite } from "./loadout.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

test("the API key card stands for the key-based providers, the CLI card for the rest", () => {
  assert.equal(authModeOf("claude", null), "cli");
  assert.equal(authModeOf("claude", { kind: "claude_login" }), "cli");
  assert.equal(authModeOf("claude", { kind: "anthropic_api" }), "apikey");
  assert.equal(authModeOf("codex", { kind: "openai_api" }), "apikey");
  assert.deepEqual(configForMode("claude", "apikey", { kind: "anthropic_api", base_url: "https://x" }), { kind: "anthropic_api", base_url: "https://x" });
  assert.deepEqual(configForMode("claude", "apikey", { kind: "claude_login" }), { kind: "anthropic_api", auth: "api_key" });
  assert.deepEqual(configForMode("codex", "cli", { kind: "openai_api" }), { kind: "codex_login" });
  assert.equal(apiKeyName("claude", { kind: "anthropic_api", auth: "auth_token" }), "anthropic_auth_token");
  assert.equal(apiKeyName("codex", { kind: "openai_api" }), "openai_api_key");
});

test("status line copy and info rows follow Conductor's jpa/Fpa and Yki/Qki", () => {
  const none = claudeAuthState("cli", { installed: true, authenticated: false }, false);
  assert.equal(none.authenticated, false);
  assert.equal(none.notConnectedMessage, "CLI not authenticated");
  const cli = claudeAuthState("cli", { installed: true, authenticated: true, version: "2.1.284", method: "Claude account", email: "ada@example.com" }, false);
  assert.deepEqual(cli.rows.map((r) => r.label), ["Version", "Login method", "Email"]);
  assert.equal(claudeAuthState("apikey", null, false).notConnectedMessage, "No Anthropic API key configured");
  assert.equal(claudeAuthState("apikey", null, true).authenticated, true);
  assert.equal(codexAuthState("apikey", null, false).notConnectedMessage, "No OpenAI API key configured");
  const codex = codexAuthState("cli", { installed: true, authenticated: true, method: "ChatGPT login" }, false);
  assert.deepEqual(codex.rows, [
    { label: "Provider", value: "OpenAI" },
    { label: "Auth", value: "ChatGPT login" },
  ]);
});

const withModel = (m: string) => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: m } });

test("an empty loadout shows the default model alone, slot 1 always follows the settings (nUi)", () => {
  const shown = displayedLoadout(withModel("opus-5-1m"), []);
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0], { id: "default", type: "built-in", agent: "claude", model: "opus-5-1m", thinkingLevel: "high", fastMode: false });
  const stored: Favorite[] = [builtIn("a", "haiku-4-5"), builtIn("b", "gpt-5.5")];
  const two = displayedLoadout(withModel("opus-5-5-1m"), stored);
  assert.equal(two[0].type === "built-in" && two[0].model, "opus-5-5-1m");
  assert.equal(two[0].id, "a");
  assert.equal(two[1], stored[1]);
});

test("equip appends at the next slot or replaces an occupied one; five slots at most", () => {
  let list: Favorite[] = [builtIn("a", "opus-5-1m")];
  list = equip(list, builtIn("b", "gpt-5.5"), 1);
  assert.deepEqual(list.map((f) => f.id), ["a", "b"]);
  list = equip(list, builtIn("c", "haiku-4-5"), 0);
  assert.deepEqual(list.map((f) => f.id), ["a", "b"]);
  assert.equal(list[0].type === "built-in" && list[0].model, "haiku-4-5");
  for (const id of ["d", "e", "f", "g"]) list = equip(list, builtIn(id, "auto"), 9);
  assert.equal(list.length, 5);
  assert.ok(isEquipped(list, "gpt-5.5"));
  assert.deepEqual(move(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(remove([builtIn("a", "auto")], "a").length, 1);
  assert.deepEqual(remove(list, "b").map((f) => f.id), ["a", "d", "e", "f"]);
});

test("favorites round-trip as Conductor's favorite_models configuration JSON", () => {
  const favs: Favorite[] = [builtIn("a", "gpt-5.6-sol", "high", true), { id: "b", type: "acp", acpAgentId: "some-acp-agent", modelId: "anthropic/claude" }];
  const rows = toRows(favs);
  assert.deepEqual(JSON.parse(rows[0].configuration), { type: "built-in", agent: "codex", model: "gpt-5.6-sol", thinkingLevel: "high", fastMode: true });
  assert.deepEqual(parseFavorites(rows), favs);
  assert.deepEqual(parseFavorites([{ id: "x", configuration: "not json" }, { id: "y", configuration: '{"type":"built-in","model":"llama-9"}' }]), []);
});

test("slot 1 and the review model write the settings the agent launch reads", () => {
  const s = withDefault(DEFAULT_SETTINGS, builtIn("a", "gpt-5.6-sol", "xhigh", true));
  assert.equal(s.models.default, "gpt-5.6-sol");
  assert.equal(s.models.default_fast_mode, true);
  assert.equal(s.models.codex.default_thinking_level, "xhigh");
  const r = withReview(DEFAULT_SETTINGS, builtIn("r", "opus-5-5-1m", "max"));
  assert.equal(r.models.review, "opus-5-5-1m");
  assert.equal(r.models.claude_code?.review_effort_level, "max");
});
