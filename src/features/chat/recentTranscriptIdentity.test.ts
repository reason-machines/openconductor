import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { AppState, Workspace } from "../../state/types.ts";
import type { ComposerAttachment } from "./composerAttachments.ts";
import type { ChatTranscript } from "./reducer.ts";
import { emptyTabs } from "../terminal/tabs.ts";
import { DEFAULT_PR_SETTINGS } from "../pr/prSettings.ts";
import type { PullRequest } from "../pr/usePullRequest.ts";
import type { ComposerMinimize } from "./useComposerMinimize.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const noop = () => {};
const unsubscribe = () => noop;

function fixture(titles: readonly [string, string] = ["Investigation", "Investigation"]) {
  const workspaceId = "transcript-target";
  const controlId = "control-target";
  const sourceIds = ["source-a", "source-b"];
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  const providerCalls: unknown[][] = [];
  const nativeCalls: { command: string; args: string | undefined }[] = [];
  const emptyMap = new Map();
  const terminalTabs = emptyTabs();
  const queue = { status: "idle", items: [], editingId: null, paused: false };
  const transcripts = new Map<string, ChatTranscript>([
    [workspaceId, { sessionId: workspaceId, messages: [], turns: {}, activeTurn: null }],
    [controlId, { sessionId: controlId, messages: [], turns: {}, activeTurn: null }],
    ...sourceIds.map((id, i): [string, ChatTranscript] => [id, {
      sessionId: id,
      messages: [{ id: `${id}:message`, sessionId: id, turnId: `${id}:turn`, role: "user", blocks: [{ type: "text", text: `TRANSCRIPT_${i === 0 ? "A" : "B"}_ONLY` }], createdAt: `2026-11-01T00:00:0${i}Z` }],
      turns: {}, activeTurn: null,
    }]),
  ]);
  const snapshot = (id: string) => {
    const transcript = transcripts.get(id);
    assert.ok(transcript, `Unexpected provider snapshot ${id}`);
    return { transcript, queue, permissions: [] };
  };
  const forbidden = (...args: unknown[]) => { providerCalls.push(args); assert.fail("Transcript attachment must not execute a provider"); };
  const agents = Object.fromEntries(["claude", "codex", "reason"].map((id) => [id, {
    id, label: id, canSteer: false, chatId: (chatId: string) => chatId, snapshot, subscribe: unsubscribe,
    submit: forbidden, stop: forbidden, queueAction: forbidden,
  }]));
  const settings = { models: { default: "opus-4-8-1m", default_fast_mode: false, default_plan_mode: false, claude_code: {}, codex: {} } };
  const db = { id: workspaceId, repositoryId: "repo", directoryName: "Transcript fixture", workspaceName: null, branch: "test", placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: "/synthetic/worktree", pinnedAt: null, unread: false, chatTabs: [{ id: sourceIds[0], title: titles[0] }, { id: sourceIds[1], title: titles[1] }, { id: controlId, title: "Control target" }], chatTitle: "Target", prTitle: null, prDescription: null, number: null, createdAt: "2026-11-01T00:00:00Z", primaryChatId: workspaceId, activeSessionId: workspaceId };
  const draftStore = { load: async () => "", save: async () => {}, clear: async () => {} };
  async function invoke(command: string, args: unknown) {
    nativeCalls.push({ command, args: JSON.stringify(args) });
    assert.equal(command, "db_select_chat", "attachment selection must not invoke native storage or provider commands");
  }
  const component = ({ children }: { children?: unknown }) => children ?? null;
  const editor = ({ value, onChange, inputRef }: { value: string; onChange: (text: string) => void; inputRef: { current: unknown } }) => {
    inputRef.current = { composing: () => false, focus: noop, focused: () => false, visible: () => true, blur: noop };
    return React.createElement("textarea", { "aria-label": "Synthetic editor", value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) });
  };
  const overrides: Record<string, Record<string, unknown>> = {
    "src/backend": { inTauri: () => true, fuzzyFilterFiles: async () => [] },
    "src/features/chat/reasonChat": { reasonAvailable: () => true, configureReasonDefault: noop, configureReason: noop, reasonChatConfig: async () => [] },
    "src/features/chat/chatRuntime": { chatStatuses: () => emptyMap, subscribeChatStatuses: unsubscribe, hideChat: noop, showChat: noop },
    "src/features/chat/codexChat": { CODEX_ACCESS: { full: { label: "Full access" } }, codexAccess: () => "full" },
    "src/features/chat/slashCompletions": { useAgentCommands: () => undefined },
    "src/features/chat/PermissionRequests": { PermissionRequests: () => null, pendingToolApproval: () => undefined },
    "src/features/chat/Transcript": { Transcript: () => null },
    "src/features/chat/ComposerEditor": { ComposerEditor: editor },
    "src/lib/local-storage": { composerDrafts: () => draftStore },
    "src/settings/api": { getSettings: async () => settings },
    "src/settings/appPrefs": { useAppPrefs: () => ({ right_panel_visible: false, garry_mode: false }) },
    "src/settings/useBoolPref": { useBoolPref: () => false },
    "src/settings/useFollowUpMode": { useFollowUpMode: () => "steering" },
    "src/settings/agents/api": { listFavorites: async () => [] },
    "src/keybindings/KeybindingsProvider": { KeybindingScope: component, useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: noop },
    "src/keybindings/overrides": { effectiveShortcuts: () => [] },
    "src/keybindings/shortcut": { glyphs: () => "", matchesEvent: () => false },
    "src/components/ui/Tooltip": { Tooltip: component, ShortcutHint: () => null },
    "src/components/motion/usePresence": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "src/state/useAutoUnread": { useWindowFocused: () => false },
    "src/features/chat/useComposerMinimize": { useComposerMinimize: () => ({ minimized: false, animate: false, expand: noop, minimizeIfEmpty: noop } satisfies ComposerMinimize) },
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
    "src/features/pr/usePullRequest": { usePullRequest: () => ({ lookup: null, pr: null, git: null, header: null, settings: DEFAULT_PR_SETTINGS, error: null, refresh: async () => {} } satisfies PullRequest) },
    "src/features/pr/useTargetBranch": { useTargetBranch: () => ({ branch: "main", disabledReason: null, changing: false }) },
    "src/features/pr/usePrActions": { usePrActions: () => ({}) },
    "src/features/pr/checks/useFixErrors": { useFixErrors: () => ({}) },
    "src/features/pr/usePullLatest": { usePullLatest: () => ({ shortcut: noop }) },
  };
  const modules = new Map<string, Record<string, unknown>>();
  const actualTsx = new Set(["src/components/WorkspaceView", "src/features/chat/ChatEmptyState", "src/features/chat/Composer", "src/features/chat/ComposerAttachmentChip", "src/features/diff/ReviewButton"]);
  function load(filename: string): Record<string, unknown> {
    const key = filename.slice(root.length).replace(/\.(tsx?|css)$/, "");
    if (key === "src/features/chat/agents") return { ...load(resolve(root, "src/features/chat/agentChoice.ts")), CHAT_AGENTS: agents };
    if (overrides[key]) return overrides[key];
    if (filename.endsWith(".css")) return {};
    if (filename.endsWith(".tsx") && !actualTsx.has(key)) return new Proxy({}, { get: () => component });
    const cached = modules.get(filename);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    modules.set(filename, exports);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, console, localStorage: storage, setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, TextDecoder, window: { location: { search: "", pathname: "/" }, addEventListener: noop, removeEventListener: noop }, navigator: { clipboard: { writeText: forbidden } }, require(name: string) {
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
  const view = load(resolve(root, "src/components/WorkspaceView.tsx"));
  const sessions = load(resolve(root, "src/features/chat/composerSession.ts"));
  const fromRow = persisted.workspaceFromRow;
  const restoreTabs = persisted.restoreChatTabsOf;
  const sessionFor = sessions.composerSessionFor;
  assert.ok(typeof fromRow === "function" && typeof restoreTabs === "function" && typeof sessionFor === "function");
  restoreTabs([db]);
  const workspace: Workspace = fromRow(db);
  const state: AppState = { repos: [{ id: "repo", name: "Test", path: "/synthetic/repo", defaultBranch: "main", workspaces: [workspace] }], selection: { kind: "workspace", repoId: "repo", workspaceId } };
  let renderer: ReturnType<typeof create>;
  function Host() {
    const [current, dispatch] = React.useReducer(app.reducer, state);
    return React.createElement(view.WorkspaceView, { repo: current.repos[0], workspace: current.repos[0].workspaces[0], sections: [], onNewSection: noop, dispatch });
  }
  return {
    workspaceId, controlId, sourceIds, transcripts, providerCalls, nativeCalls,
    async mount() {
      await act(async () => { renderer = create(React.createElement(Host)); });
      assert.deepEqual(nativeCalls, [{ command: "db_select_chat", args: JSON.stringify({ workspaceId, chatId: workspaceId }) }], "mount only persists the initially selected chat");
      nativeCalls.length = 0;
    },
    async attach(id: string) {
      const chip = renderer.root.find((node: { type: { name?: string }; props: { chat?: { chatId: string } } }) => node.type.name === "TranscriptChip" && node.props.chat?.chatId === id);
      await act(async () => chip.findByType("button").props.onClick());
    },
    attachments(id = workspaceId): ComposerAttachment[] { return sessionFor(id, draftStore).snapshot().attachments; },
    labels: () => renderer.root.findAllByProps({ className: "chip composer-attachment" }).map((node: { props: { children: unknown[] } }) => node.props.children[0]),
    async select(title: string) {
      const tab = renderer.root.findAllByProps({ role: "tab" }).find((node: { props: { children: unknown } }) => JSON.stringify(node.props.children).includes(JSON.stringify(title)));
      assert.ok(tab, `Missing target tab ${title}`);
      await act(async () => tab.props.onClick());
    },
    async removeFirst() { await act(async () => renderer.root.findAllByProps({ className: "composer-attachment-remove" })[0].props.onClick()); },
    errorCount: () => renderer.root.findAllByProps({ role: "alert" }).length,
    dispose() {
      act(() => renderer.unmount());
      assert.equal(providerCalls.length, 0);
      assert.ok(nativeCalls.every((call) => call.command === "db_select_chat"), "only selected-chat bookkeeping may call native transport");
    },
  };
}

function assertBodies(attachments: readonly ComposerAttachment[]) {
  assert.equal(attachments.length, 2, "two source chats must retain two attachments even when their titles coincide");
  assert.match(attachments[0].text, /TRANSCRIPT_A_ONLY/);
  assert.doesNotMatch(attachments[0].text, /TRANSCRIPT_B_ONLY/);
  assert.match(attachments[1].text, /TRANSCRIPT_B_ONLY/);
  assert.doesNotMatch(attachments[1].text, /TRANSCRIPT_A_ONLY/);
  assert.notEqual(attachments[0].name, attachments[1].name);
}

test("mounted recent-chat chips retain both same-title source transcripts in one target", async () => {
  const f = fixture(); await f.mount();
  try {
    const before = JSON.stringify([...f.transcripts]);
    await f.attach(f.sourceIds[0]);
    assert.equal(f.attachments().length, 1);
    assert.match(f.attachments()[0].text, /TRANSCRIPT_A_ONLY/);
    await f.attach(f.sourceIds[1]);
    assertBodies(f.attachments());
    assert.equal(f.attachments()[0].name, "session-transcript-source-a.md");
    assert.equal(f.attachments()[1].name, "session-transcript-source-b.md");
    assert.deepEqual(f.labels(), ["Transcript of Investigation.md", "Transcript of Investigation.md"]);
    assert.equal(f.errorCount(), 0);
    assert.equal(JSON.stringify([...f.transcripts]), before, "attachment selection must not modify either source transcript");
    assert.equal(f.nativeCalls.length, 0);
    await f.removeFirst();
    assert.equal(f.attachments().length, 1);
    assert.match(f.attachments()[0].text, /TRANSCRIPT_B_ONLY/);
  } finally { f.dispose(); }
});

test("mounted distinct-title recent-chat chips retain their own bodies and readable labels", async () => {
  const f = fixture(["Investigation A", "Investigation B"]); await f.mount();
  try {
    await f.attach(f.sourceIds[0]); await f.attach(f.sourceIds[1]);
    assertBodies(f.attachments());
    assert.deepEqual(f.labels(), ["Transcript of Investigation A.md", "Transcript of Investigation B.md"]);
    assert.equal(f.errorCount(), 0);
  } finally { f.dispose(); }
});

test("mounted recent-chat attachments remain isolated from another empty target and survive target switching", async () => {
  const f = fixture(["Investigation A", "Investigation B"]); await f.mount();
  try {
    await f.attach(f.sourceIds[0]); await f.attach(f.sourceIds[1]);
    const before = JSON.stringify(f.attachments());
    await f.select("Control target");
    assert.equal(f.attachments(f.controlId).length, 0);
    assert.deepEqual(f.labels(), []);
    await f.attach(f.sourceIds[1]);
    assert.equal(f.attachments(f.controlId).length, 1);
    assert.match(f.attachments(f.controlId)[0].text, /TRANSCRIPT_B_ONLY/);
    assert.equal(JSON.stringify(f.attachments()), before);
    await f.select("Target");
    assertBodies(f.attachments());
    assert.equal(JSON.stringify(f.attachments()), before);
    assert.deepEqual(f.labels(), ["Transcript of Investigation A.md", "Transcript of Investigation B.md"]);
    assert.equal(f.errorCount(), 0);
  } finally { f.dispose(); }
});
