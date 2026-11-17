import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { promptWrite, PROMPT_ROWS } from "./rows/rowModel.ts";

// Actual PromptRows, repository API/hook and PendingEdit/WriteBarrier, with synthetic
// in-memory IPC only. Base UI menu, DialogFrame and Markdown are explicit host ports.
// This proves callback/write intent, not Rust/file transport or native UI behavior.
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
const kinds = PROMPT_ROWS.map(row => row.kind);
const text = (node: any): string => typeof node === "string" ? node : node?.children?.map(text).join("") || "";

type Options = { kind?: string; local?: string | null; inherited?: string | null; loading?: boolean };
async function fixture({ kind = "code_review", local = "Synthetic local preferences", inherited = "Synthetic inherited preferences", loading = false }: Options = {}) {
  const cache = new Map<string, any>();
  const events = new EventTarget();
  const timers = new Map<number, () => void>();
  let sequence = 0;
  let stored = local;
  const writes: { command: string; args: any }[] = [];
  let reloads = 0;
  const host = Object.assign(events, {
    clearTimeout: (id: number) => timers.delete(id),
    setTimeout: (fn: () => void) => { const id = ++sequence; timers.set(id, fn); return id; },
  });
  const snapshot = () => ({
    prompts: Object.fromEntries(kinds.map(key => [key, key !== kind ? null : stored !== null ? { value: stored, layer: "repo_local" } : inherited !== null ? { value: inherited, layer: "repo_shared" } : null])),
    git: {}, env: { local: {}, cloud: {}, files: [] }, warnings: [],
  });
  const MenuContext = React.createContext(null);
  const Menu = {
    Root: ({ children }: any) => { const [open, setOpen] = React.useState(false); return React.createElement(MenuContext.Provider, { value: { open, setOpen } }, children); },
    Trigger: ({ children, ...props }: any) => { const menu = React.useContext(MenuContext); return React.createElement("button", { ...props, onClick: () => menu.setOpen(!menu.open) }, children); },
    Portal: ({ children }: any) => React.useContext(MenuContext).open ? children : null,
    Positioner: ({ children }: any) => children,
    Popup: ({ children, ...props }: any) => React.createElement("div", { role: "menu", ...props }, children),
    Item: ({ children, onClick, disabled }: any) => { const menu = React.useContext(MenuContext); return React.createElement("button", { role: "menuitem", disabled, onClick: () => { onClick(); menu.setOpen(false); } }, children); },
  };
  function load(filename: string): any {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const js = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    function controlled(name: string): any {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "@base-ui/react/menu") return { Menu };
      if (name.endsWith("/menu/menuIcons")) return { EllipsisIcon: () => null };
      if (name.endsWith("/components/DialogFrame")) return { DialogFrame: ({ children }: any) => React.createElement("div", { role: "dialog" }, children) };
      if (name.endsWith("/chat/markdown")) return { Markdown: ({ text: value }: any) => React.createElement("div", null, value) };
      if (name === "@tauri-apps/api/core") return { isTauri: () => true, invoke: async (command: string, args: any) => {
        if (command === "repo_settings_effective") { reloads++; if (loading) return new Promise(() => {}); return snapshot(); }
        assert.equal(command, "repo_settings_set_local", "no action/provider/native command may run");
        assert.equal(args.repoPath, "/synthetic/actions-reset");
        assert.equal(args.key, `prompts.${kind}`);
        assert.ok(args.value === null || typeof args.value === "string");
        writes.push({ command, args });
        stored = args.value;
        return snapshot();
      } };
      if (name.startsWith(".")) {
        let target = resolve(dirname(filename), name);
        if (!extname(target)) target += ".ts";
        return load(target);
      }
      throw Error(`Unexpected Actions Reset dependency ${name}`);
    }
    runInNewContext("(function(require,module,exports){" + js + "\n})", { console, window: host, Event }, { filename })(controlled, module, module.exports);
    return module.exports;
  }
  const { RepoActionsRows } = load(resolve(root, "src/settings/rows/PromptRows.tsx"));
  let renderer: any;
  await act(async () => { renderer = create(React.createElement(RepoActionsRows, { repoPath: "/synthetic/actions-reset" })); });
  const row = () => renderer.root.findAll((node: any) => node.type === "div" && node.props.className === "settings-row oc-prompt-row")[kinds.indexOf(kind as any)];
  const input = () => row().findByType("textarea");
  const actions = () => row().findAll((node: any) => node.type === "button" && node.props["aria-label"] === "Setting actions");
  return {
    writes, row, input, actions, reloads: () => reloads,
    async open() { await act(async () => { row().findByProps({ className: "oc-prompt-trigger" }).props.onClick(); }); },
    async edit(value: string) { await act(async () => { input().props.onFocus(); input().props.onChange({ target: { value } }); }); },
    async blur() { await act(async () => { input().props.onBlur(); }); },
    async reset() {
      assert.equal(actions().length, 1, "configured local action exposes one Setting actions trigger");
      await act(async () => { actions()[0].props.onClick(); });
      const item = row().findAll((node: any) => node.type === "button" && node.props.role === "menuitem" && text(node) === "Reset");
      assert.equal(item.length, 1, "row menu exposes Reset");
      await act(async () => { item[0].props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const kind of kinds) {
  test(`${kind}: Reset removes only the local override and reveals inherited instructions`, async () => {
    const f = await fixture({ kind });
    try {
      await f.open();
      assert.equal(f.input().props.value, "Synthetic local preferences");
      await f.reset();
      assert.equal(f.writes.length, 1);
      assert.equal(f.writes[0].args.key, `prompts.${kind}`);
      assert.equal(f.writes[0].args.value, null, "Reset deletes; it does not write a blank string");
      assert.equal(f.input().props.value, "Synthetic inherited preferences");
      assert.equal(f.actions().length, 0, "inherited rows expose no local Reset");
      assert.equal(f.reloads(), 2, "successful reset refreshes effective settings");
    } finally { await f.close(); }
  });
  test(`${kind}: clearing the draft saves an explicit empty override, not inherited instructions`, async () => {
    const f = await fixture({ kind });
    try {
      await f.open();
      await f.edit("  \n  ");
      await f.blur();
      assert.equal(f.writes.length, 1);
      assert.equal(f.writes[0].args.value, "", "blank edit preserves a local empty string; only Reset removes it");
      assert.equal(f.input().props.value, "");
      assert.equal(f.actions().length, 1, "explicit empty local override is still resettable");
      assert.ok(text(f.row()).includes("Customized"));
    } finally { await f.close(); }
  });
}

test("an explicit empty local override stays customized and resettable", async () => {
  const f = await fixture({ local: "" });
  try { await f.open(); assert.equal(f.input().props.value, ""); assert.ok(text(f.row()).includes("Customized")); await f.reset(); assert.equal(f.input().props.value, "Synthetic inherited preferences"); }
  finally { await f.close(); }
});

test("inherited instructions have no local Reset and unchanged blur writes nothing", async () => {
  const f = await fixture({ local: null });
  try { await f.open(); assert.equal(f.input().props.value, "Synthetic inherited preferences"); assert.equal(f.actions().length, 0); await f.blur(); assert.equal(f.writes.length, 0); }
  finally { await f.close(); }
});

test("absent instructions have no badge or Reset and unchanged blur writes nothing", async () => {
  const f = await fixture({ local: null, inherited: null });
  try { await f.open(); assert.equal(f.input().props.value, ""); assert.equal(f.actions().length, 0); assert.ok(!text(f.row()).includes("Customized")); await f.blur(); assert.equal(f.writes.length, 0); }
  finally { await f.close(); }
});

test("prompt writes preserve blank overrides, trim nonblank edits and skip no-ops", () => {
  assert.deepEqual(promptWrite("code_review", "Synthetic local", " \n "), { key: "prompts.code_review", value: "" });
  assert.deepEqual(promptWrite("general", undefined, "  Synthetic change  "), { key: "prompts.general", value: "Synthetic change" });
  assert.equal(promptWrite("general", "Same", " Same "), null);
  assert.equal(promptWrite("general", undefined, ""), null);
});


// Additional treatment controls; the complete frozen 16-case prefix above is unchanged.
test("Reset supersedes an unsaved draft through the existing pending-edit owner", async () => {
  const f = await fixture();
  try {
    await f.open();
    await f.edit("Unsaved synthetic draft");
    await f.reset();
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].args.value, null);
    assert.equal(f.input().props.value, "Synthetic inherited preferences");
    await f.blur();
    assert.equal(f.writes.length, 1, "settled inherited draft does not recreate a local override");
  } finally { await f.close(); }
});

test("inherited blank instructions remain customized but have no local Reset", async () => {
  const f = await fixture({ local: null, inherited: "" });
  try {
    await f.open();
    assert.equal(f.input().props.value, "");
    assert.equal(f.actions().length, 0);
    assert.ok(text(f.row()).includes("Customized"));
    await f.blur();
    assert.equal(f.writes.length, 0);
  } finally { await f.close(); }
});

test("loading rows cannot save or offer Reset before effective settings arrive", async () => {
  const f = await fixture({ loading: true });
  try {
    await f.open();
    assert.equal(f.input().props.disabled, true);
    assert.equal(f.actions().length, 0);
    assert.equal(f.writes.length, 0);
  } finally { await f.close(); }
});
