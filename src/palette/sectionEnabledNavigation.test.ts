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
import type { AppState } from "../state/types.ts";
import type { Action } from "../state/store.ts";

// Mount the actual Host -> CommandPalette -> MoveToSection route. Only external
// effects/icons are inert; no vendor JavaScript, provider, browser or app runs.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in section navigation fixture"); };
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
  const palette = evaluate("./CommandPalette.tsx", {
    "../keybindings/overrides.ts": overrides, "../keybindings/shortcut.ts": shortcut,
    "./search/model.ts": search, "./state.ts": state,
    "../state/workspaceNumber.ts": workspaceNumber, "./fromAppState.ts": adapter,
    "../home/allWorkspaces.ts": { loadFilters: () => allWorkspaces.CLEARED_FILTERS, saveFilters: noop, CLEARED_FILTERS: allWorkspaces.CLEARED_FILTERS },
    "../home/allWorkspaces": allWorkspaces,
    "./workspacesTab.ts": { workspacesTabRows: () => ({ active: [], archived: [] }), showClearFilters: () => false },
    "./WorkspacesTab.tsx": { WorkspaceFilters: inert, WorkspaceRow: inert },
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
    "../components/ConductorIcon": icons, "./palette.css": {},
  });
  return evaluate("./PaletteHost.tsx", {
    "./CommandPalette.tsx": palette, "./MoveToSection.tsx": sections, "./fromAppState.ts": adapter,
    "../keybindings/KeybindingsProvider.tsx": { useKeybindings: noop, useKeybindingOverrides: () => ({ overrides: {} }) },
    "../settings/searchIndex": { buildSearchIndex: () => [] }, "../settings/pages": { settingsGroups: () => [] },
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
  selection: { kind: "workspace", repoId: "repo", workspaceId: "workspace" },
  repos: [{ id: "repo", name: "Synthetic", path: "/synthetic/not-an-open-target", defaultBranch: "main", workspaces: [
    { id: "workspace", name: "Workspace", branch: "fixture", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1 },
  ] }],
  sections: [
    { id: "alpha", name: "Alpha", workspaceIds: [] },
    { id: "current", name: "Current", workspaceIds: ["workspace"] },
    { id: "zeta", name: "Zeta", workspaceIds: [] },
  ],
};
function textOf(node: any): string {
  if (typeof node === "string") return node;
  return (Array.isArray(node) ? node : node?.children ?? []).map(textOf).join("");
}
async function fixture(sections = seed.sections!) {
  const Host = loadHost();
  const actions: Action[] = [];
  const openChanges: boolean[] = [];
  const created: string[] = [];
  const commands: Record<string, (...args: any[]) => unknown> = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl", "createSection"].map((name) => [name, noop]));
  commands.createSectionWithWorkspace = (id: string) => created.push(id);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Host, {
      state: { ...seed, sections }, collapsedSections: new Set(), dispatch: (action: Action) => actions.push(action),
      open: true, onOpenChange: (open: boolean) => openChanges.push(open), commands,
      onOpenDialog: forbidden, onOpenProject: forbidden,
    }), { createNodeMock: () => null });
  });
  const rows = () => renderer.root.findAllByProps({ role: "option" });
  const row = (title: string) => { const result = rows().find((item: any) => textOf(item) === title); assert.ok(result, `Missing ${title}`); return result; };
  const input = () => renderer.root.findByProps({ role: "combobox" });
  await act(async () => { row("Move to section").props.onClick(); });
  assert.equal(renderer.root.findAllByProps({ "aria-label": "Back to commands" }).length, 1);
  assert.deepEqual(openChanges, [], "entering section picker must not close palette");
  return {
    actions, created, openChanges, row, input, rows,
    selected: () => rows().filter((item: any) => item.props["aria-selected"]).map(textOf),
    async hover(title: string) { await act(async () => { row(title).props.onMouseMove(); }); },
    async click(title: string) { await act(async () => { row(title).props.onClick(); }); },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async key(key: string, modifiers: Record<string, unknown> = {}) {
      const nativeEvent = { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...modifiers };
      await act(async () => { input().props.onKeyDown({ ...nativeEvent, nativeEvent, preventDefault: noop, stopPropagation: noop }); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("mounted section entry chooses first enabled result, not the previous command index", async () => {
  const view = await fixture([seed.sections![1], seed.sections![0], seed.sections![2]]);
  try { assert.deepEqual(view.selected(), ["Alpha"]); } finally { await view.close(); }
});
for (const { key, modifiers, from, to } of [
  { key: "ArrowDown", from: "Alpha", to: "Zeta" },
  { key: "ArrowUp", from: "Zeta", to: "Alpha" },
  { key: "j", modifiers: { ctrlKey: true }, from: "Alpha", to: "Zeta" },
  { key: "k", modifiers: { ctrlKey: true }, from: "Zeta", to: "Alpha" },
  { key: "Home", from: "Remove from section", to: "Alpha" },
  { key: "ArrowUp", modifiers: { metaKey: true }, from: "Remove from section", to: "Alpha" },
  { key: "End", from: "Alpha", to: "Remove from section" },
  { key: "ArrowDown", modifiers: { metaKey: true }, from: "Alpha", to: "Remove from section" },
  { key: "ArrowUp", from: "Alpha", to: "Remove from section" },
  { key: "ArrowDown", from: "Remove from section", to: "Alpha" },
]) {
  test(`mounted enabled navigation: ${JSON.stringify(modifiers ?? {})} ${key} from ${from} selects ${to}`, async () => {
    const view = await fixture();
    try { await view.hover(from); await view.key(key, modifiers); assert.deepEqual(view.selected(), [to]); }
    finally { await view.close(); }
  });
}
test("Home skips a disabled first section and Enter reaches the real Host assignment callback", async () => {
  const view = await fixture([seed.sections![1], seed.sections![0]]);
  try {
    await view.hover("Remove from section"); await view.key("Home"); await view.key("Enter");
    assert.deepEqual(view.selected(), ["Alpha"]);
    assert.deepEqual(JSON.parse(JSON.stringify(view.actions)), [{ type: "assignSection", workspaceId: "workspace", sectionId: "alpha" }]);
    assert.deepEqual(view.openChanges, []);
  } finally { await view.close(); }
});
test("disabled-only filtered results have no selection and cannot dispatch", async () => {
  const view = await fixture();
  try {
    await view.query("Current"); assert.deepEqual(view.selected(), []);
    assert.equal(view.input().props["aria-activedescendant"], undefined);
    for (const key of ["Home", "End", "ArrowDown", "ArrowUp", "Enter"]) await view.key(key);
    assert.deepEqual(view.selected(), []); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("query reset chooses first enabled result after skipping the disabled match", async () => {
  const view = await fixture([seed.sections![1], seed.sections![0]]);
  try {
    await view.query("Current"); await view.query("");
    assert.deepEqual(view.selected(), ["Alpha"]);
  } finally { await view.close(); }
});
test("current-only section list starts with New and cycles only enabled footer commands", async () => {
  const view = await fixture([seed.sections![1]]);
  try {
    assert.deepEqual(view.selected(), ["New section…"]);
    await view.key("ArrowDown"); assert.deepEqual(view.selected(), ["Remove from section"]);
    await view.key("ArrowDown"); assert.deepEqual(view.selected(), ["New section…"]);
  } finally { await view.close(); }
});
test("control: enabled query result dispatches once and leaves palette open", async () => {
  const view = await fixture();
  try {
    await view.query("Zeta"); await view.key("Enter");
    assert.deepEqual(JSON.parse(JSON.stringify(view.actions)), [{ type: "assignSection", workspaceId: "workspace", sectionId: "zeta" }]);
    assert.deepEqual(view.openChanges, []);
  } finally { await view.close(); }
});
test("control: disabled pointer handlers and composition remain inert", async () => {
  const view = await fixture();
  try {
    await view.hover("Alpha"); await view.hover("Current"); await view.click("Current");
    await view.key("ArrowDown", { isComposing: true }); await view.key("Enter", { keyCode: 229 });
    assert.deepEqual(view.selected(), ["Alpha"]); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: no matching sections have no selection or assignment", async () => {
  const view = await fixture();
  try {
    await view.query("unmatchedzzzz"); await view.key("Enter");
    assert.deepEqual(view.rows(), []); assert.deepEqual(view.selected(), []); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: no sections still selects and activates New", async () => {
  const view = await fixture([]);
  try {
    assert.deepEqual(view.rows().map(textOf), ["New section…"]);
    await view.key("Home"); assert.deepEqual(view.selected(), ["New section…"]);
    await view.key("Enter"); assert.deepEqual(view.created, ["workspace"]);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: unassigned sections stay enabled and have no Remove command", async () => {
  const view = await fixture(seed.sections!.map((section) => ({ ...section, workspaceIds: [] })));
  try {
    assert.equal(view.rows().some((row: any) => row.props["aria-disabled"]), false);
    assert.equal(view.rows().map(textOf).includes("Remove from section"), false);
    await view.hover("Alpha"); await view.key("ArrowDown");
    assert.deepEqual(view.selected(), ["Current"]);
  } finally { await view.close(); }
});
test("control: New and Remove footer consumers are unchanged", async () => {
  const view = await fixture();
  try {
    await view.hover("Remove from section"); await view.key("Enter");
    assert.deepEqual(JSON.parse(JSON.stringify(view.actions)), [{ type: "assignSection", workspaceId: "workspace", sectionId: null }]);
    await view.hover("New section…"); await view.key("Enter");
    assert.deepEqual(view.created, ["workspace"]); assert.deepEqual(view.openChanges, [false]);
  } finally { await view.close(); }
});
