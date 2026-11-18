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
import * as model from "./search/model.ts";
import * as state from "./state.ts";
import * as workspacesTab from "./workspacesTab.ts";
import type { CommandPaletteProps } from "./CommandPalette.tsx";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const data: model.PaletteData = {
  actions: [
    { id: "alpha", title: "Alpha", group: "actions" },
    { id: "beta", title: "Beta", group: "actions" },
    { id: "gamma", title: "Gamma", group: "actions" },
  ],
  settings: [{ id: "setting-a", title: "General", keywords: [] }],
  projects: [{ id: "project-a", name: "Project A" }],
  workspaces: [], recentWorkspaceIds: [], activeWorkspaceId: null,
};
const repos = [{
  id: "repo", name: "Project", path: "/synthetic/project", defaultBranch: "main",
  workspaces: ["One", "Two"].map((name, index) => ({
    id: `ws-${index}`, name, branch: name, status: "idle" as const,
    diff: { added: 0, removed: 0 }, createdAt: index + 1,
  })),
}];

function evaluate(file: string, imports: Record<string, unknown>) {
  const javascript = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(javascript, {
    console, Date, exports,
    require(name: string) {
      if (name === "./search/score.ts") return sectionSearchScore;
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected ${file} import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

function loadPalette() {
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
    "../keybindings/overrides.ts": overrides,
    "../keybindings/shortcut.ts": shortcut,
    "./search/model.ts": model, "./state.ts": state,
    "../state/workspaceNumber.ts": workspaceNumber,
    "./fromAppState.ts": { VIEW_ARCHIVED_ACTION: "view-archived-workspaces" },
    "../home/allWorkspaces.ts": { ...allWorkspaces, loadFilters: () => ({ ...allWorkspaces.CLEARED_FILTERS, archiveFilter: "all" }) },
    "../home/allWorkspaces": allWorkspaces,
    "./workspacesTab.ts": workspacesTab, "./WorkspacesTab.tsx": rows,
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => ({ current: null }) },
    "../components/ConductorIcon": icons, "./palette.css": {},
  });
  return { Palette: palette.CommandPalette, sections };
}

async function fixture(extra: Partial<CommandPaletteProps> = {}) {
  const { Palette, sections } = loadPalette();
  const selected: string[] = [];
  let closes = 0;
  const props = {
    data, initialTab: "actions", onSelect: (item: model.ResultItem) => selected.push(item.id),
    onClose: () => { closes += 1; },
    SectionPicker: sections.MoveToSection, computeSectionItems: sections.sectionItems,
    ...extra,
  };
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Palette, props), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        return node.props.role === "listbox" ? { scrollTo: noop, querySelector: () => ({ scrollIntoView: noop }) } : null;
      },
    });
  });
  const input = () => renderer.root.findByProps({ role: "combobox" });
  const rows = () => renderer.root.findAllByProps({ role: "option" }).filter((row: any) => row.props.className?.includes("palette-item"));
  return {
    input, rows, selected, closes: () => closes,
    async key(key: string, options: Record<string, unknown> = {}) {
      const nativeEvent = { key, isComposing: false, keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...options };
      await act(async () => { input().props.onKeyDown({ ...nativeEvent, nativeEvent, preventDefault: noop, stopPropagation: noop }); });
    },
    async hover(index: number) { await act(async () => { rows()[index].props.onMouseMove(); }); },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async update(next: Partial<CommandPaletteProps>) { Object.assign(props, next); await act(async () => { renderer.update(React.createElement(Palette, props)); }); },
    async dispose() { await act(async () => { renderer.unmount(); }); },
  };
}

function linked(view: Awaited<ReturnType<typeof fixture>>) {
  const selected = view.rows().filter((row: any) => row.props["aria-selected"]);
  assert.equal(selected.length, 1, "fixture has exactly one selected result");
  const id = selected[0].props.id;
  assert.equal(typeof id, "string", "selected option exposes an ID");
  assert.ok(id.length > 0);
  assert.equal(view.input().props["aria-activedescendant"], id, "combobox references its selected option");
  assert.equal(view.rows().filter((row: any) => row.props.id === id).length, 1, "target ID is unique");
  return id;
}

for (const initialTab of ["actions", "all", "projects", "settings"] as const) {
  test(`${initialTab} combobox exposes the selected result to assistive technology`, async () => {
    const view = await fixture({ initialTab });
    try { linked(view); } finally { await view.dispose(); }
  });
}

test("the search input declares list autocomplete", async () => {
  const view = await fixture();
  try { assert.equal(view.input().props["aria-autocomplete"], "list"); } finally { await view.dispose(); }
});

test("keyboard and pointer selection update the active descendant without activation", async () => {
  const view = await fixture();
  try {
    const first = linked(view);
    await view.key("ArrowDown");
    assert.notEqual(linked(view), first);
    await view.hover(2);
    assert.equal(linked(view), view.rows()[2].props.id);
    assert.deepEqual(view.selected, []);
    assert.equal(view.closes(), 0);
  } finally { await view.dispose(); }
});

test("filtering clears a missing target and reconnects when results return", async () => {
  const view = await fixture();
  try {
    linked(view);
    await view.query("no-such-result-zzzzz");
    assert.equal(view.input().props["aria-activedescendant"], undefined);
    await view.query("Beta");
    linked(view);
  } finally { await view.dispose(); }
});

test("workspaces begin unselected, then keyboard and pointer selection link real workspace rows", async () => {
  const view = await fixture({ initialTab: "workspaces", repos });
  try {
    assert.equal(view.rows().length, 2);
    assert.equal(view.input().props["aria-activedescendant"], undefined);
    await view.key("ArrowDown");
    linked(view);
    await view.hover(1);
    linked(view);
  } finally { await view.dispose(); }
});

const sectionMode: Partial<CommandPaletteProps> = {
  data: { ...data, activeWorkspaceId: "ws-0" }, sectionKey: "section-view", localWorkspaceId: "ws-0",
  moveToSection: {
    workspaceId: "ws-0", sections: [
      { id: "other", name: "Other", workspaceIds: [] },
      { id: "current", name: "Current", workspaceIds: ["ws-0"] },
    ], onMove: noop, onNewSection: noop, onBack: noop,
  },
};
test("section results and both footer actions share the input's active-descendant contract", async () => {
  const view = await fixture(sectionMode);
  try {
    linked(view);
    await view.hover(2); // New section
    linked(view);
    await view.key("End"); // Remove from section
    linked(view);
    await view.query("no-matching-section");
    assert.equal(view.input().props["aria-activedescendant"], undefined);
  } finally { await view.dispose(); }
});

test("a removed result never leaves a dangling active-descendant reference", async () => {
  const view = await fixture();
  try {
    await view.key("End");
    linked(view);
    await view.update({ data: { ...data, actions: [data.actions[0]] } });
    assert.equal(view.input().props["aria-activedescendant"], undefined);
  } finally { await view.dispose(); }
});

test("simultaneously mounted palettes have independent option IDs", async () => {
  const first = await fixture();
  const second = await fixture();
  try { assert.notEqual(linked(first), linked(second)); } finally { await first.dispose(); await second.dispose(); }
});

test("control: ordinary Enter selects the existing result and closes once", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("Enter");
    assert.deepEqual(view.selected, ["action:beta"]);
    assert.equal(view.closes(), 1);
  } finally { await view.dispose(); }
});

test("control: composition still suppresses navigation and selection", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown", { isComposing: true });
    await view.key("Enter", { keyCode: 229 });
    assert.equal(view.rows()[0].props["aria-selected"], true);
    assert.deepEqual(view.selected, []);
    assert.equal(view.closes(), 0);
  } finally { await view.dispose(); }
});

test("control: no results have no active descendant", async () => {
  const view = await fixture({ data: { ...data, actions: [] } });
  try {
    assert.equal(view.rows().length, 0);
    assert.equal(view.input().props["aria-activedescendant"], undefined);
  } finally { await view.dispose(); }
});
