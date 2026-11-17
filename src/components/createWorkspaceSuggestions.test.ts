import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const root = resolve(import.meta.dirname, "../..");
const file = { name: "entry.ts", path: "src/entry.ts", is_directory: false };
const directory = { name: "src", path: "src", is_directory: true };
const completions = {
  files: [file, directory],
  slashCommands: [{ name: "review", description: "Review changes", argumentHint: "" }],
  skills: [{ name: "guide", displayName: "Guide", path: "/synthetic/skills/guide/SKILL.md", description: "A guide" }],
};

// Qualification fixture, frozen before product edits. Mounts the real dialog,
// Create composer, shared ComposerEditor and suggestion menus. TipTap's DOM
// adapter is inert; real ProseMirror state/schema retain editor transactions.
// The proposed repository/ref provider is a synthetic response at the IPC edge,
// NOT evidence that the native pre-workspace provider currently exists.
async function fixture(page: boolean, options: { noRepo?: boolean; reject?: boolean } = {}) {
  const modules = new Map<string, Record<string, any>>();
  const boundary = { creates: 0, closes: 0, composing: false, focused: false, calls: [] as { command: string; args: any }[] };
  let editor: InertEditor;
  let keyDown: (event: KeyboardEvent) => boolean;
  let renderer: ReturnType<typeof create>;
  const passthrough = ({ children }: { children: unknown }) => children;
  const dom = { dataset: {}, offsetParent: {}, blur() {}, ownerDocument: { getSelection: () => null } };
  class InertEditor {
    state: any;
    schema: any;
    view: any;
    commands: any;
    isDestroyed = false;
    get isEmpty() { return this.state.doc.textContent === ""; }
    get isFocused() { return boundary.focused; }
    config: any;
    constructor(config: any) {
      this.config = config;
      editor = this;
      this.schema = dependencies("@tiptap/core").getSchema(config.extensions);
      this.state = dependencies("@tiptap/pm/state").EditorState.create({ schema: this.schema, doc: this.schema.nodeFromJSON(config.content) });
      this.view = {
        dom,
        get composing() { return boundary.composing; },
        focus: () => { boundary.focused = true; },
        dispatch: (transaction: any) => {
          this.state = this.state.apply(transaction);
          if (transaction.docChanged) config.onUpdate();
          if (transaction.selectionSet || transaction.docChanged) config.onSelectionUpdate();
        },
      };
      this.commands = {
        setContent: (content: any) => { this.state = dependencies("@tiptap/pm/state").EditorState.create({ schema: this.schema, doc: this.schema.nodeFromJSON(content) }); },
        setHardBreak: () => { this.view.dispatch(this.state.tr.replaceSelectionWith(this.schema.nodes.hardBreak.create())); return true; },
      };
      keyDown = (event) => config.editorProps.handleKeyDown(this.view, event);
    }
    chain() {
      let action = () => {};
      const chain = {
        focus: () => chain,
        insertContentAt: (range: any, content: any) => {
          action = () => {
            const nodes = typeof content === "string" ? [this.schema.text(content)] : content.map((node: any) => this.schema.nodeFromJSON(node));
            const fragment = dependencies("@tiptap/pm/model").Fragment.fromArray(nodes);
            const transaction = this.state.tr.replaceWith(range.from, range.to, fragment);
            const end = range.from + fragment.size;
            transaction.setSelection(dependencies("@tiptap/pm/state").TextSelection.create(transaction.doc, end));
            this.view.dispatch(transaction);
          };
          return chain;
        },
        deleteRange: (range: any) => { action = () => this.view.dispatch(this.state.tr.delete(range.from, range.to)); return chain; },
        run: () => { action(); return true; },
      };
      return chain;
    }
    type(text: string, caret = text.length) {
      const doc = this.schema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
      this.state = dependencies("@tiptap/pm/state").EditorState.create({ schema: this.schema, doc });
      this.state = this.state.apply(this.state.tr.setSelection(dependencies("@tiptap/pm/state").TextSelection.create(doc, caret + 1)));
      this.config.onUpdate(); this.config.onFocus(); this.config.onSelectionUpdate();
    }
    destroy() { this.isDestroyed = true; }
  }
  function load(path: string): Record<string, any> {
    const cached = modules.get(path);
    if (cached) return cached;
    const exports = {};
    modules.set(path, exports);
    const ref = process.env.CREATE_SUGGESTIONS_REF;
    const source = ref ? execFileSync("git", ["-c", "gc.auto=0", "show", `${ref}:${path}`], { cwd: root, encoding: "utf8" }) : readFileSync(resolve(root, path), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, {
      exports, console, TextDecoder, TextEncoder, Uint8Array, URL, URLSearchParams, setTimeout, clearTimeout,
      document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {}, crypto: { randomUUID: () => "suggestions-fixture" },
      require(name: string) {
        if (name === "@tiptap/core") return { ...dependencies(name), Editor: InertEditor };
        if (name.startsWith("@tiptap/") || ["react", "react/jsx-runtime", "fuzzysort"].includes(name)) return dependencies(name);
        if (name.endsWith(".css")) return {};
        if (name === "@tauri-apps/api/core") return {
          isTauri: () => true,
          invoke: async (command: string, args: any) => {
            boundary.calls.push({ command, args });
            if (command === "pre_workspace_completions") {
              if (options.reject) throw new Error("Synthetic lookup failure");
              return completions;
            }
            if (command === "fuzzy_match_files") return args.files.filter((item: any) => item.path.includes(args.query)).map((entry: any) => ({ file: entry, relative_path: entry.path, score: 1, match_indices: [] }));
            assert.fail(`Unexpected native call: ${command}`);
          },
        };
        if (name === "../workspace/api") return {
          ensureRepository: async () => ({ id: "repo", root: "/synthetic/project", defaultBranch: "main" }),
          listBranches: async () => [{ name: "main", remote: null, commit: "", isHead: true, committedAt: 0 }],
          createWorkspace: () => { boundary.creates++; return new Promise(() => {}); }, errorText: (error: Error) => error.message,
        };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => null };
        if (name === "../workspace/launchModel") return { launchDefaults: () => ({ agent: "codex", model: "fixture", effort: "" }), loadoutPicks: () => [] };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../settings/models") return { modelLabel: (value: string) => value };
        if (name === "../keybindings/KeybindingsProvider" || name.endsWith("/KeybindingsProvider.tsx")) return { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings() {} };
        if (name === "@base-ui/react/dialog") return { Dialog: { Root: passthrough, Portal: passthrough, Popup: passthrough } };
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
        if (name.endsWith("/motion/usePresence") || name.endsWith("/motion/usePresence.ts")) return { usePresence: (visible: boolean) => ({ mounted: visible, attrs: {} }) };
        if (name.endsWith("/ui/Tooltip") || name.endsWith("/ui/Tooltip.tsx")) return { Tooltip: passthrough, ShortcutHint: () => null };
        if (name.endsWith("/fileIconNames.ts")) return { fileIconName: () => "", folderIconName: () => "", materialIconUrl: () => "" };
        if (name.endsWith("/FileIcons") || name.endsWith("/FileIcons.tsx")) return { FileTypeIcon: () => null, FolderTypeIcon: () => null };
        if (name.endsWith("/Icons")) return { TerminalIcon: () => null };
        if (name.endsWith("/composerIcons") || name.endsWith("/composerIcons.tsx")) return { PaperclipIcon: () => null, PlusIcon: () => null };
        if (name.endsWith("/ModelPicker")) return { ModelPicker: () => null };
        if (name.endsWith("/ChatModelPicker")) return {};
        if (name.endsWith("/ComposerAttachmentChip")) return { ComposerAttachmentChip: () => null };
        if (name.endsWith("/draft-attachments/api.ts")) return { draftAttachmentsApi: {} };
        if (name.endsWith("/diff/ReviewButton")) return { queuePending: () => assert.fail("must not queue a message") };
        if (name === "./create/RepoSelect" || name === "./create/TargetBranchButton" || name === "./CreateFromPicker") return { [name.split("/").at(-1)!]: () => null };
        const inert = new Map<string, Record<string, unknown>>([
          ["../scripts/api", {}], ["../scripts/model", {}], ["../workspace/setupWatch", {}], ["./WorkspaceView", {}],
          ["../features/chat/reasonChat", {}], ["../features/chat/chatModel", {}], ["../workspace/firstMessage", {}],
          ["../features/chat/chatModelChoice", {}], ["../features/chat/agentChoice", {}],
          ["../workspace/pendingLaunches", { addPendingLaunch() {}, removePendingLaunch() {} }],
        ]);
        if (inert.has(name)) return inert.get(name);
        if (name.startsWith(".")) {
          const local = resolve(dirname(resolve(root, path)), name).slice(root.length + 1);
          const found = [local, `${local}.ts`, `${local}.tsx`].find((candidate) => existsSync(resolve(root, candidate)));
          if (found) return load(found);
        }
        throw new Error(`Unexpected suggestions fixture dependency ${path}: ${name}`);
      },
    });
    return exports;
  }
  const Component = load(page ? "src/components/CreateWorkspaceComposer.tsx" : "src/components/CreateWorkspaceDialog.tsx")[page ? "CreateWorkspaceComposer" : "CreateWorkspaceDialog"];
  await act(async () => {
    renderer = create(React.createElement(Component, {
      repos: options.noRepo ? [] : [{ id: "repo", name: "Project", path: "/synthetic/project", remote: "https://github.com/fixture/project", defaultBranch: "main", workspaces: [] }],
      initialRepoId: options.noRepo ? null : "repo", prefixSettings: { branch_prefix_type: "none" }, githubUsername: null,
      eyebrowVariant: "floating", addActions: {}, dispatch() {}, onWarning() {}, onClose() { boundary.closes++; },
    }), { createNodeMock: (element: any) => element.props.className === "oc-editor-mount" ? dom : null });
  });
  return {
    boundary,
    async type(text: string) { await act(async () => { editor.type(text); }); },
    menu(label: string) { return renderer.root.findAll((node: any) => node.props.role === "listbox" && node.props["aria-label"] === label); },
    draft() { return renderer.root.findByType(load("src/features/chat/ComposerEditor.tsx").ComposerEditor).props.value; },
    parts() { return JSON.parse(JSON.stringify(load("src/features/chat/composerDocument.ts").readComposerDraft(this.draft()))); },
    async key(key = "Enter", props: Record<string, unknown> = {}) {
      const event = { key, code: key, keyCode: 13, isComposing: false, defaultPrevented: false, stopped: false,
        metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...props,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
      };
      let handled = false;
      await act(async () => { handled = keyDown(event as unknown as KeyboardEvent); });
      return { handled, prevented: event.defaultPrevented, stopped: event.stopped };
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const page of [false, true]) {
  test(`pre-workspace lookup uses repository/ref/agent identity, not an existing workspace (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("@");
      assert.deepEqual(JSON.parse(JSON.stringify(view.boundary.calls.filter((call) => call.command === "pre_workspace_completions"))), [
        { command: "pre_workspace_completions", args: { repositoryId: "repo", ref: "main", agentType: "codex" } },
      ]);
      assert.equal(view.menu("Mention files").length, 1);
      assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  for (const key of ["Enter", "Tab"]) {
    test(`@ selection inserts one file atom and trailing space without creating (page=${page},key=${key})`, async () => {
      const view = await fixture(page);
      try {
        await view.type("@entry");
        assert.equal(view.menu("Mention files").length, 1);
        assert.deepEqual(await view.key(key), { handled: true, prevented: true, stopped: true });
        assert.deepEqual(view.parts(), [{ kind: "file", path: "src/entry.ts", label: "src/entry.ts", directory: false }, { kind: "text", text: " " }]);
        assert.equal(view.boundary.creates, 0);
      } finally { view.dispose(); }
    });
    test(`/ selection inserts the reported command without submitting (page=${page},key=${key})`, async () => {
      const view = await fixture(page);
      try {
        await view.type("/rev");
        assert.equal(view.menu("Slash commands").length, 1);
        assert.deepEqual(await view.key(key), { handled: true, prevented: true, stopped: true });
        assert.equal(view.draft(), "/review "); assert.equal(view.boundary.creates, 0);
      } finally { view.dispose(); }
    });
  }
  test(`directory selections preserve directory identity (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("@src");
      assert.equal(view.menu("Mention files").length, 1);
      await view.key("ArrowDown"); await view.key("Enter");
      assert.deepEqual(view.parts(), [{ kind: "file", path: "src", label: "src", directory: true }, { kind: "text", text: " " }]);
      assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  test(`Escape dismisses suggestions without closing the containing dialog (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("/rev"); assert.equal(view.menu("Slash commands").length, 1);
      assert.deepEqual(await view.key("Escape"), { handled: true, prevented: true, stopped: true });
      assert.equal(view.menu("Slash commands").length, 0); assert.equal(view.boundary.closes, 0); assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  test(`composition and unrelated keys do not submit or mutate (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("/rev");
      for (const signals of [{ isComposing: true }, { keyCode: 229 }, { key: "x" }]) {
        assert.deepEqual(await view.key("Enter", signals), { handled: false, prevented: false, stopped: false });
      }
      assert.equal(view.draft(), "/rev"); assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  test(`no repository means no native lookup, no suggestions, and no create (page=${page})`, async () => {
    const view = await fixture(page, { noRepo: true });
    try {
      await view.type("@entry");
      assert.equal(view.boundary.calls.length, 0); assert.equal(view.menu("Mention files").length, 0); assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  test(`ordinary Enter keeps the existing create path (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("Ordinary task");
      assert.equal(view.menu("Mention files").length, 0); assert.equal(view.menu("Slash commands").length, 0);
      assert.equal((await view.key()).prevented, true); assert.equal(view.boundary.creates, 1);
    } finally { view.dispose(); }
  });
}
