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

type Agent = "claude" | "codex" | "reason";
type Action = "button" | "command";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(agent: Agent = "claude", options: { secondary?: boolean; loadingDraft?: boolean; reject?: boolean } = {}) {
  const workspaceId = "plan-workspace";
  const sibling = "plan-workspace:chat:sibling";
  const sourceId = options.secondary ? sibling : workspaceId;
  const requestId = "plan-request:" + sourceId;
  const runId = agent === "claude" ? sourceId + ":claude" : sourceId;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  const commands = new Map<string, () => unknown>();
  const answers: unknown[][] = [];
  const providerCalls: unknown[][] = [];
  const notifications: string[] = [];
  const fileRead = deferred<ArrayBuffer>();
  const draftRead = deferred<string>();
  const handoffWrite = deferred<void>();
  const draftStore = { load: () => options.loadingDraft ? draftRead.promise : Promise.resolve(""), save: async () => {}, clear: async () => {} };
  const permissions = agent === "codex" ? [] : [{ kind: "plan", requestId, plan: "Keep the schema. Update the query." }];
  const snapshot = { transcript: { messages: [], turns: {}, activeTurn: null }, queue: { status: "needs_plan_response", items: [], editingId: null, paused: false }, permissions };
  const agents = Object.fromEntries(["claude", "codex", "reason"].map((id) => [id, {
    id, label: id, canSteer: false, chatId: (chatId: string) => id === "claude" ? chatId + ":claude" : chatId,
    snapshot: () => snapshot, subscribe: unsubscribe,
    submit: (...args: unknown[]) => { providerCalls.push(args); }, stop: noop, queueAction: noop,
    answerPermission: async (...args: unknown[]) => { answers.push(args); if (options.reject) throw new Error("Synthetic answer rejected"); },
  }]));
  const settings = { models: { default: "opus-4-8-1m", default_fast_mode: false, default_plan_mode: true, claude_code: {}, codex: {} } };
  const db = { id: workspaceId, repositoryId: "repo", directoryName: "Test workspace", workspaceName: null, branch: "test", placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: "/synthetic/worktree", pinnedAt: null, unread: false, chatTabs: [{ id: sibling, title: "Sibling" }], chatTitle: "Original", prTitle: null, prDescription: null, number: null, createdAt: "2026-11-01T00:00:00Z", primaryChatId: workspaceId, activeSessionId: sourceId };
  async function invoke(command: string, args: Record<string, unknown> = {}) {
    if (command === "draft_attachment_write" && String(args.relativePath).endsWith("/plan.md")) return handoffWrite.promise;
    if (/^(claude_|codex_|chat_)/.test(command)) throw new Error("Provider execution forbidden: " + command);
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
    "src/features/chat/slashCompletions": { useAgentCommands: () => undefined },
    "src/features/chat/markdown": { Markdown: ({ text }: { text: string }) => React.createElement("div", null, text) },
    "src/features/chat/Transcript": { Transcript: ({ transcript }: { transcript: unknown }) => React.createElement("output", { "data-transcript": true }, JSON.stringify(transcript)) },
    "src/features/chat/ComposerEditor": { ComposerEditor: editor },
    "src/lib/local-storage": { composerDrafts: () => draftStore },
    "src/settings/api": { getSettings: async () => settings },
    "src/settings/appPrefs": { useAppPrefs: () => prefs },
    "src/settings/useBoolPref": { useBoolPref: () => false },
    "src/settings/useFollowUpMode": { useFollowUpMode: () => "steering" },
    "src/settings/agents/api": { listFavorites: async () => [] },
    "src/keybindings/KeybindingsProvider": { KeybindingScope: component, useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: (handlers: Record<string, (() => unknown) | undefined>) => {
      const latest = React.useRef(handlers); latest.current = handlers;
      const ids = Object.keys(handlers).filter((id) => handlers[id]).sort().join("\n");
      React.useEffect(() => {
        const registered = new Map(ids.split("\n").filter(Boolean).map((id) => [id, () => latest.current[id]?.()]));
        for (const [id, handler] of registered) commands.set(id, handler);
        return () => { for (const [id, handler] of registered) if (commands.get(id) === handler) commands.delete(id); };
      }, [ids]);
    } },
    "src/keybindings/overrides": { effectiveShortcuts: () => [] },
    "src/keybindings/shortcut": { glyphs: () => "", matchesEvent: () => false },
    "src/components/ui/Tooltip": { Tooltip: component, ShortcutHint: () => null },
    "src/components/motion/usePresence": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} } satisfies ReturnType<typeof usePresence>) },
    "src/state/useAutoUnread": { useWindowFocused: () => false },
    "src/features/chat/useComposerMinimize": { useComposerMinimize: () => ({ minimized: false, animate: false, expand: noop, minimizeIfEmpty: noop } satisfies ComposerMinimize) },
    "src/features/terminal/session": { subscribeTabs: unsubscribe, getTabs: () => emptyTerminalTabs, onCenterTabOpened: unsubscribe },
    "src/features/browser/store": { subscribeBrowser: unsubscribe, browserSnapshot: () => ({ pages: emptyMap }) },
    "src/features/diff/useWorkspaceDiff": { useWorkspaceDiff: () => ({ openPath: noop, openTurnFile: noop, update: noop, files: [], scope: "all", loading: false, load: { state: "ready" } }) },
    "src/features/diff/ReviewComments": { useReviewComments: () => ({ hasPending: false }) },
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
  const actualTsx = new Set(["src/components/WorkspaceView", "src/features/chat/Composer", "src/features/chat/PermissionRequests", "src/features/diff/ReviewButton"]);
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
  const app = load(resolve(root, "src/state/store.ts"));
  const persisted = load(resolve(root, "src/state/persisted.ts"));
  const agentChoice = load(resolve(root, "src/features/chat/agentChoice.ts"));
  const view = load(resolve(root, "src/components/WorkspaceView.tsx"));
  const fromRow = persisted.workspaceFromRow as (row: unknown) => Workspace;
  (persisted.restoreChatTabsOf as (rows: unknown[]) => void)([db]);
  (agentChoice.saveAgent as (id: string, value: Agent) => void)(sourceId, agent);
  const state: AppState = { repos: [{ id: "repo", name: "Test", path: "/synthetic/repo", defaultBranch: "main", workspaces: [fromRow(db)] }], selection: { kind: "workspace", repoId: "repo", workspaceId } };
  let renderer: ReturnType<typeof create>;
  function Host() {
    const [current, dispatch] = React.useReducer(app.reducer, state);
    return React.createElement(view.WorkspaceView, { repo: current.repos[0], workspace: current.repos[0].workspaces[0], dispatch, notify: (_kind: string, text: string) => notifications.push(text) });
  }
  const button = (title: string) => renderer.root.findByProps({ title });
  const editorNode = () => renderer.root.findByProps({ "aria-label": "Synthetic editor" });
  return {
    answers, providerCalls, commands, runId, requestId, snapshot, notifications,
    async mount() { await act(async () => { renderer = create(React.createElement(Host)); }); },
    async edit(text: string) { await act(async () => editorNode().props.onChange({ target: { value: text } })); },
    draft: () => editorNode().props.value,
    text: () => JSON.stringify(renderer.toJSON()),
    async approve(action: Action) {
      await act(async () => {
        if (action === "button") button("Execute plan in current chat").props.onClick();
        else { const callback = commands.get("chat.approvePlan"); assert.ok(callback, "real PlanCard must register chat.approvePlan"); callback(); }
      });
    },
    capture: () => button("Execute plan in current chat").props.onClick as () => void,
    async call(callback: () => void) { await act(async () => callback()); },
    async submit() { await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: noop })); },
    async attachPending() {
      await act(async () => renderer.root.findByProps({ type: "file" }).props.onChange({ target: { files: [{ name: "notes.txt", size: 4, arrayBuffer: () => fileRead.promise }], value: "notes.txt" } }));
    },
    async finishAttachment() { await act(async () => fileRead.resolve(new TextEncoder().encode("Note").buffer)); },
    async finishDraft() { await act(async () => draftRead.resolve("")); },
    async attachReady() {
      await act(async () => renderer.root.findByProps({ type: "file" }).props.onChange({ target: { files: [{ name: "keep.txt", size: 4, arrayBuffer: async () => new TextEncoder().encode("Keep").buffer }], value: "keep.txt" } }));
    },
    async handoff() { await act(async () => button("Send plan to a new chat for implementation").props.onClick()); },
    approveDisabled: () => button("Execute plan in current chat").props.disabled,
    async dispose() { await act(async () => { renderer.unmount(); handoffWrite.resolve(); }); },
  };
}

for (const action of ["button", "command"] as const) {
  for (const secondary of [false, true]) {
    test("mounted Claude plan " + action + " sends the current trimmed draft (secondary=" + secondary + ")", async () => {
      const f = fixture("claude", { secondary }); await f.mount();
      try {
        await f.edit("Old draft"); await f.edit("  Keep the schema unchanged.  "); await f.attachReady();
        await f.approve(action);
        assert.equal(JSON.stringify(f.answers), JSON.stringify([[f.runId, f.requestId, { kind: "plan", approved: false, feedback: "Keep the schema unchanged." }]]));
        assert.equal(f.draft(), "");
        assert.match(f.text(), /keep[.]txt/, "plan answers must not consume staged attachments");
        assert.equal(f.providerCalls.length, 0, "answer only; do not open or prompt any provider");
      } finally { await f.dispose(); }
    });
  }
  for (const text of ["", "  \n\t "]) {
    test("mounted Claude plan " + action + " approves a blank draft " + JSON.stringify(text), async () => {
      const f = fixture(); await f.mount();
      try {
        await f.edit(text); await f.approve(action);
        assert.equal(JSON.stringify(f.answers), JSON.stringify([[f.runId, f.requestId, { kind: "plan", approved: true }]]));
        assert.equal(f.draft(), text);
      } finally { await f.dispose(); }
    });
  }
  for (const loading of ["draft", "file"] as const) {
    test("mounted Claude plan " + action + " waits for the loading " + loading, async () => {
      const f = fixture("claude", { loadingDraft: loading === "draft" }); await f.mount();
      try {
        await f.edit("  Wait for files.  ");
        if (loading === "file") await f.attachPending();
        await f.approve(action);
        assert.equal(f.answers.length, 0, "loading feedback must not answer the plan");
        assert.equal(f.draft(), "  Wait for files.  ");
        assert.match(f.text(), /finish loading/);
        if (loading === "file") await f.finishAttachment(); else await f.finishDraft();
        await f.approve(action);
        assert.equal(JSON.stringify(f.answers), JSON.stringify([[f.runId, f.requestId, { kind: "plan", approved: false, feedback: "Wait for files." }]]));
        if (loading === "file") assert.match(f.text(), /notes[.]txt/);
      } finally { await f.dispose(); }
    });
  }
  test("mounted Claude plan " + action + " stays blocked during handoff", async () => {
    const f = fixture(); await f.mount();
    try {
      await f.edit("Keep this draft"); await f.handoff();
      assert.equal(f.approveDisabled(), true);
      await f.approve(action); assert.equal(f.answers.length, 0); assert.equal(f.draft(), "Keep this draft");
    } finally { await f.dispose(); }
  });
}

test("mounted Claude composer feedback uses the same loading guard and trim", async () => {
  const f = fixture(); await f.mount();
  try {
    await f.edit("  Keep this feedback.  "); await f.attachPending(); await f.submit();
    assert.equal(f.answers.length, 0); assert.equal(f.draft(), "  Keep this feedback.  ");
    await f.finishAttachment(); await f.submit();
    assert.equal(JSON.stringify(f.answers), JSON.stringify([[f.runId, f.requestId, { kind: "plan", approved: false, feedback: "Keep this feedback." }]]));
    assert.equal(f.draft(), ""); assert.match(f.text(), /notes[.]txt/);
  } finally { await f.dispose(); }
});

test("mounted Claude stale request callback cannot answer a replacement request", async () => {
  const f = fixture(); await f.mount();
  try {
    await f.edit("Do not send to another request"); const stale = f.capture();
    f.snapshot.permissions.splice(0, 1, { kind: "plan", requestId: "replacement-request", plan: "Another plan" });
    await f.call(stale); assert.equal(f.answers.length, 0); assert.equal(f.draft(), "Do not send to another request");
  } finally { await f.dispose(); }
});

test("mounted Claude rejected plan feedback keeps its draft and attachments", async () => {
  const f = fixture("claude", { reject: true }); await f.mount();
  try {
    await f.edit("  Retry later  "); await f.attachReady(); await f.approve("button");
    assert.equal(f.answers.length, 1); assert.equal(f.draft(), "  Retry later  "); assert.match(f.text(), /keep[.]txt/);
    assert.match(f.text(), /Synthetic answer rejected/);
  } finally { await f.dispose(); }
});

test("mounted Reason approval does not acquire Claude feedback semantics", async () => {
  const f = fixture("reason"); await f.mount();
  try {
    await f.edit("Reason draft"); await f.approve("button");
    assert.equal(JSON.stringify(f.answers), JSON.stringify([[f.runId, f.requestId, { kind: "plan", approved: true }]]));
    assert.equal(f.draft(), "Reason draft");
  } finally { await f.dispose(); }
});

test("mounted Codex does not register a Claude PlanCard approval", async () => {
  const f = fixture("codex"); await f.mount();
  try { assert.equal(f.commands.has("chat.approvePlan"), false); assert.equal(f.answers.length, 0); }
  finally { await f.dispose(); }
});
