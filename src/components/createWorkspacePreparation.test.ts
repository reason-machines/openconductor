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
type Attachment = { name: string; text: string };
type Pending = { kind: string; text: string; attachments?: Attachment[] };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Real Create component and pure file/request transforms; only I/O and surrounding UI are substituted. */
async function fixture({ agent = "claude", defaultPlan = false, loaded = true, holdPlan = false, copy = "ok" } = {}) {
  const events: string[] = [];
  const warnings: string[] = [];
  const queued: Pending[] = [];
  const writes: { chatId: string; workspaceId: string; mode: string }[] = [];
  const staged = new Map<string, number[]>();
  const keys = new Map<string, () => unknown>();
  const planGate = deferred();
  let loadout: unknown = loaded ? { settings: { models: { default_plan_mode: defaultPlan } }, slots: [] } : null;
  let renderer: ReturnType<typeof create>;
  const modules = new Map<string, Record<string, unknown>>();
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const sourceRoot = file === "src/components/CreateWorkspaceComposer.tsx" ? process.env.OC_CREATE_PREPARATION_SOURCE_ROOT ?? root : root;
    const source = readFileSync(resolve(sourceRoot, file), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, console, TextDecoder, TextEncoder, Uint8Array, crypto: { randomUUID: () => "draft" },
      document: { activeElement: null }, HTMLElement: class {},
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        const real: Record<string, string> = {
          "../workspace/createFlow": "src/workspace/createFlow.ts",
          "../workspace/createInSection": "src/workspace/createInSection.ts",
          "./naming.ts": "src/workspace/naming.ts",
          "../workspace/naming": "src/workspace/naming.ts",
          "../features/chat/composerAttachments": "src/features/chat/composerAttachments.ts",
          "../draft-attachments/staging.ts": "src/features/draft-attachments/staging.ts",
        };
        if (real[name]) return load(real[name]);
        if (name === "@tauri-apps/api/core") return { invoke: async (command: string, args: typeof writes[number]) => {
          assert.equal(command, "local_plan_mode_set");
          writes.push({ ...args }); events.push("plan-start");
          if (holdPlan) await planGate.promise;
          events.push("plan-saved"); return args.mode;
        } };
        if (name === "../workspace/api") return {
          ensureRepository: async () => ({ id: "repo", root: "/synthetic/project", defaultBranch: "main" }),
          listBranches: async () => [],
          createWorkspace: async () => ({ workspace: { id: "created", path: "/synthetic/created", directoryName: "oslo", branchName: "oslo" } }),
          errorText: (error: Error) => error.message,
        };
        if (name === "../features/draft-attachments/api.ts") return { draftAttachmentsApi: {
          async write({ relativePath, data }: { relativePath: string; data: Uint8Array }) { staged.set(relativePath, Array.from(data)); },
          async materialize() {
            events.push("copy");
            if (copy === "throws") throw new Error("copy rejected");
            return { attachments: copy === "missing" ? [] : Array.from(staged.keys(), relativePath => ({ relativePath, error: copy === "error" ? "copy failed" : null })), stagingRemoved: copy === "ok" };
          },
          async remove() {},
        } };
        if (name === "../features/diff/ReviewButton") return { queuePending: (_id: string, message: Pending) => { queued.push(message); events.push("queue"); } };
        if (name === "../scripts/api") return { scriptsConfig: async () => ({ setup: null }), startSetup: async () => false };
        if (name === "../scripts/model") return { workspaceRef: () => ({}) };
        if (name === "../workspace/setupWatch") return { watchSetup() {}, unwatchSetup() {} };
        if (name === "../workspace/pendingLaunches") return { addPendingLaunch: () => events.push("pending"), removePendingLaunch: () => events.push("remove-pending") };
        if (name === "./WorkspaceView") return { seedTranscript: () => events.push("seed") };
        if (name === "../features/chat/reasonChat") return { configureReason: () => events.push("configure") };
        if (name === "../features/chat/chatModel") return { sessionConfig: () => ({}) };
        if (name === "../workspace/firstMessage") return { renameAfterFirstMessage: () => events.push("rename") };
        if (name === "../features/chat/chatModelChoice") return { saveModelChoice: () => events.push("model") };
        if (name === "../features/chat/agentChoice") return { saveAgent: () => events.push("agent") };
        if (name === "../workspace/launchModel") return { launchDefaults: () => ({ agent, model: "fixture", effort: "" }), loadoutPicks: () => [] };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => loadout };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../settings/models") return { modelLabel: (value: string) => value };
        if (name === "../keybindings/KeybindingsProvider") return {
          useKeybindingOverrides: () => ({ overrides: {} }),
          useKeybindings: (handlers: Record<string, () => unknown>) => { for (const [id, handler] of Object.entries(handlers)) keys.set(id, handler); },
        };
        if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
        if (name === "../keybindings/shortcut") return { glyphs: () => "", matchesEvent: () => false };
        if (name === "./motion/usePresence") return { usePresence: () => ({ mounted: true, attrs: {} }) };
        if (name === "./ui/Tooltip") return { Tooltip: ({ children }: { children: unknown }) => children };
        if (name === "../features/chat/ComposerEditor.tsx") return { ComposerEditor({ inputRef, value, onChange, onPasteFiles }: Record<string, any>) {
          React.useLayoutEffect(() => { inputRef.current = { focus() {}, focused: () => true }; return () => { inputRef.current = null; }; }, []);
          return React.createElement("textarea", { value, onChange, onPasteFiles });
        } };
        const nullComponents: Record<string, string[]> = {
          "../features/chat/ModelPicker": ["ModelPicker"], "../features/chat/ChatModelPicker": [],
          "./create/RepoSelect": ["RepoSelect"], "./create/TargetBranchButton": ["TargetBranchButton"],
          "./CreateFromPicker": ["CreateFromPicker"], "../features/chat/ComposerAttachmentChip": ["ComposerAttachmentChip"],
          "../features/chat/composerIcons": ["PaperclipIcon", "PlusIcon"], "../features/chat/composer.css": [],
        };
        if (name in nullComponents) return Object.fromEntries(nullComponents[name].map(component => [component, () => null]));
        throw new Error(`Unexpected preparation dependency ${name}`);
      },
    });
    return exports;
  }
  const Component = load("src/components/CreateWorkspaceComposer.tsx").CreateWorkspaceComposer as Parameters<typeof React.createElement>[0];
  const props = {
    repos: [{ id: "repo", name: "Project", path: "/synthetic/project", defaultBranch: "main", workspaces: [] }],
    initialRepoId: "repo", prefixSettings: { branch_prefix_type: "none" }, githubUsername: null,
    eyebrowVariant: "floating", addActions: {},
    onLaunchStart: () => events.push("launch-start"), onClose: () => events.push("close"),
    dispatch: (action: { type: string }) => events.push(action.type), onWarning: (message: string) => warnings.push(message),
  };
  await act(async () => { renderer = create(React.createElement(Component, props)); });
  const plan = () => renderer.root.find((node: { type: { name?: string } }) => node.type?.name === "CreateAddMenu").props.planMode;
  return {
    events, warnings, queued, writes, staged, plan,
    async settings(value: boolean) { loadout = { settings: { models: { default_plan_mode: value } }, slots: [] }; await act(async () => renderer.update(React.createElement(Component, props))); },
    async toggle() { await act(async () => plan().onToggle()); },
    async shortcut() { let result: unknown; await act(async () => { result = keys.get("chat.togglePlanMode")?.(); }); return result; },
    async message(text = "First request") { await act(async () => renderer.root.findByType("textarea").props.onChange(text)); },
    async files(files: File[]) { await act(async () => renderer.root.findByType("textarea").props.onPasteFiles(files)); },
    async submit() { await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); }); },
    async finishPlan(error?: Error) { await act(async () => { if (error) planGate.reject(error); else planGate.resolve(); }); },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const defaultPlan of [false, true]) {
  test(`Create inherits Plan default ${defaultPlan} and persists before the first text prompt`, async () => {
    const f = await fixture({ defaultPlan, holdPlan: true });
    try {
      assert.equal(f.plan().isPlanMode, defaultPlan);
      await f.message(); await f.submit();
      assert.deepEqual(f.writes, [{ chatId: "created", workspaceId: "created", mode: defaultPlan ? "plan" : "default" }]);
      assert.ok(!f.events.includes("seed")); assert.ok(!f.events.includes("addWorkspace"));
      assert.ok(f.plan().disabled);
      await f.finishPlan();
      assert.ok(f.events.indexOf("plan-saved") < f.events.indexOf("seed"));
      assert.ok(f.events.indexOf("seed") < f.events.indexOf("addWorkspace"));
      assert.ok(f.events.includes("rename"));
    } finally { await f.finishPlan(); f.dispose(); }
  });
  test(`Create explicitly overrides Plan default ${defaultPlan} using either menu or shortcut`, async () => {
    const f = await fixture({ defaultPlan });
    try {
      await f.toggle(); assert.equal(f.plan().isPlanMode, !defaultPlan);
      await f.shortcut(); assert.equal(f.plan().isPlanMode, defaultPlan);
      await f.shortcut(); assert.equal(f.plan().isPlanMode, !defaultPlan);
      await f.settings(defaultPlan); assert.equal(f.plan().isPlanMode, !defaultPlan, "settings refresh must not erase an explicit choice");
      await f.message(); await f.submit();
      assert.equal(f.writes[0]?.mode, defaultPlan ? "default" : "plan");
    } finally { f.dispose(); }
  });
}

test("Create inherits asynchronously loaded settings until an explicit choice is made", async () => {
  const f = await fixture({ loaded: false });
  try {
    assert.equal(f.plan().isPlanMode, false);
    await f.settings(true); assert.equal(f.plan().isPlanMode, true);
    await f.toggle(); assert.equal(f.plan().isPlanMode, false);
    await f.settings(false); await f.settings(true); assert.equal(f.plan().isPlanMode, false);
    await f.message(); await f.submit(); assert.equal(f.writes[0]?.mode, "default");
  } finally { f.dispose(); }
});

test("an explicit Plan choice before settings load survives the load", async () => {
  const f = await fixture({ loaded: false });
  try {
    await f.shortcut(); await f.settings(false); assert.equal(f.plan().isPlanMode, true);
  } finally { f.dispose(); }
});

for (const attachments of [false, true]) {
  test(`Plan persistence gates ${attachments ? "attachment delivery" : "an empty-prompt workspace"}`, async () => {
    const f = await fixture({ defaultPlan: true, holdPlan: true });
    try {
      if (attachments) { await f.message(); await f.files([new File(["inline"], "note.txt")]); }
      await f.submit();
      assert.ok(!f.events.includes("addWorkspace")); assert.equal(f.queued.length, 0);
      await f.finishPlan();
      assert.ok(f.events.includes("addWorkspace"));
      if (attachments) { assert.equal(f.queued[0]?.kind, "send"); assert.ok(f.events.indexOf("plan-saved") < f.events.indexOf("queue")); }
      else assert.ok(!f.events.includes("seed"));
    } finally { await f.finishPlan(); f.dispose(); }
  });
  test(`rejected Plan persistence keeps created workspace reachable without auto-send (attachments=${attachments})`, async () => {
    const f = await fixture({ holdPlan: true });
    try {
      await f.shortcut(); await f.message();
      if (attachments) await f.files([new File(["keep me"], "note.txt"), new File([Uint8Array.of(0, 255)], "blob.bin")]);
      await f.submit(); await f.finishPlan(new Error("Plan write refused"));
      assert.ok(f.events.includes("addWorkspace")); assert.ok(f.events.includes("remove-pending"));
      assert.ok(!f.events.includes("seed")); assert.ok(!f.events.includes("rename"));
      assert.equal(f.queued[0]?.kind, "draft"); assert.equal(f.queued[0]?.text, "First request");
      assert.deepEqual(f.queued[0]?.attachments ? JSON.parse(JSON.stringify(f.queued[0].attachments)) : [], attachments ? [{ name: "note.txt", text: "keep me" }] : []);
      assert.match(f.warnings.join(" "), /Plan.*write refused/);
      assert.ok(!f.events.includes("copy"), "failed Plan setup must not send or discard staged data");
    } finally { await f.finishPlan(); f.dispose(); }
  });
}

for (const copy of ["error", "missing", "throws"]) {
  test(`failed binary copy (${copy}) preserves inline UTF-8 files in the editable draft`, async () => {
    const f = await fixture({ agent: "reason", copy });
    try {
      await f.message(); await f.files([new File(["first α"], "one.txt"), new File([Uint8Array.of(0, 255)], "blob.bin"), new File(["second\nline"], "two.txt")]);
      await f.submit();
      assert.equal(f.queued[0]?.kind, "draft"); assert.equal(f.queued[0]?.text, "First request");
      assert.ok(f.queued[0]?.attachments, "inline files must survive the failed copy");
      assert.deepEqual(JSON.parse(JSON.stringify(f.queued[0].attachments)), [{ name: "one.txt", text: "first α" }, { name: "two.txt", text: "second\nline" }]);
      assert.equal(f.staged.size, 1); assert.ok(f.events.includes("addWorkspace"));
      assert.ok(!f.events.includes("seed")); assert.ok(!f.events.includes("rename"));
      assert.match(f.warnings.join(" "), /first message was not sent/);
    } finally { f.dispose(); }
  });
}

test("successful mixed attachment delivery still includes both inline and materialized files", async () => {
  const f = await fixture();
  try {
    await f.message(); await f.files([new File(["keep me"], "note.txt"), new File([Uint8Array.of(0, 255)], "blob.bin")]); await f.submit();
    assert.equal(f.queued[0]?.kind, "send"); assert.equal(f.queued[0]?.attachments?.length, 2);
    assert.ok(f.events.indexOf("plan-saved") < f.events.indexOf("copy"));
    assert.ok(f.events.indexOf("copy") < f.events.indexOf("queue")); assert.equal(f.warnings.length, 0);
  } finally { f.dispose(); }
});

for (const agent of ["reason", "codex"]) {
  test(`${agent} launch stays outside the Claude Plan persistence boundary`, async () => {
    const f = await fixture({ agent, defaultPlan: true });
    try {
      assert.equal(f.plan(), undefined); assert.equal(await f.shortcut(), false);
      await f.message(); await f.submit(); assert.equal(f.writes.length, 0); assert.ok(f.events.includes("seed"));
    } finally { f.dispose(); }
  });
}
