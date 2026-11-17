import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as overrides from "../../../src/keybindings/overrides.ts";
import * as shortcut from "../../../src/keybindings/shortcut.ts";
import * as workspaceNumber from "../../../src/state/workspaceNumber.ts";
import * as allWorkspaces from "../../../src/home/allWorkspaces.ts";
import * as adapter from "../../../src/palette/fromAppState.ts";
import * as search from "../../../src/palette/search/model.ts";
import * as state from "../../../src/palette/state.ts";
import type { AppState } from "../../../src/state/types.ts";
import type { Action } from "../../../src/state/store.ts";

// Mount the actual Host -> CommandPalette -> MoveToSection route. Only external
// effects/icons are inert; no vendor JavaScript, provider, browser or app runs.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in section navigation fixture"); };
const sourceRoot = new URL("../../../src/palette/sectionEnabledNavigation.test.ts", import.meta.url);
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

for (const disabledFirst of [false, true]) {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    test(`section supplemental: Shift+${key}, disabled-first=${disabledFirst}`, async () => {
      const view = await fixture(disabledFirst ? [seed.sections![1], seed.sections![0], seed.sections![2]] : seed.sections);
      try {
        const from = key === "ArrowDown" || key === "End" ? "Alpha" : key === "Home" ? "Remove from section" : "Zeta";
        const to = key === "ArrowDown" ? "Zeta" : key === "End" ? "Remove from section" : "Alpha";
        await view.hover(from); assert.deepEqual(view.selected(), [from]);
        await view.key(key, { shiftKey: true });
        assert.deepEqual(view.selected(), [to], "section root must retain inherited Shift navigation and skip disabled current section");
        assert.deepEqual(view.actions, []); assert.deepEqual(view.created, []); assert.deepEqual(view.openChanges, []);
      } finally { await view.close(); }
    });
  }
}
for (const signal of [{ isComposing: true }, { keyCode: 229 }]) {
  test(`section control: composing shifted navigation stays inert ${JSON.stringify(signal)}`, async () => {
    const view = await fixture();
    try {
      await view.hover("Alpha");
      for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) await view.key(key, { shiftKey: true, ...signal });
      assert.deepEqual(view.selected(), ["Alpha"]); assert.deepEqual(view.actions, []);
    } finally { await view.close(); }
  });
}
test("section control: disabled-only filtered results never activate", async () => {
  const view = await fixture();
  try {
    await view.query("Current");
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) await view.key(key, { shiftKey: true });
    await view.key("Enter"); assert.deepEqual(view.selected(), []); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("section control: ordinary navigation still skips the disabled section", async () => {
  const view = await fixture();
  try { await view.hover("Alpha"); await view.key("ArrowDown"); assert.deepEqual(view.selected(), ["Zeta"]); }
  finally { await view.close(); }
});
