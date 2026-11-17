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
import * as score from "./search/score.ts";
import * as state from "./state.ts";
import type { AppState } from "../state/types.ts";
import type { NavSection } from "../state/navigationSections.ts";

// Actual Host -> Palette -> MoveToSection, normal input and row callbacks.
// Native/provider/filesystem operations are forbidden; no vendor code is run.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in section search fixture"); };
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
function loadHost() {
  const icons = { ConductorIcon: inert };
  const sections = evaluate("./MoveToSection.tsx", { "../components/ConductorIcon": icons, "./search/score.ts": score });
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
    "../components/ConductorIcon": icons, "./gitPanelActions.ts": { GIT_PANEL_ACTIONS: [], requestGitPanelAction: forbidden },
  }).PaletteHost;
}
const sections: NavSection[] = [
  { id: "current", name: "Current", workspaceIds: ["workspace"] },
  { id: "other", name: "Other", workspaceIds: [] },
];
function textOf(node: any): string {
  if (typeof node === "string") return node;
  return (Array.isArray(node) ? node : node?.children ?? []).map(textOf).join("");
}
async function fixture(items = sections) {
  const Host = loadHost();
  const effects: unknown[] = [];
  const seed: AppState = {
    selection: { kind: "workspace", repoId: "repo", workspaceId: "workspace" }, sections: items,
    repos: [{ id: "repo", name: "Synthetic", path: "/synthetic/not-an-open-target", defaultBranch: "main", workspaces: [
      { id: "workspace", name: "Workspace", branch: "fixture", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1 },
    ] }],
  };
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl", "createSection", "createSectionWithWorkspace"].map((name) => [name, (...args: unknown[]) => effects.push({ command: name, args })]));
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Host, {
    state: seed, collapsedSections: new Set<string>(), dispatch: (action: unknown) => effects.push(action),
    open: true, onOpenChange: (open: boolean) => effects.push(open), commands, onOpenDialog: forbidden, onOpenProject: forbidden,
  })); });
  const input = () => renderer.root.findByProps({ role: "combobox" });
  const rows = () => renderer.root.findAllByProps({ role: "option" }).filter((row: any) => row.props.className?.includes("palette-item"));
  const click = async (label: string) => {
    const row = rows().find((row: any) => textOf(row) === label || row.findAllByProps({ className: "palette-title" }).some((title: any) => textOf(title) === label));
    assert.ok(row, `normal rendered row ${label} exists`);
    await act(async () => { row.props.onClick(); });
  };
  await click("Move to section");
  return {
    effects, rows, click,
    labels: () => rows().map(textOf) as string[],
    selected: () => rows().filter((row: any) => row.props["aria-selected"]).map(textOf) as string[],
    separators: () => renderer.root.findAllByProps({ role: "separator" }).length,
    empty: () => renderer.root.findAllByProps({ className: "palette-section-empty" }).length,
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async key(key: string, signal: Record<string, unknown> = {}) {
      const nativeEvent = { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...signal };
      const event = { ...nativeEvent, nativeEvent, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } };
      await act(async () => { input().props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
function assertAssignment(effect: unknown, sectionId: string | null) {
  const action = effect as Record<string, unknown>;
  assert.deepEqual(Object.keys(action).sort(), ["sectionId", "type", "workspaceId"]);
  assert.equal(action.type, "assignSection");
  assert.equal(action.workspaceId, "workspace");
  assert.equal(action.sectionId, sectionId);
}

for (const query of ["new", "create", "NEW"]) {
  test(`section search exposes New section by ${query}`, async () => {
    const view = await fixture();
    try {
      await view.query(query);
      assert.deepEqual(view.labels(), ["New section…"]);
      assert.deepEqual(view.selected(), ["New section…"]);
      await view.key("Enter");
      assert.equal(view.effects[0], false);
      const call = view.effects[1] as { command: string; args: unknown[] };
      assert.equal(call.command, "createSectionWithWorkspace");
      assert.equal(call.args.length, 1); assert.equal(call.args[0], "workspace");
      assert.equal(view.effects.length, 2);
    } finally { await view.close(); }
  });
}
for (const query of ["remove", "from"]) {
  test(`section search exposes Remove from section by ${query}`, async () => {
    const view = await fixture();
    try {
      await view.query(query);
      assert.deepEqual(view.labels(), ["Remove from section"]);
      assert.deepEqual(view.selected(), ["Remove from section"]);
      await view.click("Remove from section");
      assert.equal(view.effects.length, 1); assertAssignment(view.effects[0], null);
    } finally { await view.close(); }
  });
}
test("section search keeps both action aliases for section with no name matches", async () => {
  const view = await fixture();
  try {
    await view.query("section");
    assert.deepEqual(view.labels(), ["New section…", "Remove from section"]);
    await view.key("ArrowDown"); assert.deepEqual(view.selected(), ["Remove from section"]);
    await view.key("Enter"); assert.equal(view.effects.length, 1); assertAssignment(view.effects[0], null);
  } finally { await view.close(); }
});
test("section search can create the first section by its keyword", async () => {
  const view = await fixture([]);
  try {
    await view.query("create"); assert.deepEqual(view.labels(), ["New section…"]);
    await view.click("New section…"); assert.equal(view.effects[0], false);
    assert.equal((view.effects[1] as { command: string }).command, "createSectionWithWorkspace");
    assert.equal(view.effects.length, 2);
  } finally { await view.close(); }
});
test("section search ranks full-name matches before partial matches", async () => {
  const view = await fixture([
    { id: "bucket-a", name: "Other tasks", workspaceIds: [] },
    { id: "bucket-b", name: "Other", workspaceIds: [] },
  ]);
  try {
    await view.query("Other"); assert.deepEqual(view.labels(), ["Other", "Other tasks"]);
    await view.key("Enter"); assert.equal(view.effects.length, 1); assertAssignment(view.effects[0], "bucket-b");
  } finally { await view.close(); }
});
test("section search considers the explicit section value as well as its name keyword", async () => {
  const view = await fixture([{ id: "release", name: "Ship room", workspaceIds: [] }]);
  try {
    await view.query("release"); assert.deepEqual(view.labels(), ["Ship room"]);
    await view.key("Enter"); assert.equal(view.effects.length, 1); assertAssignment(view.effects[0], "release");
  } finally { await view.close(); }
});
test("section search ranks the matching action group before a weaker section group", async () => {
  const view = await fixture([{ id: "bucket", name: "New work", workspaceIds: [] }]);
  try {
    await view.query("new"); assert.deepEqual(view.labels(), ["New section…", "New work"]);
    assert.deepEqual(view.selected(), ["New section…"]);
    assert.equal(view.separators(), 0, "cmdk separators are hidden while searching");
  } finally { await view.close(); }
});

test("control: empty search preserves sections then both actions and one separator", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(view.labels(), ["Current", "Other", "New section…", "Remove from section"]);
    assert.equal(view.separators(), 1); assert.deepEqual(view.selected(), ["Other"]);
    assert.deepEqual(view.effects, []);
  } finally { await view.close(); }
});
test("control: Remove is not offered when the workspace belongs to no section", async () => {
  const view = await fixture([{ id: "other", name: "Other", workspaceIds: [] }]);
  try {
    await view.query("remove"); assert.deepEqual(view.labels(), []); assert.equal(view.empty(), 1);
    await view.key("Enter"); assert.deepEqual(view.effects, []);
  } finally { await view.close(); }
});
test("control: a disabled current section cannot be selected by search", async () => {
  const view = await fixture();
  try {
    await view.query("Current"); assert.deepEqual(view.labels(), ["Current"]);
    assert.deepEqual(view.selected(), []); assert.equal(view.rows()[0].props["aria-disabled"], true);
    await view.click("Current"); await view.key("Enter"); assert.deepEqual(view.effects, []);
  } finally { await view.close(); }
});
test("control: enabled name search still selects exactly the section target", async () => {
  const view = await fixture();
  try {
    await view.query("Other"); assert.deepEqual(view.labels(), ["Other"]);
    await view.key("Enter"); assert.equal(view.effects.length, 1); assertAssignment(view.effects[0], "other");
  } finally { await view.close(); }
});
test("control: unmatched text cannot select a hidden action", async () => {
  const view = await fixture();
  try {
    await view.query("zzzz"); assert.deepEqual(view.labels(), []); assert.equal(view.empty(), 1);
    await view.key("Enter"); assert.deepEqual(view.effects, []);
    await view.query(""); assert.deepEqual(view.labels(), ["Current", "Other", "New section…", "Remove from section"]);
  } finally { await view.close(); }
});
for (const signal of [{ isComposing: true }, { keyCode: 229 }]) {
  test(`control: composition ${JSON.stringify(signal)} does not trigger New section`, async () => {
    const view = await fixture([]);
    try {
      assert.deepEqual(view.labels(), ["New section…"]);
      assert.deepEqual(await view.key("Enter", signal), { prevented: 0, stopped: 0 });
      assert.deepEqual(view.effects, []);
    } finally { await view.close(); }
  });
}
