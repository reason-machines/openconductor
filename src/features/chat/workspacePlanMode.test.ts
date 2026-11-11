import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { emptyTabs } from "../terminal/tabs.ts";
import { DEFAULT_PR_SETTINGS } from "../pr/prSettings.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const noop = () => {};
const unsubscribe = () => noop;
const emptyMap = new Map();
const tabs = emptyTabs();
type Mode = "default" | "plan";

function fixture(agent = "claude", initial: Mode = "default", reject = false, busy = false) {
  const chatId = "plan-workspace";
  const saved = new Map<string, Mode>([[chatId, initial]]);
  const writes: { chatId: string; mode: Mode }[] = [];
  const keys = new Map<string, () => unknown>();
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  const snapshot = { transcript: { messages: [], turns: {}, activeTurn: busy ? "turn" : null }, queue: { status: busy ? "working" : "idle", items: [], editingId: null, paused: false }, permissions: [] };
  const agents = Object.fromEntries(["claude", "codex", "reason"].map((id) => [id, { id, canSteer: false, chatId: (id: string) => id, snapshot: () => snapshot, subscribe: unsubscribe, submit: () => { throw new Error("Provider execution forbidden"); }, stop: noop, queueAction: noop }]));
  const row = { id: chatId, repositoryId: "repo", directoryName: "Test", workspaceName: null, branch: "test", placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: "/synthetic/worktree", pinnedAt: null, unread: false, chatTabs: [], chatTitle: "Original", prTitle: null, prDescription: null, number: null, createdAt: "2026-11-01T00:00:00Z", primaryChatId: chatId, activeSessionId: chatId };
  const component = ({ children }: { children?: unknown }) => children ?? null;
  const backend = { inTauri: () => true, fuzzyFilterFiles: async () => [] };
  const modules = new Map<string, Record<string, unknown>>();
  const overrides: Record<string, unknown> = {
    "src/backend": backend,
    "src/features/chat/reasonChat": { reasonAvailable: () => true, configureReasonDefault: noop, configureReason: noop, reasonChatConfig: async () => [] },
    "src/features/chat/chatRuntime": { chatStatuses: () => emptyMap, subscribeChatStatuses: unsubscribe, hideChat: noop, showChat: noop },
    "src/features/chat/codexChat": { CODEX_ACCESS: { full: { label: "Full access" } }, codexAccess: () => "full" },
    "src/features/chat/slashCompletions": { useAgentCommands: () => undefined },
    "src/features/chat/Transcript": { Transcript: component },
    "src/features/chat/ComposerEditor": { ComposerEditor: ({ value, onChange, inputRef }: { value: string; onChange: (text: string) => void; inputRef: { current: unknown } }) => {
      inputRef.current = { composing: () => false, focus: noop, focused: () => false, visible: () => true, blur: noop };
      return React.createElement("textarea", { "aria-label": "Synthetic editor", value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) });
    } },
    "src/lib/local-storage": { composerDrafts: () => ({ load: async () => "", save: async () => {}, clear: async () => {} }) },
    "src/settings/api": { getSettings: async () => ({ models: { default: "opus-4-8-1m", default_fast_mode: false, default_plan_mode: false, claude_code: {}, codex: {} } }) },
    "src/settings/appPrefs": { useAppPrefs: () => ({ right_panel_visible: false, garry_mode: false }) },
    "src/settings/useBoolPref": { useBoolPref: () => false },
    "src/settings/useFollowUpMode": { useFollowUpMode: () => "steering" },
    "src/settings/agents/api": { listFavorites: async () => [] },
    "src/keybindings/KeybindingsProvider": { KeybindingScope: component, useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: (handlers: Record<string, (() => unknown) | undefined>) => {
      const latest = React.useRef(handlers); latest.current = handlers;
      const ids = Object.keys(handlers).filter((id) => handlers[id]).sort().join("\n");
      React.useEffect(() => {
        const registered = new Map(ids.split("\n").filter(Boolean).map((id) => [id, () => latest.current[id]?.()]));
        for (const [id, handler] of registered) keys.set(id, handler);
        return () => { for (const [id, handler] of registered) if (keys.get(id) === handler) keys.delete(id); };
      }, [ids]);
    } },
    "src/keybindings/overrides": { effectiveShortcuts: () => [] },
    "src/keybindings/shortcut": { glyphs: () => "", matchesEvent: () => false },
    "src/components/ui/Tooltip": { Tooltip: component, ShortcutHint: () => null },
    "src/components/motion/usePresence": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "src/state/useAutoUnread": { useWindowFocused: () => false },
    "src/features/chat/useComposerMinimize": { useComposerMinimize: () => ({ minimized: false, animate: false, expand: noop, minimizeIfEmpty: noop }) },
    "src/features/terminal/session": { subscribeTabs: unsubscribe, getTabs: () => tabs, onCenterTabOpened: unsubscribe },
    "src/features/browser/store": { subscribeBrowser: unsubscribe, browserSnapshot: () => ({ pages: emptyMap }) },
    "src/features/diff/useWorkspaceDiff": { useWorkspaceDiff: () => ({ openPath: noop, openTurnFile: noop, update: noop, files: [], scope: "all", loading: false, load: { state: "ready" } }) },
    "src/features/diff/ReviewComments": { useReviewComments: () => ({ hasPending: false }) },
    "src/workspace/useSetupWatch": { useCreateSetupRunning: () => false },
    "src/workspace/archive": {}, "src/workspace/api": {}, "src/workspace/link": {}, "src/features/chat/forkWorkspace": {}, "src/home/createFirstWorkspace": {}, "src/features/diff/reviewApi": {}, "src/settings/repoSettings": {}, "src/scripts/api": {},
    "src/workspace/firstMessage": { renameAfterFirstMessage: noop },
    "src/features/pr/useArchiveOnMerge": { useArchiveOnMerge: () => noop },
    "src/features/pr/workspaceSync": { useWorkspacePrSync: () => noop },
    "src/features/pr/usePullRequest": { usePullRequest: () => ({ lookup: null, pr: null, git: null, header: null, settings: DEFAULT_PR_SETTINGS, error: null, refresh: async () => {} }) },
    "src/features/pr/useTargetBranch": { useTargetBranch: () => ({ branch: "main", disabledReason: null, changing: false }) },
    "src/features/pr/usePrActions": { usePrActions: () => ({}) },
    "src/features/pr/checks/useFixErrors": { useFixErrors: () => ({}) },
    "src/features/pr/usePullLatest": { usePullLatest: () => ({ shortcut: noop }) },
  };
  async function invoke(command: string, args: { chatId: string; mode: Mode }) {
    if (command === "local_plan_mode_get") return saved.get(args.chatId) ?? "default";
    if (command === "local_plan_mode_set") {
      if (reject) throw new Error("Synthetic mode save rejected");
      saved.set(args.chatId, args.mode); writes.push(args); return args.mode;
    }
    if (/^(claude_|codex_|chat_)/.test(command)) throw new Error("Provider execution forbidden: " + command);
    return undefined;
  }
  const actual = new Set(["src/components/WorkspaceView", "src/features/chat/Composer", "src/features/diff/ReviewButton"]);
  function load(filename: string): Record<string, unknown> {
    const key = filename.slice(root.length).replace(/\.(tsx?|css)$/, "");
    if (key === "src/features/chat/agents") return { ...load(resolve(root, "src/features/chat/agentChoice.ts")), CHAT_AGENTS: agents };
    if (overrides[key]) return overrides[key] as Record<string, unknown>;
    if (filename.endsWith(".css")) return {};
    if (filename.endsWith(".tsx") && !actual.has(key)) return new Proxy({}, { get: () => component });
    const cached = modules.get(filename); if (cached) return cached;
    const exports: Record<string, unknown> = {}; modules.set(filename, exports);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, console, localStorage: storage, setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, TextDecoder, window: { location: { search: "", pathname: "/" }, addEventListener: noop, removeEventListener: noop }, navigator: { clipboard: { writeText: async () => {} } }, require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "@tauri-apps/api/core") return { invoke, isTauri: () => true };
      if (name === "@tauri-apps/api/event") return { listen: async () => noop };
      if (!name.startsWith(".")) return dependencies(name);
      const base = resolve(dirname(filename), name);
      const path = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
      assert.ok(path, `Missing fixture module ${name} from ${filename}`); return load(path);
    } });
    return exports;
  }
  const app = load(resolve(root, "src/state/store.ts"));
  const persisted = load(resolve(root, "src/state/persisted.ts"));
  const choice = load(resolve(root, "src/features/chat/agentChoice.ts"));
  const view = load(resolve(root, "src/components/WorkspaceView.tsx"));
  (persisted.restoreChatTabsOf as (rows: unknown[]) => void)([row]);
  (choice.saveAgent as (id: string, value: string) => void)(chatId, agent);
  const workspace = (persisted.workspaceFromRow as (row: unknown) => unknown)(row);
  let renderer: ReturnType<typeof create>;
  function Host() {
    const [state, dispatch] = React.useReducer(app.reducer, { repos: [{ id: "repo", name: "Test", path: "/synthetic/repo", defaultBranch: "main", workspaces: [workspace] }], selection: { kind: "workspace", repoId: "repo", workspaceId: chatId } });
    return React.createElement(view.WorkspaceView, { repo: state.repos[0], workspace: state.repos[0].workspaces[0], dispatch });
  }
  return {
    writes, saved, keys, chatId,
    async mount() { await act(async () => { renderer = create(React.createElement(Host)); }); },
    async menu(label: string) { await act(async () => renderer.root.findByProps({ "aria-label": "Add" }).props.onClick()); return renderer.root.findAllByProps({ role: "menuitem" }).find((node: { findAllByType: (type: string) => { children: unknown[] }[] }) => node.findAllByType("span").some((span) => span.children.includes(label))); },
    async click(callback: () => unknown) { await act(async () => { await callback(); }); },
    async command(text: string) { await act(async () => { const input = renderer.root.findByProps({ "aria-label": "Synthetic editor" }); input.props.onChange({ target: { value: text } }); }); await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: noop })); },
    text: () => JSON.stringify(renderer.toJSON()),
    async dispose() { await act(async () => renderer.unmount()); },
  };
}

for (const action of ["menu", "slash", "shortcut"] as const) {
  test(`local Claude Plan ${action} persists the selected chat's mode`, async () => {
    const f = fixture(); await f.mount();
    try {
      if (action === "menu") { const item = await f.menu("Plan mode"); assert.ok(item, "local Claude must expose Plan mode"); await f.click(item.props.onClick); }
      else if (action === "slash") await f.command("/plan");
      else { const toggle = f.keys.get("chat.togglePlanMode"); assert.ok(toggle, "Plan shortcut must be registered"); await f.click(toggle); }
      assert.equal(f.saved.get(f.chatId), "plan");
      assert.equal(f.writes.length, 1);
      assert.equal(f.writes[0].chatId, f.chatId, "persist logical chat ID, not provider alias");
    } finally { await f.dispose(); }
  });
}

test("a saved Claude Plan mode is read back and exits to default", async () => {
  const f = fixture("claude", "plan"); await f.mount();
  try { const item = await f.menu("Exit plan mode"); assert.ok(item, "persisted Plan mode must survive remount"); await f.click(item.props.onClick); assert.equal(f.saved.get(f.chatId), "default"); }
  finally { await f.dispose(); }
});

test("failed mode persistence retains the confirmed state and reports the error", async () => {
  const f = fixture("claude", "default", true); await f.mount();
  try { const item = await f.menu("Plan mode"); assert.ok(item); await f.click(item.props.onClick); assert.equal(f.saved.get(f.chatId), "default"); assert.match(f.text(), /Synthetic mode save rejected/); }
  finally { await f.dispose(); }
});

for (const agent of ["reason", "codex"]) {
  test(`${agent} does not claim a local Plan capability`, async () => {
    const f = fixture(agent); await f.mount();
    try { assert.equal(await f.menu("Plan mode"), undefined); }
    finally { await f.dispose(); }
  });
}

test("busy Claude cannot change Plan mode", async () => {
  const f = fixture("claude", "default", false, true); await f.mount();
  try { const item = await f.menu("Plan mode"); assert.ok(item); assert.equal(item.props.disabled, true); const toggle = f.keys.get("chat.togglePlanMode"); if (toggle) await f.click(toggle); assert.equal(f.writes.length, 0); }
  finally { await f.dispose(); }
});
