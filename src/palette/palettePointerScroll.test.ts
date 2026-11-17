import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as sectionSearchScore from "./search/score.ts";
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

// Real Host, palette, workspace rows and section picker. Synthetic list nodes
// observe scroll requests, not actual browser geometry or viewport visibility.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in pointer-scroll fixture"); };
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
      if (name === "./search/score.ts") return sectionSearchScore;
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
  const scrolls: { title: string; block: string }[] = [];
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl", "createSection", "createSectionWithWorkspace"].map((name) => [name, () => commandCalls.push(name)]));
  let renderer: ReturnType<typeof create>;
  const rows = () => renderer.root.findAllByProps({ role: "option" }).filter((row: any) => row.props.className?.includes("palette-item"));
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
          return row ? { scrollIntoView(options: { block: string }) { scrolls.push({ title: textOf(row), block: options.block }); } } : null;
        },
      };
    } });
  });
  const input = () => renderer.root.findByProps({ role: "combobox" });
  return {
    actions, openChanges, commandCalls, scrolls, rows, input,
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
for (const tab of ["All", "Actions", "Projects", "Settings", "Workspaces"]) {
  test(`actual Host ${tab}: pointer selection changes highlight without requesting scroll`, async () => {
    const view = await fixture();
    try {
      await view.tab(tab); assert.ok(view.rows().length >= 3); view.clear();
      const target = textOf(view.rows()[2]); await view.hover(2);
      assert.deepEqual(view.selected(), [target]);
      assert.deepEqual(view.scrolls, [], "pointer selection must not enqueue selected-option scroll");
      assert.deepEqual(view.actions, []); assert.deepEqual(view.commandCalls, []); assert.deepEqual(view.openChanges, []);
    } finally { await view.close(); }
  });
  test(`control ${tab}: pointer selection does not suppress the following keyboard scroll`, async () => {
    const view = await fixture();
    try {
      await view.tab(tab); await view.hover(1); view.clear();
      const target = textOf(view.rows()[2]); await view.key("ArrowDown");
      assert.deepEqual(view.selected(), [target]); assert.deepEqual(view.scrolls, [{ title: target, block: "nearest" }]);
    } finally { await view.close(); }
  });
}
test("control: hovering the already selected result cannot suppress the next keyboard scroll", async () => {
  const view = await fixture();
  try {
    await view.tab("Actions"); await view.hover(0); view.clear(); await view.key("ArrowDown");
    assert.equal(view.scrolls.length, 1); assert.equal(view.scrolls[0].title, textOf(view.rows()[1]));
  } finally { await view.close(); }
});
test("control: repeated pointer updates retain highlight and ordinary Enter activation", async () => {
  const view = await fixture();
  try {
    await view.tab("Actions"); await view.hover(1);
    const index = view.rows().findIndex((row: any) => textOf(row).startsWith("Toggle theme")); assert.ok(index >= 0);
    await view.hover(index); view.clear(); await view.key("Enter");
    assert.deepEqual(view.commandCalls, ["toggleTheme"]); assert.deepEqual(view.openChanges, [false]);
  } finally { await view.close(); }
});
test("control: composition preserves the pointer-selected result without scrolling", async () => {
  const view = await fixture();
  try {
    await view.tab("Actions"); await view.hover(2); const selected = view.selected(); view.clear();
    await view.key("ArrowDown", { isComposing: true }); await view.key("End", { keyCode: 229 });
    assert.deepEqual(view.selected(), selected); assert.deepEqual(view.scrolls, []);
  } finally { await view.close(); }
});
test("control: disabled empty-results row has no pointer selection or scroll callback", async () => {
  const view = await fixture();
  try {
    await view.query("zzzz-not-a-matching-result"); view.clear();
    for (const row of view.rows()) { assert.equal(String(row.props["aria-disabled"]), "true"); assert.equal(row.props.onMouseMove, undefined); }
    await view.key("ArrowDown"); await view.key("Enter");
    assert.deepEqual(view.selected(), []); assert.deepEqual(view.scrolls, []); assert.deepEqual(view.actions, []); assert.deepEqual(view.openChanges, []);
  } finally { await view.close(); }
});
test("control: section current-row pointer remains inert", async () => {
  const view = await fixture();
  try {
    const move = view.rows().findIndex((row: any) => textOf(row) === "Move to section"); assert.ok(move >= 0);
    await view.click(move); view.clear();
    const current = view.rows().findIndex((row: any) => textOf(row) === "Current"); assert.ok(current >= 0);
    await view.hover(current); await view.click(current);
    assert.equal(view.rows()[current].props["aria-selected"], false);
    assert.deepEqual(view.scrolls, []); assert.deepEqual(view.actions, []); assert.deepEqual(view.openChanges, []);
  } finally { await view.close(); }
});
