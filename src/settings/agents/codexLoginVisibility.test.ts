import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as authRules from "./agentAuth.ts";
import * as codexRules from "./codexModes.ts";
import * as agentSettings from "../agentSettings.ts";
import * as agentOptions from "../agentOptions.ts";
import type { CliLoginStatus } from "./api.ts";
import { DEFAULT_SETTINGS, type Settings } from "../types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = process.env.CODEX_LOGIN_SOURCE_FILE
  ? readFileSync(process.env.CODEX_LOGIN_SOURCE_FILE, "utf8")
  : readFileSync(new URL("./CodexTab.tsx", import.meta.url), "utf8");

type ViewExports = Pick<typeof import("./parts"), "AuthStatus" | "LoginButton">;

function evaluate(text: string, fileName: string, exports: object, require: (name: string) => unknown): void {
  const javascript = ts.transpileModule(text, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, { exports, require });
}

function fixture({ mode = "cli", authenticated = false, loading = false }: {
  mode?: codexRules.CodexMode;
  authenticated?: boolean;
  loading?: boolean;
}) {
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
  const login: CliLoginStatus = { installed: true, authenticated, method: "ChatGPT login" };
  const tab: Partial<Pick<typeof import("./CodexTab"), "CodexTab">> = {};
  evaluate(source, "CodexTab.tsx", tab, (name) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name.endsWith(".css")) return {};
    if (name === "@tauri-apps/api/core") return { invoke: forbid("invoke") };
    if (name === "../../backend") return { inTauri: () => false, openUrl: forbid("openUrl") };
    if (name === "../api") return {
      connectProvider: forbid("connectProvider"), disconnectProvider: forbid("disconnectProvider"),
      revealProviderSecret: forbid("revealProviderSecret"), errorText: String,
    };
    if (name === "./agentAuth") return authRules;
    if (name === "./codexModes") return codexRules;
    if (name === "../agentSettings") return agentSettings;
    if (name === "../agentOptions") return agentOptions;
    if (name === "../GeneralPage") return { Row: ({ children }: { children: unknown }) => children };
    if (name === "./ClaudeTab") return { useAgentConfigPaths: () => null };
    if (name === "./icons") return new Proxy({}, { get: () => () => null });
    if (name === "./kit") return {
      AuthCards: "auth-cards", ConfigFileCard: () => null, ExecutablePathRow: () => null,
      LoginButton: parts.LoginButton, SecretRow: "secret-row",
      StatusLine: (props: { connected: boolean; checking: boolean }) => React.createElement(parts.AuthStatus, {
        ...props, authenticated: props.connected, loading: props.checking,
      }),
    };
    if (name === "./useAgentStatus") return {
      useAgentStatus: () => ({ provider: {}, login, loading, refresh() {}, setProvider: forbid("setProvider") }),
      storedSecret: () => ({ present: mode === "apikey", hint: null }),
    };
    if (name === "../connectedDefault") return { useConnectedDefault() {} };
    throw new Error(`Unexpected CodexTab dependency: ${name}`);
  });
  assert.ok(tab.CodexTab);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    codex_provider: mode === "chatgpt" ? codexRules.CHATGPT_SIGN_IN : null,
    providers: mode === "apikey" ? { codex: { kind: "openai_api" } } : {},
  };
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(tab.CodexTab, { settings, save: forbid("save"), reload: forbid("reload") })); });
  return {
    buttons: () => renderer.root.findAllByType("button").map((node: { children: unknown[] }) => node.children.filter((child) => typeof child === "string").join("")),
    secrets: () => renderer.root.findAllByType("secret-row"),
    mode: () => renderer.root.findByType("auth-cards").props.value,
    status: () => renderer.root.findByProps({ "data-testid": "agent-auth-status" }).findAllByType("div").map((node: { children: unknown[] }) => node.children.join("")).join(" "),
    forbiddenCalls,
    close() { act(() => renderer.unmount()); },
  };
}

for (const [name, authenticated, loading] of [
  ["connected CLI retains Run codex login", true, false],
  ["signed-out CLI retains Run codex login", false, false],
  ["refreshing connected CLI retains Run codex login", true, true],
] as const) {
  test(name, () => {
    const view = fixture({ authenticated, loading });
    try {
      assert.equal(view.mode(), "cli");
      assert.ok(view.buttons().includes("Run codex login"), "CLI mode must keep the login action regardless of connected status");
      assert.equal(view.secrets().length, 0);
      if (authenticated) assert.match(view.status(), /Connected/);
      assert.deepEqual(view.forbiddenCalls, [], "rendering must not initiate login or read credentials");
    } finally { view.close(); }
  });
}

test("API-key mode retains its secret control instead of CLI login", () => {
  const view = fixture({ mode: "apikey", authenticated: true });
  try {
    assert.equal(view.mode(), "apikey");
    assert.ok(!view.buttons().includes("Run codex login"));
    assert.equal(view.secrets().length, 1);
    assert.equal(view.secrets()[0].props.label, "OpenAI API key");
    assert.deepEqual(view.forbiddenCalls, []);
  } finally { view.close(); }
});

test("ChatGPT mode retains its sign-in control instead of CLI login", () => {
  const view = fixture({ mode: "chatgpt", authenticated: true });
  try {
    assert.equal(view.mode(), "chatgpt");
    assert.ok(!view.buttons().includes("Run codex login"));
    assert.ok(view.buttons().includes("Sign in with ChatGPT"));
    assert.equal(view.secrets().length, 0);
    assert.deepEqual(view.forbiddenCalls, []);
  } finally { view.close(); }
});
