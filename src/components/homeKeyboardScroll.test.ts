import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { closedArchiveFilterFixture } from "../../evidence/home-archive-select-keyboard/closedArchiveFilterFixture.ts";
import ts from "typescript";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { effectiveShortcuts } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const NOW = new Date(2026, 10, 11, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;
type Host = {
  type: unknown;
  props: Record<string, unknown>;
  parent: Host | null;
  findAllByProps(props: object): Host[];
  findByType(type: string): Host;
};
type ScrollCall = { target: string; options: ScrollIntoViewOptions };
type ScrollNode = {
  scrollIntoView(options: ScrollIntoViewOptions): void;
  closest(selector: string): { querySelector(selector: string): ScrollNode | null } | null;
};

function workspace(id: string, age: number): Workspace {
  return {
    id, name: `Workspace ${id}`, userSetWorkspaceName: true, branch: id,
    status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW - age,
  };
}

function fixtures(): Repo[] {
  return [{
    id: "one", name: "Project One", path: "/fixture/one", defaultBranch: "main",
    workspaces: [workspace("D", 3 * DAY), workspace("B", 2 * 60_000), workspace("C", DAY), workspace("A", 60_000)],
  }];
}

// Mount production hooks and handlers. Only the DOM scroll boundary is a spy:
// its selected row and date-group structure come from the actual rendered tree.
async function fixture(repos = fixtures(), initiallyLoading = false) {
  const calls: ScrollCall[] = [];
  const actions: Action[] = [];
  const rowNodes = new Map<Host, ScrollNode>();
  let renderer: ReturnType<typeof create>;
  const rows = (): Host[] => renderer.root.findAllByProps({ role: "option" });
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  function rowNode(row: Host): ScrollNode {
    const cached = rowNodes.get(row);
    if (cached) return cached;
    const node: ScrollNode = {
      scrollIntoView(options) { calls.push({ target: String(row.props.title), options: { ...options } }); },
      closest(selector) {
        assert.equal(selector, ".allws-group");
        let group = row.parent;
        while (group && group.type !== "section") group = group.parent;
        assert.ok(group);
        const section = group;
        return {
          querySelector(selector) {
            if (selector === '[role="option"]') return rowNode(section.findAllByProps({ role: "option" })[0]);
            assert.equal(selector, ".allws-group-heading");
            assert.equal(section.findByType("h2").props.className, "allws-group-heading");
            return {
              scrollIntoView(options) { calls.push({ target: `heading:${section.props["aria-label"]}`, options: { ...options } }); },
              closest() { return null; },
            };
          },
        };
      },
    };
    rowNodes.set(row, node);
    return node;
  }
  const listNode = {
    querySelector(selector: string) {
      assert.equal(selector, '[role="option"][aria-selected="true"]');
      const selected = rows().find((row) => row.props["aria-selected"] === true);
      return selected ? rowNode(selected) : null;
    },
  };
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "active" }), saveFilters() {} },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/overrides": { effectiveShortcuts },
    "../keybindings/shortcut": { glyphs },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../workspace/archive": { listArchivedWorkspaces: async () => [], onArchiveEvent: () => () => {} },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./home/ArchiveFilter": closedArchiveFilterFixture,
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
  };
  const exported: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  const source = readFileSync(new URL("./AllWorkspaces.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, {
    fileName: "AllWorkspaces.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: exported, Date: class extends Date { static now() { return NOW; } },
    window: new EventTarget(), document: new EventTarget(),
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Home dependency: ${name}`);
      return imports[name];
    },
  });
  const { AllWorkspaces } = exported;
  assert.ok(AllWorkspaces);
  const props = { repos, sidebarVisible: true, dispatch: (action: Action) => { actions.push(action); }, onCreateWorkspace() {} };
  await act(async () => {
    renderer = create(React.createElement(AllWorkspaces, { ...props, loading: initiallyLoading }), {
      createNodeMock(element: { props: Record<string, unknown> }) {
        return element.props.className === "allws-list" ? listNode : null;
      },
    });
  });
  return {
    calls, actions,
    selected: () => rows().filter((row) => row.props["aria-selected"]).map((row) => row.props.title),
    async key(key: string, extra: { metaKey?: boolean; nativeEvent?: { isComposing: boolean }; keyCode?: number; cancelled?: boolean } = {}) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), { key }, extra);
      if (extra.cancelled) event.preventDefault();
      await act(async () => { input().props.onKeyDown(event); });
      return event;
    },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async render(loading: boolean) { await act(async () => { renderer.update(React.createElement(AllWorkspaces, { ...props, loading })); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const scroll = (...targets: string[]): ScrollCall[] => targets.map((target) => ({ target, options: { block: "nearest" } }));

test("Home initially reveals the selected first row after its date heading", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(view.selected(), ["Workspace A"]);
    assert.deepEqual(view.calls, scroll("heading:Today", "Workspace A"));
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Arrow navigation reveals the actual selected row, and only first rows reveal their heading", async () => {
  const view = await fixture();
  try {
    view.calls.length = 0;
    assert.equal((await view.key("ArrowDown")).defaultPrevented, true);
    assert.deepEqual(view.selected(), ["Workspace B"]);
    assert.deepEqual(view.calls, scroll("Workspace B"));
    view.calls.length = 0;
    await view.key("ArrowDown");
    assert.deepEqual(view.selected(), ["Workspace C"]);
    assert.deepEqual(view.calls, scroll("heading:Yesterday", "Workspace C"));
    view.calls.length = 0;
    await view.key("ArrowUp");
    assert.deepEqual(view.calls, scroll("Workspace B"));
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home, End and meta-arrow endpoints reveal the selection without opening it", async () => {
  const view = await fixture();
  try {
    for (const [key, extra, selected] of [
      ["End", {}, "D"], ["Home", {}, "A"],
      ["ArrowDown", { metaKey: true }, "D"], ["ArrowUp", { metaKey: true }, "A"],
    ] as const) {
      view.calls.length = 0;
      assert.equal((await view.key(key, extra)).defaultPrevented, true);
      assert.deepEqual(view.selected(), [`Workspace ${selected}`]);
      assert.equal(view.calls.length, 2);
      assert.match(view.calls[0].target, /^heading:/);
      assert.deepEqual(view.calls[1], scroll(`Workspace ${selected}`)[0]);
      assert.deepEqual(view.actions, []);
    }
    await view.key("Enter");
    assert.deepEqual(JSON.parse(JSON.stringify(view.actions)), [{ type: "select", selection: { kind: "workspace", repoId: "one", workspaceId: "A" } }]);
  } finally { await view.close(); }
});

test("unchanged endpoint selections and unrelated renders do not repeatedly scroll", async () => {
  const view = await fixture();
  try {
    await view.key("End");
    view.calls.length = 0;
    await view.key("End");
    await view.render(false);
    assert.deepEqual(view.calls, []);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("a search-selected row is revealed and no-match/empty navigation never scrolls a stale row", async () => {
  const repos = fixtures();
  repos[0].workspaces.find((row) => row.id === "C")!.name = "ZebraQuartz";
  const view = await fixture(repos);
  try {
    view.calls.length = 0;
    await view.query("ZebraQuartz");
    assert.deepEqual(view.selected(), ["ZebraQuartz"]);
    assert.deepEqual(view.calls, scroll("heading:Yesterday", "ZebraQuartz"));
    view.calls.length = 0;
    await view.query("no such workspace");
    for (const key of ["Home", "End", "ArrowDown", "ArrowUp", "Enter"]) await view.key(key);
    assert.deepEqual(view.selected(), []);
    assert.deepEqual(view.calls, []);
    assert.deepEqual(view.actions, []);
    await view.query("");
    assert.deepEqual(view.calls, scroll("heading:Today", "Workspace A"));
  } finally { await view.close(); }
});

test("an empty Home has no row to reveal", async () => {
  const view = await fixture([]);
  try {
    for (const key of ["Home", "End", "ArrowDown", "ArrowUp"]) await view.key(key);
    assert.deepEqual(view.calls, []);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("loading completion reveals the selected row even when its key did not change", async () => {
  const view = await fixture(fixtures(), true);
  try {
    assert.deepEqual(view.calls, []);
    await view.render(false);
    assert.deepEqual(view.calls, scroll("heading:Today", "Workspace A"));
  } finally { await view.close(); }
});

test("composing or already-consumed navigation does not reveal a different row", async () => {
  const view = await fixture();
  try {
    view.calls.length = 0;
    for (const extra of [{ nativeEvent: { isComposing: true } }, { keyCode: 229 }, { cancelled: true }]) {
      await view.key("ArrowDown", extra);
    }
    assert.deepEqual(view.selected(), ["Workspace A"]);
    assert.deepEqual(view.calls, []);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
