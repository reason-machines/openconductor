import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Settings } from "../types.ts";
import { reasonModeOf, reasonProviderFor, reasonStatus, activeWorkspace, withReason, type ReasonAccount } from "./reasonModes.ts";

const account: ReasonAccount = {
  version: "0.2.692",
  name: "Ada",
  email: "ada@example.com",
  credential: "login",
  error: null,
  organization: "Reason Engineering",
  workspaces: [
    { slug: "reason-engineering", name: "Reason Engineering", selected: true, connected: true },
    { slug: "reason-tests", name: "Reason Tests", selected: false, connected: false },
  ],
  computerConnected: true,
};
const withProvider = (p: Settings["providers"]["reason"]): Settings => ({ ...DEFAULT_SETTINGS, providers: { ...DEFAULT_SETTINGS.providers, reason: p } });

test("each card maps to a provider and back", () => {
  for (const mode of ["account", "cli", "apikey"] as const) assert.equal(reasonModeOf(withProvider(reasonProviderFor(mode))), mode);
  assert.equal(reasonModeOf(DEFAULT_SETTINGS), "account", "no provider is the Reason account");
});

test("signed in: Version, Account, Workspace and This Mac; a pinned workspace wins", () => {
  const s = withReason(DEFAULT_SETTINGS, "workspace", "reason-tests");
  const st = reasonStatus("account", account, s, false);
  assert.equal(st.connected, true);
  assert.deepEqual(st.rows, [
    { label: "Version", value: "0.2.692" },
    { label: "Account", value: "ada@example.com" },
    { label: "Workspace", value: "Reason Tests" },
    { label: "This Mac", value: "Connected" },
  ]);
  assert.equal(reasonStatus("account", account, DEFAULT_SETTINGS, false).rows[2].value, "Reason Engineering");
});

test("signed out or keyless shows only the version and says what to do", () => {
  const out = { ...account, name: null, email: null, workspaces: [] };
  const st = reasonStatus("cli", out, DEFAULT_SETTINGS, false);
  assert.equal(st.connected, false);
  assert.deepEqual(st.rows, [{ label: "Version", value: "0.2.692" }]);
  assert.match(st.notConnectedMessage, /Sign in with your Reason account/);
  assert.doesNotMatch(st.notConnectedMessage, /run|terminal/i);
  assert.equal(reasonStatus("apikey", account, DEFAULT_SETTINGS, false).connected, false);
  assert.equal(reasonStatus("apikey", account, DEFAULT_SETTINGS, true).rows[2].value, "API key");
  assert.match(reasonStatus("account", null, DEFAULT_SETTINGS, false).notConnectedMessage, /not installed/);
});

test("expired credentials never show a stale identity as connected", () => {
  const status = reasonStatus("account", { ...account, error: "Your sign-in has expired." }, DEFAULT_SETTINGS, false);
  assert.equal(status.connected, false);
  assert.deepEqual(status.rows, [{ label: "Version", value: "0.2.692" }]);
  assert.equal(status.notConnectedMessage, "Your sign-in has expired.");
  assert.equal(reasonStatus("account", { ...account, name: "", email: " " }, DEFAULT_SETTINGS, false).connected, false);
});

test("an unavailable pinned workspace never falls back to the account selection", () => {
  const settings = withReason(DEFAULT_SETTINGS, "workspace", "removed-workspace");
  assert.equal(activeWorkspace(settings, account), null);
  assert.equal(reasonStatus("account", account, settings, false).rows.find((row) => row.label === "Workspace")?.value, "removed-workspace (unavailable)");
  assert.equal(activeWorkspace(settings, { ...account, workspaces: [] }), null);
  assert.equal(activeWorkspace(DEFAULT_SETTINGS, account)?.slug, "reason-engineering");
  assert.equal(activeWorkspace(withReason(DEFAULT_SETTINGS, "workspace", ""), account)?.slug, "reason-engineering");
});

test("an empty option unsets the key", () => {
  const s = withReason(withReason(DEFAULT_SETTINGS, "model", "byok:anthropic:claude-opus-5-5"), "reasoning_effort", "high");
  assert.deepEqual(s.reason, { model: "byok:anthropic:claude-opus-5-5", reasoning_effort: "high" });
  assert.equal(withReason(s, "model", "").reason?.model, null);
});
