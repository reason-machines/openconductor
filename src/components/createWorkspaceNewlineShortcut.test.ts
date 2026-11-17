import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { effectiveShortcuts } from "../../src/keybindings/overrides.ts";
import { glyphs, matchesEvent } from "../../src/keybindings/shortcut.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const root = resolve(import.meta.dirname, "../..");
const chord = [{ key: { kind: "logical" as const, value: "Enter" }, modifiers: ["ctrl" as const, "shift" as const] }];

// Mount the actual dialog, Create composer and shared editor. Only TipTap's DOM
// engine is inert: its command records the final setHardBreak dispatch, not a
// browser default action or a claim about Conductor's unavailable EIt body.
async function fixture(page: boolean, overrides: Record<string, typeof chord> = { "chat.newLine": chord }) {
  const modules = new Map<string, Record<string, unknown>>();
  const document = { activeElement: null };
  const boundary = { breaks: 0, requests: 0, closes: 0, composing: false, focused: false };
  let keyDown: (event: KeyboardEvent) => boolean;
  let renderer: ReturnType<typeof create>;
  const passthrough = ({ children }: { children: unknown }) => children;
  const dom = { dataset: {}, offsetParent: {}, blur() {}, ownerDocument: { getSelection: () => null } };
  class InertEditor {
    state: any;
    schema: any;
    isEmpty = false;
    isDestroyed = false;
    get isFocused() { return boundary.focused; }
    view: any;
    commands: any;
    constructor(options: any) {
      this.schema = dependencies("@tiptap/core").getSchema(options.extensions);
      this.state = dependencies("@tiptap/pm/state").EditorState.create({ schema: this.schema, doc: this.schema.nodeFromJSON(options.content) });
      this.view = {
        dom,
        get composing() { return boundary.composing; },
        focus: () => { boundary.focused = true; },
        dispatch: (transaction: any) => { this.state = this.state.apply(transaction); },
      };
      this.commands = {
        setHardBreak: () => { boundary.breaks++; return true; },
        setContent: (content: any) => { this.state = dependencies("@tiptap/pm/state").EditorState.create({ schema: this.schema, doc: this.schema.nodeFromJSON(content) }); },
      };
      keyDown = (event) => options.editorProps.handleKeyDown(this.view, event);
    }
    destroy() { this.isDestroyed = true; }
  }
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const ref = process.env.CREATE_NEWLINE_REF;
    const source = ref && ["src/components/CreateWorkspaceComposer.tsx", "src/components/CreateWorkspaceDialog.tsx", "src/features/chat/ComposerEditor.tsx"].includes(file)
      ? execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8" })
      : readFileSync(resolve(root, file), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, console, document, HTMLElement: class {}, TextDecoder, TextEncoder, Uint8Array,
      crypto: { randomUUID: () => "newline-fixture" },
      require(name: string) {
        if (name === "@tiptap/core") return { ...dependencies(name), Editor: InertEditor };
        if (name.startsWith("@tiptap/") || name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name === "./CreateWorkspaceComposer") return load("src/components/CreateWorkspaceComposer.tsx");
        if (name === "../features/chat/ComposerEditor.tsx") return load("src/features/chat/ComposerEditor.tsx");
        if (name === "./composerDocument.ts") return load("src/features/chat/composerDocument.ts");
        if (name === "./composerSchema.ts") return load("src/features/chat/composerSchema.ts");
        if (name === "../../components/fileIconNames.ts") return { fileIconName: () => "", folderIconName: () => "", materialIconUrl: () => "" };
        if (name === "../workspace/createFlow") return load("src/workspace/createFlow.ts");
        if (name === "../workspace/createInSection") return load("src/workspace/createInSection.ts");
        if (name === "./naming.ts" || name === "../workspace/naming") return load("src/workspace/naming.ts");
        if (name === "@base-ui/react/dialog") return { Dialog: { Root: passthrough, Portal: passthrough, Popup: passthrough } };
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
        if (name === "./motion/usePresence") return { usePresence: () => ({ mounted: true, attrs: {} }) };
        if (name === "./ui/Tooltip") return { Tooltip: passthrough };
        if (name === "../features/chat/composerAttachments") return load("src/features/chat/composerAttachments.ts");
        if (name === "../draft-attachments/staging.ts") return load("src/features/draft-attachments/staging.ts");
        if (name === "../features/draft-attachments/api.ts") return { draftAttachmentsApi: {} };
        if (name === "../features/diff/ReviewButton") return { queuePending: () => assert.fail("must not queue a message") };
        if (name === "../features/chat/composer.css") return {};
        if (name === "@tauri-apps/api/core") return { invoke: async () => assert.fail("must not invoke native commands") };
        if (name === "../workspace/api") return {
          ensureRepository: async () => ({ id: "repo", root: "/synthetic/project", defaultBranch: "main" }),
          listBranches: async () => [{ name: "main", remote: null, commit: "", isHead: true, committedAt: 0 }],
          createWorkspace: () => { boundary.requests++; return new Promise(() => {}); },
          errorText: (error: Error) => error.message,
        };
        if (name === "../workspace/pendingLaunches") return { addPendingLaunch() {}, removePendingLaunch() {} };
        if (name === "../workspace/launchModel") return { launchDefaults: () => ({ agent: "reason", model: "fixture", effort: "" }), loadoutPicks: () => [] };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => null };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../features/chat/ChatModelPicker") return {};
        if (name === "../settings/models") return { modelLabel: (value: string) => value };
        if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides }), useKeybindings() {} };
        if (name === "../keybindings/overrides") return { effectiveShortcuts };
        if (name === "../keybindings/shortcut") return { glyphs, matchesEvent };
        const inert = new Map<string, Record<string, unknown>>([
          ["../scripts/api", { scriptsConfig() {}, startSetup() {} }],
          ["../scripts/model", { workspaceRef() {} }], ["../workspace/setupWatch", { watchSetup() {}, unwatchSetup() {} }],
          ["./WorkspaceView", { seedTranscript() {} }], ["../features/chat/reasonChat", { configureReason() {} }],
          ["../features/chat/chatModel", { sessionConfig() {} }], ["../workspace/firstMessage", { renameAfterFirstMessage() {} }],
          ["../features/chat/chatModelChoice", { saveModelChoice() {} }], ["../features/chat/agentChoice", { saveAgent() {} }],
          ["../features/chat/ComposerAttachmentChip", { ComposerAttachmentChip: () => null }],
          ["../features/chat/ModelPicker", { ModelPicker: () => null }], ["./create/RepoSelect", { RepoSelect: () => null }],
          ["./create/TargetBranchButton", { TargetBranchButton: () => null }], ["./CreateFromPicker", { CreateFromPicker: () => null }],
          ["../features/chat/composerIcons", { PaperclipIcon: () => null, PlusIcon: () => null }],
        ]);
        if (inert.has(name)) return inert.get(name);
        throw new Error(`Unexpected newline fixture dependency: ${name}`);
      },
    });
    return exports;
  }
  const Component = load(page ? "src/components/CreateWorkspaceComposer.tsx" : "src/components/CreateWorkspaceDialog.tsx")[page ? "CreateWorkspaceComposer" : "CreateWorkspaceDialog"];
  await act(async () => {
    renderer = create(React.createElement(Component, {
      repos: [{ id: "repo", name: "Project", path: "/synthetic/project", defaultBranch: "main", workspaces: [] }],
      initialRepoId: "repo", prefixSettings: { branch_prefix_type: "none" }, githubUsername: null,
      eyebrowVariant: "floating", addActions: {}, dispatch() {}, onWarning() {}, onClose() { boundary.closes++; },
    }), { createNodeMock: (element: { props: { className?: string } }) => element.props.className === "oc-editor-mount" ? dom : null });
  });
  // Drive the actual Create value callback; key events then enter at the actual
  // mounted ComposerEditor's editorProps.handleKeyDown, not a copied predicate.
  await act(async () => {
    renderer.root.findByType(load("src/features/chat/ComposerEditor.tsx").ComposerEditor).props.onChange("ab");
  });
  return {
    boundary,
    async key(properties: Partial<KeyboardEvent> = {}) {
      const event = {
        key: "Enter", code: "Enter", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true,
        isComposing: false, keyCode: 13, defaultPrevented: false, stopped: false, ...properties,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
      };
      let handled = false;
      await act(async () => { handled = keyDown(event as unknown as KeyboardEvent); });
      return { prevented: event.defaultPrevented, stopped: event.stopped, handled };
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const page of [false, true]) {
  test(`configured newline reaches the mounted shared editor command once (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      assert.deepEqual(await view.key(), { prevented: true, stopped: false, handled: true });
      assert.equal(view.boundary.breaks, 1);
      assert.equal(view.boundary.requests, 0); assert.equal(view.boundary.closes, 0);
    } finally { view.dispose(); }
  });
  for (const command of ["chat.submitMessage", "chat.submitOppositeFollowUp", "workspace.addToBacklogFromComposer"]) {
    test(`configured ${command} wins a newline collision (page=${page})`, async () => {
      const view = await fixture(page, { "chat.newLine": chord, [command]: chord });
      try {
        assert.deepEqual(await view.key(), { prevented: true, stopped: command === "workspace.addToBacklogFromComposer", handled: true });
        assert.equal(view.boundary.breaks, 0); assert.equal(view.boundary.requests, 1);
      } finally { view.dispose(); }
    });
  }
  test(`composition signals and unrelated chords remain unhandled (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      for (const properties of [{ isComposing: true }, { keyCode: 229 }, { key: "j", code: "KeyJ" }, { altKey: true }]) {
        assert.deepEqual(await view.key(properties), { prevented: false, stopped: false, handled: false });
      }
      view.boundary.composing = true;
      assert.deepEqual(await view.key(), { prevented: false, stopped: false, handled: false });
      assert.equal(view.boundary.breaks, 0); assert.equal(view.boundary.requests, 0); assert.equal(view.boundary.closes, 0);
    } finally { view.dispose(); }
  });
  test(`default Shift+Enter uses the same newline command (page=${page})`, async () => {
    const view = await fixture(page, {});
    try {
      assert.deepEqual(await view.key({ ctrlKey: false }), { prevented: true, stopped: false, handled: true });
      assert.equal(view.boundary.breaks, 1); assert.equal(view.boundary.requests, 0);
    } finally { view.dispose(); }
  });
  test(`ordinary Enter still submits exactly once (page=${page})`, async () => {
    const view = await fixture(page, {});
    try {
      assert.deepEqual(await view.key({ ctrlKey: false, shiftKey: false }), { prevented: true, stopped: false, handled: true });
      assert.equal(view.boundary.breaks, 0); assert.equal(view.boundary.requests, 1);
    } finally { view.dispose(); }
  });
}
