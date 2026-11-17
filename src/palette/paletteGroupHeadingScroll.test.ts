import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as overrides from "../keybindings/overrides.ts";
import * as shortcut from "../keybindings/shortcut.ts";
import * as workspaceNumber from "../state/workspaceNumber.ts";
import * as allWorkspaces from "../home/allWorkspaces.ts";
import * as adapter from "./fromAppState.ts";
import * as search from "./search/model.ts";
import * as state from "./state.ts";
import * as workspacesTab from "./workspacesTab.ts";
import type { AppState } from "../state/types.ts";
import type { Action } from "../state/store.ts";

// Actual Host → palette → result groups; synthetic host nodes follow the mounted
// parent/group/heading structure. Scroll-call proof is not browser geometry.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in group-heading fixture"); };
const sourceRoot = process.env.PALETTE_FIXTURE_SOURCE_ROOT ?? import.meta.url;
function evaluate(file: string, imports: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(new URL(file, sourceRoot), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(output, {
    exports, console, Date,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected ${file} import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}
function loadHost() {
  const icons = { ConductorIcon: inert };
  const sections = evaluate("./MoveToSection.tsx", { "../components/ConductorIcon": icons });
  const rows = evaluate("./WorkspacesTab.tsx", {
    "../home/allWorkspaces.ts": allWorkspaces,
    "../state/chatUnread.ts": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession.ts": { useWorkspaceAgentStatus: () => undefined },
    "../state/rowStatus.ts": { homeStatus: () => "idle", showsActivityStatus: () => false, rowStatusLabel: () => "Idle" },
    "../components/RowStatusIcon": { RowStatusIcon: inert },
    "../state/workspaceNumber.ts": workspaceNumber,
    "../workspace/archivedList.ts": { ARCHIVE_FILTER_LABEL: "Archived workspaces" },
    "../components/Icons": { ArchiveIcon: inert, CheckIcon: inert, ChevronDownIcon: inert, FolderIcon: inert },
    "./workspacesTab.ts": workspacesTab,
  });
  const palette = evaluate("./CommandPalette.tsx", {
    "../keybindings/overrides.ts": overrides, "../keybindings/shortcut.ts": shortcut,
    "./search/model.ts": search, "./state.ts": state,
    "../state/workspaceNumber.ts": workspaceNumber, "./fromAppState.ts": adapter,
    "../home/allWorkspaces.ts": { ...allWorkspaces, loadFilters: () => allWorkspaces.CLEARED_FILTERS, saveFilters: noop },
    "../home/allWorkspaces": allWorkspaces,
    "./workspacesTab.ts": workspacesTab, "./WorkspacesTab.tsx": rows,
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
    "../components/ConductorIcon": icons, "./palette.css": {},
  });
  return evaluate("./PaletteHost.tsx", {
    "./CommandPalette.tsx": palette, "./MoveToSection.tsx": sections, "./fromAppState.ts": adapter,
    "../keybindings/KeybindingsProvider.tsx": { useKeybindings: noop, useKeybindingOverrides: () => ({ overrides: {} }) },
    "../settings/searchIndex": { buildSearchIndex: () => ["General", "Appearance", "Advanced"].map((label) => ({ id: label.toLowerCase(), label, keywords: [], icon: "settings", target: { scope: "user", page: label.toLowerCase() } })) },
    "../settings/pages": { settingsGroups: () => [] },
    "../settings/SettingsView": { AGENT_SEARCH_TABS: [], scrollToRow: forbidden, searchIcon: inert },
    "../features/chat/ChatModelPicker": { openAgentSettings: forbidden, openRepoSettingsPage: forbidden, openSettingsPage: forbidden },
    "../settings/useBoolPref.ts": { useBoolPref: () => false }, "../settings/useSettings.ts": { useSettings: () => ({}) },
    "./recentWorkspaces.ts": { loadRecentWorkspaceIds: () => [], saveRecentWorkspaceIds: noop, recordViewedWorkspace: (ids: string[]) => ids },
    "./settingsRepository.ts": { loadLastWorkspaceRoute: () => null, selectedWorkspaceRoute: () => null, saveLastWorkspaceRoute: noop, settingsRepositoryId: forbidden },
    "../workspace/archive": { listArchivedWorkspaces: async () => [] },
    "../state/nextUnread.ts": { openNextUnread: forbidden }, "./projectWorkspace.ts": { preferredProjectWorkspace: forbidden },
    "../features/openIn/OpenInButton.tsx": { AppIcon: inert, useInstalledApps: () => [] },
    "../features/openIn/apps.ts": { openInApp: forbidden },
    "../settings/appPrefs.ts": { recordOpenIn: forbidden, useAppPrefs: () => ({ default_open_in: null }) },
    "../components/Toast": { Toaster: inert, useToasts: () => ({ toasts: [], show: forbidden, dismiss: noop }) },
    "../components/ConductorIcon": icons,
    "./gitPanelActions.ts": { GIT_PANEL_ACTIONS: [], requestGitPanelAction: forbidden },
  }).PaletteHost;
}
const seed: AppState = {
  selection: { kind: "workspace", repoId: "repo-0", workspaceId: "ws-0-0" },
  repos: [0, 1, 2].map((r) => ({ id: `repo-${r}`, name: `Project ${r}`, path: `/synthetic/project-${r}`, defaultBranch: "main", workspaces: [0, 1, 2].map((w) => ({
    id: `ws-${r}-${w}`, name: `Workspace ${r}-${w}`, branch: `fixture-${r}-${w}`, status: "idle", diff: { added: 0, removed: 0 }, createdAt: r * 3 + w + 1,
  })) })),
  sections: [{ id: "current", name: "Current", workspaceIds: ["ws-0-0"] }, { id: "other", name: "Other", workspaceIds: [] }],
};
function textOf(node: any): string {
  if (typeof node === "string") return node;
  return (Array.isArray(node) ? node : node?.children ?? []).map(textOf).join("");
}
async function fixture() {
  const Host = loadHost();
  const actions: Action[] = [];
  const openChanges: boolean[] = [];
  const commandCalls: string[] = [];
  const scrolls: { kind: "heading" | "item"; title: string; block: string }[] = [];
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl", "createSection", "createSectionWithWorkspace"].map((name) => [name, () => commandCalls.push(name)]));
  let renderer: ReturnType<typeof create>;
  const rows = () => renderer.root.findAllByProps({ role: "option" }).filter((row: any) => row.props.className?.includes("palette-item"));
  const hosts = (node: any): any[] => node.findAll((child: any) => typeof child.type === "string");
  const matches = (node: any, selector: string) => selector === '[role="option"]'
    ? node.props.role === "option"
    : selector === '[aria-selected="true"]'
      ? String(node.props["aria-selected"]) === "true"
      : selector.startsWith(".") && String(node.props.className ?? "").split(" ").includes(selector.slice(1));
  const nodes = new Map<any, any>();
  const dom = (node: any): any => {
    if (!node) return null;
    if (!nodes.has(node)) nodes.set(node, {
      querySelector(selector: string) { return dom(hosts(node).find((child) => child !== node && matches(child, selector))); },
      querySelectorAll(selector: string) { return hosts(node).filter((child) => child !== node && matches(child, selector)).map(dom); },
      closest(selector: string) {
        let cursor = node;
        while (cursor) { if (typeof cursor.type === "string" && matches(cursor, selector)) return dom(cursor); cursor = cursor.parent; }
        return null;
      },
      scrollIntoView(options: { block: string }) { scrolls.push({ kind: matches(node, ".palette-heading") ? "heading" : "item", title: textOf(node), block: options.block }); },
    });
    return nodes.get(node);
  };
  await act(async () => {
    renderer = create(React.createElement(Host, {
      state: seed, collapsedSections: new Set(), dispatch: (action: Action) => actions.push(action),
      open: true, onOpenChange: (open: boolean) => openChanges.push(open), commands,
      onOpenDialog: forbidden, onOpenProject: forbidden,
    }), { createNodeMock(element: any) {
      if (element.props.role !== "listbox") return null;
      return {
        scrollTo: noop,
        querySelector(selector: string) {
          assert.equal(selector, '[aria-selected="true"]');
          const row = rows().find((node: any) => String(node.props["aria-selected"]) === "true" && String(node.props["aria-disabled"]) !== "true");
          return dom(row);
        },
      };
    } });
  });
  const input = () => renderer.root.findByProps({ role: "combobox" });
  return {
    actions, openChanges, commandCalls, scrolls, rows, input,
    groups: () => renderer.root.findAll((node: any) => typeof node.type === "string" && node.props.role === "group"),
    selected: () => rows().filter((row: any) => String(row.props["aria-selected"]) === "true").map(textOf),
    clear() { scrolls.length = 0; },
    async tab(label: string) { await act(async () => { renderer.root.findAllByProps({ role: "tab" }).find((tab: any) => textOf(tab) === label).props.onClick(); }); },
    async hover(index: number) { await act(async () => { rows()[index].props.onMouseMove(); }); },
    async click(index: number) { await act(async () => { rows()[index].props.onClick(); }); },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async key(key: string, modifiers: Record<string, unknown> = {}) {
      const nativeEvent = { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...modifiers };
      await act(async () => { input().props.onKeyDown({ ...nativeEvent, nativeEvent, preventDefault: noop, stopPropagation: noop }); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
function firstGroup(view: Awaited<ReturnType<typeof fixture>>) {
  return view.groups().find((group: any) => group.findAllByProps({ className: "palette-heading" }).length > 0 && group.findAllByProps({ role: "option" }).length > 0);
}
function expected(heading: string, item: string) {
  return [{ kind: "heading", title: heading, block: "nearest" }, { kind: "item", title: item, block: "nearest" }];
}
for (const tab of ["All", "Actions", "Settings", "Workspaces"]) {
  for (const key of ["Home", "ArrowUp"]) {
    test(`actual Host ${tab}: ${key} reveals first row's heading before the option`, async () => {
      const view = await fixture();
      try {
        await view.tab(tab);
        const group = firstGroup(view); assert.ok(group, "reachable group with heading");
        const heading = textOf(group.findByProps({ className: "palette-heading" }));
        const first = group.findAllByProps({ role: "option" })[0];
        const index = view.rows().findIndex((row: any) => row === first); assert.ok(index >= 0);
        await view.hover(index + 1); view.clear(); await view.key(key);
        assert.deepEqual(view.selected(), [textOf(first)], "keyboard selected actual first option");
        assert.deepEqual(view.scrolls, expected(heading, textOf(first)), "heading must be revealed before the selected first option");
        assert.deepEqual(view.actions, []); assert.deepEqual(view.commandCalls, []); assert.deepEqual(view.openChanges, []);
      } finally { await view.close(); }
    });
  }
}
for (const direction of ["ArrowDown", "ArrowUp"]) {
  test(`actual Host: Option+${direction} reveals the destination group's heading`, async () => {
    const view = await fixture();
    try {
      const groups = view.groups().filter((group: any) => group.findAllByProps({ className: "palette-heading" }).length && group.findAllByProps({ role: "option" }).length);
      assert.ok(groups.length > 1);
      const origin = direction === "ArrowDown" ? groups[0] : groups[1];
      const target = direction === "ArrowDown" ? groups[1] : groups[0];
      const first = target.findAllByProps({ role: "option" })[0];
      const index = view.rows().findIndex((row: any) => row === origin.findAllByProps({ role: "option" })[0]);
      await view.hover(index); view.clear(); await view.key(direction, { altKey: true });
      assert.deepEqual(view.selected(), [textOf(first)]);
      assert.deepEqual(view.scrolls, expected(textOf(target.findByProps({ className: "palette-heading" })), textOf(first)));
    } finally { await view.close(); }
  });
}
for (const tab of ["All", "Actions", "Settings", "Workspaces"]) {
  test(`control ${tab}: nonfirst row only reveals the option`, async () => {
    const view = await fixture();
    try {
      await view.tab(tab); const group = firstGroup(view); assert.ok(group);
      const first = group.findAllByProps({ role: "option" })[0];
      const index = view.rows().findIndex((row: any) => row === first);
      await view.hover(index); view.clear(); await view.key("ArrowDown");
      const title = textOf(view.rows()[index + 1]); assert.deepEqual(view.selected(), [title]);
      assert.deepEqual(view.scrolls, [{ kind: "item", title, block: "nearest" }]);
    } finally { await view.close(); }
  });
}
test("control: headless Projects group only reveals its selected option", async () => {
  const view = await fixture();
  try {
    await view.tab("Projects"); await view.hover(1); view.clear(); await view.key("Home");
    const title = textOf(view.rows()[0]); assert.deepEqual(view.selected(), [title]);
    assert.deepEqual(view.scrolls, [{ kind: "item", title, block: "nearest" }]);
  } finally { await view.close(); }
});
test("control: IME leaves selection and scroll calls untouched", async () => {
  const view = await fixture();
  try {
    await view.hover(1); const selected = view.selected(); view.clear();
    await view.key("Home", { isComposing: true }); await view.key("ArrowUp", { keyCode: 229 });
    assert.deepEqual(view.selected(), selected); assert.deepEqual(view.scrolls, []);
  } finally { await view.close(); }
});
test("control: empty/disabled rows produce no selection or scroll", async () => {
  const view = await fixture();
  try {
    await view.query("zzzz-not-a-matching-result"); view.clear(); await view.key("Home"); await view.key("Enter");
    assert.deepEqual(view.selected(), []); assert.deepEqual(view.scrolls, []);
    assert.deepEqual(view.actions, []); assert.deepEqual(view.commandCalls, []); assert.deepEqual(view.openChanges, []);
  } finally { await view.close(); }
});
test("control: pointer selection never requests a group-heading scroll", async () => {
  const view = await fixture();
  try {
    await view.tab("Actions"); await view.hover(1); view.clear(); await view.hover(0);
    assert.equal(view.selected().length, 1);
    assert.deepEqual(view.scrolls.filter((call) => call.kind === "heading"), []);
  } finally { await view.close(); }
});
