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
import type { AppState } from "../state/types.ts";
import type { Action } from "../state/store.ts";

// Actual Host -> Palette -> MoveToSection callbacks and React effects. Host-node
// doubles observe scroll calls only: this does not exercise browser layout.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in section scroll fixture"); };
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
  sections: Array.from({ length: 30 }, (_, i) => ({ id: `section-${i}`, name: `Section ${String(i).padStart(2, "0")}`, workspaceIds: i === 15 ? ["workspace"] : [] })),
};
function textOf(node: any): string {
  if (typeof node === "string") return node;
  return (Array.isArray(node) ? node : node?.children ?? []).map(textOf).join("");
}
type Scroll = { scope: "regular" | "section"; title: string; block: string };
async function fixture(sections = seed.sections!) {
  const Host = loadHost();
  const actions: Action[] = [];
  const openChanges: boolean[] = [];
  const scrolls: Scroll[] = [];
  const queriedScopes: string[] = [];
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl", "createSection", "createSectionWithWorkspace"].map((name) => [name, noop]));
  let renderer: ReturnType<typeof create>;
  const rows = () => renderer.root.findAllByProps({ role: "option" });
  const isSection = () => renderer.root.findAllByProps({ "aria-label": "Back to commands" }).length === 1;
  await act(async () => {
    renderer = create(React.createElement(Host, {
      state: { ...seed, sections }, collapsedSections: new Set(), dispatch: (action: Action) => actions.push(action),
      open: true, onOpenChange: (open: boolean) => openChanges.push(open), commands,
      onOpenDialog: forbidden, onOpenProject: forbidden,
    }), { createNodeMock(element: any) {
      if (element.props.role !== "listbox") return null;
      const scope: Scroll["scope"] = element.props["data-tab"] === undefined ? "section" : "regular";
      return {
        scrollTo: noop,
        querySelector(selector: string) {
          assert.equal(selector, '[aria-selected="true"]');
          queriedScopes.push(scope);
          // A detached regular list cannot masquerade as the section list.
          if ((scope === "section") !== isSection()) return null;
          const row = rows().find((node: any) => node.props["aria-selected"] && !node.props["aria-disabled"]);
          return row ? { scrollIntoView(options: { block: string }) { scrolls.push({ scope, title: textOf(row), block: options.block }); } } : null;
        },
      };
    } });
  });
  const row = (title: string) => { const result = rows().find((item: any) => textOf(item) === title); assert.ok(result, `Missing ${title}`); return result; };
  const input = () => renderer.root.findByProps({ role: "combobox" });
  return {
    actions, openChanges, scrolls, queriedScopes, row, input, rows,
    selected: () => rows().filter((item: any) => item.props["aria-selected"]).map(textOf),
    clear() { scrolls.length = 0; queriedScopes.length = 0; },
    async enter() { await act(async () => { row("Move to section").props.onClick(); }); },
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
function assertSectionScroll(view: Awaited<ReturnType<typeof fixture>>, title: string) {
  assert.ok(view.scrolls.some((call) => call.scope === "section" && call.title === title && call.block === "nearest"), `selected ${title} must scroll its actual section list: ${JSON.stringify(view.scrolls)}`);
  assert.equal(view.queriedScopes.includes("regular"), false, "section movement must not target the detached regular list");
}
for (const { key, modifiers, from, to } of [
  { key: "ArrowDown", from: "Section 00", to: "Section 01" },
  { key: "ArrowUp", from: "Section 29", to: "Section 28" },
  { key: "j", modifiers: { ctrlKey: true }, from: "Section 00", to: "Section 01" },
  { key: "k", modifiers: { ctrlKey: true }, from: "Section 29", to: "Section 28" },
  { key: "Home", from: "Section 29", to: "Section 00" },
  { key: "End", from: "Section 00", to: "Remove from section" },
  { key: "ArrowDown", modifiers: { metaKey: true }, from: "Section 00", to: "Remove from section" },
  { key: "ArrowUp", modifiers: { metaKey: true }, from: "Section 29", to: "Section 00" },
  { key: "ArrowUp", from: "Section 00", to: "Remove from section" },
  { key: "ArrowDown", from: "Remove from section", to: "Section 00" },
]) {
  test(`mounted section keyboard scroll: ${JSON.stringify(modifiers ?? {})} ${key} ${from} -> ${to}`, async () => {
    const view = await fixture();
    try {
      await view.enter(); await view.hover(from); view.clear(); await view.key(key, modifiers);
      assert.deepEqual(view.selected(), [to]); assertSectionScroll(view, to);
      assert.deepEqual(view.actions, []); assert.deepEqual(view.openChanges, []);
    } finally { await view.close(); }
  });
}
test("filtered result change at the same index scrolls the newly selected section", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.query("Section 28"); view.clear(); await view.query("Section 29");
    assert.deepEqual(view.selected(), ["Section 29"]); assertSectionScroll(view, "Section 29");
  } finally { await view.close(); }
});
test("control: ordinary command navigation still scrolls the regular list", async () => {
  const view = await fixture();
  try {
    view.clear(); await view.key("ArrowDown");
    assert.ok(view.scrolls.some((call) => call.scope === "regular" && call.block === "nearest"));
    assert.equal(view.scrolls.some((call) => call.scope === "section"), false);
  } finally { await view.close(); }
});
test("control: composition does not change selection or request scroll", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("Section 00"); view.clear();
    await view.key("ArrowDown", { isComposing: true }); await view.key("End", { keyCode: 229 });
    assert.deepEqual(view.selected(), ["Section 00"]); assert.deepEqual(view.scrolls, []);
  } finally { await view.close(); }
});
test("control: enabled pointer selection changes the highlight without requesting scroll", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("Section 00"); view.clear(); await view.hover("Section 29");
    assert.deepEqual(view.selected(), ["Section 29"]); assert.deepEqual(view.scrolls, []);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: current section pointer callbacks cannot select, scroll or dispatch", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("Section 00"); view.clear();
    await view.hover("Section 15"); await view.click("Section 15");
    assert.deepEqual(view.selected(), ["Section 00"]); assert.deepEqual(view.scrolls, []); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: empty filtered list does not scroll or assign", async () => {
  const view = await fixture();
  try {
    await view.enter(); view.clear(); await view.query("no-such-section");
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) await view.key(key);
    assert.deepEqual(view.rows(), []); assert.deepEqual(view.scrolls, []); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: disabled-only filtered rows do not request scroll or dispatch", async () => {
  const view = await fixture();
  try {
    await view.enter(); view.clear(); await view.query("Section 15");
    for (const key of ["Home", "End", "ArrowDown", "ArrowUp", "Enter"]) await view.key(key);
    assert.deepEqual(view.scrolls, []); assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
test("control: selected enabled section still reaches the real Host assignment consumer", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("Section 29"); view.clear(); await view.key("Enter");
    assert.deepEqual(JSON.parse(JSON.stringify(view.actions)), [{ type: "assignSection", workspaceId: "workspace", sectionId: "section-29" }]);
    assert.deepEqual(view.openChanges, []);
  } finally { await view.close(); }
});
