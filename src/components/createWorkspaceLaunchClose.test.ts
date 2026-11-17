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
// Additive real-module paths introduced by Create suggestions. Existing I/O
// boundaries and every lifecycle/attachment assertion remain unchanged.
const suggestionModules: Record<string, string> = {
  "../features/chat/composerDocument.ts": "src/features/chat/composerDocument.ts",
  "../features/chat/preWorkspaceCompletions.ts": "src/features/chat/preWorkspaceCompletions.ts",
  "./create/CreateWorkspaceSuggestions.tsx": "src/components/create/CreateWorkspaceSuggestions.tsx",
  "../../workspace/createFlow.ts": "src/workspace/createFlow.ts",
  "../../features/chat/preWorkspaceCompletions.ts": "src/features/chat/preWorkspaceCompletions.ts",
  "../../features/chat/FileMentionMenu.tsx": "src/features/chat/FileMentionMenu.tsx",
  "../../features/chat/SlashMenu.tsx": "src/features/chat/SlashMenu.tsx",
  "../../features/chat/fileMentions.ts": "src/features/chat/fileMentions.ts",
  "../../features/chat/slashCommands.ts": "src/features/chat/slashCommands.ts",
  "./composerSlashRange.ts": "src/features/chat/composerSlashRange.ts",
  "./fileMentions.ts": "src/features/chat/fileMentions.ts",
  "./slashCommands.ts": "src/features/chat/slashCommands.ts",
  "./useSuggestionPointer.ts": "src/features/chat/useSuggestionPointer.ts",
  "../../components/FileIcons": "src/components/FileIcons.tsx",
  "../../components/Icons": "src/components/Icons.tsx",
  "./fileIconNames": "src/components/fileIconNames.ts",
  "./Icons": "src/components/Icons.tsx",
  "./ConductorIcon": "src/components/ConductorIcon.tsx",
  "./AppMark": "src/components/AppMark.tsx",
  "./conductorIcons.generated": "src/components/conductorIcons.generated.ts",
};
type Host = { props: Record<string, unknown> };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture({ agent = "reason", page = false, path = "/synthetic/project", repos = true, setup = false, setupFails = false, section = false, writeFails = false, copyFails = false, holdCopy = false, holdWrite = false, missingCopy = false, copyThrows = false } = {}) {
  const keys = new Map<string, (() => unknown) | undefined>();
  let editorFocused = false;
  const events: string[] = [];
  const warnings: string[] = [];
  const actions: { type: string; workspace?: { id: string }; sectionId?: string }[] = [];
  const pending = new Set<string>();
  const staged = new Map<string, number[]>();
  const copied = new Map<string, number[]>();
  const queued: { kind: string; text: string; attachments?: { name: string; text: string }[] }[] = [];
  const copyGate = deferred<void>();
  const writeGate = deferred<void>();
  const creation = deferred<{ workspace: { id: string; directoryName: string; branchName: string; path: string } }>();
  const registration = deferred<{ id: string; root: string; defaultBranch: string }>();
  const modules = new Map<string, Record<string, unknown>>();
  let submitting = false;
  let requests = 0;
  let closes = 0;
  let setScreen: (value: string) => void = () => {};
  let renderer: ReturnType<typeof create>;
  const passthrough = ({ children }: { children: unknown }) => children;
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const sourceRoot = file === "src/components/CreateWorkspaceDialog.tsx" || file === "src/components/CreateWorkspaceComposer.tsx"
      ? process.env.OC_LAUNCH_CLOSE_SOURCE_ROOT ?? root : root;
    const source = readFileSync(resolve(sourceRoot, file), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, {
      exports, console, TextDecoder, TextEncoder, Uint8Array, crypto: { randomUUID: () => "pending-launch" },
      document: { activeElement: null }, HTMLElement: class {},
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort" || name === "vscode-material-icons") return dependencies(name);
        if (suggestionModules[name]) return load(suggestionModules[name]);
        if (name === "./CreateWorkspaceComposer") return load("src/components/CreateWorkspaceComposer.tsx");
        if (name === "./CreateWorkspaceDialog") return load("src/components/CreateWorkspaceDialog.tsx");
        if (name === "../workspace/createFlow") return load("src/workspace/createFlow.ts");
        if (name === "../workspace/createInSection") return load("src/workspace/createInSection.ts");
        if (name === "./naming.ts" || name === "../workspace/naming") return load("src/workspace/naming.ts");
        if (name === "@base-ui/react/dialog") return { Dialog: { Root: passthrough, Portal: passthrough, Popup: ({ children }: { children: unknown }) => React.createElement("section", { role: "dialog" }, children) } };
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
        if (name === "./motion/usePresence") return { usePresence: () => ({ mounted: true, attrs: {} }) };
        if (name === "./ui/Tooltip") return { Tooltip: ({ children }: { children: unknown }) => children };
        if (name === "../features/chat/ComposerAttachmentChip") return { ComposerAttachmentChip: () => null };
        if (name === "../features/chat/composerAttachments") return load("src/features/chat/composerAttachments.ts");
        if (name === "../draft-attachments/staging.ts") return load("src/features/draft-attachments/staging.ts");
        if (name === "../features/draft-attachments/api.ts") return { draftAttachmentsApi: {
          async write({ draftWorkspaceId, relativePath, data }: { draftWorkspaceId: string; relativePath: string; data: Uint8Array }) {
            events.push("stage");
            if (holdWrite) await writeGate.promise;
            if (writeFails) throw new Error("Fixture staging failed");
            staged.set(`${draftWorkspaceId}/${relativePath}`, Array.from(data));
          },
          async materialize({ localWorkspaceId, workspacePath }: { localWorkspaceId: string; workspacePath: string }) {
            events.push("copy-start");
            if (holdCopy) await copyGate.promise;
            if (copyThrows) throw new Error("Fixture IPC copy refused");
            if (missingCopy) return { attachments: [], stagingRemoved: false };
            const attachments = Array.from(staged).filter(([key]) => key.startsWith(`${localWorkspaceId}/`)).map(([key, bytes]) => {
              const relativePath = key.slice(localWorkspaceId.length + 1);
              if (!copyFails) copied.set(`${workspacePath}/${relativePath}`, bytes);
              return { relativePath, error: copyFails ? "Fixture copy failed" : null };
            });
            if (!copyFails) staged.clear();
            events.push("copy-end");
            return { attachments, stagingRemoved: !copyFails };
          },
          async remove({ localWorkspaceId, relativePath }: { localWorkspaceId: string; relativePath: string }) {
            return staged.delete(`${localWorkspaceId}/${relativePath}`);
          },
        } };
        if (name === "../features/diff/ReviewButton") return { queuePending: (_id: string, message: typeof queued[number]) => { queued.push(message); events.push("queue"); } };
        if (name === "../features/chat/composerIcons") return { PaperclipIcon: () => null, PlusIcon: () => null };
        if (name === "../features/chat/composer.css") return {};
        if (name === "@tauri-apps/api/core") return { isTauri: () => false, invoke: async () => {} };
        if (name === "../workspace/api") return {
          ensureRepository() {
            if (submitting) { events.push("register"); return registration.promise; }
            return Promise.resolve({ id: "repo", root: path, defaultBranch: "main" });
          },
          listBranches: async () => [{ name: "main", remote: null, commit: "", isHead: true, committedAt: 0 }],
          createWorkspace() { requests++; events.push("create"); return creation.promise; },
          errorText: (error: Error) => error.message,
        };
        if (name === "../workspace/pendingLaunches") return {
          addPendingLaunch(id: string) { pending.add(id); events.push("pending"); },
          removePendingLaunch(id: string) { pending.delete(id); events.push("remove-pending"); },
        };
        if (name === "../scripts/api") return {
          scriptsConfig: async () => ({ setup: setup ? "echo setup" : null }),
          async startSetup() { events.push("setup"); if (setupFails) throw new Error("Setup failed"); return true; },
        };
        if (name === "../scripts/model") return { workspaceRef: () => ({ repositoryId: "repo", workspaceId: "created", path: "/synthetic/created" }) };
        if (name === "../workspace/setupWatch") return { watchSetup: () => events.push("watch"), unwatchSetup: () => events.push("unwatch") };
        if (name === "./WorkspaceView") return { seedTranscript: () => events.push("seed") };
        if (name === "../features/chat/reasonChat") return { configureReason: () => events.push("configure") };
        if (name === "../features/chat/chatModel") return { sessionConfig: () => ({}) };
        if (name === "../workspace/firstMessage") return { renameAfterFirstMessage: () => events.push("rename") };
        if (name === "../features/chat/chatModelChoice") return { saveModelChoice: () => events.push("model") };
        if (name === "../features/chat/agentChoice") return { saveAgent: () => events.push("agent") };
        if (name === "../workspace/launchModel") return { launchDefaults: () => ({ agent, model: "fixture", effort: "" }), loadoutPicks: () => [] };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => null };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../features/chat/ModelPicker") return { ModelPicker: () => null };
        if (name === "../features/chat/ChatModelPicker") return {};
        if (name === "../settings/models") return { modelLabel: (value: string) => value };
        if (name === "./create/RepoSelect") return { RepoSelect: () => null };
        if (name === "./create/TargetBranchButton") return { TargetBranchButton: ({ onChange }: { onChange: (value: string) => void }) => React.createElement("input", { "aria-label": "Target branch", onChange }) };
        if (name === "./CreateFromPicker") return { CreateFromPicker: () => null };
        if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: (handlers: Record<string, (() => unknown) | undefined>) => { for (const [id, handler] of Object.entries(handlers)) keys.set(id, handler); } };
        if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
        if (name === "../keybindings/shortcut") return { glyphs: () => "", matchesEvent: () => false };
        if (name.endsWith("/ComposerEditor.tsx") || name.endsWith("/ComposerEditor")) {
          return {
            ComposerEditor({ inputRef, value, onChange, onKeyDown }: Record<string, ((...a: unknown[]) => unknown) & string>) {
              React.useLayoutEffect(() => {
                const handle = {
                  focus: () => { editorFocused = true; }, blur: () => { editorFocused = false; }, visible: () => true,
                  focused: () => editorFocused, composing: () => false,
                  selection: () => ({ text: String(value), start: 0, end: 0 }),
                  replaceRange: () => false, insertFile: () => {}, deleteRange: () => false, newline: () => {},
                };
                Object.assign(inputRef, { current: handle });
                return () => Object.assign(inputRef, { current: null });
              }, []);
              return React.createElement("textarea", {
                "aria-label": "First message",
                value,
                onChange: (e: { target: { value: string } }) => onChange(e.target.value),
                onKeyDown: (e: { nativeEvent: KeyboardEvent }) => onKeyDown(e.nativeEvent),
              });
            },
          };
        }
        throw new Error(`Unexpected launch-close dependency ${name}`);
      },
    });
    return exports;
  }
  const Component = load(page ? "src/components/CreateWorkspaceComposer.tsx" : "src/components/CreateWorkspaceDialog.tsx")[page ? "CreateWorkspaceComposer" : "CreateWorkspaceDialog"];
  assert.equal(typeof Component, "function");
  function Shell() {
    const [screen, update] = React.useState("create");
    setScreen = update;
    return screen === "create" ? React.createElement(Component, {
      repos: repos ? [{ id: "repo", name: "Project", path, defaultBranch: "main", workspaces: [] }] : [],
      initialRepoId: "repo", prefixSettings: { branch_prefix_type: "none" }, githubUsername: null,
      eyebrowVariant: "floating", sections: section ? [{ id: "section", name: "Work", workspaceIds: [] }] : [],
      initialSectionId: section ? "section" : undefined,
      onClose() { closes++; events.push("close"); update("home"); },
      dispatch(action: { type: string }) { actions.push(action); events.push(action.type); },
      onWarning(message: string) { warnings.push(message); },
      addActions: {},
    }) : React.createElement("output", { "data-screen": screen }, screen);
  }
  await act(async () => { renderer = create(React.createElement(Shell)); });
  function send(host: Host, event: string, value: unknown) {
    const handler = host.props[event];
    assert.equal(typeof handler, "function");
    if (typeof handler === "function") return handler(value);
  }
  return {
    events, warnings, actions, pending, staged, copied, queued, keys,
    focusEditor(focused: boolean) { editorFocused = focused; },
    async shortcut() {
      const handler = keys.get("chat.togglePlanMode");
      assert.equal(typeof handler, "function", "Create must register the displayed Plan mode command");
      let result: unknown;
      await act(async () => { result = handler?.(); });
      return result;
    },
    async finishCopy() { await act(async () => copyGate.resolve()); },
    async finishWrite() { await act(async () => writeGate.resolve()); },
    chips: () => renderer.root.findAll((node: { type: unknown }) => typeof node.type === "function" && node.type.name === "ComposerAttachmentChip"),
    async removeFirst() {
      await act(async () => {
        const chip = renderer.root.findAll((node: { type: unknown }) => typeof node.type === "function" && node.type.name === "ComposerAttachmentChip")[0];
        assert.ok(chip);
        chip.props.onRemove();
      });
    },
    get requests() { return requests; }, get closes() { return closes; },
    isOpen: () => renderer.root.findAllByType("form").length === 1,
    replacement: () => renderer.root.findAllByProps({ "data-screen": "replacement" }).length === 1,
    rendered: () => JSON.stringify(renderer.toJSON()),
    async submit() { submitting = true; await act(async () => { void send(renderer.root.findByType("form"), "onSubmit", { preventDefault() {} }); }); },
    async registered() { await act(async () => registration.resolve({ id: "repo", root: path, defaultBranch: "main" })); },
    async succeed() { await act(async () => creation.resolve({ workspace: { id: "created", directoryName: "oslo", branchName: "oslo", path: "/synthetic/created" } })); },
    async fail() { await act(async () => creation.reject(new Error("Fixture creation failed"))); },
    replace() { act(() => setScreen("replacement")); },
    invalid() { act(() => send(renderer.root.findByProps({ "aria-label": "Target branch" }), "onChange", "bad..branch")); },
    message() { act(() => send(renderer.root.findByType("textarea"), "onChange", { target: { value: "First request" } })); },
    async pasteFiles(files: Pick<File, "name" | "size" | "arrayBuffer">[]) {
      let handled = false;
      await act(async () => {
        const editor = renderer.root.find((node: { type: unknown }) => typeof node.type === "function" && node.type.name === "ComposerEditor");
        handled = editor.props.onPasteFiles(files as unknown as FileList);
      });
      return handled;
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

test("create composer leaves clipboard pastes without files to the shared editor", async () => {
  const view = await fixture();
  try {
    view.message();
    assert.equal(await view.pasteFiles([]), false, "plain text and custom atoms must reach ComposerEditor.handlePaste");
    assert.match(view.rendered(), /First request/);
    assert.equal(view.requests, 0);
  } finally { view.dispose(); }
});

test("create composer still handles clipboard file attachments", async () => {
  const view = await fixture();
  try {
    assert.equal(await view.pasteFiles([new File(["fixture"], "fixture.txt", { type: "text/plain" })]), true);
    assert.equal(view.requests, 0);
  } finally { view.dispose(); }
});

test("create composer stages exact binary bytes and finishes materialization before queueing", async () => {
  const view = await fixture({ holdCopy: true });
  try {
    view.message();
    const bytes = Uint8Array.of(137, 80, 78, 71, 0, 255);
    await view.pasteFiles([new File([bytes], "disposable.png", { type: "image/png" })]);
    assert.equal(view.staged.size, 1, "binary bytes must be staged before creation");
    assert.deepEqual([...view.staged.values()][0], Array.from(bytes));
    assert.equal(view.requests, 0);
    await view.submit(); await view.registered(); await view.succeed();
    assert.ok(view.events.includes("copy-start"));
    assert.equal(view.queued.length, 0, "no prompt may name an uncopied file");
    await view.finishCopy();
    assert.equal(view.queued.length, 1);
    const message = view.queued[0]!;
    const attachment = message.attachments?.[0];
    assert.equal(message.kind, "send");
    assert.equal(message.text, "First request");
    assert.match(attachment?.name ?? "", /^\.context\/attachments\/[a-z0-9]{6}\/disposable\.png$/);
    assert.ok(attachment?.text.includes(attachment.name));
    assert.deepEqual(view.copied.get(`/synthetic/created/${attachment?.name}`), Array.from(bytes));
    assert.ok(view.events.indexOf("copy-end") < view.events.indexOf("queue"));
    assert.equal(view.staged.size, 0);
    assert.ok(!view.events.includes("seed") && !view.events.includes("rename"));
  } finally { view.dispose(); }
});

test("create composer keeps nonbinary files inline without staging", async () => {
  const view = await fixture();
  try {
    await view.pasteFiles([new File(["héllo\n"], "notes.txt", { type: "text/plain" })]);
    await view.submit(); await view.registered(); await view.succeed();
    assert.deepEqual(JSON.parse(JSON.stringify(view.queued[0]?.attachments)), [{ name: "notes.txt", text: "héllo\n" }]);
    assert.ok(!view.events.includes("stage") && !view.events.includes("copy-start"));
  } finally { view.dispose(); }
});

test("create composer blocks launch while an attachment read is pending", async () => {
  const view = await fixture({ page: true });
  const reading = deferred<ArrayBuffer>();
  try {
    await view.pasteFiles([{ name: "slow.bin", size: 2, arrayBuffer: () => reading.promise }]);
    await view.submit();
    assert.equal(view.pending.size, 0, "pending attachment work must not launch or dismiss");
    assert.equal(view.isOpen(), true);
    await act(async () => reading.resolve(Uint8Array.of(0, 255).buffer));
    await view.submit(); await view.registered(); await view.succeed();
    assert.equal(view.queued[0]?.kind, "send");
    assert.equal(view.copied.size, 1);
  } finally { reading.resolve(new ArrayBuffer(0)); view.dispose(); }
});

test("create composer surfaces staging failure without a phantom binary chip", async () => {
  const view = await fixture({ writeFails: true });
  try {
    view.message();
    await view.pasteFiles([new File([Uint8Array.of(0, 255)], "failed.bin")]);
    assert.match(view.rendered(), /Fixture staging failed/);
    assert.equal(view.staged.size, 0);
    await view.submit(); await view.registered(); await view.succeed();
    assert.equal(view.queued.length, 0);
    assert.ok(view.events.includes("seed"), "original text-only launch is preserved");
  } finally { view.dispose(); }
});

test("create composer does not auto-send a path when materialization fails", async () => {
  const view = await fixture({ copyFails: true });
  try {
    view.message();
    await view.pasteFiles([new File([Uint8Array.of(0, 255)], "failed.bin")]);
    await view.submit(); await view.registered(); await view.succeed();
    assert.equal(view.queued.filter(message => message.kind === "send").length, 0);
    assert.equal(view.queued[0]?.kind, "draft", "keep the first message editable, not silently lost");
    assert.equal(view.queued[0]?.text, "First request");
    assert.equal(view.staged.size, 1, "failed materialization keeps the staged bytes");
    assert.match(view.warnings.join(" "), /Fixture copy failed/);
    assert.ok(view.actions.some(action => action.type === "addWorkspace"), "the created workspace is still reachable");
    assert.ok(!view.events.includes("seed"));
  } finally { view.dispose(); }
});

test("create composer blocks launch while the staging write is pending", async () => {
  const view = await fixture({ page: true, holdWrite: true });
  try {
    await view.pasteFiles([new File([Uint8Array.of(0, 255)], "slow.bin")]);
    await view.submit();
    assert.equal(view.pending.size, 0);
    assert.equal(view.chips().length, 0, "do not advertise an unfinished write");
    await view.finishWrite();
    await view.submit(); await view.registered(); await view.succeed();
    assert.equal(view.copied.size, 1);
    assert.equal(view.queued[0]?.kind, "send");
  } finally { await view.finishWrite(); view.dispose(); }
});

test("same-name binary files use distinct paths and removing a chip deletes only its staged copy", async () => {
  const view = await fixture();
  try {
    await view.pasteFiles([new File([Uint8Array.of(0, 1)], "same.bin"), new File([Uint8Array.of(0, 2)], "same.bin")]);
    assert.equal(view.staged.size, 2);
    const [first, second] = [...view.staged.keys()];
    assert.notEqual(first, second);
    await view.removeFirst();
    assert.equal(view.staged.size, 1);
    assert.ok(view.staged.has(second!));
    await view.submit(); await view.registered(); await view.succeed();
    assert.equal(view.queued[0]?.attachments?.length, 1);
    assert.deepEqual([...view.copied.values()][0], [0, 2]);
  } finally { view.dispose(); }
});

for (const mode of ["missingCopy", "copyThrows"] as const) {
  test(`create composer stops automatic delivery on ${mode}`, async () => {
    const view = await fixture({ [mode]: true });
    try {
      await view.pasteFiles([new File([Uint8Array.of(0, 255)], "missing.bin")]);
      await view.submit(); await view.registered(); await view.succeed();
      assert.equal(view.queued[0]?.kind, "draft");
      assert.equal(view.queued[0]?.attachments, undefined);
      assert.equal(view.staged.size, 1);
      assert.ok(view.actions.some(action => action.type === "addWorkspace"));
      assert.match(view.warnings.join(" "), /first message was not sent/);
    } finally { view.dispose(); }
  });
}

test("create composer rejects oversized files without reading or staging them", async () => {
  const view = await fixture();
  try {
    await view.pasteFiles([{ name: "too-big.bin", size: 26 * 1024 * 1024, arrayBuffer: async () => { throw new Error("must not read oversized file"); } }]);
    assert.match(view.rendered(), /larger than 25 MB/);
    assert.equal(view.staged.size, 0);
    assert.equal(view.chips().length, 0);
  } finally { view.dispose(); }
});

test("accepted modal launch closes after pending registration and before repository registration settles", async () => {
  const view = await fixture();
  try {
    await view.submit();
    assert.equal(view.isOpen(), false);
    assert.deepEqual(view.events, ["pending", "close", "register"]);
    assert.equal(view.requests, 0);
    assert.equal(view.pending.size, 1);
    await view.registered();
    assert.equal(view.requests, 1);
    await view.succeed();
    assert.equal(view.pending.size, 0);
    assert.equal(view.closes, 1);
    assert.equal(view.actions[0]?.type, "addWorkspace");
  } finally { view.dispose(); }
});

test("late modal success does not close a replacement dialog", async () => {
  const view = await fixture();
  try {
    await view.submit();
    view.replace();
    await view.registered();
    await view.succeed();
    assert.equal(view.replacement(), true);
    assert.equal(view.closes, 1);
    assert.equal(view.pending.size, 0);
    assert.equal(view.actions.length, 1);
  } finally { view.dispose(); }
});

test("detached creation failure stays visible through the persistent warning surface", async () => {
  const view = await fixture();
  try {
    await view.submit();
    view.replace();
    await view.registered();
    await view.fail();
    assert.equal(view.replacement(), true);
    assert.deepEqual(view.warnings, ["Failed to create workspace: Fixture creation failed"]);
    assert.equal(view.pending.size, 0);
    assert.equal(view.actions.length, 0);
  } finally { view.dispose(); }
});

test("full-page creation remains mounted until success and suppresses a pending duplicate", async () => {
  const view = await fixture({ page: true });
  try {
    await view.submit();
    assert.equal(view.isOpen(), true);
    assert.equal(view.closes, 0);
    await view.submit();
    await view.registered();
    assert.equal(view.requests, 1);
    await view.succeed();
    assert.equal(view.isOpen(), false);
    assert.equal(view.closes, 1);
    assert.equal(view.pending.size, 0);
  } finally { view.dispose(); }
});

test("full-page creation failure stays inline and clears the pending row", async () => {
  const view = await fixture({ page: true });
  try {
    await view.submit();
    await view.registered();
    await view.fail();
    assert.equal(view.isOpen(), true);
    assert.match(view.rendered(), /Failed to create workspace: Fixture creation failed/);
    assert.deepEqual(view.warnings, []);
    assert.equal(view.pending.size, 0);
  } finally { view.dispose(); }
});

for (const input of ["invalid", "missing-checkout", "no-repository"] as const) {
  test(`${input} does not close or create a workspace`, async () => {
    const view = await fixture({ path: input === "missing-checkout" ? "" : "/synthetic/project", repos: input !== "no-repository" });
    try {
      if (input === "invalid") view.invalid();
      await view.submit();
      assert.equal(view.isOpen(), true);
      assert.equal(view.closes, 0);
      assert.equal(view.requests, 0);
      assert.equal(view.pending.size, 0);
      assert.deepEqual(view.warnings, []);
      if (input === "missing-checkout") assert.match(view.rendered(), /no local checkout/);
    } finally { view.dispose(); }
  });
}

for (const setupFails of [false, true]) {
  test(`detached launch preserves first message, section and setup ${setupFails ? "failure" : "success"}`, async () => {
    const view = await fixture({ setup: true, setupFails, section: true });
    try {
      view.message();
      await view.submit();
      await view.registered();
      await view.succeed();
      assert.equal(view.isOpen(), false);
      assert.equal(view.closes, 1);
      assert.equal(view.pending.size, 0);
      assert.deepEqual(view.actions.map(action => action.type), ["addWorkspace", "assignSection"]);
      assert.equal(view.actions[1]?.sectionId, "section");
      for (const event of ["configure", "seed", "rename", "setup", "watch"]) assert.ok(view.events.includes(event), event);
      assert.equal(view.events.includes("unwatch"), setupFails);
      // GAP-SB-01: state must reflect whether setup actually started.
      // setup started successfully → "setting_up" (row stays dimmed until backend clears it).
      // setup threw (setupFails) → "ready" (row must NOT stay permanently dimmed).
      const wsAction = view.actions[0] as { type: string; workspace?: { state?: string } };
      assert.equal(wsAction.workspace?.state, setupFails ? "ready" : "setting_up",
        `workspace.state must be ${setupFails ? "ready" : "setting_up"} when setup ${setupFails ? "fails" : "starts"}`
      );
    } finally { view.dispose(); }
  });
}

test("accepted modal launch adds workspace with state ready when no setup script", async () => {
  // GAP-SB-01: when startSetupScript returns false (no .setup in scriptsConfig),
  // addWorkspace must dispatch state="ready" so the row is NOT permanently dimmed.
  const view = await fixture({ setup: false });
  try {
    await view.submit();
    await view.registered();
    await view.succeed();
    assert.equal(view.pending.size, 0);
    const wsAction = view.actions.find(a => a.type === "addWorkspace") as { type: string; workspace?: { state?: string } } | undefined;
    assert.ok(wsAction, "addWorkspace must be dispatched");
    assert.equal(wsAction?.workspace?.state, "ready",
      "workspace.state must be \"ready\" when no setup script exists"
    );
  } finally { view.dispose(); }
});

// -------------------------------------------------------------------------
// workspace.addToBacklogFromComposer: Alt+Enter creates workspace idle + sets
// status to backlog without seeding or renaming.
// Evidence: Hji.txt `ca` callback + `Ei` keydown capture handler in Conductor.
// -------------------------------------------------------------------------

async function backlogFixture() {
  const events: string[] = [];
  const actions: { type: string; workspaceId?: string; status?: string }[] = [];
  const pending = new Set<string>();
  const creation = deferred<{ workspace: { id: string; directoryName: string; branchName: string; path: string } }>();
  const registration = deferred<{ id: string; root: string; defaultBranch: string }>();
  const modules = new Map<string, Record<string, unknown>>();
  let closes = 0;
  let creationFirstSession: unknown = "not-checked";
  let renderer: ReturnType<typeof create>;
  const passthrough = ({ children }: { children: unknown }) => children;
  void passthrough; // referenced by dynamic require below
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const source = readFileSync(resolve(root, file), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, {
      exports, console, crypto: { randomUUID: () => "pending-launch" },
      document: { activeElement: null }, HTMLElement: class {},
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort" || name === "vscode-material-icons") return dependencies(name);
        if (suggestionModules[name]) return load(suggestionModules[name]);
        if (name === "../workspace/createFlow") return load("src/workspace/createFlow.ts");
        if (name === "../workspace/createInSection") return load("src/workspace/createInSection.ts");
        if (name === "./naming.ts" || name === "../workspace/naming") return load("src/workspace/naming.ts");
        if (name === "../workspace/api") return {
          ensureRepository() { events.push("register"); return registration.promise; },
          listBranches: async () => [{ name: "main", remote: null, commit: "", isHead: true, committedAt: 0 }],
          createWorkspace(args: { firstSession?: unknown }) {
            creationFirstSession = args.firstSession ?? null;
            events.push("create");
            return creation.promise;
          },
          errorText: (error: Error) => error.message,
        };
        if (name === "../workspace/pendingLaunches") return {
          addPendingLaunch(id: string) { pending.add(id); events.push("pending"); },
          removePendingLaunch(id: string) { pending.delete(id); events.push("remove-pending"); },
        };
        if (name === "../scripts/api") return { scriptsConfig: async () => ({ setup: null }) };
        if (name === "../scripts/model") return { workspaceRef: () => null };
        if (name === "../workspace/setupWatch") return { watchSetup: () => {}, unwatchSetup: () => {} };
        if (name === "./WorkspaceView") return { seedTranscript: () => events.push("seed") };
        if (name === "../features/chat/reasonChat") return { configureReason: () => {} };
        if (name === "../features/chat/chatModel") return { sessionConfig: () => ({}) };
        if (name === "../workspace/firstMessage") return { renameAfterFirstMessage: () => events.push("rename") };
        if (name === "../features/chat/chatModelChoice") return { saveModelChoice: () => {} };
        if (name === "../features/chat/agentChoice") return { saveAgent: () => {} };
        if (name === "../workspace/launchModel") return {
          launchDefaults: () => ({ agent: "reason", model: "fixture", effort: "" }),
          loadoutPicks: () => [],
          pickLaunch: (_: unknown, next: unknown) => next,
        };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => null };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../features/chat/ModelPicker") return { ModelPicker: () => null };
        if (name === "../features/chat/ChatModelPicker") return {};
        if (name === "../settings/models") return { modelLabel: (v: string) => v };
        if (name === "./create/RepoSelect") return { RepoSelect: () => null };
        if (name === "./create/TargetBranchButton") return { TargetBranchButton: () => null };
        if (name === "./CreateFromPicker") return { CreateFromPicker: () => null };
        if (name === "./motion/usePresence") return { usePresence: () => ({ mounted: true, attrs: {} }) };
        if (name === "./ui/Tooltip") return { Tooltip: ({ children }: { children: unknown }) => children };
        if (name === "../features/chat/ComposerAttachmentChip") return { ComposerAttachmentChip: () => null };
        if (name === "../features/chat/composerAttachments") return { inlineText: () => null, rejectReason: () => null, safeFileName: (s: string) => s };
        if (name === "../features/draft-attachments/api.ts") return { draftAttachmentsApi: {} };
        if (name === "../features/diff/ReviewButton") return { queuePending: () => {} };
        if (name === "../features/chat/composerIcons") return { PaperclipIcon: () => null, PlusIcon: () => null };
        if (name === "../features/chat/composer.css") return {};
        if (name === "@tauri-apps/api/core") return { isTauri: () => false, invoke: async () => {} };
        if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: () => {} };
        if (name === "../keybindings/overrides") return {
          effectiveShortcuts(id: string) {
            if (id === "workspace.addToBacklogFromComposer")
              return [{ key: { kind: "logical", value: "Enter" }, alt: true, meta: false, shift: false, ctrl: false }];
            return [];
          },
        };
        if (name === "../keybindings/shortcut") return {
          glyphs: () => "",
          // Minimal matchesEvent: logical key + exact alt modifier match
          matchesEvent(s: { key: { kind: string; value: string }; alt?: boolean }, e: { key: string; altKey?: boolean }) {
            return s.key.kind === "logical" && s.key.value === e.key && !!s.alt === !!e.altKey;
          },
        };
        if (name.endsWith("/ComposerEditor.tsx") || name.endsWith("/ComposerEditor")) {
          return {
            ComposerEditor({ inputRef, value, onChange, onKeyDown }: Record<string, ((...a: unknown[]) => unknown) & string>) {
              React.useLayoutEffect(() => {
                const handle = {
                  focus: () => {}, blur: () => {}, visible: () => true,
                  focused: () => false, composing: () => false,
                  selection: () => ({ text: String(value), start: 0, end: 0 }),
                  replaceRange: () => false, insertFile: () => {}, deleteRange: () => false, newline: () => {},
                };
                Object.assign(inputRef, { current: handle });
                return () => Object.assign(inputRef, { current: null });
              }, []);
              return React.createElement("textarea", {
                "aria-label": "First message",
                value,
                onChange: (e: { target: { value: string } }) => onChange(e.target.value),
                onKeyDown: (e: { nativeEvent: KeyboardEvent }) => onKeyDown(e.nativeEvent),
              });
            },
          };
        }
        throw new Error(`Unexpected backlog-fixture dependency ${name}`);
      },
    });
    return exports;
  }
  const CreateWorkspaceComposer = load("src/components/CreateWorkspaceComposer.tsx")["CreateWorkspaceComposer"] as (props: Record<string, unknown>) => unknown;
  assert.equal(typeof CreateWorkspaceComposer, "function");
  function Shell() {
    return React.createElement(CreateWorkspaceComposer as Parameters<typeof React.createElement>[0], {
      repos: [{ id: "repo", name: "Project", path: "/synthetic/project", defaultBranch: "main", workspaces: [] }],
      initialRepoId: "repo", prefixSettings: { branch_prefix_type: "none" }, githubUsername: null,
      eyebrowVariant: "floating", sections: [], initialSectionId: undefined,
      onClose() { closes++; events.push("close"); },
      dispatch(action: { type: string; workspaceId?: string; status?: string }) { actions.push(action); events.push(action.type); },
      onWarning() {},
      addActions: {},
    });
  }
  await act(async () => { renderer = create(React.createElement(Shell)); });
  function send(host: { props: Record<string, unknown> }, event: string, value: unknown) {
    const handler = host.props[event];
    if (typeof handler === "function") return (handler as (v: unknown) => unknown)(value);
  }
  return {
    events, actions, pending,
    get closes() { return closes; },
    get creationFirstSession() { return creationFirstSession; },
    async altEnter() {
      await act(async () => {
        // nativeEvent needs preventDefault/stopPropagation because ComposerEditor passes the native
        // event directly to onKeyDown (no React synthetic wrapper), so the handler calls e.preventDefault().
        const nativeEvent = { key: "Enter", altKey: true, isComposing: false, preventDefault() {}, stopPropagation() {} } as unknown as KeyboardEvent;
        send(
          renderer.root.findByType("textarea"),
          "onKeyDown",
          { nativeEvent, key: "Enter", altKey: true, preventDefault() {}, stopPropagation() {} },
        );
      });
    },
    async registered() { await act(async () => registration.resolve({ id: "repo", root: "/synthetic/project", defaultBranch: "main" })); },
    async succeed() {
      await act(async () => creation.resolve({ workspace: { id: "backlog-ws", directoryName: "lima", branchName: "lima", path: "/synthetic/backlog" } }));
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

test("Alt+Enter (addToBacklogFromComposer) creates workspace idle, sets backlog status, skips seed/rename", async () => {
  const view = await backlogFixture();
  try {
    await view.altEnter();
    await view.registered();
    await view.succeed();
    // addWorkspace then setWorkspaceStatus(backlog) in that order
    assert.deepEqual(
      view.actions.map((a) => a.type),
      ["addWorkspace", "setWorkspaceStatus"],
    );
    assert.equal(view.actions[1]?.status, "backlog");
    assert.equal(view.actions[1]?.workspaceId, "backlog-ws");
    // No firstSession sent to createWorkspace — the workspace starts idle
    assert.equal(view.creationFirstSession, null, "backlog workspace must have no firstSession");
    // No seed or rename — no chat session started
    assert.ok(!view.events.includes("seed"), "seed must not fire for backlog workspace");
    assert.ok(!view.events.includes("rename"), "rename must not fire for backlog workspace");
    // Dialog closed after success
    assert.equal(view.closes, 1);
  } finally { view.dispose(); }
});

for (const page of [false, true]) {
  test(`create Plan shortcut toggles the existing menu state while editor-focused (page=${page})`, async () => {
    const view = await fixture({ page, agent: "claude" });
    try {
      view.focusEditor(true);
      assert.match(view.rendered(), /Plan mode/);
      await view.shortcut();
      assert.match(view.rendered(), /Exit plan mode/);
      await view.shortcut();
      assert.doesNotMatch(view.rendered(), /Exit plan mode/);
      assert.equal(view.requests, 0);
      assert.equal(view.queued.length, 0);
    } finally { view.dispose(); }
  });
}
test("create Plan shortcut leaves an unfocused editor unchanged", async () => {
  const view = await fixture({ page: true, agent: "claude" });
  try {
    view.focusEditor(false);
    const handler = view.keys.get("chat.togglePlanMode");
    if (handler) assert.equal(await view.shortcut(), false);
    assert.doesNotMatch(view.rendered(), /Exit plan mode/);
    view.focusEditor(true);
    await view.shortcut();
    assert.match(view.rendered(), /Exit plan mode/);
    view.focusEditor(false);
    assert.equal(await view.shortcut(), false);
    assert.match(view.rendered(), /Exit plan mode/);
  } finally { view.dispose(); }
});
test("create Plan shortcut does not change launch controls while creating", async () => {
  const view = await fixture({ page: true, agent: "claude" });
  try {
    view.focusEditor(true);
    await view.shortcut();
    await view.submit();
    assert.equal(await view.shortcut(), false);
    assert.match(view.rendered(), /Exit plan mode/);
    assert.equal(view.requests, 0);
  } finally { view.dispose(); }
});
for (const agent of ["reason", "codex"]) {
  test(`create Plan shortcut never exposes unsupported agent controls (${agent})`, async () => {
    const view = await fixture({ page: true, agent });
    try {
      view.focusEditor(true);
      const handler = view.keys.get("chat.togglePlanMode");
      if (handler) assert.equal(await view.shortcut(), false);
      assert.doesNotMatch(view.rendered(), /Exit plan mode/);
      assert.equal(view.requests, 0);
    } finally { view.dispose(); }
  });
}
