import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

assert.ok(process.env.OPENCONDUCTOR_SOURCE_ROOT, "Set OPENCONDUCTOR_SOURCE_ROOT to the admitted clean checkout, never the frozen source branch");
const root = resolve(process.env.OPENCONDUCTOR_SOURCE_ROOT);
const sourcePolicy = JSON.parse(readFileSync(new URL("./static-import-closure.json", import.meta.url), "utf8"));
const decorativeTsx = new Set(sourcePolicy.decorative_tsx);
const dependencies = createRequire(resolve(root, "package.json"));
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const noop = () => {};
const unsubscribe = () => noop;
const stamp = "2026-11-01T00:00:00Z";

export function fixture({ kind = "Read", garry = false } = {}) {
  const workspaceId = "closed-fixture-w1";
  const foreignWorkspaceId = "closed-fixture-w2";
  const sourceId = `${workspaceId}:chat:source`;
  const targetId = `${workspaceId}:chat:target`;
  const foreignSourceId = `${foreignWorkspaceId}:chat:source`;
  const sourceTitle = "Source investigation";
  const targetTitle = "Empty target";
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const nativeCalls = [];
  const boundaryErrors = [];
  const forbiddenCalls = [];
  const hidden = new Set();
  const bindings = new Map();
  const modules = new Map();
  const emptyMap = new Map();
  const queue = { status: "idle", items: [], editingId: null, paused: false };
  const transcript = (id) => {
    const turnId = `${id}:turn`;
    const toolId = `${id}:tool`;
    const token = id === sourceId ? "BODY_A" : id === targetId ? "BODY_B" : "BODY_PRIMARY";
    const input = kind === "ExitPlanMode" ? { plan: token } : { file_path: `/synthetic/${token}.txt` };
    return {
      sessionId: id, activeTurn: turnId, turns: { [turnId]: { status: "running", startedAt: stamp } },
      messages: [
        { id: `${id}:assistant`, sessionId: id, turnId, role: "assistant", createdAt: stamp, blocks: [{ type: "tool_use", id: toolId, name: kind, input }] },
        { id: `${id}:result`, sessionId: id, turnId, role: "user", createdAt: stamp, blocks: [{ type: "tool_result", toolUseId: toolId, content: token }] },
      ],
    };
  };
  const transcripts = new Map([workspaceId, targetId, sourceId, foreignWorkspaceId, foreignSourceId].map((id) => [id, transcript(id)]));
  const snapshot = (id) => {
    assert.ok(transcripts.has(id), `Unexpected provider snapshot ${id}`);
    return { transcript: transcripts.get(id), queue, permissions: [] };
  };
  const forbidden = (...args) => { forbiddenCalls.push(args); throw new Error("Provider execution is outside this fixture"); };
  const snapshotSubscribers = new Map();
  function subscribeSnapshot(id, callback) {
    const listeners = snapshotSubscribers.get(id) ?? new Set();
    listeners.add(callback);
    snapshotSubscribers.set(id, listeners);
    return () => { listeners.delete(callback); };
  }
  const agents = Object.fromEntries(["claude", "codex", "reason"].map((id) => [id, { id, label: id, canSteer: false, chatId: (id) => id, snapshot, subscribe: subscribeSnapshot, submit: forbidden, stop: forbidden, queueAction: forbidden }]));
  const settings = { models: { default: "opus-4-8-1m", default_fast_mode: false, default_plan_mode: false, claude_code: {}, codex: {} } };
  const repoRow = { id: "repo", name: "Fixture repo", rootPath: "/synthetic/repo", remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: stamp };
  const row = (id, title, chatTabs) => ({ id, repositoryId: "repo", directoryName: id, workspaceName: null, branch: "test", placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: `/synthetic/${id}`, pinnedAt: null, unread: false, chatTabs, chatTitle: title, primaryChatId: id, activeSessionId: id, prTitle: null, prDescription: null, number: null, createdAt: stamp });
  const rows = [row(workspaceId, "Primary empty", [{ id: sourceId, title: sourceTitle }, { id: targetId, title: targetTitle }]), row(foreignWorkspaceId, "Foreign empty", [])];
  const allStoredTabs = new Map(rows.flatMap((r) => r.chatTabs.map((tab) => [tab.id, { ...tab, workspaceId: r.id }])));
  let appPrefs;
  let nativePrefs;
  const draftStore = { load: async () => "", save: async () => {}, clear: async () => {} };
  const selectedCall = (workspaceId, chatId) => ({ command: "db_select_chat", args: JSON.stringify({ workspaceId, chatId }) });
  async function invoke(command, args) {
    nativeCalls.push({ command, args: JSON.stringify(args) });
    try { return await invokeBoundary(command, args); }
    catch (error) { boundaryErrors.push(String(error)); throw error; }
  }
  async function invokeBoundary(command, args) {
    if (command === "get_app_prefs") { assert.equal(args, undefined); return structuredClone(nativePrefs); }
    if (command === "set_app_pref") {
      assert.deepEqual(Object.keys(args), ["update"]);
      assert.equal(args.update.key, "garry_mode");
      assert.equal(typeof args.update.value, "boolean");
      nativePrefs = { ...nativePrefs, garry_mode: args.update.value };
      return structuredClone(nativePrefs);
    }
    if (command === "db_list_repos") { assert.equal(args, undefined); return [repoRow]; }
    if (command === "db_list_workspaces") { assert.equal(args, undefined); return structuredClone(rows); }
    if (command === "db_select_chat") {
      assert.deepEqual(Object.keys(args).sort(), ["chatId", "workspaceId"]);
      const r = rows.find((r) => r.id === args.workspaceId);
      assert.ok(r && (args.chatId === r.primaryChatId || r.chatTabs.some((tab) => tab.id === args.chatId)));
      r.activeSessionId = args.chatId;
      return;
    }
    if (command === "db_close_chat_tab") {
      assert.deepEqual(Object.keys(args), ["chatId"]);
      assert.ok(allStoredTabs.has(args.chatId));
      hidden.add(args.chatId);
      for (const r of rows) r.chatTabs = r.chatTabs.filter((tab) => tab.id !== args.chatId);
      return;
    }
    if (command === "db_open_chat_tab") {
      assert.deepEqual(Object.keys(args).sort(), ["chatId", "title", "workspaceId"]);
      const stored = allStoredTabs.get(args.chatId);
      assert.ok(stored && stored.workspaceId === args.workspaceId);
      assert.equal(args.title, stored.title);
      hidden.delete(args.chatId);
      const r = rows.find((r) => r.id === args.workspaceId);
      r.chatTabs = [...r.chatTabs.filter((tab) => tab.id !== args.chatId), { id: args.chatId, title: args.title }];
      return;
    }
    throw new Error(`Unbound native command ${command}; candidate read APIs require explicit review before freezing`);
  }
  const component = ({ children }) => children ?? null;
  const editor = ({ value, onChange, inputRef }) => {
    inputRef.current = { composing: () => false, focus: noop, focused: () => false, visible: () => true, blur: noop };
    return React.createElement("textarea", { "aria-label": "Synthetic editor", value, onChange: (e) => onChange(e.target.value) });
  };
  function useKeybindings(callbacks) {
    const current = React.useRef(callbacks);
    current.current = callbacks;
    const token = React.useRef(Symbol("registration"));
    React.useEffect(() => { bindings.set(token.current, current); return () => bindings.delete(token.current); }, []);
  }
  const overrides = {
    "src/backend": { inTauri: () => true, fuzzyFilterFiles: async () => [] },
    "src/features/chat/reasonChat": { reasonAvailable: () => true, configureReasonDefault: noop, configureReason: noop, reasonChatConfig: async () => [] },
    "src/features/chat/chatRuntime": { chatStatuses: () => emptyMap, subscribeChatStatuses: unsubscribe, hideChat: noop, showChat: noop },
    "src/features/chat/codexChat": { CODEX_ACCESS: { full: { label: "Full access" } }, codexAccess: () => "full" },
    "src/features/chat/slashCompletions": { useAgentCommands: () => undefined },
    "src/features/chat/PermissionRequests": { PermissionRequests: () => null, ToolApproval: forbidden, pendingToolApproval: () => undefined },
    "src/features/chat/ComposerEditor": { ComposerEditor: editor },
    "src/features/chat/McpStatusDialog": { McpStatusDialog: forbidden },
    "src/lib/local-storage": { composerDrafts: () => draftStore },
    "src/settings/api": { getSettings: async () => settings },
    "src/settings/useBoolPref": { useBoolPref: () => false },
    "src/features/chat/markdown": { Markdown: ({ text }) => React.createElement("span", { "data-markdown-decoration": true }, text), highlight: (_language, text) => text },
    "src/features/chat/LinkMenu": { LinkMenuNotify: React.createContext(undefined), LinkWithMenu: ({ children, ...props }) => React.createElement("a", props, children) },
    "src/features/chat/TranscriptSearch": { TranscriptSearch: ({ children }) => children },
    "src/settings/useFollowUpMode": { useFollowUpMode: () => "steering" },
    "src/settings/agents/api": { listFavorites: async () => [] },
    "src/keybindings/KeybindingsProvider": { KeybindingScope: component, useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings },
    "src/keybindings/overrides": { effectiveShortcuts: () => [] },
    "src/keybindings/shortcut": { glyphs: () => "", matchesEvent: () => false },
    "src/components/ui/Tooltip": { Tooltip: component, ShortcutHint: () => null },
    "src/components/motion/usePresence": { usePresence: (open) => ({ mounted: open, attrs: {} }) },
    "src/state/useAutoUnread": { useWindowFocused: () => false },
    "src/features/chat/useComposerMinimize": { useComposerMinimize: () => ({ minimized: false, animate: false, expand: noop, minimizeIfEmpty: noop }) },
    "src/features/terminal/session": { subscribeTabs: unsubscribe, getTabs: () => terminalTabs, onCenterTabOpened: unsubscribe },
    "src/features/browser/store": { subscribeBrowser: unsubscribe, browserSnapshot: () => ({ pages: emptyMap }) },
    "src/features/diff/useWorkspaceDiff": { useWorkspaceDiff: () => ({ openPath: noop, openTurnFile: noop, update: noop, files: [], scope: "all", loading: false, load: { state: "ready" } }) },
    "src/features/diff/ReviewComments": { useReviewComments: () => ({ hasPending: false }) },
    "src/workspace/useSetupWatch": { useCreateSetupRunning: () => false },
    "src/workspace/archive": {}, "src/workspace/api": {}, "src/workspace/link": {},
    "src/workspace/firstMessage": { renameAfterFirstMessage: forbidden },
    "src/features/chat/forkWorkspace": {}, "src/home/createFirstWorkspace": {},
    "src/features/diff/reviewApi": {}, "src/settings/repoSettings": {}, "src/scripts/api": {},
    "src/features/pr/useArchiveOnMerge": { useArchiveOnMerge: () => noop },
    "src/features/pr/workspaceSync": { useWorkspacePrSync: () => noop },
    "src/features/pr/usePullRequest": { usePullRequest: () => ({ lookup: null, pr: null, git: null, header: null, settings: prSettings, error: null, refresh: async () => {} }) },
    "src/features/pr/useTargetBranch": { useTargetBranch: () => ({ branch: "main", disabledReason: null, changing: false }) },
    "src/features/pr/usePrActions": { usePrActions: () => ({}) },
    "src/features/pr/checks/useFixErrors": { useFixErrors: () => ({}) },
    "src/features/pr/usePullLatest": { PullLatestButton: () => null, usePullLatest: () => ({ shortcut: noop }) },
  };
  const actualTsx = new Set(["src/components/WorkspaceView", "src/features/chat/ChatEmptyState", "src/features/chat/Composer", "src/features/diff/ReviewButton", "src/features/chat/Transcript", "src/features/chat/ToolRows"]);
  function load(filename) {
    const key = filename.slice(root.length + 1).replace(/\.(tsx?|css)$/, "");
    if (key === "src/features/chat/agents") return { ...load(resolve(root, "src/features/chat/agentChoice.ts")), CHAT_AGENTS: agents };
    if (overrides[key]) return overrides[key];
    if (filename.endsWith(".css")) return {};
    if (filename.endsWith(".tsx") && !actualTsx.has(key)) {
      assert.ok(decorativeTsx.has(key), `New TSX loader dependency must be classified explicitly: ${key}`);
      return new Proxy({}, { get: () => component });
    }
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const sourceFile = key === "src/features/chat/Transcript" && process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE
      ? resolve(process.env.DISCLOSURE_TRANSCRIPT_SOURCE_FILE)
      : filename;
    const source = ts.transpileModule(readFileSync(sourceFile, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, console, localStorage: storage, structuredClone, setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, TextDecoder, window: { location: { search: "", pathname: "/" }, addEventListener: noop, removeEventListener: noop }, navigator: { clipboard: { writeText: forbidden } }, require(name) {
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
  appPrefs = load(resolve(root, "src/settings/appPrefs.ts"));
  nativePrefs = { ...appPrefs.DEFAULT_APP_PREFS, right_panel_visible: false, garry_mode: garry };
  const { emptyTabs } = load(resolve(root, "src/features/terminal/tabs.ts"));
  const terminalTabs = emptyTabs();
  const { DEFAULT_PR_SETTINGS: prSettings } = load(resolve(root, "src/features/pr/prSettings.ts"));
  const app = load(resolve(root, "src/state/store.ts"));
  const view = load(resolve(root, "src/components/WorkspaceView.tsx"));
  const { composerSessionFor } = load(resolve(root, "src/features/chat/composerSession.ts"));
  const { forkTranscript } = load(resolve(root, "src/features/chat/fork.ts"));
  let state;
  let renderer;
  let dispatch;
  function Host() {
    const [current, send] = React.useReducer(app.reducer, state);
    state = current;
    dispatch = send;
    const repo = current.repos.find((repo) => repo.id === current.selection.repoId);
    const workspace = repo.workspaces.find((w) => w.id === current.selection.workspaceId);
    return React.createElement(view.WorkspaceView, { repo, workspace, sections: [], onNewSection: noop, dispatch });
  }
  function tab(title) {
    return renderer.root.findAllByProps({ role: "tab" }).find((node) => JSON.stringify(node.props.children).includes(JSON.stringify(title)));
  }
  function chips() {
    return renderer.root.findAll((node) => node.type?.name === "TranscriptChip").map((node) => node.props.chat);
  }
  return {
    workspaceId, foreignWorkspaceId, sourceId, targetId, foreignSourceId, sourceTitle, nativeCalls, hidden, transcripts,
    root: () => renderer.root,
    async rerenderCurrent() {
      const id = rows.find((row) => row.id === workspaceId).activeSessionId;
      const listeners = snapshotSubscribers.get(id);
      assert.equal(listeners?.size, 1, "actual ChatPanel keeps one live snapshot subscription");
      transcripts.set(id, structuredClone(transcripts.get(id)));
      await act(async () => {
        for (const listener of listeners) listener(snapshot(id));
        renderer.update(React.createElement(Host));
      });
    },
    async setGarry(value) { await act(async () => { await appPrefs.setAppPref({ key: "garry_mode", value }); }); },
    prefs: () => appPrefs.getAppPrefs(),
    async toggleRow() {
      const heads = renderer.root.findAll((node) => node.type === "div" && node.props.className?.startsWith("oc-tool-head") && node.props["aria-expanded"] !== undefined);
      assert.equal(heads.length, 1, "the actual single tool RowShell is mounted");
      await act(async () => heads[0].props.onClick());
    },
    expanded() {
      const heads = renderer.root.findAll((node) => node.type === "div" && node.props.className?.startsWith("oc-tool-head") && node.props["aria-expanded"] !== undefined);
      assert.equal(heads.length, 1, "the actual single tool RowShell is mounted");
      return heads[0].props["aria-expanded"];
    },
    async mount() {
      const repos = await app.loadReposFromDb();
      assert.deepEqual(nativeCalls, [{ command: "db_list_repos", args: undefined }, { command: "db_list_workspaces", args: undefined }], "real hydration reads only the established repository/workspace selectors");
      nativeCalls.length = 0;
      state = { repos, selection: { kind: "workspace", repoId: "repo", workspaceId } };
      await appPrefs.loadAppPrefs();
      assert.equal(appPrefs.getAppPrefs().right_panel_visible, false, "actual persisted fixture preference is loaded before mounting unrelated panels");
      assert.equal(appPrefs.getAppPrefs().garry_mode, garry, "actual persisted fixture Garry preference is loaded before mounting chat");
      await act(async () => { renderer = create(React.createElement(Host)); });
      assert.deepEqual(nativeCalls.filter((call) => call.command !== "get_app_prefs"), [selectedCall(workspaceId, workspaceId)], "mount persists the initial primary selection exactly");
      assert.equal(nativeCalls.filter((call) => call.command === "get_app_prefs").length, 1, "actual appPrefs hydrates through native IPC once before rendering");
      nativeCalls.length = 0;
    },
    async select(title) { const node = tab(title); assert.ok(node, `Missing rendered tab ${title}`); await act(async () => node.props.onClick()); },
    async close(title) { await act(async () => renderer.root.findByProps({ "aria-label": `Close ${title} tab` }).props.onClick()); },
    async switchWorkspace(id) { await act(async () => dispatch({ type: "select", selection: { kind: "workspace", repoId: "repo", workspaceId: id } })); },
    async reopen() {
      const handlers = [...bindings.values()].map((ref) => ref.current["nav.reopenTab"]).filter(Boolean);
      assert.equal(handlers.length, 1, "reopen must reach the one production workspace keybinding handler");
      await act(async () => handlers[0]());
    },
    async attach(id) {
      const chip = renderer.root.find((node) => node.type?.name === "TranscriptChip" && node.props.chat.chatId === id);
      await act(async () => chip.findByType("button").props.onClick());
    },
    hasTab: (title) => Boolean(tab(title)),
    suggestions: () => chips().map((chat) => chat.chatId),
    text: () => JSON.stringify(renderer.toJSON()),
    attachments: (id = targetId) => composerSessionFor(id, draftStore).snapshot().attachments,
    expectedTranscript: (id) => forkTranscript(transcripts.get(id)),
    storedSource: () => allStoredTabs.get(sourceId),
    async dispose() {
      if (renderer) await act(async () => renderer.unmount());
      assert.equal(forbiddenCalls.length, 0, "disclosure navigation must not execute a provider or clipboard operation");
      assert.deepEqual(boundaryErrors, [], "transport assertions must not be swallowed by product async catches");
      assert.ok(nativeCalls.every((call) => ["db_select_chat", "db_close_chat_tab", "db_open_chat_tab", "get_app_prefs", "set_app_pref"].includes(call.command)), `unexpected native calls: ${JSON.stringify(nativeCalls)}`);
    },
  };
}
