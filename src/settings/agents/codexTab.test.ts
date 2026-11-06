import { test } from "node:test";
import assert from "node:assert/strict";
import { chatgptStatus, codexModeOf, loginResult, switchSteps, withCodexProvider } from "./codexTab.ts";
import { DEFAULT_SETTINGS, type Settings } from "../types.ts";

const s = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

test("the card follows [providers.codex] first, then codex_provider", () => {
  assert.equal(codexModeOf(s({})), "cli");
  assert.equal(codexModeOf(s({ codex_provider: "chatgpt_sign_in" })), "chatgpt");
  assert.equal(codexModeOf(s({ codex_provider: "custom" })), "apikey");
  assert.equal(codexModeOf(s({ codex_provider: "default" })), "cli");
  assert.equal(codexModeOf(s({ providers: { codex: { kind: "openai_api" } } })), "apikey");
  assert.equal(codexModeOf(s({ codex_provider: "chatgpt_sign_in", providers: { codex: { kind: "codex_login" } } })), "cli");
});

test("ChatGPT disconnects any stored provider, then saves chatgpt_sign_in without [providers.codex]", () => {
  const from = s({ providers: { codex: { kind: "openai_api" }, claude: { kind: "claude_login" } } });
  const steps = switchSteps(from, "chatgpt");
  assert.deepEqual(steps.map((x) => x.op), ["disconnect", "save"]);
  const saved = steps[1]!.op === "save" ? steps[1].settings : null;
  assert.equal(saved?.codex_provider, "chatgpt_sign_in");
  assert.equal(saved?.providers.codex, undefined);
  assert.deepEqual(saved?.providers.claude, { kind: "claude_login" });
  assert.equal(codexModeOf(saved!), "chatgpt");
  assert.deepEqual(switchSteps(s({}), "chatgpt").map((x) => x.op), ["save"]);
});

test("CLI and API key clear chatgpt_sign_in first, then connect; API key keeps its stored options", () => {
  const chat = s({ codex_provider: "chatgpt_sign_in" });
  const cli = switchSteps(chat, "cli");
  assert.deepEqual(cli.map((x) => x.op), ["save", "connect"]);
  assert.equal(cli[0]!.op === "save" && cli[0].settings.codex_provider, null);
  assert.deepEqual(cli[1], { op: "connect", config: { kind: "codex_login" } });
  assert.deepEqual(switchSteps(s({}), "apikey"), [{ op: "connect", config: { kind: "openai_api" } }]);
  const org = { kind: "openai_api" as const, organization: "org-1" };
  assert.deepEqual(switchSteps(s({ providers: { codex: org } }), "apikey"), [{ op: "connect", config: org }]);
  assert.equal(withCodexProvider(s({ codex_provider: "x" }), null).codex_provider, null);
});

test("the ChatGPT card's status: account and plan, or not signed in", () => {
  const acct = { kind: "chatgpt", email: "e2e@example.com", planType: "pro", requiresOpenaiAuth: true };
  assert.deepEqual(chatgptStatus(acct), {
    authenticated: true,
    rows: [
      { label: "ChatGPT account", value: "e2e@example.com" },
      { label: "Plan", value: "Pro" },
    ],
    notConnectedMessage: "Not signed in with ChatGPT",
  });
  assert.equal(chatgptStatus({ kind: "apiKey", requiresOpenaiAuth: true }).authenticated, false);
  assert.equal(chatgptStatus(null).notConnectedMessage, "Not signed in with ChatGPT");
});

test("a sign-in's end: the account, nothing on cancel, readable errors otherwise", () => {
  const account = { kind: "chatgpt", email: "a@b.c", requiresOpenaiAuth: true };
  assert.deepEqual(loginResult({ loginId: "1", status: "success", account }), { account });
  assert.deepEqual(loginResult({ loginId: "1", status: "cancelled" }), { error: null });
  assert.match((loginResult({ loginId: "1", status: "timedOut" }) as { error: string }).error, /timed out/);
  assert.equal((loginResult({ loginId: "1", status: "failed", error: "denied" }) as { error: string }).error, "ChatGPT sign-in failed: denied");
});
