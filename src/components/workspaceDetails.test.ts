import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import { agoTime } from "../home/dashboard.ts";
import type { Workspace } from "../state/types";

type Change = { reason: string; event: { target: unknown }; cancel(): void };
type PopoverState = { open: boolean; modal: boolean; onOpenChange(open: boolean, details: Change): void };
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const NOW = Date.UTC(2026, 10, 12, 14);
const PopoverContext = React.createContext<PopoverState | null>(null);
const original: Workspace = {
  id: "local-workspace", name: "Renamed workspace", branch: "sven/raw-branch", status: "idle",
  diff: { added: 4, removed: 2 }, createdAt: NOW - 5 * 60_000,
};

class MenuElement {
  closest(selector: string) { return selector === "[data-cm-tree]" ? this : null; }
}

function fixture(workspace = original, repo: { name: string } | null = { name: "Repository name" }, baselineHeader?: string) {
  const actions: unknown[] = [];
  let rootState: PopoverState | undefined;
  const modules = new Map<string, Record<string, unknown>>();
  const mocks: Record<string, unknown> = {
    "@base-ui/react/popover": { Popover: {
      Root: (props: PopoverState & { children: React.ReactNode }) => {
        rootState = props;
        return React.createElement(PopoverContext.Provider, { value: props }, props.children);
      },
      Trigger: ({ children, onContextMenu }: { children: React.ReactNode; onContextMenu: unknown }) => {
        const state = React.useContext(PopoverContext);
        assert.ok(state);
        return React.createElement("strong", {
          role: "button", "aria-haspopup": "dialog", onContextMenu,
          onClick: () => state.onOpenChange(!state.open, { reason: "trigger-press", event: { target: null }, cancel: assert.fail }),
        }, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) => React.useContext(PopoverContext)?.open ? children : null,
      Positioner: ({ children }: { children: React.ReactNode }) => children,
      Popup: React.forwardRef<HTMLDivElement, { children: React.ReactNode; "aria-label": string }>((props, ref) =>
        React.createElement("div", { role: "dialog", "aria-label": props["aria-label"], ref }, props.children)),
    } },
    "./WorkspaceContextMenu": { WorkspaceContextMenu: (props: object) => React.createElement("fixture-context-menu", props) },
    "./RenameWorkspaceDialog": { RenameWorkspaceDialog: (props: object) => React.createElement("fixture-rename-dialog", props) },
    "./Icons": { ClockIcon: () => null, FolderIcon: () => null, MoreIcon: () => null },
    "./menu/menuIcons": { PencilIcon: () => null },
    "../home/dashboard": { agoTime: (at: number) => agoTime(at, NOW) },
  };
  function load(filename: string): Record<string, unknown> {
    const cached = modules.get(filename);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    modules.set(filename, exports);
    const source = filename === "./WorkspaceNameHeader.tsx" && baselineHeader !== undefined
      ? baselineHeader : readFileSync(new URL(filename, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(javascript, {
      exports, Element: MenuElement, Date, Number,
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name.endsWith(".css")) return {};
        if (name === "./WorkspaceDetails") return load("./WorkspaceDetails.tsx");
        assert.ok(name in mocks, `Unexpected details dependency: ${name}`);
        return mocks[name];
      },
    });
    return exports;
  }
  const headerExports: Partial<Pick<typeof import("./WorkspaceNameHeader"), "WorkspaceNameHeader">> = {};
  Object.assign(headerExports, load("./WorkspaceNameHeader.tsx"));
  const Header = headerExports.WorkspaceNameHeader;
  assert.ok(Header);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Header, {
      workspace, repo: repo ?? undefined, repoId: "repo-id", sections: [],
      dispatch: (action: unknown) => actions.push(action),
      onNewSection: (value: unknown) => actions.push(["section", value]),
      onCopyLink: (value: unknown) => actions.push(["copy", value]),
      onError: assert.fail,
    }));
  });
  const content = (node: { children: Array<unknown> }): string => node.children.map((child) =>
    typeof child === "string" || typeof child === "number" ? String(child) :
      child && typeof child === "object" && "children" in child ? content(child as { children: unknown[] }) : "").join("");
  return {
    actions,
    trigger: () => renderer.root.findByType("strong"),
    open() {
      const trigger = renderer.root.findByType("strong");
      assert.equal(typeof trigger.props.onClick, "function", "workspace label must open details on primary activation");
      act(() => trigger.props.onClick());
    },
    text: () => content(renderer.root),
    fields: () => renderer.root.findAllByType("dt").map((node: { children: unknown[] }) => content(node)),
    values: () => renderer.root.findAllByType("dd").map((node: { children: unknown[] }) => content(node)),
    dialogCount: () => renderer.root.findAllByProps({ role: "dialog" }).length,
    button: (label: string) => renderer.root.findByProps({ "aria-label": label }),
    context: () => renderer.root.findByType("fixture-context-menu"),
    rename: () => renderer.root.findByType("fixture-rename-dialog"),
    root: () => rootState,
    closeFor(reason: string, target: unknown = null) {
      let canceled = false;
      assert.ok(rootState);
      act(() => rootState?.onOpenChange(false, { reason, event: { target }, cancel: () => { canceled = true; } }));
      return canceled;
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("pinned main reproduces missing primary details while original right-click still works", () => {
  const source = readFileSync(new URL("../../evidence/header-local-details/WorkspaceNameHeader.baseline.tsx.txt", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), "f3d487eb9e62229e6e5d03595a7f19ab9b69b60374bd9bf9f64ccc3560dd31dc");
  const view = fixture(original, { name: "Repository name" }, source);
  try {
    assert.throws(() => view.open(), /workspace label must open details on primary activation/);
    act(() => view.trigger().props.onContextMenu({ clientX: 30, clientY: 60, preventDefault() {} }));
    assert.equal(view.context().props.workspace, original);
    assert.equal(view.context().props.at.x, 30);
    assert.equal(view.context().props.at.y, 60);
    assert.deepEqual(view.actions, []);
  } finally { view.close(); }
});

test("primary activation opens local details without mutating the workspace", () => {
  const before = JSON.stringify(original);
  const view = fixture();
  try {
    assert.equal(view.dialogCount(), 0);
    view.open();
    assert.equal(view.dialogCount(), 1);
    assert.match(view.text(), /Renamed workspace/);
    assert.deepEqual(view.fields(), ["Repository", "Created"]);
    assert.deepEqual(view.values(), ["Repository name", "5m ago"]);
    assert.deepEqual(view.actions, []);
    assert.equal(JSON.stringify(original), before);
    assert.equal(view.root()?.modal, false);
  } finally { view.close(); }
});

test("local details omit creator, host and assignment without profile lookups", () => {
  const view = fixture();
  try {
    view.open();
    assert.doesNotMatch(view.text(), /Unknown user|Host|Assignee|Creator| · /);
    assert.deepEqual(view.fields(), ["Repository", "Created"]);
  } finally { view.close(); }
});

test("missing repository metadata omits only its row", () => {
  const view = fixture(original, null);
  try {
    view.open();
    assert.deepEqual(view.fields(), ["Created"]);
    assert.deepEqual(view.values(), ["5m ago"]);
  } finally { view.close(); }
});

const ageCases = [
  { label: "zero", at: 0, expected: "" },
  { label: "NaN", at: NaN, expected: "" },
  { label: "infinity", at: Infinity, expected: "Invalid time" },
  { label: "invalid Date range", at: 8_640_000_000_000_001, expected: "Invalid time" },
  { label: "future clamp", at: NOW + 60_000, expected: "just now" },
  { label: "under 30 seconds", at: NOW - 29_999, expected: "just now" },
  { label: "30 seconds", at: NOW - 30_000, expected: "1m ago" },
  { label: "hour rounding", at: NOW - (44 * 60 + 30) * 1000, expected: "1h ago" },
  { label: "day rounding", at: NOW - 24 * 3_600_000, expected: "1d ago" },
  { label: "42 hour boundary", at: NOW - 42 * 3_600_000, expected: "2d ago" },
  { label: "month", at: NOW - 30 * 86_400_000, expected: "1mo ago" },
  { label: "year", at: Date.UTC(2025, 10, 12, 14), expected: "1y ago" },
];
for (const item of ageCases) {
  test(`Created preserves SS ${item.label} behavior`, () => {
    const view = fixture({ ...original, createdAt: item.at });
    try {
      view.open();
      assert.equal(view.values()[1], item.expected);
    } finally { view.close(); }
  });
}

test("details Rename opens the existing dialog for the same workspace", () => {
  const view = fixture();
  try {
    view.open();
    act(() => view.button("Rename workspace").props.onClick());
    assert.equal(view.dialogCount(), 0);
    assert.equal(view.rename().props.workspace, original);
    assert.equal(view.rename().props.repoId, "repo-id");
    assert.deepEqual(view.actions, []);
  } finally { view.close(); }
});

test("details actions reuse existing workspace context actions", () => {
  const view = fixture();
  try {
    view.open();
    act(() => view.button("Workspace actions").props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 40, bottom: 80 }) } }));
    assert.equal(view.context().props.workspace, original);
    assert.equal(view.context().props.at.x, 40);
    assert.equal(view.context().props.at.y, 84);
    assert.equal(view.closeFor("focus-out"), true);
    assert.equal(view.closeFor("escape-key"), true);
    assert.equal(view.closeFor("outside-press", new MenuElement()), true);
    assert.equal(view.dialogCount(), 1);
    act(() => view.context().props.onClose());
    assert.equal(view.closeFor("focus-out"), false);
    assert.equal(view.dialogCount(), 0);
  } finally { view.close(); }
});

for (const reason of ["escape-key", "outside-press", "focus-out"]) {
  test(`details allow library ${reason} dismissal when no nested actions are open`, () => {
    const view = fixture();
    try {
      view.open();
      assert.equal(view.closeFor(reason), false);
      assert.equal(view.dialogCount(), 0);
    } finally { view.close(); }
  });
}

test("control: original right-click menu retains workspace identity and coordinates", () => {
  const view = fixture();
  try {
    let prevented = false;
    act(() => view.trigger().props.onContextMenu({ clientX: 30, clientY: 60, preventDefault() { prevented = true; } }));
    assert.equal(prevented, true);
    assert.equal(view.context().props.workspace, original);
    assert.equal(view.context().props.at.x, 30);
    assert.equal(view.context().props.at.y, 60);
    assert.deepEqual(view.actions, []);
    assert.equal(view.dialogCount(), 0);
  } finally { view.close(); }
});

test("control: context Rename, Copy link and New section callbacks are preserved", () => {
  const view = fixture();
  try {
    act(() => view.trigger().props.onContextMenu({ clientX: 0, clientY: 0, preventDefault() {} }));
    const menu = view.context();
    act(() => { menu.props.onCopyLink(original); menu.props.onNewSection(original); menu.props.onRename(); });
    assert.equal(view.rename().props.workspace, original);
    assert.deepEqual(view.actions, [["copy", original], ["section", original]]);
  } finally { view.close(); }
});
