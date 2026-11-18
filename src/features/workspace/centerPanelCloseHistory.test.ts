// Oracle: retained Conductor yYo.Q/te (ev_b733d967…), not an executed native trace.
// Mount the real hook/groups and complete source-extracted MainTabs + renderCenterTabs.
// Only preference, keybinding scope, decorative leaves and terminal destruction are inert.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const sourceRoot = resolve(process.env.OC_GROUPED_CLOSE_SOURCE_ROOT ?? fileURLToPath(new URL("../../../", import.meta.url)));
const dependencies = createRequire(resolve(process.env.OC_GROUPED_CLOSE_DEPENDENCY_ROOT ?? sourceRoot, "package.json"));
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const noop = () => {};
const statuses = new Map();
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");
const identity = ({ children }: { children?: unknown }) => children ?? null;
const key = "openconductor.workspace-center-panel-layout-v1";
const group = (id: string, tabs: string[], activeTab = tabs[0]) => ({ type: "group", id, tabs, activeTab });
const split = (first: unknown, second: unknown) => ({ type: "split", orientation: "horizontal", firstSize: 50, first, second });
const savedLayout = () => ({ root: split(group("left", ["chat", "terminal:A"], "chat"), split(group("middle", ["terminal:B"]), group("right", ["terminal:C"]))), activeGroupId: "middle" });
function storage() {
  const values = new Map([[key, JSON.stringify({ version: 1, layouts: { one: savedLayout(), two: savedLayout() } })]]);
  return { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); }, values };
}
type Disk = ReturnType<typeof storage>;
interface Element {
  type: unknown;
  props: Record<string, any>;
  findAll(predicate: (node: Element) => boolean): Element[];
  findByProps(props: Record<string, unknown>): Element;
}
interface Tree { root: Element; update(element: unknown): void; unmount(): void }

function fixture(options: { enabled?: boolean; disk?: Disk } = {}) {
  const enabled = Object.hasOwn(options, "enabled") ? options.enabled : true;
  const disk = options.disk ?? storage();
  const modules = new Map<string, Record<string, any>>();
  function evaluate(source: string, filename: string, context: Record<string, unknown> = {}) {
    const exports: Record<string, any> = {};
    const output = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(output, { exports, console, localStorage: disk, ...context, require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "../../keybindings/KeybindingsProvider") return { KeybindingScope: identity };
      if (name === "../../settings/useBoolPref") return { useBoolPref: () => enabled };
      if (name === "./centerPanelLayout.ts") return load("src/features/workspace/centerPanelLayout.ts");
      throw new Error(`Unexpected dependency ${name} from ${filename}; no native/provider fallback`);
    } }, { filename });
    return exports;
  }
  function load(path: string): Record<string, any> {
    if (!modules.has(path)) modules.set(path, evaluate(read(path), path));
    return modules.get(path)!;
  }
  const model = load("src/features/workspace/centerPanelLayout.ts");
  const feature = load("src/features/workspace/CenterPanelGroups.tsx");
  const shell = load("src/features/terminal/shellIntegration.ts");
  const viewSource = read("src/components/WorkspaceView.tsx");
  const ast = ts.createSourceFile("WorkspaceView.tsx", viewSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Record<string, string[]> = { MainTabs: [], renderCenterTabs: [] };
  function visit(node: any) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "MainTabs") found.MainTabs.push(node.getText(ast));
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "renderCenterTabs") found.renderCenterTabs.push(`const ${node.getText(ast)};`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(found.MainTabs.length, 1, "one complete actual MainTabs parent");
  assert.equal(found.renderCenterTabs.length, 1, "one complete actual renderCenterTabs declaration");
  const actual = evaluate(`${found.MainTabs[0]}\nexports.makeTabs = (centerPanel, closeTab, workspace, centerTerminals) => { ${found.renderCenterTabs[0]} return renderCenterTabs; };`, "visible-center-close.tsx", {
    useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    subscribeChatStatuses: () => noop, chatStatuses: () => statuses,
    chatTabUnreadDot: () => false, chatTabStatus: () => undefined, ChatTabUnreadDot: () => null,
    tabLabel: shell.tabLabel, ChatTabMenu: () => null, NewChatButton: () => null,
    browserPage: undefined, fileTarget: null, diffOpen: false, prOpen: false, prNumber: null,
    closeBrowser: noop, closeFile: noop, closePrTab: noop, closeDiffTab: noop, closeReview: noop,
    reviews: { tabs: [] }, primaryId: "primary", isChatUnread: () => false,
    toggleChatRead: noop, chatMenu: () => ({}), openChatTabs: 1, newChat: noop,
  });
  let tree: Tree;
  let workspaceId = "one";
  let updateTabs: (workspace: string, id: string) => void = () => { throw new Error("not mounted"); };
  let selected = "";
  let layout: any;
  const destructions: { workspaceId: string; id: string }[] = [];
  function Harness({ id }: { id: string }) {
    const [routes, setRoutes] = React.useState({ one: "terminal:B", two: "terminal:B" });
    const [allTabs, setAllTabs] = React.useState({ one: ["A", "B", "C"], two: ["A", "B", "C"] });
    const ids: string[] = allTabs[id];
    const select = React.useCallback((tab: string) => setRoutes((current: Record<string, string>) => ({ ...current, [id]: tab })), [id]);
    updateTabs = (workspace: string, removed: string) => setAllTabs((current: Record<string, string[]>) => ({ ...current, [workspace]: current[workspace].filter((tab) => tab !== removed) }));
    const destroy = (workspace: string, terminalId: string) => {
      destructions.push({ workspaceId: workspace, id: terminalId });
      updateTabs(workspace, terminalId);
    };
    const panel = feature.useCenterPanelLayout(id, ["chat", ...ids.map((tab) => `terminal:${tab}`)], routes[id], select);
    selected = routes[id]; layout = panel.layout;
    const renderTabs = actual.makeTabs(panel, destroy, { id, name: "Chat" }, ids.map((terminalId) => ({ id: terminalId, title: terminalId, placement: "center", status: "running", runningProgram: terminalId })));
    return panel.enabled
      ? React.createElement(feature.CenterPanelGroups, { layout: panel.layout, onActivate: panel.activate,
        renderTabs: (entry: any) => renderTabs(entry.activeTab, (tab: string) => panel.select(entry.id, tab), entry.tabs),
        renderContent: (tab: string, focused: boolean) => React.createElement("output", { "data-pane-tab": tab, "data-pane-focused": focused }),
      })
      : renderTabs(selected, select);
  }
  function button(label: string) {
    const matches = tree.root.findAll((node) => node.type === "button" && typeof node.props["aria-label"] === "string" && node.props["aria-label"].startsWith("Close Terminal") && node.props["aria-label"].endsWith(` (${label}) tab`));
    assert.equal(matches.length, 1, `exactly one actual visible ${label}`);
    return matches[0];
  }
  return {
    disk, destructions,
    mount() { act(() => { tree = create(React.createElement(Harness, { id: workspaceId })); }); },
    dispose() { act(() => tree.unmount()); },
    select(tab: string) {
      const label = tab === "chat" ? "Chat" : tab;
      const matches = tree.root.findAll((node) => node.type === "button" && node.props.role === "tab" && typeof node.props.children === "string" && (tab === "chat" ? node.props.children === label : node.props.children.endsWith(` (${label})`)));
      assert.equal(matches.length, 1, `one actual ${label} tab`);
      act(() => matches[0].props.onClick());
      assert.equal(selected, tab === "chat" ? "chat" : `terminal:${tab}`);
    },
    close(id: string) { act(() => button(id).props.onClick()); },
    removeExternally(id: string) { act(() => updateTabs(workspaceId, id)); },
    switchWorkspace(id: string) { workspaceId = id; act(() => tree.update(React.createElement(Harness, { id }))); },
    selected: () => selected,
    groups: () => Array.from(model.centerGroups(layout.root), (entry: any) => entry.tabs.join(",")),
    focused: () => tree.root.findAll((node) => node.type === "output" && node.props["data-pane-focused"] === true).map((node) => node.props["data-pane-tab"]),
  };
}

function using(options: Parameters<typeof fixture>[0], check: (f: ReturnType<typeof fixture>) => void) {
  const f = fixture(options); f.mount();
  try { check(f); } finally { f.dispose(); }
}

test("visible grouped close chooses cross-group MRU, not the first structural survivor", () => {
  using({}, (f) => {
    f.select("chat"); f.select("C"); f.select("B"); f.close("B");
    assert.equal(f.selected(), "terminal:C");
    assert.deepEqual(f.focused(), ["terminal:C"]);
    assert.deepEqual(f.groups(), ["chat,terminal:A", "terminal:C"]);
    assert.deepEqual(f.destructions, [{ workspaceId: "one", id: "B" }]);
  });
});

test("closed/stale viewed entries are skipped before selecting a surviving MRU", () => {
  using({}, (f) => {
    f.select("chat"); f.select("C"); f.select("A"); f.select("B");
    f.removeExternally("A"); f.close("B");
    assert.equal(f.selected(), "terminal:C");
    assert.deepEqual(f.focused(), ["terminal:C"]);
    assert.deepEqual(f.groups(), ["chat", "terminal:C"]);
  });
});

test("workspace histories are isolated even with identical terminal ids", () => {
  using({}, (f) => {
    f.select("chat"); f.select("C"); f.select("B");
    f.switchWorkspace("two"); f.close("B");
    assert.equal(f.selected(), "chat", "one's C history cannot affect an unviewed workspace");
    assert.deepEqual(f.focused(), ["chat"]);
    assert.deepEqual(f.destructions, [{ workspaceId: "two", id: "B" }]);
  });
});

test("empty view history keeps the existing structural fallback", () => {
  using({}, (f) => {
    f.close("B");
    assert.equal(f.selected(), "chat");
    assert.deepEqual(f.focused(), ["chat"]);
    assert.deepEqual(f.groups(), ["chat,terminal:A", "terminal:C"]);
  });
});

test("closing an inactive grouped terminal preserves the selected survivor", () => {
  using({}, (f) => {
    f.select("chat"); f.select("C"); f.select("B"); f.select("C"); f.close("B");
    assert.equal(f.selected(), "terminal:C");
    assert.deepEqual(f.focused(), ["terminal:C"]);
    assert.deepEqual(f.destructions, [{ workspaceId: "one", id: "B" }]);
  });
});

for (const enabled of [false, undefined]) test(`ordinary ${String(enabled)} close leaves selection ownership unchanged`, () => {
  using({ enabled }, (f) => {
    const before = f.disk.getItem(key);
    f.select("C"); f.select("B"); f.close("B");
    assert.equal(f.selected(), "terminal:B", "ordinary caller owns its existing terminal-missing fallback");
    assert.deepEqual(f.destructions, [{ workspaceId: "one", id: "B" }]);
    assert.equal(f.disk.getItem(key), before, "no disabled-mode layout or history writes");
  });
});

test("view history is not restored from persisted layout in a fresh owner", () => {
  const disk = storage();
  using({ disk }, (f) => { f.select("chat"); f.select("C"); f.select("B"); });
  const saved = JSON.parse(disk.getItem(key)!);
  assert.deepEqual(Object.keys(saved).sort(), ["layouts", "version"]);
  assert.deepEqual(Object.keys(saved.layouts.one).sort(), ["activeGroupId", "root"]);
  using({ disk }, (f) => {
    f.close("B");
    assert.equal(f.selected(), "chat", "nonpersisted MRU must not leak into a fresh owner");
    assert.deepEqual(f.focused(), ["chat"]);
  });
});
