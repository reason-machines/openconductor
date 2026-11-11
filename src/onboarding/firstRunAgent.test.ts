import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { DEFAULT_SETTINGS, type Settings } from "../settings/types.ts";
import type { ReasonAccount } from "../settings/agents/reasonModes.ts";

register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,next) {
  try { return await next(s,c); } catch (e) {
    if (s.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s+".ts",c);
    throw e;
  }
}`), import.meta.url);

let settings: Settings = { ...DEFAULT_SETTINGS, reason: undefined };
const globals = globalThis as Record<string, unknown>;
globals.window = globalThis;
globals.isTauri = true;
globals.__TAURI_INTERNALS__ = {
  async invoke(command: string, args?: { settings: Settings }) {
    if (command === "get_settings") return settings;
    if (command === "update_settings" && args) return settings = args.settings;
    throw new Error(`Unexpected settings IPC ${command}`);
  },
};
const { selectFirstRunAgent } = await import("./firstRunAgent.ts");
const { rememberPairedWorkspace } = await import("./reasonChatConnection.ts");
const account: ReasonAccount = {
  version: "fixture", name: "Fixture", email: "fixture@example.invalid", credential: "login", error: null,
  organization: "Fixture", computerConnected: true,
  workspaces: [{ slug: "paired", name: "Paired", selected: true, connected: true }],
};

for (const agent of ["claude", "codex", "reason"] as const) {
  test(`${agent} selection works with genuinely absent Reason settings`, async () => {
    settings = { ...DEFAULT_SETTINGS, reason: undefined };
    await selectFirstRunAgent(agent);
    assert.equal(settings.models.default_agent, agent);
    assert.equal(settings.models.default_initialized, true);
    if (agent === "reason") assert.equal(settings.reason?.model, "openai/gpt-6.1-sol");
  });
}

test("browser pairing stores its selected workspace when Reason settings are absent", async () => {
  settings = { ...DEFAULT_SETTINGS, reason: undefined };
  await rememberPairedWorkspace(account);
  assert.equal(settings.reason?.workspace, "paired");
});

test("pairing never replaces an explicitly pinned workspace", async () => {
  settings = { ...DEFAULT_SETTINGS, reason: { workspace: "pinned" } };
  await rememberPairedWorkspace(account);
  assert.equal(settings.reason?.workspace, "pinned");
});

test("pairing without a selected workspace stays explicit instead of inventing a default", async () => {
  settings = { ...DEFAULT_SETTINGS, reason: undefined };
  await assert.rejects(rememberPairedWorkspace({ ...account, workspaces: [] }), /Choose a workspace/);
  assert.equal(settings.reason, undefined);
});
