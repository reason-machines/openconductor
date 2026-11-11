import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { SectionDialogMode } from "./SectionDialog";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
type Host = { props: Record<string, unknown> };
type Write = { resolve: (written: boolean) => void; reject: (error: Error) => void };

async function fixture(mode: SectionDialogMode) {
  const writes: Write[] = [];
  const logs: unknown[][] = [];
  let reads = 0;
  let sequence = 0;
  let mounted: ReturnType<typeof create>;
  let dispatch: (action: unknown) => void = () => { throw new Error("Store not mounted"); };
  let reopen: (data: SectionDialogMode) => void = () => { throw new Error("Dialog not mounted"); };
  let batchSubmit: () => void = () => { throw new Error("App handler not bound"); };
  let activeMode = mode;
  let generated = 0;
  const timers = new Map<number, () => void>();
  const modules = new Map<string, Record<string, unknown>>();
  const jsx = dependencies("react/jsx-runtime");
  const window = { location: { search: "", pathname: "/" }, addEventListener() {}, removeEventListener() {} };
  const localStorage = { getItem: () => null, setItem() {} };
  const section = { id: "existing", name: "Before", emoji: null, workspaceIds: [] };
  const unused = new Set(["./names", "./repoOrder", "./sidebarOrder", "./nextUnread", "./chatUnread", "./addRepo", "../workspace/archive", "../scripts/api", "../scripts/model", "../workspace/setupWatch"]);
  const files: Record<string, string> = {
    "./navigationSections": "../state/navigationSections.ts",
    "./Dialogs": "./Dialogs.tsx",
    "./sectionEmoji": "./sectionEmoji.ts",
    "./toastTiming": "./toastTiming.ts",
  };
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, window, localStorage, URLSearchParams,
      console: { error: (...args: unknown[]) => logs.push(args) },
      setTimeout(callback: () => void) { const id = ++sequence; timers.set(id, callback); return id; },
      clearTimeout(id: number) { timers.delete(id); },
      require(name: string) {
        if (name === "react") return React;
        if (name === "react/jsx-runtime") return jsx;
        if (name === "@tauri-apps/api/core") return {
          invoke(command: string) {
            if (command === "db_list_repos" || command === "db_list_workspaces") return Promise.resolve([]);
            if (command === "db_read_navigation_sections") { reads++; return Promise.resolve({ sections: [section], updatedAt: 1 }); }
            if (command === "db_write_navigation_sections") return new Promise<boolean>((resolve, reject) => writes.push({ resolve, reject }));
            throw new Error(`Unexpected section write command: ${command}`);
          },
        };
        if (name === "../backend") return { inTauri: () => true };
        if (name === "./selectors") return { startSelection: (state: unknown) => state };
        if (name === "./persisted") return {
          parsePrefs: () => ({ collapsed: [], expanded: [], selection: { kind: "root" } }),
          prefsOf: () => ({}), reposFromDb: () => [], restoreChatTabsOf() {}, validSelection: (selection: unknown) => selection,
        };
        if (name === "./sidebarPersist") return { sidebarWrite: () => undefined };
        if (name === "../settings/appPrefs") return { useAppPrefs: () => ({}) };
        if (name === "./Icons") return { CloseIcon: () => null };
        if (name === "./sidebarMotion") return { endingProps: () => ({}) };
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
        if (name in files) return load(files[name]);
        if (unused.has(name)) return {};
        throw new Error(`Unexpected section write dependency: ${name}`);
      },
    });
    return exports;
  }
  const { useAppStore } = load("../state/store.ts");
  const { useToasts, Toaster } = load("./Toast.tsx");
  const { SectionDialog } = load("./SectionDialog.tsx");
  assert.ok(typeof useAppStore === "function");
  assert.ok(typeof useToasts === "function");
  assert.ok(typeof SectionDialog === "function");
  const app = ts.createSourceFile("App.tsx", readFileSync(new URL("../App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: string | undefined;
  function visit(node: import("typescript").Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "submitSection") initializer = node.initializer?.getText(app);
    ts.forEachChild(node, visit);
  }
  visit(app);
  assert.ok(initializer, "Mount the actual App submitSection handler, not a copied callback");
  const binding = ts.transpileModule(`(function(dispatch, show, newId) { return ${initializer}; })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const bindSubmit = runInNewContext(binding);
  const Harness = () => {
    const [, send] = useAppStore();
    const { toasts, show, dismiss } = useToasts();
    const [open, setOpen] = React.useState(true);
    const [data, setData] = React.useState(mode);
    activeMode = data;
    dispatch = send;
    reopen = next => { setData(next); setOpen(true); };
    const submit = bindSubmit(send, show, () => `created-${++generated}`);
    batchSubmit = () => {
      submit({ mode: "create" }, { name: "Created together" });
      submit({ mode: "edit", sectionId: "existing", name: "Before" }, { name: "Edited together" });
    };
    return React.createElement(React.Fragment, null,
      open && React.createElement(SectionDialog, { data, onSubmit: (value: unknown) => submit(data, value), onClose: () => setOpen(false) }),
      React.createElement(Toaster, { toasts, dismiss }),
    );
  };
  await act(async () => { mounted = create(React.createElement(Harness)); });
  const click = (label: string) => {
    const button = mounted.root.findAllByType("button").find((host: Host) => host.props.children === label);
    assert.ok(button, `Missing ${label} button`);
    act(() => button.props.onClick());
  };
  return {
    writes, logs,
    get reads() { return reads; },
    dialogs: () => mounted.root.findAllByProps({ role: "dialog" }).length,
    alerts: (): string[] => mounted.root.findAllByProps({ className: "toast-message" }).map((host: Host) => host.props.children).flat().filter((value: unknown): value is string => typeof value === "string"),
    submit() {
      const input = mounted.root.findByProps({ "aria-label": "Section name" });
      act(() => input.props.onChange({ target: { value: "Saved name" } }));
      click(activeMode.mode === "create" ? "Create" : "Save");
    },
    reopen(data: SectionDialogMode) { act(() => reopen(data)); },
    batchSubmit() { act(() => batchSubmit()); },
    cancel() { click("Cancel"); },
    unrelatedWrite() { act(() => dispatch({ type: "reorderSection", sectionId: "existing", toIndex: 0 })); },
    async succeed(index = 0, written = true) { await act(async () => writes[index].resolve(written)); },
    async fail(index = 0) { await act(async () => writes[index].reject(new Error("synthetic private database diagnostic"))); },
    dispose() { act(() => mounted.unmount()); },
  };
}

test("section writes retain their own error feedback when pending writes settle out of order", async () => {
  const view = await fixture({ mode: "create" });
  try {
    view.submit();
    view.reopen({ mode: "edit", sectionId: "existing", name: "Before" });
    view.submit();
    assert.equal(view.writes.length, 2);
    await view.fail(1);
    assert.deepEqual(view.alerts(), ["Couldn't edit section"]);
    await view.fail(0);
    assert.deepEqual(view.alerts(), ["Couldn't edit section", "Couldn't create section"]);
    assert.equal(view.writes.length, 2);
  } finally { view.dispose(); }
});

test("a coalesced section write retains both create and edit failure callbacks", async () => {
  const view = await fixture({ mode: "create" });
  try {
    view.batchSubmit();
    assert.equal(view.writes.length, 1);
    await view.fail();
    assert.deepEqual(view.alerts(), ["Couldn't create section", "Couldn't edit section"]);
    assert.equal(view.reads, 2);
  } finally { view.dispose(); }
});

for (const mode of [{ mode: "create" }, { mode: "edit", sectionId: "existing", name: "Before" }] satisfies SectionDialogMode[]) {
  test(`section ${mode.mode} reports a rejected write after the actual dialog unmounts`, async () => {
    const view = await fixture(mode);
    try {
      view.submit();
      assert.equal(view.dialogs(), 0, "Save must close before persistence settles");
      assert.equal(view.writes.length, 1);
      assert.deepEqual(view.alerts(), []);
      await view.fail();
      assert.equal(view.dialogs(), 0, "A failed write must not reopen the dialog");
      assert.equal(view.reads, 2, "Keep the existing database reload on rejection");
      assert.deepEqual(view.alerts(), [mode.mode === "create" ? "Couldn't create section" : "Couldn't edit section"]);
      assert.equal(view.alerts().some(message => message.includes("private")), false);
    } finally { view.dispose(); }
  });

  test(`section ${mode.mode} keeps successful immediate close quiet`, async () => {
    const view = await fixture(mode);
    try {
      view.submit();
      assert.equal(view.dialogs(), 0);
      await view.succeed();
      assert.equal(view.reads, 1);
      assert.deepEqual(view.alerts(), []);
    } finally { view.dispose(); }
  });

  test(`section ${mode.mode} reloads a superseded layout without a failure toast`, async () => {
    const view = await fixture(mode);
    try {
      view.submit();
      await view.succeed(0, false);
      assert.equal(view.reads, 2);
      assert.deepEqual(view.alerts(), []);
    } finally { view.dispose(); }
  });

  test(`section ${mode.mode} Cancel neither writes nor reports a save error`, async () => {
    const view = await fixture(mode);
    try {
      view.cancel();
      assert.equal(view.dialogs(), 0);
      assert.equal(view.writes.length, 0);
      assert.deepEqual(view.alerts(), []);
    } finally { view.dispose(); }
  });

  test(`section ${mode.mode} does not reuse its failure callback for a later unrelated write`, async () => {
    const view = await fixture(mode);
    try {
      view.submit();
      await view.succeed();
      view.unrelatedWrite();
      assert.equal(view.writes.length, 2);
      await view.fail(1);
      assert.deepEqual(view.alerts(), []);
    } finally { view.dispose(); }
  });
}
