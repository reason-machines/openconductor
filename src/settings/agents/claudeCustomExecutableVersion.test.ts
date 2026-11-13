import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as authRules from "./agentAuth.ts";
import type { CliLoginStatus } from "./api.ts";
import { DEFAULT_SETTINGS, type Settings } from "../types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = readFileSync(process.env.CLAUDE_VERSION_SOURCE_FILE ?? new URL("./ClaudeTab.tsx", import.meta.url), "utf8");
type StatusExports = Pick<typeof import("./parts"), "AuthStatus">;

function evaluate(text: string, fileName: string, exports: object, require: (name: string) => unknown): void {
  const javascript = ts.transpileModule(text, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, { exports, require });
}

function fixture({
  path = null, mode = "cli", authenticated = true, version = "2.1.284", keyStored = true,
}: {
  path?: string | null;
  mode?: "cli" | "apikey";
  authenticated?: boolean;
  version?: string;
  keyStored?: boolean;
} = {}) {
  const forbiddenCalls: string[] = [];
  const forbid = (name: string) => () => { forbiddenCalls.push(name); throw new Error(`Unexpected external call: ${name}`); };
  const parts: Partial<StatusExports> = {};
  evaluate(readFileSync(new URL("./parts.tsx", import.meta.url), "utf8"), "parts.tsx", parts, (name) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name.endsWith(".css")) return {};
    if (name === "@xterm/xterm") return { Terminal: forbid("Terminal") };
    if (name === "@xterm/addon-fit") return { FitAddon: forbid("FitAddon") };
    if (name === "../../features/terminal/pty") return {
      onPtyEvent: forbid("onPtyEvent"), ptyAckBytes: forbid("ptyAckBytes"), ptyKill: forbid("ptyKill"),
      ptyResize: forbid("ptyResize"), ptySpawn: forbid("ptySpawn"), ptyWrite: forbid("ptyWrite"),
    };
    if (name === "./agentAuth") return authRules;
    if (name === "./api") return { homeDir: forbid("homeDir"), openExternal: forbid("openExternal") };
    if (name === "./icons") return new Proxy({}, { get: () => () => null });
    throw new Error(`Unexpected parts dependency: ${name}`);
  });
  assert.ok(parts.AuthStatus);
  const login: CliLoginStatus = Object.freeze({
    installed: true, authenticated, version, method: "Claude account", organization: "Fixture Org", email: "fixture@example.invalid",
  });
  const originalLogin = { ...login };
  const connected: boolean[] = [];
  const tab: Partial<Pick<typeof import("./ClaudeTab"), "ClaudeTab">> = {};
  evaluate(source, "ClaudeTab.tsx", tab, (name) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name === "@tauri-apps/api/core") return { invoke: forbid("invoke") };
    if (name === "../../backend") return { inTauri: () => false };
    if (name === "../api") return {
      connectProvider: forbid("connectProvider"), disconnectProvider: forbid("disconnectProvider"),
      revealProviderSecret: forbid("revealProviderSecret"), errorText: String,
    };
    if (name === "./agentAuth") return authRules;
    if (name === "./icons") return { KeyIcon: () => null, TerminalIcon: () => null };
    if (name === "./kit") return {
      AuthCards: () => null, ConfigFileCard: () => null, ExecutablePathRow: () => null,
      LoginButton: () => null, SecretRow: () => null,
      StatusLine: (props: { connected: boolean; checking: boolean }) => React.createElement(parts.AuthStatus, {
        ...props, authenticated: props.connected, loading: props.checking,
      }),
    };
    if (name === "../rows/AgentOptionRows") return { ChromeModeRow: () => null };
    if (name === "./useAgentStatus") return {
      useAgentStatus: () => ({ provider: {}, login, loading: false, refresh: forbid("refresh"), setProvider: forbid("setProvider") }),
      storedSecret: () => ({ present: keyStored, hint: null }),
    };
    if (name === "../connectedDefault") return { useConnectedDefault: (_agent: string, value: boolean) => { connected.push(value); } };
    throw new Error(`Unexpected ClaudeTab dependency: ${name}`);
  });
  assert.ok(tab.ClaudeTab);
  const settings: Settings = {
    ...DEFAULT_SETTINGS, claude_code_executable_path: path,
    providers: mode === "apikey" ? { claude: { kind: "anthropic_api", auth: "api_key" } } : {},
  };
  const render = (next: Settings) => React.createElement(tab.ClaudeTab, { settings: next, save: forbid("save"), reload: forbid("reload") });
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(render(settings)); });
  return {
    rows: () => renderer.root.findAllByType("tr").map((row: { findByType: (type: string) => { children: string[] } }) => ({
      label: row.findByType("th").children.join(""), value: row.findByType("td").children.join(""),
    })),
    changePath(next: string | null) { act(() => renderer.update(render({ ...settings, claude_code_executable_path: next }))); },
    connected,
    close() {
      act(() => renderer.unmount());
      assert.deepEqual(forbiddenCalls, [], "render and path changes must not call a native/provider/secret/settings operation");
      assert.deepEqual(login, originalLogin, "display projection must not mutate the source status");
    },
  };
}

const cliRows = [
  { label: "Login method", value: "Claude account" },
  { label: "Organization", value: "Fixture Org" },
  { label: "Email", value: "fixture@example.invalid" },
];
const keyRows = [{ label: "Provider", value: "Anthropic API" }, { label: "Auth", value: "API key" }];
const versionRow = { label: "Version", value: "2.1.284" };

for (const mode of ["cli", "apikey"] as const) {
  test(`custom Claude executable omits only Version in ${mode} mode`, () => {
    const view = fixture({ path: "/fixture/bin/claude", mode });
    try {
      assert.deepEqual(view.rows(), mode === "cli" ? cliRows : keyRows);
      assert.deepEqual(view.connected, [true]);
    } finally { view.close(); }
  });
  test(`default Claude executable retains Version first in ${mode} mode`, () => {
    const view = fixture({ path: mode === "cli" ? null : "", mode });
    try {
      assert.deepEqual(view.rows(), [versionRow, ...(mode === "cli" ? cliRows : keyRows)]);
      assert.deepEqual(view.connected, [true]);
    } finally { view.close(); }
  });
}

test("raw truthy executable override follows the reference visibility rule", () => {
  const view = fixture({ path: "   " });
  try { assert.deepEqual(view.rows(), cliRows); } finally { view.close(); }
});

test("custom path does not authenticate a signed-out CLI or expose its rows", () => {
  const view = fixture({ path: "/fixture/bin/claude", authenticated: false });
  try {
    assert.deepEqual(view.rows(), []);
    assert.deepEqual(view.connected, [false]);
  } finally { view.close(); }
});

test("custom path does not authenticate an absent API key or expose its rows", () => {
  const view = fixture({ path: "/fixture/bin/claude", mode: "apikey", keyStored: false });
  try {
    assert.deepEqual(view.rows(), []);
    assert.deepEqual(view.connected, [false]);
  } finally { view.close(); }
});

test("a missing version leaves all other CLI rows intact", () => {
  const view = fixture({ version: "" });
  try { assert.deepEqual(view.rows(), cliRows); } finally { view.close(); }
});

test("a mounted tab removes Version when an override arrives without a status reload", () => {
  const view = fixture();
  try {
    assert.deepEqual(view.rows(), [versionRow, ...cliRows]);
    view.changePath("/fixture/bin/claude");
    assert.deepEqual(view.rows(), cliRows);
    assert.ok(view.connected.every(Boolean));
  } finally { view.close(); }
});

test("clearing the override restores the existing Version without a status reload", () => {
  const view = fixture({ path: "/fixture/bin/claude" });
  try {
    view.changePath(null);
    assert.deepEqual(view.rows(), [versionRow, ...cliRows]);
    assert.ok(view.connected.every(Boolean));
  } finally { view.close(); }
});
