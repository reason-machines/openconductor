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
type Host = { props: Record<string, unknown> };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture({ page = false, path = "/synthetic/project", repos = true, setup = false, setupFails = false, section = false } = {}) {
  const events: string[] = [];
  const warnings: string[] = [];
  const actions: { type: string; workspace?: { id: string }; sectionId?: string }[] = [];
  const pending = new Set<string>();
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, console, crypto: { randomUUID: () => "pending-launch" },
      document: { activeElement: null }, HTMLElement: class {},
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name === "./CreateWorkspaceComposer") return load("src/components/CreateWorkspaceComposer.tsx");
        if (name === "./CreateWorkspaceDialog") return load("src/components/CreateWorkspaceDialog.tsx");
        if (name === "../workspace/createFlow") return load("src/workspace/createFlow.ts");
        if (name === "../workspace/createInSection") return load("src/workspace/createInSection.ts");
        if (name === "./naming.ts" || name === "../workspace/naming") return load("src/workspace/naming.ts");
        if (name === "@base-ui/react/dialog") return { Dialog: { Root: passthrough, Portal: passthrough, Popup: ({ children }: { children: unknown }) => React.createElement("section", { role: "dialog" }, children) } };
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
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
        if (name === "../workspace/launchModel") return { launchDefaults: () => ({ agent: "reason", model: "fixture", effort: "" }), loadoutPicks: () => [] };
        if (name === "../settings/agents/useLoadout") return { useLoadout: () => null };
        if (name === "../features/chat/loadoutChoices") return { loadoutChoices: () => [] };
        if (name === "../features/chat/ModelPicker") return { ModelPicker: () => null };
        if (name === "../features/chat/ChatModelPicker") return {};
        if (name === "../settings/models") return { modelLabel: (value: string) => value };
        if (name === "./create/RepoSelect") return { RepoSelect: () => null };
        if (name === "./create/TargetBranchButton") return { TargetBranchButton: ({ onChange }: { onChange: (value: string) => void }) => React.createElement("input", { "aria-label": "Target branch", onChange }) };
        if (name === "./CreateFromPicker") return { CreateFromPicker: () => null };
        if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }) };
        if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
        if (name === "../keybindings/shortcut") return { glyphs: () => "", matchesEvent: () => false };
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
    events, warnings, actions, pending,
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
    dispose() { act(() => renderer.unmount()); },
  };
}

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
    } finally { view.dispose(); }
  });
}
