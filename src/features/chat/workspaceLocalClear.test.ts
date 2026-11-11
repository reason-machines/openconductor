import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { AppState, Workspace } from "../../state/types.ts";
import { emptyTabs } from "../terminal/tabs.ts";
import { DEFAULT_PR_SETTINGS } from "../pr/prSettings.ts";
import type { PullRequest } from "../pr/usePullRequest.ts";
import type { ComposerMinimize } from "./useComposerMinimize.ts";
import type { usePresence } from "../../components/motion/usePresence.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const noop = () => {};
const unsubscribe = () => noop;
const emptyMap = new Map();
const emptyTerminalTabs = emptyTabs();

/** Real Composer -> ChatPanel -> WorkspaceView and review-tab consumer; no CLI or native process. */
function fixture(agent: "claude" | "codex" | "reason", options: { secondary?: boolean; cap?: boolean; siblings?: boolean; shadow?: boolean; reject?: boolean; running?: boolean; defaultFast?: boolean; defaultPlan?: boolean } = {}) {
  const workspaceId = `clear-${agent}-${JSON.stringify(options)}`;
  const sibling = `${workspaceId}:chat:sibling`;
  const sourceId = options.secondary ? sibling : workspaceId;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  const requests: { command: string; args: Record<string, unknown> }[] = [];
  const providerCalls: unknown[][] = [];
  const notifications: string[] = [];
  let shellChat: { send: (text: string) => void; attach: (file: { name: string; text: string }) => void };
  const snapshots = new Map<string, unknown>();
  const oldTranscript = { messages: [{ id: "old", role: "user", text: "Keep this exact transcript", createdAt: "2026-11-01T00:00:00Z" }], turns: {}, activeTurn: options.running ? "in-progress" : null };
  const queue = { status: "idle", items: [], editingId: null, paused: false };
  const runtimeId = (id: string) => agent === "claude" ? `${id}:claude` : id;
  snapshots.set(runtimeId(sourceId), { transcript: oldTranscript, queue, permissions: [] });
  const snapshot = (id: string) => {
    if (!snapshots.has(id)) snapshots.set(id, { transcript: { messages: [], turns: {}, activeTurn: null }, queue, permissions: [] });
    return snapshots.get(id);
  };
  const agents = Object.fromEntries(["claude", "codex", "reason"].map((id) => [id, { id, label: id, canSteer: false, chatId: (chatId: string) => id === "claude" ? `${chatId}:claude` : chatId, snapshot, subscribe: unsubscribe, submit: (...args: unknown[]) => providerCalls.push(args), reset: (...args: unknown[]) => { providerCalls.push(["reset", ...args]); }, stop: noop, queueAction: noop }]));
  const settings = { models: { default: agent === "codex" ? "gpt-5.5" : "opus-4-8-1m", default_fast_mode: options.defaultFast ?? false, default_plan_mode: options.defaultPlan ?? false, claude_code: {}, codex: {} } };
  const extras = [...(options.secondary || options.cap || options.siblings ? [sibling] : []), ...(options.cap ? [1, 2, 3].map((i) => `${workspaceId}:chat:${i}`) : [])].map((id) => ({ id, title: id === sibling ? "Sibling" : id }));
  let db = { id: workspaceId, repositoryId: "repo", directoryName: "Test workspace", workspaceName: null, branch: "test", placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: "/synthetic/worktree", pinnedAt: null, unread: false, chatTabs: extras, chatTitle: "Original", prTitle: null, prDescription: null, number: null, createdAt: "2026-11-01T00:00:00Z", primaryChatId: workspaceId, activeSessionId: sourceId };
  let sequence = 0;
  const hidden = new Set<string>();
  async function invoke(command: string, args: Record<string, unknown> = {}) {
    requests.push({ command, args });
    if (command === "db_clear_local_chat") {
      if (options.reject) throw new Error("Synthetic clear rejected");
      assert.equal(args.workspaceId, workspaceId);
      assert.equal(args.chatId, db.activeSessionId);
      const id = `${workspaceId}:chat:replacement-${++sequence}`;
      hidden.add(String(args.chatId));
      const visible = [...[{ id: db.primaryChatId, title: db.chatTitle }, ...db.chatTabs].filter((t) => t.id !== args.chatId), { id, title: "Untitled" }];
      const [primary, ...chatTabs] = visible;
      db = { ...db, primaryChatId: primary.id, activeSessionId: id, chatTitle: primary.title, chatTabs };
      return { chatId: id, primaryChatId: db.primaryChatId, title: "Untitled" };
    }
    if (command === "db_select_chat") { db = { ...db, activeSessionId: String(args.chatId) }; return; }
    if (command === "db_open_chat_tab") {
      const id = String(args.chatId), title = String(args.title);
      db = id === db.primaryChatId ? { ...db, chatTitle: title } : { ...db, chatTabs: db.chatTabs.map((t) => t.id === id ? { ...t, title } : t) };
      return;
    }
    if (command === "db_list_workspaces") return [db];
    if (command === "db_list_repos") return [{ id: "repo", name: "Test", rootPath: "/synthetic/repo", remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: db.createdAt }];
    if (/^(claude_|codex_|chat_.*reset)/.test(command)) { providerCalls.push([command, args]); throw new Error(`Provider execution forbidden: ${command}`); }
    return undefined;
  }
  const component = ({ children }: { children?: unknown }) => children ?? null;
  const editor = ({ value, onChange, inputRef }: { value: string; onChange: (text: string) => void; inputRef: { current: unknown } }) => {
    inputRef.current = { composing: () => false, focus: noop, focused: () => false, visible: () => true, blur: noop };
    return React.createElement("textarea", { "aria-label": "Synthetic editor", value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) });
  };
  const prefs = { right_panel_visible: false, garry_mode: false };
  const backend = { inTauri: () => true, fuzzyFilterFiles: async () => [] };
  const overrides: Record<string, unknown> = {
    "src/backend": backend,
    "src/features/chat/reasonChat": { reasonAvailable: () => true, configureReasonDefault: noop, configureReason: noop, reasonChatConfig: async () => [] },
    "src/features/chat/chatRuntime": { chatStatuses: () => emptyMap, subscribeChatStatuses: unsubscribe, hideChat: noop, showChat: noop },
    "src/features/chat/codexChat": { CODEX_ACCESS: { full: { label: "Full access" } }, codexAccess: () => "full" },
    "src/features/chat/slashCompletions": { useAgentCommands: () => options.shadow ? { slashCommands: [{ name: "clear", description: "Agent override" }], skills: [] } : undefined },
    "src/features/chat/PermissionRequests": { PermissionRequests: () => null, pendingToolApproval: () => undefined },
    "src/features/chat/Transcript": { Transcript: ({ transcript }: { transcript: unknown }) => React.createElement("output", { "data-transcript": true }, JSON.stringify(transcript)) },
    "src/features/chat/ComposerEditor": { ComposerEditor: editor },
    "src/lib/local-storage": { composerDrafts: () => ({ load: async () => "", save: async () => {}, clear: async () => {} }) },
    "src/settings/api": { getSettings: async () => settings },
    "src/settings/appPrefs": { useAppPrefs: () => prefs },
    "src/settings/useBoolPref": { useBoolPref: () => false },
    "src/settings/useFollowUpMode": { useFollowUpMode: () => "steering" },
    "src/settings/agents/api": { listFavorites: async () => [] },
    "src/keybindings/KeybindingsProvider": { KeybindingScope: component, useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: noop },
    "src/keybindings/overrides": { effectiveShortcuts: () => [] },
    "src/keybindings/shortcut": { glyphs: () => "", matchesEvent: () => false },
    "src/components/ui/Tooltip": { Tooltip: component, ShortcutHint: () => null },
    "src/components/motion/usePresence": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} } satisfies ReturnType<typeof usePresence>) },
    "src/state/useAutoUnread": { useWindowFocused: () => false },
    "src/features/chat/useComposerMinimize": { useComposerMinimize: () => ({ minimized: false, animate: false, expand: noop, minimizeIfEmpty: noop } satisfies ComposerMinimize) },
    "src/features/terminal/session": { subscribeTabs: unsubscribe, getTabs: () => emptyTerminalTabs, onCenterTabOpened: unsubscribe },
    "src/features/browser/store": { subscribeBrowser: unsubscribe, browserSnapshot: () => ({ pages: emptyMap }) },
    "src/features/diff/useWorkspaceDiff": { useWorkspaceDiff: () => ({ openPath: noop, openTurnFile: noop, update: noop, files: [], scope: "all", loading: false, load: { state: "ready" } }) },
    "src/features/diff/ReviewComments": { useReviewComments: (_id: string, bridge: typeof shellChat) => { shellChat = bridge; return { hasPending: false }; } },
    "src/workspace/useSetupWatch": { useCreateSetupRunning: () => false },
    "src/workspace/archive": {},
    "src/workspace/api": {},
    "src/workspace/firstMessage": { renameAfterFirstMessage: noop },
    "src/workspace/link": {},
    "src/features/chat/forkWorkspace": {},
    "src/home/createFirstWorkspace": {},
    "src/features/diff/reviewApi": {},
    "src/settings/repoSettings": {},
    "src/scripts/api": {},
    "src/features/pr/useArchiveOnMerge": { useArchiveOnMerge: () => noop },
    "src/features/pr/workspaceSync": { useWorkspacePrSync: () => noop },
    "src/features/pr/usePullRequest": { usePullRequest: () => ({ lookup: null, pr: null, git: null, header: null, settings: DEFAULT_PR_SETTINGS, error: null, refresh: async () => {} } satisfies PullRequest) },
    "src/features/pr/useTargetBranch": { useTargetBranch: () => ({ branch: "main", disabledReason: null, changing: false }) },
    "src/features/pr/usePrActions": { usePrActions: () => ({}) },
    "src/features/pr/checks/useFixErrors": { useFixErrors: () => ({}) },
    "src/features/pr/usePullLatest": { usePullLatest: () => ({ shortcut: noop }) },
  };
  const modules = new Map<string, Record<string, unknown>>();
  const actualTsx = new Set(["src/components/WorkspaceView", "src/features/chat/Composer", "src/features/diff/ReviewButton"]);
  function load(filename: string): Record<string, unknown> {
    const key = filename.slice(root.length).replace(/\.(tsx?|css)$/, "");
    if (key === "src/features/chat/agents") return { ...load(resolve(root, "src/features/chat/agentChoice.ts")), CHAT_AGENTS: agents };
    if (overrides[key]) return overrides[key] as Record<string, unknown>;
    if (filename.endsWith(".css")) return {};
    if (filename.endsWith(".tsx") && !actualTsx.has(key)) return new Proxy({}, { get: () => component });
    const cached = modules.get(filename);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    modules.set(filename, exports);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, console, localStorage: storage, setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, TextDecoder, window: { location: { search: "", pathname: "/" }, addEventListener: noop, removeEventListener: noop }, navigator: { clipboard: { writeText: async () => {} } }, require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "@tauri-apps/api/core") return { invoke, isTauri: () => true };
      if (name === "@tauri-apps/api/event") return { listen: async () => noop };
      if (!name.startsWith(".")) return dependencies(name);
      const base = resolve(dirname(filename), name);
      const path = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
      assert.ok(path, `Missing fixture module ${name} from ${filename}`);
      return load(path);
    } });
    return exports;
  }
  let app = load(resolve(root, "src/state/store.ts"));
  let persisted = load(resolve(root, "src/state/persisted.ts"));
  let openChat = load(resolve(root, "src/state/openChat.ts"));
  const choice = load(resolve(root, "src/features/chat/chatModelChoice.ts"));
  const agentChoice = load(resolve(root, "src/features/chat/agentChoice.ts"));
  let view = load(resolve(root, "src/components/WorkspaceView.tsx"));
  // These exports are produced by the actual transpiled modules, not stand-ins.
  let fromRow = persisted.workspaceFromRow as (row: unknown) => Workspace;
  let restoreTabs = persisted.restoreChatTabsOf as (rows: unknown[]) => void;
  const saveAgent = agentChoice.saveAgent as (id: string, agent: string) => void;
  const saveChoice = choice.saveModelChoice as (id: string, value: unknown) => void;
  restoreTabs([db]);
  saveAgent(sourceId, agent);
  saveChoice(sourceId, { agent, model: settings.models.default, effort: "high", fast: true });
  let state: AppState = { repos: [{ id: "repo", name: "Test", path: "/synthetic/repo", defaultBranch: "main", workspaces: [fromRow(db)] }], selection: { kind: "workspace", repoId: "repo", workspaceId } };
  let renderer: ReturnType<typeof create>;
  function Host() {
    const [current, dispatch] = React.useReducer(app.reducer, state);
    state = current;
    return React.createElement(view.WorkspaceView, { repo: current.repos[0], workspace: current.repos[0].workspaces[0], dispatch, notify: (_kind: string, text: string) => notifications.push(text) });
  }
  async function mount() { await act(async () => { renderer = create(React.createElement(Host)); }); }
  return {
    workspaceId, sourceId, sibling, requests, providerCalls, hidden, oldTranscript, snapshots, runtimeId, storage, notifications,
    mount,
    async submit(text = "/clear") {
      await act(async () => { renderer.root.findByProps({ "aria-label": "Synthetic editor" }).props.onChange({ target: { value: text } }); });
      await act(async () => { renderer.root.findByType("form").props.onSubmit({ preventDefault: noop }); });
    },
    selected: () => (openChat.workspaceChats as (id: string) => string[])(workspaceId),
    transcript: () => renderer.root.findAllByProps({ "data-transcript": true }).map((r: { props: { children: string } }) => r.props.children).join(""),
    text: () => JSON.stringify(renderer.toJSON()),
    db: () => db,
    async shellSend(text: string) {
      await act(async () => shellChat.send(text));
      assert.equal(providerCalls.at(-1)?.[0], db.primaryChatId, "programmatic shell send targets the shell primary independently of the composer draft");
      assert.match(JSON.stringify(renderer.toJSON()), /shell[.]txt/, "shell attachment is staged in the primary composer");
      await act(async () => { renderer.root.findByProps({ "aria-label": "Synthetic editor" }).props.onChange({ target: { value: text } }); });
      await act(async () => { renderer.root.findByType("form").props.onSubmit({ preventDefault: noop }); });
    },
    async shellAttach() { await act(async () => shellChat.attach({ name: "shell.txt", text: "Shell attachment" })); },
    selectedId: () => renderer.root.find((node: { type: { name?: string } }) => node.type.name === "ChatPanel").props.chatId,
    choice: (id: string) => JSON.parse(storage.getItem(`openconductor.composer.model.${id}`) ?? "null"),
    async select(id: string) {
      const title = id === db.primaryChatId ? db.chatTitle : db.chatTabs.find((t) => t.id === id)?.title;
      const tab = renderer.root.findAllByProps({ role: "tab" }).find((node: { props: { children: unknown } }) => JSON.stringify(node.props.children).includes(JSON.stringify(title)));
      assert.ok(tab, `Missing rendered chat tab ${id}`);
      await act(async () => tab.props.onClick());
    },
    async rename(id: string, title: string) {
      const menu = renderer.root.find((node: { type: { name?: string } }) => node.type.name === "MainTabs").props.chatMenu(id, "Old title");
      await act(async () => menu.rename());
      const dialog = renderer.root.find((node: { props: { currentTitle?: string } }) => node.props.currentTitle === "Old title");
      await act(async () => dialog.props.onRename(title));
    },
    async reload() {
      await act(async () => renderer.unmount());
      modules.clear();
      app = load(resolve(root, "src/state/store.ts"));
      persisted = load(resolve(root, "src/state/persisted.ts"));
      openChat = load(resolve(root, "src/state/openChat.ts"));
      view = load(resolve(root, "src/components/WorkspaceView.tsx"));
      fromRow = persisted.workspaceFromRow as (row: unknown) => Workspace;
      restoreTabs = persisted.restoreChatTabsOf as (rows: unknown[]) => void;
      restoreTabs([db]);
      state = { ...state, repos: [{ ...state.repos[0], workspaces: [fromRow(db)] }] };
      await mount();
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const agent of ["claude", "codex"] as const) {
  test(`mounted ${agent} /clear replaces the idle primary, preserving history and reload identity`, async () => {
    const f = fixture(agent);
    await f.mount();
    try {
      const before = JSON.stringify(f.oldTranscript);
      await f.submit();
      const clear = f.requests.filter((r) => r.command === "db_clear_local_chat");
      assert.equal(clear.length, 1, "mounted /clear must reach the replacement operation, not the unavailable alert");
      assert.notEqual(f.db().activeSessionId, f.sourceId);
      assert.equal(f.db().primaryChatId, f.db().activeSessionId);
      assert.equal(f.hidden.has(f.sourceId), true);
      assert.equal(JSON.stringify(f.oldTranscript), before);
      assert.doesNotMatch(f.text(), /is not available/);
      assert.doesNotMatch(f.transcript(), /Keep this exact transcript/);
      assert.equal(f.providerCalls.length, 0, "clear alone must not open, prompt or reset a provider");
      await f.reload();
      assert.doesNotMatch(f.transcript(), /Keep this exact transcript/);
      assert.equal(f.selected()[0], f.db().primaryChatId);
      assert.equal(f.selectedId(), f.db().activeSessionId);
      assert.equal(f.choice(f.db().activeSessionId).model, agent === "codex" ? "gpt-5.5" : "opus-4-8-1m");
      assert.equal(f.choice(f.db().activeSessionId).effort, "high");
      assert.equal(f.choice(f.db().activeSessionId).fast, false);
      const replacement = f.db().activeSessionId;
      await f.rename(replacement, "Replacement renamed");
      await f.reload();
      assert.equal(f.db().chatTitle, "Replacement renamed");
      assert.match(f.text(), /Replacement renamed/);
      assert.doesNotMatch(f.text(), /Original/);
      await f.submit("Follow-up");
      assert.equal(f.providerCalls.at(-1)?.[0], f.runtimeId(replacement));
    } finally { f.dispose(); }
  });

  for (const secondary of [false, true]) {
    test(`mounted ${agent} /clear at cap preserves sibling order and selected identity (secondary=${secondary})`, async () => {
      const f = fixture(agent, { cap: true, secondary });
      await f.mount();
      try {
        assert.equal(f.selectedId(), f.sourceId);
        await f.submit();
        const replacement = f.db().activeSessionId;
        const primary = secondary ? f.workspaceId : f.sibling;
        assert.equal(f.selectedId(), replacement);
        assert.equal(f.selected()[0], primary);
        assert.equal(f.selected().at(-1), replacement);
        assert.equal(f.selected().length, 5);
        assert.equal(new Set(f.selected()).size, 5);
        assert.equal(f.providerCalls.length, 0);
        await f.reload();
        assert.equal(f.selectedId(), replacement);
        assert.equal(f.selected()[0], primary);
        assert.equal(f.selected().at(-1), replacement);
        await f.select(primary);
        assert.equal(f.selectedId(), primary);
        await f.select(replacement);
        assert.equal(f.selected()[0], primary, "selecting a secondary must not promote it");
        await f.submit();
        const repeated = f.db().activeSessionId;
        assert.notEqual(repeated, replacement);
        assert.equal(f.selectedId(), repeated);
        assert.equal(f.selected()[0], primary);
        assert.equal(f.selected().at(-1), repeated);
        assert.equal(f.selected().length, 5);
        await f.reload();
        assert.equal(f.selectedId(), repeated);
        assert.equal(f.selected()[0], primary);
        await f.submit("Selected follow-up");
        assert.equal(f.providerCalls.at(-1)?.[0], f.runtimeId(repeated));
        await f.shellAttach();
        assert.equal(f.selectedId(), primary);
        await f.shellSend("Shell follow-up");
        assert.equal(f.providerCalls.at(-1)?.[0], primary, "shell-primary actions target the oldest visible sibling, not the selected replacement");
        assert.match(JSON.stringify(f.providerCalls.at(-1)), /Shell attachment/);
        assert.equal(f.hidden.has(f.sourceId), true);
        assert.equal(f.hidden.has(replacement), true);
        assert.equal(f.oldTranscript.messages[0].text, "Keep this exact transcript");
      } finally { f.dispose(); }
    });
  }

  test(`mounted ${agent} /clear uses creation Fast defaults instead of copying the source`, async () => {
    const f = fixture(agent, { defaultFast: true });
    await f.mount();
    try {
      await f.submit();
      assert.equal(f.choice(f.db().activeSessionId).fast, true);
      assert.equal(f.providerCalls.length, 0);
    } finally { f.dispose(); }
  });

  test(`mounted ${agent} /clear rejection retains the selected transcript`, async () => {
    const f = fixture(agent, { reject: true });
    await f.mount();
    try {
      await f.submit();
      assert.equal(f.selectedId(), f.sourceId);
      assert.match(f.transcript(), /Keep this exact transcript/);
      assert.match(f.text(), /Synthetic clear rejected/);
      assert.equal(f.hidden.size, 0);
      assert.equal(f.providerCalls.length, 0);
    } finally { f.dispose(); }
  });

  test(`mounted ${agent} same-name command shadows built-in /clear`, async () => {
    const f = fixture(agent, { shadow: true });
    await f.mount();
    try {
      await f.submit();
      assert.equal(f.requests.filter((r) => r.command === "db_clear_local_chat").length, 0);
      assert.equal(f.selectedId(), f.sourceId);
      assert.equal(f.providerCalls.length, 1);
    } finally { f.dispose(); }
  });
}
