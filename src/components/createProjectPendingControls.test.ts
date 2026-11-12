import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { CreatedProject, CreateProgress, CreateProjectRequest } from "../backend";
import * as createModel from "../state/createProject.ts";
import * as cloneModel from "../state/cloneDialog.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
type Host = { props: Record<string, unknown>; findByProps: (props: object) => Host };
type Creation = {
  request: CreateProjectRequest;
  progress: (value: CreateProgress) => void;
  resolve: (value: CreatedProject) => void;
  reject: (error: Error) => void;
};

async function fixture() {
  const creations: Creation[] = [];
  const picks: { directory: boolean; multiple: boolean; title: string; defaultPath?: string }[] = [];
  const registered: string[] = [];
  const workspaces: { id: string; root: string; defaultBranch: string }[] = [];
  const scripts: unknown[] = [];
  const preferences: unknown[] = [];
  const added: unknown[] = [];
  const completed: { repoId: string; githubUrl: string }[] = [];
  const modules = new Map<string, Record<string, unknown>>();
  let closed = 0;
  let picked: string | null = null;
  let renderer: ReturnType<typeof create>;
  class ProgressChannel { onmessage: (value: CreateProgress) => void = () => {}; }
  function invoke(command: string, payload: Record<string, unknown>) {
    if (command === "create_new_project") {
      const request = payload.request;
      assert.ok(request !== null && typeof request === "object");
      assert.ok("slug" in request && typeof request.slug === "string");
      assert.ok("parentDir" in request && typeof request.parentDir === "string");
      assert.ok("template" in request && (request.template === "empty" || request.template === "nextjs"));
      const channel = payload.onProgress;
      assert.ok(channel instanceof ProgressChannel);
      const captured: CreateProjectRequest = { parentDir: request.parentDir, slug: request.slug, template: request.template };
      return new Promise<CreatedProject>((resolve, reject) => {
        creations.push({ request: captured, progress: value => channel.onmessage(value), resolve, reject });
        channel.onmessage({ kind: "step", text: "Creating project directory..." });
      });
    }
    if (command === "add_repository") {
      assert.equal(typeof payload.path, "string");
      registered.push(String(payload.path));
      return Promise.resolve({ id: "registered", name: "before-project", root: payload.path, defaultBranch: "main" });
    }
    if (command === "save_repo_scripts") { scripts.push(payload); return Promise.resolve(); }
    throw new Error(`Unexpected create-project command: ${command}`);
  }
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const parts = {
      Root: ({ children }: { children: unknown }) => children,
      Portal: ({ children }: { children: unknown }) => children,
      Backdrop: () => null,
      Popup: React.forwardRef((props: object, ref: unknown) => React.createElement("section", { ...props, ref })),
    };
    runInNewContext(ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, Error, window: {}, document: { activeElement: null }, HTMLElement: class {},
      localStorage: { getItem: () => null, removeItem() {} },
      console: { warn() {} },
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name === "../backend") return load("../backend.ts");
        if (name === "./state/createProject" || name === "../state/createProject") return createModel;
        if (name === "../state/cloneDialog") return cloneModel;
        if (name === "@tauri-apps/api/core") return { invoke, Channel: ProgressChannel, isTauri: () => true };
        if (name === "@tauri-apps/plugin-dialog") return {
          async open(options: { directory: boolean; multiple: boolean; title: string; defaultPath?: string }) {
            picks.push({ ...options });
            return picked;
          },
        };
        if (name === "./settings/appPrefs") return {
          getAppPrefs: () => ({ last_clone_directory: null }),
          loadAppPrefs: async () => ({ last_clone_directory: null }),
          async setAppPref(value: unknown) { preferences.push(value); },
        };
        if (name === "../workspace/api") return { defaultCloneDirectory: async () => "/synthetic/old" };
        if (name === "../home/createFirstWorkspace") return {
          async createFirstWorkspace(repo: { id: string; root: string; defaultBranch: string }) {
            workspaces.push({ ...repo });
            return { workspace: { id: "first-workspace" } };
          },
        };
        if (name === "./Icons") return { FileCodeIcon: () => null, NextMarkIcon: () => null };
        if (name === "./DialogFrame") return load("./DialogFrame.tsx");
        if (name === "@base-ui/react/dialog") return { Dialog: parts };
        if (name === "@base-ui/react/alert-dialog") return { AlertDialog: parts };
        if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }) };
        if (name === "../keybindings/overrides") return { effectiveShortcuts: () => ["meta+Enter"] };
        if (name === "../keybindings/shortcut") return { matchesEvent: (_shortcut: string, event: { key: string; metaKey?: boolean }) => event.key === "Enter" && event.metaKey === true };
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
        if (name === "./dialogFrame.css") return {};
        throw new Error(`Unexpected create-project dependency: ${name}`);
      },
    });
    return exports;
  }
  const { CreateProjectDialog } = load("./CreateProjectDialog.tsx");
  assert.ok(typeof CreateProjectDialog === "function");
  const primary = (): Host => renderer.root.findByProps({ type: "submit" });
  const send = (host: Host, event: string, value?: unknown) => {
    const handler = host.props[event];
    assert.ok(typeof handler === "function", `Missing ${event} handler`);
    return handler(value);
  };
  const submit = async () => {
    await act(async () => { void send(renderer.root.findByType("form"), "onSubmit", { preventDefault() {} }); });
  };
  await act(async () => {
    renderer = create(React.createElement(CreateProjectDialog, {
      onClose() { closed++; },
      onRepoAdded(repo: unknown) { added.push(repo); },
      onCreated(repoId: string, _first: unknown, githubUrl: string) { completed.push({ repoId, githubUrl }); },
    }), {
      createNodeMock(element: { type: unknown }) {
        if (element.type !== "section") return null;
        return {
          querySelector() {
            if (primary().props.disabled === true) return null;
            return { click: () => { void submit(); } };
          },
        };
      },
    });
  });
  const input = (field: "name" | "parent"): Host => renderer.root.findByProps(field === "name" ? { id: "project-name" } : { placeholder: "Enter path or click to select" });
  const template = (label: string): Host => {
    const node = renderer.root.findAllByProps({ role: "radio" }).find((host: Host) => host.findByProps({ className: "create-project-template-label" }).props.children === label);
    assert.ok(node, `Missing ${label} template`);
    return node;
  };
  const browse = (): Host => {
    const node = renderer.root.findAllByType("button").find((host: Host) => host.props.children === "Browse");
    assert.ok(node);
    return node;
  };
  function edit(field: "name" | "parent", value: string) {
    assert.notEqual(input(field).props.disabled, true, `Pending ${field} must remain editable`);
    act(() => send(input(field), "onChange", { target: { value } }));
  }
  return {
    creations, picks, registered, workspaces, scripts, preferences, added, completed,
    primary, input, template, browse, edit, submit,
    get closed() { return closed; },
    rendered: () => JSON.stringify(renderer.toJSON()),
    async start() {
      edit("name", "before-project");
      assert.equal(input("parent").props.value, "/synthetic/old");
      await submit();
      assert.equal(creations.length, 1);
      assert.equal(primary().props.disabled, true);
    },
    async pick(value: string | null) {
      assert.notEqual(browse().props.disabled, true, "Pending Browse must remain available");
      picked = value;
      await act(async () => { send(browse(), "onClick"); });
    },
    select(label: string) {
      assert.notEqual(template(label).props.disabled, true, "Pending templates must remain selectable");
      act(() => send(template(label), "onClick"));
    },
    shortcut() {
      let prevented = false;
      act(() => send(renderer.root.findByType("section"), "onKeyDown", {
        defaultPrevented: false,
        nativeEvent: { key: "Enter", metaKey: true, isComposing: false },
        preventDefault() { prevented = true; },
      }));
      return prevented;
    },
    progress(value: CreateProgress) { act(() => creations[0].progress(value)); },
    async fail() { await act(async () => creations[0].reject(new Error("Synthetic create failure"))); },
    async succeed() {
      await act(async () => creations[0].resolve({
        path: "/synthetic/old/before-project", githubUrl: "https://github.com/synthetic/before-project",
        originRemoteUrl: "git@github.com:synthetic/before-project.git", defaultBranch: "main",
      }));
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

const originalRequest: CreateProjectRequest = { parentDir: "/synthetic/old", slug: "before-project", template: "empty" };

for (const field of ["name", "parent"] satisfies ("name" | "parent")[]) {
  test(`pending Create project ${field} edits preserve the active request and survive rejection`, async () => {
    const view = await fixture();
    try {
      await view.start();
      const next = field === "name" ? "after-project" : "/synthetic/new";
      view.edit(field, next);
      assert.equal(view.input(field).props.value, next);
      assert.deepEqual(view.creations.map(call => call.request), [originalRequest]);
      await view.submit();
      assert.equal(view.creations.length, 1);
      await view.fail();
      assert.equal(view.input(field).props.value, next);
      assert.equal(view.primary().props.disabled, false);
    } finally { view.dispose(); }
  });
}

test("pending Create project Browse updates only the draft and preserves Cancel", async () => {
  const view = await fixture();
  try {
    await view.start();
    await view.pick("/synthetic/picked");
    assert.equal(view.input("parent").props.value, "/synthetic/picked");
    await view.pick(null);
    assert.equal(view.input("parent").props.value, "/synthetic/picked");
    assert.deepEqual(view.picks.map(pick => pick.defaultPath), ["/synthetic/old", "/synthetic/picked"]);
    assert.deepEqual(view.creations.map(call => call.request), [originalRequest]);
    await view.succeed();
    assert.deepEqual(view.registered, ["/synthetic/old/before-project"]);
    assert.equal(view.closed, 1);
  } finally { view.dispose(); }
});

test("pending Create project template selection does not change the active pipeline", async () => {
  const view = await fixture();
  try {
    await view.start();
    view.select("Next.js");
    assert.equal(view.template("Next.js").props["aria-checked"], true);
    assert.deepEqual(view.creations.map(call => call.request), [originalRequest]);
    await view.succeed();
    assert.equal(view.scripts.length, 0, "The captured Empty template must not gain Next.js scripts");
    assert.equal(view.closed, 1);
  } finally { view.dispose(); }
});

test("pending Create project retains the primary, shortcut and duplicate-submit guards", async () => {
  const view = await fixture();
  try {
    await view.start();
    assert.match(view.rendered(), /Creating\.\.\./);
    assert.equal(view.shortcut(), true);
    await view.submit();
    view.progress({ kind: "line", text: "Synthetic progress" });
    assert.match(view.rendered(), /Synthetic progress/);
    assert.equal(view.creations.length, 1);
    assert.equal(view.primary().props.disabled, true);
    assert.equal(view.closed, 0);
  } finally { view.dispose(); }
});

test("Create project success retains its captured request and completion callbacks", async () => {
  const view = await fixture();
  try {
    await view.start();
    await view.succeed();
    assert.deepEqual(view.creations.map(call => call.request), [originalRequest]);
    assert.deepEqual(view.registered, ["/synthetic/old/before-project"]);
    assert.deepEqual(view.workspaces, [{ id: "registered", root: "/synthetic/old/before-project", defaultBranch: "main" }]);
    assert.equal(view.added.length, 1);
    assert.deepEqual(view.completed, [{ repoId: "registered", githubUrl: "https://github.com/synthetic/before-project" }]);
    assert.equal(view.preferences.length, 1);
    assert.equal(view.closed, 1);
  } finally { view.dispose(); }
});

test("Create project rejection preserves its draft and permits a new captured retry", async () => {
  const view = await fixture();
  try {
    await view.start();
    await view.fail();
    assert.equal(view.input("name").props.value, "before-project");
    assert.equal(view.input("parent").props.value, "/synthetic/old");
    assert.match(view.rendered(), /Couldn't create project: Synthetic create failure/);
    assert.equal(view.closed, 0);
    view.edit("name", "retry-project");
    view.edit("parent", "/synthetic/retry");
    view.select("Next.js");
    await view.submit();
    assert.deepEqual(view.creations.map(call => call.request), [originalRequest, { parentDir: "/synthetic/retry", slug: "retry-project", template: "nextjs" }]);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});

test("idle Create project Browse Cancel preserves the displayed folder without creating", async () => {
  const view = await fixture();
  try {
    await view.pick(null);
    assert.equal(view.input("parent").props.value, "/synthetic/old");
    assert.deepEqual(view.picks, [{ directory: true, multiple: false, title: "Choose where to create the project", defaultPath: "/synthetic/old" }]);
    assert.equal(view.creations.length, 0);
    assert.equal(view.closed, 0);
  } finally { view.dispose(); }
});
