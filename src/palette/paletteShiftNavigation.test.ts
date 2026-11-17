import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as overrides from "../keybindings/overrides.ts";
import * as shortcut from "../keybindings/shortcut.ts";
import { logical } from "../keybindings/types.ts";
import * as workspaceNumber from "../state/workspaceNumber.ts";
import * as allWorkspaces from "../home/allWorkspaces.ts";
import * as adapter from "./fromAppState.ts";
import * as search from "./search/model.ts";
import * as state from "./state.ts";
import * as workspacesTab from "./workspacesTab.ts";
import type { AppState } from "../state/types.ts";

// Actual mounted Host, input and production command resolver. External effects
// are inert or forbidden; neither vendor JS nor browser/native input is run.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in Shift-navigation fixture"); };
function evaluate(file: string, imports: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
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
function loadHost(bindings: overrides.Overrides) {
  const icons = { ConductorIcon: inert };
  const sections = evaluate("./MoveToSection.tsx", { "../components/ConductorIcon": icons });
  const rows = evaluate("./WorkspacesTab.tsx", {
    "../home/allWorkspaces.ts": allWorkspaces,
    "../state/chatUnread.ts": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession.ts": { useWorkspaceAgentStatus: () => undefined },
    "../state/rowStatus.ts": { homeStatus: () => "idle", showsActivityStatus: () => false, rowStatusLabel: () => "Idle" },
    "../components/RowStatusIcon": { RowStatusIcon: inert }, "../state/workspaceNumber.ts": workspaceNumber,
    "../workspace/archivedList.ts": { ARCHIVE_FILTER_LABEL: "Archived workspaces" },
    "../components/Icons": { ArchiveIcon: inert, CheckIcon: inert, ChevronDownIcon: inert, FolderIcon: inert },
    "./workspacesTab.ts": workspacesTab,
  });
  const palette = evaluate("./CommandPalette.tsx", {
    "../keybindings/overrides.ts": overrides, "../keybindings/shortcut.ts": shortcut,
    "./search/model.ts": search, "./state.ts": state,
    "../state/workspaceNumber.ts": workspaceNumber, "./fromAppState.ts": adapter,
    "../home/allWorkspaces.ts": { ...allWorkspaces, loadFilters: () => allWorkspaces.CLEARED_FILTERS, saveFilters: noop },
    "../home/allWorkspaces": allWorkspaces, "./workspacesTab.ts": workspacesTab, "./WorkspacesTab.tsx": rows,
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
    "../components/ConductorIcon": icons, "./palette.css": {},
  });
  return evaluate("./PaletteHost.tsx", {
    "./CommandPalette.tsx": palette, "./MoveToSection.tsx": sections, "./fromAppState.ts": adapter,
    "../keybindings/KeybindingsProvider.tsx": { useKeybindings: noop, useKeybindingOverrides: () => ({ overrides: bindings }) },
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
    "../components/ConductorIcon": icons, "./gitPanelActions.ts": { GIT_PANEL_ACTIONS: [], requestGitPanelAction: forbidden },
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
async function fixture(bindings: overrides.Overrides = {}) {
  const Host = loadHost(bindings);
  const effects: unknown[] = [];
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl", "createSection", "createSectionWithWorkspace"].map((name) => [name, () => effects.push(name)]));
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Host, {
      state: seed, collapsedSections: new Set(), dispatch: (action: unknown) => effects.push(action),
      open: true, onOpenChange: (open: boolean) => effects.push(open), commands,
      onOpenDialog: forbidden, onOpenProject: forbidden,
    }));
  });
  const input = () => renderer.root.findByProps({ role: "combobox" });
  const rows = () => renderer.root.findAllByProps({ role: "option" }).filter((row: any) => row.props.className?.includes("palette-item"));
  return {
    effects, rows,
    selected: () => rows().findIndex((row: any) => String(row.props["aria-selected"]) === "true"),
    tabName: () => textOf(renderer.root.findAllByProps({ role: "tab" }).find((tab: any) => tab.props["aria-selected"])),
    async tab(label: string) { await act(async () => { renderer.root.findAllByProps({ role: "tab" }).find((tab: any) => textOf(tab) === label).props.onClick(); }); },
    async hover(index: number) { await act(async () => { rows()[index].props.onMouseMove(); }); },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async key(key: string, modifiers: Record<string, unknown> = {}) {
      const nativeEvent = { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...modifiers };
      const event = { ...nativeEvent, nativeEvent, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } };
      await act(async () => { input().props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
for (const tab of ["All", "Actions", "Settings", "Workspaces", "Projects"]) {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    test(`mounted Host ${tab}: Shift+${key} navigates the normal input`, async () => {
      const view = await fixture();
      try {
        await view.tab(tab); assert.ok(view.rows().length >= 3);
        await view.hover(1); assert.equal(view.selected(), 1);
        const target = key === "ArrowDown" ? 2 : key === "End" ? view.rows().length - 1 : 0;
        const event = await view.key(key, { shiftKey: true });
        assert.equal(view.selected(), target, "normal input must select the evidenced row");
        assert.deepEqual(event, { prevented: 1, stopped: 1 });
        assert.deepEqual(view.effects, []); assert.equal(view.tabName(), tab);
      } finally { await view.close(); }
    });
  }
}
for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
  test(`control: ordinary ${key} keeps its selected target`, async () => {
    const view = await fixture();
    try {
      await view.hover(1);
      assert.deepEqual(await view.key(key), { prevented: 1, stopped: 1 });
      assert.equal(view.selected(), key === "ArrowDown" ? 2 : key === "End" ? view.rows().length - 1 : 0);
      assert.deepEqual(view.effects, []);
    } finally { await view.close(); }
  });
}
for (const signal of [{ isComposing: true }, { keyCode: 229 }]) {
  test(`control: IME ${JSON.stringify(signal)} keeps shifted navigation unconsumed`, async () => {
    const view = await fixture();
    try {
      await view.hover(1);
      for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
        assert.deepEqual(await view.key(key, { shiftKey: true, ...signal }), { prevented: 0, stopped: 0 });
        assert.equal(view.selected(), 1);
      }
      assert.deepEqual(view.effects, []);
    } finally { await view.close(); }
  });
}
for (const [command, destination, key] of [["commandPalette.nextTab", "Workspaces", "ArrowDown"], ["commandPalette.previousTab", "Settings", "Home"]]) {
  test(`control: explicit Shift+${key} ${command} takes precedence`, async () => {
    const view = await fixture({ [command]: [logical(key, ["shift"])] });
    try {
      assert.deepEqual(await view.key(key, { shiftKey: true }), { prevented: 1, stopped: 1 });
      assert.equal(view.tabName(), destination); assert.deepEqual(view.effects, []);
    } finally { await view.close(); }
  });
}
test("control: explicit shifted close wins over fallback navigation", async () => {
  const view = await fixture({ toggleCommandPalette: [logical("End", ["shift"])] });
  try {
    await view.hover(1);
    assert.deepEqual(await view.key("End", { shiftKey: true }), { prevented: 1, stopped: 1 });
    assert.equal(view.selected(), 1); assert.deepEqual(view.effects, [false]);
  } finally { await view.close(); }
});
test("control: no eligible results or disabled placeholders cannot activate", async () => {
  const view = await fixture();
  try {
    await view.query("zzzz-no-matching-result");
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) await view.key(key, { shiftKey: true });
    assert.equal(view.selected(), -1); await view.key("Enter"); assert.deepEqual(view.effects, []);
  } finally { await view.close(); }
});
test("control: unrelated shifted text remains editable", async () => {
  const view = await fixture();
  try {
    await view.hover(1);
    assert.deepEqual(await view.key("A", { shiftKey: true }), { prevented: 0, stopped: 0 });
    assert.equal(view.selected(), 1); assert.deepEqual(view.effects, []);
  } finally { await view.close(); }
});
