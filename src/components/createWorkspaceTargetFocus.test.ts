import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const root = resolve(import.meta.dirname, "../..");
const repo = (id = "repo") => ({ id, name: id, path: `/synthetic/${id}`, defaultBranch: "main", workspaces: [] });

// Actual Create and shared editor execute. The TipTap DOM engine, repository
// I/O, surrounding controls and suggestions are inert ports. No original vendor
// JavaScript, native command, browser, real OS focus or provider is executed.
async function fixture(initialTarget = false) {
  const modules = new Map<string, Record<string, any>>();
  const listeners = new Map<string, Set<(event: any) => void>>();
  const boundary = { focus: 0, destroyed: 0 };
  const document = {
    activeElement: null,
    addEventListener(type: string, callback: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener(type: string, callback: (event: any) => void) { listeners.get(type)?.delete(callback); },
  };
  const dom = { dataset: {}, offsetParent: {}, blur() {}, ownerDocument: { getSelection: () => null } };
  class InertEditor {
    schema: any; state: any; view: any; commands: any;
    isEmpty = true; isFocused = false; isDestroyed = false;
    constructor(options: any) {
      this.schema = dependencies("@tiptap/core").getSchema(options.extensions);
      this.state = dependencies("@tiptap/pm/state").EditorState.create({ schema: this.schema, doc: this.schema.nodeFromJSON(options.content) });
      this.view = { dom, composing: false, focus: () => { boundary.focus++; this.isFocused = true; }, dispatch: (transaction: any) => { this.state = this.state.apply(transaction); } };
      this.commands = { setContent() {}, setHardBreak() {} };
    }
    destroy() { this.isDestroyed = true; boundary.destroyed++; }
  }
  const passthrough = ({ children }: { children: unknown }) => children;
  function load(file: string): Record<string, any> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const source = readFileSync(resolve(root, file), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, {
      exports, console, document, HTMLElement: class {}, TextDecoder, TextEncoder, Uint8Array,
      crypto: { randomUUID: () => "target-focus-fixture" },
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name === "@tiptap/core") return { ...dependencies(name), Editor: InertEditor };
        if (name.startsWith("@tiptap/")) return dependencies(name);
        const real: Record<string, string> = {
          "../workspace/createFlow": "src/workspace/createFlow.ts", "../../workspace/createFlow.ts": "src/workspace/createFlow.ts", "../workspace/createInSection": "src/workspace/createInSection.ts",
          "../workspace/naming": "src/workspace/naming.ts", "./naming.ts": "src/workspace/naming.ts",
          "../features/chat/ComposerEditor.tsx": "src/features/chat/ComposerEditor.tsx",
          "../features/chat/composerDocument.ts": "src/features/chat/composerDocument.ts",
          "../features/chat/preWorkspaceCompletions.ts": "src/features/chat/preWorkspaceCompletions.ts",
          "./composerDocument.ts": "src/features/chat/composerDocument.ts", "./composerSchema.ts": "src/features/chat/composerSchema.ts",
          "../features/chat/composerAttachments": "src/features/chat/composerAttachments.ts", "../draft-attachments/staging.ts": "src/features/draft-attachments/staging.ts",
        };
        if (real[name]) return load(real[name]);
        if (name === "../../components/fileIconNames.ts") return { fileIconName: () => "", folderIconName: () => "", materialIconUrl: () => "" };
        if (name === "@tauri-apps/api/core") return { invoke: () => assert.fail("native invocation must stay inert") };
        if (name === "../workspace/api") return { ensureRepository: async () => ({ id: "repo" }), listBranches: async () => [], errorText: String, createWorkspace: () => assert.fail("workspace creation forbidden") };
        if (name === "../workspace/launchModel") return { launchDefaults: () => ({ agent: "reason", model: "fixture", effort: "" }), loadoutPicks: () => [] };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => null };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../settings/models") return { modelLabel: (value: string) => value };
        if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings() {} };
        if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
        if (name === "../keybindings/shortcut") return { glyphs: () => "", matchesEvent: () => false };
        if (name === "./motion/usePresence") return { usePresence: () => ({ mounted: false, attrs: {} }) };
        if (name === "./ui/Tooltip") return { Tooltip: passthrough };
        if (name === "./create/CreateWorkspaceSuggestions.tsx") return {
          CreateWorkspaceSuggestions: () => null,
          useCreateWorkspaceSuggestions: () => ({ onSelection() {}, onFocus() {}, onBlur() {}, onKeyDown: () => false }),
        };
        const nullComponents: Record<string, string[]> = {
          "../features/chat/ModelPicker": ["ModelPicker"], "./create/RepoSelect": ["RepoSelect"],
          "./create/TargetBranchButton": ["TargetBranchButton"], "./CreateFromPicker": ["CreateFromPicker"],
          "../features/chat/ComposerAttachmentChip": ["ComposerAttachmentChip"], "../features/chat/composerIcons": ["PaperclipIcon", "PlusIcon"],
        };
        if (name in nullComponents) return Object.fromEntries(nullComponents[name].map(key => [key, () => null]));
        const inert = ["../scripts/api", "../scripts/model", "../workspace/setupWatch", "./WorkspaceView", "../features/chat/reasonChat", "../features/chat/chatModel", "../workspace/firstMessage", "../features/chat/chatModelChoice", "../features/chat/agentChoice", "../workspace/pendingLaunches", "../features/chat/ChatModelPicker", "../features/draft-attachments/api.ts", "../features/diff/ReviewButton"];
        if (inert.includes(name) || name.endsWith(".css")) return {};
        throw new Error(`Unexpected target-focus dependency ${name} from ${file}`);
      },
    });
    return exports;
  }
  const Component = load("src/components/CreateWorkspaceComposer.tsx").CreateWorkspaceComposer;
  const props = { repos: initialTarget ? [repo()] : [], initialRepoId: initialTarget ? "repo" : null, prefixSettings: { branch_prefix_type: "none" }, githubUsername: null, eyebrowVariant: "floating", addActions: {}, dispatch() {}, onWarning() {}, onClose() {} };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Component, props), { createNodeMock: ({ props: element }: any) => element.className === "oc-editor-mount" ? dom : null }); });
  return {
    boundary,
    async target(id = "repo") { await act(async () => renderer.update(React.createElement(Component, { ...props, repos: [repo(id)] }))); },
    async rerender() { await act(async () => renderer.update(React.createElement(Component, props))); },
    async event(type: string, key?: string) { await act(async () => { for (const callback of [...(listeners.get(type) ?? [])]) callback({ key }); }); },
    listeners() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
    dispose() { act(() => renderer.unmount()); },
  };
}

test("a target arriving without user navigation refocuses the same actual Create editor once", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  assert.equal(view.boundary.focus, 1, "existing mount autofocus remains");
  view.boundary.focus = 0;
  await view.target();
  assert.equal(view.boundary.focus, 1, "target availability completes retained Hji/dQo focus");
  await view.target("second");
  assert.equal(view.boundary.focus, 1, "target focus is one-shot");
});

test("unrelated keys do not cancel target-arrival focus", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  view.boundary.focus = 0;
  await view.event("keydown", "Shift");
  await view.target();
  assert.equal(view.boundary.focus, 1);
});

test("Tab expresses user focus intent and cancels target-arrival focus", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  view.boundary.focus = 0;
  await view.event("keydown", "Tab");
  await view.target();
  assert.equal(view.boundary.focus, 0);
});

test("pointer interaction cancels target-arrival focus", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  view.boundary.focus = 0;
  await view.event("pointerdown");
  await view.target();
  assert.equal(view.boundary.focus, 0);
});

test("a target present at mount keeps existing single autofocus and never refocuses on updates", async (t) => {
  const view = await fixture(true); t.after(view.dispose);
  assert.equal(view.boundary.focus, 1);
  await view.rerender();
  await view.target("second");
  assert.equal(view.boundary.focus, 1);
});

test("remaining without a target does not add focus calls", async (t) => {
  const view = await fixture(); t.after(view.dispose);
  view.boundary.focus = 0;
  await view.rerender();
  assert.equal(view.boundary.focus, 0);
});

test("waiting focus listeners are removed on actual editor unmount", async () => {
  const view = await fixture();
  view.dispose();
  assert.equal(view.listeners(), 0);
  assert.equal(view.boundary.destroyed, 1);
});

test("target arrival in a second composer cannot focus the first editor", async (t) => {
  const first = await fixture(), second = await fixture(true);
  t.after(first.dispose); t.after(second.dispose);
  first.boundary.focus = second.boundary.focus = 0;
  await second.target("second");
  assert.equal(first.boundary.focus, 0);
  assert.equal(second.boundary.focus, 0);
});
