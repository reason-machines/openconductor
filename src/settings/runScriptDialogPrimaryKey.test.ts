import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

// Actual RepoScriptsRows callback regression; APIs and decorative leaves are inert.
// Ported from the hash-frozen 15-case qualification fixture without assertion changes.
// Callback bubbling is not physical DOM, native, CodeMirror or script-execution proof.
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = process.env.OC_PRIMARY_SOURCE_ROOT ?? fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(root);
const logical = (value: string, modifiers: string[] = ["meta"]) => ({ key: { kind: "logical", value }, modifiers });
const custom = { "dialog.primaryAction": [logical("s", ["meta", "shift"])] };
const another = { "dialog.primaryAction": [logical("k", ["alt"])] };
const sample = {
  id: "dev", label: "Dev", command: "printf synthetic", args: [], cwd: null,
  default: false, icon: "play", hide: false, availableIn: ["local"], layer: "repo_local",
};
type Field = "name" | "command";

async function fixture(initial: Record<string, unknown> = {}, mode: "new" | "edit" = "new", seeded = false) {
  const writes: { repo: string; key: string; value: any }[] = [];
  const errors: string[] = [];
  const modules = new Map<string, { exports: any }>();
  let replaceOverrides: (value: Record<string, unknown>) => void = () => { throw new Error("Provider is not mounted"); };
  const events = { addEventListener() {}, removeEventListener() {} };
  const document = { ...events, activeElement: null };
  const storage = new Map<string, string>();
  const config = {
    setup: null, setupLayer: null, archive: null, archiveLayer: null,
    runMode: "concurrent", autoRunAfterSetup: false,
    run: mode === "edit" || seeded ? [sample] : [], managedKeys: [], warnings: [],
  };
  function load(path: string): any {
    if (modules.has(path)) return modules.get(path)!.exports;
    assert.ok(path === resolve(sourceRoot, "settings/rows/RepoScriptsRows.tsx")
      || path === resolve(sourceRoot, "settings/repoScripts.ts")
      || /[/\\]keybindings[/\\]/.test(path)
      || /[/\\]lib[/\\]persistence[/\\]/.test(path), `Unexpected source module: ${path}`);
    const module = { exports: {} as any };
    modules.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(compiled, {
      exports: module.exports, module, Error,
      window: { ...events, clearTimeout() {}, setTimeout() { throw new Error("Setup/Archive edits are outside this fixture"); } },
      document, HTMLElement: class {},
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      cancelAnimationFrame() {},
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
      },
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name.endsWith(".css")) return {};
        if (path.endsWith("RepoScriptsRows.tsx")) {
          if (name === "../../backend") return { openUrl() { throw new Error("No external URL is opened"); } };
          if (name === "../../scripts/api") return { async scriptsConfig() { return config; } };
          if (name === "../repoSettings.ts") return {
            async repoSettingsSetLocal(repo: string, key: string, value: unknown) { writes.push({ repo, key, value }); },
          };
          if (name === "../useRepoSettings.ts") return { notifyRepoSettingsChanged() {} };
          if (name === "../api") return { errorText: (error: unknown) => String(error) };
          // Decorative/layout leaves only. Their key handling is not mocked.
          if (name === "../GeneralPage") return {
            Row: ({ control, children }: { control: unknown; children: unknown }) => React.createElement("section", null, control, children),
          };
          if (name === "./runIcons") return { RUN_ICON_NAMES: ["play", "zap"], RunIcon: () => null, iconLabel: (value: string) => value };
        }
        assert.ok(name.startsWith("."), `Unexpected external dependency: ${name}`);
        const target = resolve(dirname(path), name);
        const file = [target, `${target}.ts`, `${target}.tsx`].find((candidate) => existsSync(candidate));
        assert.ok(file, `Unresolved admitted source dependency: ${name}`);
        return load(file);
      },
    }, { filename: path });
    return module.exports;
  }
  const provider = load(resolve(sourceRoot, "keybindings/KeybindingsProvider.tsx"));
  const { RepoScriptsRows } = load(resolve(sourceRoot, "settings/rows/RepoScriptsRows.tsx"));
  function Controller() {
    replaceOverrides = provider.useKeybindingOverrides().setOverrides;
    return React.createElement(RepoScriptsRows, {
      repo: { id: "synthetic-repo", path: "/synthetic/repo", name: "Synthetic", defaultBranch: "main" },
      notify(_kind: string, message: string) { errors.push(message); },
    });
  }
  let renderer: ReturnType<typeof create>;
  const text = (node: any): string => typeof node === "string" || typeof node === "number"
    ? String(node) : (node.children ?? []).map(text).join("");
  const primary = () => renderer.root.findByProps({ "data-primary-action": true });
  const host = () => ({
    querySelector(selector: string) {
      if (!selector.includes("data-primary-action")) throw new Error(`Unexpected DOM lookup: ${selector}`);
      const button = primary();
      return button.props.disabled ? null : { click: () => button.props.onClick(), hasAttribute: (name: string) => name === "disabled" && Boolean(button.props.disabled) };
    },
  });
  await act(async () => {
    renderer = create(React.createElement(provider.KeybindingsProvider, {
      loadOverrides: async () => JSON.stringify({ version: 1, overrides: initial }),
    }, React.createElement(Controller)), { createNodeMock: host });
  });
  const button = (label: string) => renderer.root.findAll((node: any) => node.type === "button" && text(node) === label)[0];
  await act(async () => button(mode === "new" ? "Add" : "Edit").props.onClick());
  const field = (which: Field) => which === "name"
    ? renderer.root.findByType("input") : renderer.root.findByProps({ "aria-label": "Command" });
  const changeName = (value: string) => act(() => field("name").props.onChange({ target: { value } }));
  const changeCommand = (value: string) => act(() => field("command").props.onChange({ target: { value, selectionStart: value.length } }));
  if (mode === "new") changeName("fixture");
  changeCommand("printf fixture-only");
  return {
    writes, errors, primary, changeName, changeCommand,
    get dialogs() { return renderer.root.findAllByProps({ role: "dialog" }).length; },
    override(value: Record<string, unknown>) { act(() => replaceOverrides(value)); },
    async clickSave() { await act(async () => primary().props.onClick()); },
    cancel() { act(() => button("Cancel").props.onClick()); },
    async press(which: Field, key: string, modifiers: Record<string, boolean | string> = {}) {
      const target = field(which);
      const chain: any[] = [];
      for (let node = target; node; node = node.parent) if (typeof node.type === "string") chain.push(node);
      const nativeEvent = { key, code: key === "Enter" ? "Enter" : `Key${key.toUpperCase()}`, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...modifiers };
      const event = {
        ...nativeEvent, nativeEvent, defaultPrevented: false, stopped: false, currentTarget: host(),
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
      };
      await act(async () => {
        for (const node of chain) {
          if (event.stopped) break;
          if (typeof node.props.onKeyDown === "function") node.props.onKeyDown(event);
        }
      });
      return event;
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const field of ["name", "command"] as const) {
  test(`Run-script ${field}: configured logical primary writes once`, async () => {
    const view = await fixture(custom);
    try {
      const event = await view.press(field, "S", { code: "KeyS", metaKey: true, shiftKey: true });
      assert.equal(view.writes.length, 1);
      assert.equal(view.writes[0].key, "scripts.run.fixture");
      assert.equal(view.writes[0].value.command, "printf fixture-only");
      assert.equal(event.defaultPrevented, true);
    } finally { view.dispose(); }
  });
  test(`Run-script ${field}: replacement removes Command-Enter activation`, async () => {
    const view = await fixture(custom);
    try {
      await view.press(field, "Enter", { metaKey: true });
      assert.equal(view.writes.length, 0);
      assert.equal(view.dialogs, 1);
    } finally { view.dispose(); }
  });
  test(`Run-script ${field}: default Command-Enter reaches Save exactly once`, async () => {
    const view = await fixture();
    try {
      await view.press(field, "Enter", { metaKey: true });
      assert.equal(view.writes.length, 1);
    } finally { view.dispose(); }
  });
}

test("Run-script primary reads a replacement override without closing the dialog", async () => {
  const view = await fixture(custom);
  try {
    view.override(another);
    await view.press("name", "S", { code: "KeyS", metaKey: true, shiftKey: true });
    assert.equal(view.writes.length, 0);
    await view.press("name", "k", { code: "KeyK", altKey: true });
    assert.equal(view.writes.length, 1);
  } finally { view.dispose(); }
});

test("Run-script primary resolves an additional configured shortcut", async () => {
  const view = await fixture({ "dialog.primaryAction": [logical("s", ["meta", "shift"]), logical("y", ["ctrl"])] });
  try {
    await view.press("name", "y", { ctrlKey: true });
    assert.equal(view.writes.length, 1);
  } finally { view.dispose(); }
});

test("Run-script pointer Save preserves the existing write payload", async () => {
  const view = await fixture(custom);
  try {
    await view.clickSave();
    assert.equal(view.writes.length, 1);
    assert.equal(view.writes[0].repo, "/synthetic/repo");
    assert.equal(view.writes[0].value.command, "printf fixture-only");
  } finally { view.dispose(); }
});

test("Run-script primary preserves changed Edit and the original id", async () => {
  const view = await fixture({}, "edit");
  try {
    await view.press("name", "Enter", { metaKey: true });
    assert.equal(view.writes.length, 1);
    assert.equal(view.writes[0].key, "scripts.run.dev");
  } finally { view.dispose(); }
});

for (const invalid of ["blank", "duplicate", "unchanged"] as const) {
  test(`Run-script ${invalid} keeps primary disabled and transport unused`, async () => {
    const view = await fixture({}, invalid === "unchanged" ? "edit" : "new", invalid === "duplicate");
    try {
      if (invalid === "blank") view.changeName("   ");
      if (invalid === "duplicate") view.changeName("dev");
      if (invalid === "unchanged") view.changeCommand("printf synthetic");
      assert.equal(view.primary().props.disabled, true);
      await view.press("name", "Enter", { metaKey: true });
      assert.equal(view.writes.length, 0);
    } finally { view.dispose(); }
  });
}

test("Run-script configured primary keeps exact modifier matching", async () => {
  const view = await fixture(another);
  try {
    await view.press("name", "k", { altKey: true, ctrlKey: true });
    assert.equal(view.writes.length, 0);
    assert.equal(view.dialogs, 1);
  } finally { view.dispose(); }
});

test("Run-script Escape and Cancel keep transport unused", async () => {
  const escape = await fixture(custom);
  try {
    await escape.press("name", "Escape");
    assert.equal(escape.dialogs, 0);
    assert.equal(escape.writes.length, 0);
  } finally { escape.dispose(); }
  const cancel = await fixture(custom);
  try {
    cancel.cancel();
    assert.equal(cancel.dialogs, 0);
    assert.equal(cancel.writes.length, 0);
  } finally { cancel.dispose(); }
});
