import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as authRules from "./agentAuth.ts";
import type { CliLoginStatus } from "./api.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = process.env.CLAUDE_LOGIN_SOURCE_FILE
  ? readFileSync(process.env.CLAUDE_LOGIN_SOURCE_FILE, "utf8")
  : readFileSync(new URL("./ClaudeTab.tsx", import.meta.url), "utf8");

type ViewExports = Pick<typeof import("./parts"), "AuthStatus" | "LoginButton">;

function evaluate(text: string, fileName: string, exports: object, require: (name: string) => unknown): void {
  const javascript = ts.transpileModule(text, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, { exports, require });
}

function fixture({ authenticated, loading = false, apiKey = false }: { authenticated: boolean; loading?: boolean; apiKey?: boolean }) {
  const forbiddenCalls: string[] = [];
  const forbid = (name: string) => () => { forbiddenCalls.push(name); throw new Error(`Unexpected native/provider call: ${name}`); };
  const parts: Partial<ViewExports> = {};
  evaluate(readFileSync(new URL("./parts.tsx", import.meta.url), "utf8"), "parts.tsx", parts, (name) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name.endsWith(".css")) return {};
    if (name === "@xterm/xterm") return { Terminal: forbid("Terminal") };
    if (name === "@xterm/addon-fit") return { FitAddon: forbid("FitAddon") };
    if (name === "../../features/terminal/pty") return {
      onPtyEvent: forbid("onPtyEvent"), ptyKill: forbid("ptyKill"), ptyResize: forbid("ptyResize"),
      ptySpawn: forbid("ptySpawn"), ptyWrite: forbid("ptyWrite"),
    };
    if (name === "./agentAuth") return authRules;
    if (name === "./api") return { homeDir: forbid("homeDir"), openExternal: forbid("openExternal") };
    if (name === "./icons") return new Proxy({}, { get: () => () => null });
    throw new Error(`Unexpected parts dependency: ${name}`);
  });
  assert.ok(parts.LoginButton);
  assert.ok(parts.AuthStatus);
  const login: CliLoginStatus = { installed: true, authenticated, method: "Claude account" };
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
      LoginButton: parts.LoginButton, SecretRow: "secret-row",
      StatusLine: (props: { connected: boolean; checking: boolean }) => React.createElement(parts.AuthStatus, {
        ...props, authenticated: props.connected, loading: props.checking,
      }),
    };
    if (name === "../rows/AgentOptionRows") return { ChromeModeRow: () => null };
    if (name === "./useAgentStatus") return {
      useAgentStatus: () => ({ provider: {}, login, loading, refresh() {}, setProvider: forbid("setProvider") }),
      storedSecret: () => ({ present: apiKey, hint: null }),
    };
    if (name === "../connectedDefault") return { useConnectedDefault() {} };
    throw new Error(`Unexpected ClaudeTab dependency: ${name}`);
  });
  assert.ok(tab.ClaudeTab);
  const settings = { ...DEFAULT_SETTINGS, providers: apiKey ? { claude: { kind: "anthropic_api" as const } } : {} };
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(tab.ClaudeTab, { settings, save: forbid("save"), reload: forbid("reload") })); });
  return {
    buttons: () => renderer.root.findAllByType("button").map((node: { children: unknown[] }) => node.children.filter((child) => typeof child === "string").join("")),
    secrets: () => renderer.root.findAllByType("secret-row"),
    status: () => renderer.root.findByProps({ "data-testid": "agent-auth-status" }).findAllByType("div").map((node: { children: unknown[] }) => node.children.join("")).join(" "),
    forbiddenCalls,
    close() { act(() => renderer.unmount()); },
  };
}

for (const [name, authenticated, loading] of [
  ["connected CLI retains Run claude /login", true, false],
  ["signed-out CLI retains Run claude /login", false, false],
  ["refreshing connected CLI retains Run claude /login", true, true],
] as const) {
  test(name, () => {
    const view = fixture({ authenticated, loading });
    try {
      assert.ok(view.buttons().some((label: string) => label === "Run claude /login"), "CLI mode must keep the login action regardless of connected status");
      assert.equal(view.secrets().length, 0);
      if (authenticated) assert.match(view.status(), /Connected/);
      assert.deepEqual(view.forbiddenCalls, [], "rendering must not initiate login or read credentials");
    } finally { view.close(); }
  });
}

test("API-key mode retains its secret control instead of CLI login", () => {
  const view = fixture({ authenticated: true, apiKey: true });
  try {
    assert.ok(!view.buttons().some((label: string) => label === "Run claude /login"));
    assert.equal(view.secrets().length, 1);
    assert.equal(view.secrets()[0].props.label, "Anthropic API key");
    assert.deepEqual(view.forbiddenCalls, []);
  } finally { view.close(); }
});
