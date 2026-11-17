import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const root = new URL("../../", import.meta.url);
const inert = () => null;
const FILTERS_KEY = "openconductor.home.filters.v1";

type Node = { type: unknown; props: Record<string, any>; children: (Node | string)[]; instance: Host };
type Host = {
  label: string; textContent: string; disabled: boolean;
  focus: (options?: unknown) => void;
  contains: (target: unknown) => boolean;
  querySelectorAll: (selector: string) => Host[];
  querySelector: (selector: string) => Host | null;
};
function text(value: any): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return text(value.props?.children ?? value.children);
}

async function fixture(projects: string[] = []) {
  const actions: unknown[] = [];
  const writes: string[] = [];
  const values = new Map([[FILTERS_KEY, JSON.stringify({ projects, archiveFilter: "active" })]]);
  const window = new EventTarget();
  const document: { activeElement: Host | null } = { activeElement: null };
  let renderer: ReturnType<typeof create>;
  const hosts = new Map<string, Host>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { values.set(key, value); writes.push(value); } };
  const cache = new Map<string, Record<string, any>>();
  const modules = new Set(["src/components/AllWorkspaces.tsx", "src/home/allWorkspaces.ts", "src/components/sidebarLabel.ts", "src/state/workspaceNumber.ts"]);
  const common: Record<string, unknown> = {
    useBoolPref: () => false, useStatusMatrix: () => false, useWorkspaceAgentStatus: () => "idle",
    useKeybindingOverrides: () => ({ overrides: {} }), effectiveShortcuts: () => [], glyphs: () => "",
    listArchivedWorkspaces: async () => [], onArchiveEvent: () => inert,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    homeStatus: () => "idle", rowStatusLabel: () => "Idle", showsActivityStatus: () => false,
    rowGitStatus: () => undefined, isWorkspaceUnread: () => false,
  };
  function load(path: string): Record<string, any> {
    const previous = cache.get(path);
    if (previous) return previous;
    const exports = {}; cache.set(path, exports);
    const source = readFileSync(new URL(path, root), "utf8");
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const mocked = new Map<string, Record<string, unknown>>();
    for (const statement of tree.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const names: Record<string, unknown> = {};
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
        if (!item.isTypeOnly) {
          const name = item.propertyName?.text ?? item.name.text;
          names[name] = name in common ? common[name] : /^[A-Z]/.test(name) ? inert : () => assert.fail(`Unexpected dependency ${statement.moduleSpecifier.getText(tree)}.${name}`);
        }
      }
      mocked.set(statement.moduleSpecifier.text, names);
    }
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(javascript, {
      exports, window, document, localStorage: storage, console, Event, Date, setTimeout, clearTimeout,
      require(specifier: string) {
        if (specifier === "react") return React;
        if (specifier === "react/jsx-runtime") return dependencies(specifier);
        if (specifier.startsWith(".")) {
          const candidate = new URL(specifier, new URL(path, root)).pathname.slice(root.pathname.length);
          const found = [candidate, candidate + ".ts", candidate + ".tsx"].find((name) => modules.has(name));
          if (found) return load(found);
        }
        const module = mocked.get(specifier); assert.ok(module, `Unexpected module ${specifier}`); return module;
      },
    });
    return exports;
  }
  const workspace = (id: string) => ({ id: `workspace-${id}`, name: `Working ${id}`, branch: `work/${id}`, state: "ready", status: "working", diff: { added: 0, removed: 0 }, createdAt: Date.now(), updatedAt: Date.now() });
  const repos = [{ id: "a", name: "Alpha", workspaces: [workspace("a")] }, { id: "b", name: "Beta", workspaces: [workspace("b")] }];
  function options(): Node[] { return renderer.root.findAll((node: Node) => typeof node.type === "string" && node.props.role === "menuitemcheckbox"); }
  function host(element: { type: string; props: Record<string, any> }): Host {
    const { props } = element;
    const label = props["aria-label"] ?? (props.role === "menuitemcheckbox" ? text(props.children).replace(/^✓/, "") : props.className);
    const key = `${element.type}:${String(label)}`;
    let value = hosts.get(key);
    if (!value) {
      value = {
        label, textContent: text(props.children), disabled: Boolean(props.disabled),
        focus() { document.activeElement = value!; },
        contains(target: unknown) { return target === value || options().some((node) => node.instance === target); },
        querySelectorAll(selector: string) { return selector.includes("menuitem") ? options().map((node) => node.instance) : []; },
        querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; },
      };
      hosts.set(key, value);
    }
    return value;
  }
  const AllWorkspaces = load("src/components/AllWorkspaces.tsx").AllWorkspaces;
  await act(async () => { renderer = create(React.createElement(AllWorkspaces, { repos, sidebarVisible: true, dispatch: (action: unknown) => actions.push(action), onCreateWorkspace: inert }), { createNodeMock: host }); });
  const trigger = () => renderer.root.find((node: Node) => node.type === "button" && node.props["aria-label"] === "Projects");
  const panel = () => renderer.root.findAll((node: Node) => typeof node.type === "string" && node.props.role === "menu")[0];
  async function key(node: Node, value: string, modifiers: Record<string, unknown> = {}) {
    const event = { key: value, which: 0, defaultPrevented: false, nativeEvent: {}, target: node.instance, currentTarget: node.instance, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...modifiers };
    await act(async () => { node.props.onKeyDown?.(event); });
    return event;
  }
  return {
    actions, writes, document,
    open: () => trigger().props["aria-expanded"] === true,
    focused: () => document.activeElement?.label,
    options: () => options().map((node) => text(node).replace(/^✓/, "")),
    async triggerKey(value: string, modifiers?: Record<string, unknown>) { return key(trigger(), value, modifiers); },
    async panelKey(value: string, modifiers?: Record<string, unknown>) { const menu = panel(); assert.ok(menu, "Projects menu is reachable"); return key(menu, value, modifiers); },
    async clickTrigger() { await act(async () => { trigger().props.onClick({ currentTarget: trigger().instance }); }); },
    async clickOption(label: string) { const node = options().find((item) => text(item).replace(/^✓/, "") === label); assert.ok(node, label); await act(async () => { node.props.onClick(); }); },
    async focusOption(label: string) { const node = options().find((item) => text(item).replace(/^✓/, "") === label); assert.ok(node, label); node.instance.focus(); },
    async escape() { await act(async () => { window.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" })); }); },
    saved: () => JSON.parse(values.get(FILTERS_KEY)!),
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const [key, label] of [["ArrowDown", "All projects"], ["ArrowUp", "Beta"]]) {
  test(`Projects trigger ${key} opens and focuses ${label}`, async () => {
    const view = await fixture();
    try { await view.triggerKey(key); assert.equal(view.open(), true, "arrow opens Projects"); assert.equal(view.focused(), label); assert.deepEqual(view.actions, []); assert.deepEqual(view.writes, []); }
    finally { await view.close(); }
  });
}

for (const [key, from, label] of [["ArrowDown", "Alpha", "Beta"], ["ArrowUp", "Alpha", "All projects"], ["ArrowDown", "Beta", "All projects"], ["ArrowUp", "All projects", "Beta"], ["Home", "Beta", "All projects"], ["End", "All projects", "Beta"]]) {
  test(`Projects menu ${key} moves ${from} to ${label}`, async () => {
    const view = await fixture();
    try { await view.clickTrigger(); await view.focusOption(from); await view.panelKey(key); assert.equal(view.focused(), label); assert.equal(view.open(), true); assert.deepEqual(view.actions, []); assert.deepEqual(view.writes, []); }
    finally { await view.close(); }
  });
}

test("Projects typeahead reaches checked Beta without changing the filter", async () => {
  const view = await fixture(["b"]);
  try { await view.clickTrigger(); await view.focusOption("All projects"); await view.panelKey("b"); assert.equal(view.focused(), "Beta"); assert.deepEqual(view.saved().projects, ["b"]); assert.deepEqual(view.writes, []); }
  finally { await view.close(); }
});

test("Projects pointer choices remain multi-select and All projects clears", async () => {
  const view = await fixture();
  try { await view.clickTrigger(); assert.deepEqual(view.options(), ["All projects", "Alpha", "Beta"]); await view.clickOption("Alpha"); await view.clickOption("Beta"); assert.equal(view.open(), true); assert.deepEqual(view.saved().projects, ["a", "b"]); await view.clickOption("All projects"); assert.deepEqual(view.saved().projects, []); assert.deepEqual(view.actions, []); }
  finally { await view.close(); }
});

test("Escape still dismisses a clicked Projects menu", async () => {
  const view = await fixture();
  try { await view.clickTrigger(); assert.equal(view.open(), true); await view.escape(); assert.equal(view.open(), false); assert.deepEqual(view.writes, []); }
  finally { await view.close(); }
});

test("An unrelated trigger key leaves the menu closed and emits no actions", async () => {
  const view = await fixture();
  try { await view.triggerKey("ArrowLeft"); assert.equal(view.open(), false); assert.deepEqual(view.actions, []); assert.deepEqual(view.writes, []); }
  finally { await view.close(); }
});
