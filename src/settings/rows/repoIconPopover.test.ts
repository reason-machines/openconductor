import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Repo } from "../../state/types";
import * as repoIcon from "../../state/repoIcon.ts";
import { searchEmoji } from "../../components/repoEmoji.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRef = process.env.SETTINGS_ICON_SOURCE_REF;

function source(path: string) {
  return sourceRef
    ? execFileSync("git", ["show", `${sourceRef}:${path}`], { encoding: "utf8" })
    : readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

function load(path: string, imports: Record<string, unknown>, suffix = "") {
  const exports: Record<string, unknown> = {};
  const javascript = ts.transpileModule(source(path) + suffix, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name in imports) return imports[name];
      throw new Error(`Unexpected repository icon popup dependency: ${name}`);
    },
  });
  return exports;
}

function fixture(globalDialog = false, icon: string | null = null) {
  const Context = React.createContext(null);
  function Root({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
    return React.createElement(Context.Provider, { value: { open, onOpenChange } }, children);
  }
  function Trigger({ children, ...props }: { children: ReactNode }) {
    const state = React.useContext(Context);
    return React.createElement("button", { ...props, "aria-expanded": state.open, onClick: () => state.onOpenChange(!state.open) }, children);
  }
  function Portal({ children }: { children: ReactNode }) {
    return React.useContext(Context).open ? children : null;
  }
  function Positioner({ children, ...props }: { children: ReactNode }) {
    return React.createElement("test-positioner", props, children);
  }
  function Popup({ children, ...props }: { children: ReactNode }) {
    return React.createElement("div", { role: "dialog", ...props }, children);
  }
  const icons = { CloseIcon: () => null, SearchIcon: () => null };
  const modal = load("src/components/Dialogs.tsx", {
    "./Icons": icons,
    "./motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
  });
  const repoIcons = {
    RepoIcon: () => null,
    isRepoIconName: (name: string) => name === "folder" || name === "star",
    RepoIconGlyph: () => null,
    useRepoFavicon() { throw new Error("Unexpected favicon I/O in settings popup regression"); },
  };
  const picker = load("src/components/RepoIconDialog.tsx", {
    "../state/repoIcon": repoIcon,
    "./Dialogs": modal,
    "./Icons": icons,
    "./repoIcons.generated": { REPO_ICONS: { folder: {}, star: {} } },
    "./repoEmoji": { searchEmoji },
    "./RepoIcon": repoIcons,
  });
  const misc = load("src/settings/repoMisc.ts", {
    "@tauri-apps/api/core": { invoke() { throw new Error("Unexpected native invocation in settings popup regression"); } },
  });
  const rows = load("src/settings/rows/RepoMiscRows.tsx", {
    "@base-ui/react/popover": { Popover: { Root, Trigger, Portal, Positioner, Popup } },
    "../../components/RepoIcon": repoIcons,
    "../../components/RepoIconDialog": picker,
    "../../components/RemoveRepositoryDialog": {},
    "../../components/Icons": icons,
    "../../backend": {},
    "./rows.css": {},
    "./repoIconPopover.css": {},
    "../../features/openIn/OpenInButton": {},
    "../GeneralPage": { Row: ({ children }: { children: ReactNode }) => React.createElement("section", null, children) },
    "../icons": {},
    "../rootPath": {},
    "../repoSettings": {},
    "../useRepoSettings": {},
    "../repoMisc": misc,
  }, "\nexports.IconRow = IconRow;\n");
  const repo: Repo = { id: "settings-icon-repo", name: "Settings icon fixture", path: "", defaultBranch: "main", workspaces: [], icon };
  const changes: [string, string | null][] = [];
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(globalDialog ? picker.RepoIconDialog : rows.IconRow, globalDialog ? {
      repo, onChange: (value: string | null) => changes.push([repo.id, value]), onClose: () => {}, onError: assert.fail,
    } : {
      repo, actions: { onSetIcon: (id: string, value: string | null) => changes.push([id, value]), onRemoved: assert.fail, notify: assert.fail },
    }));
  });
  return {
    changes,
    root: () => renderer.root,
    open() { act(() => renderer.root.findAllByType("button").find((button: { props: { [key: string]: unknown } }) => button.props["aria-label"] === "Change repository icon").props.onClick()); },
    click(label: string) { act(() => renderer.root.findByProps({ "aria-label": label }).props.onClick()); },
    tab(label: string) { act(() => renderer.root.findByProps({ role: "tab", children: label }).props.onClick()); },
    dismiss() { act(() => renderer.root.findByType(Root).props.onOpenChange(false, { reason: "outside-press" })); },
    popover: () => renderer.root.findByType(Root),
    dispose() { act(() => renderer.unmount()); },
  };
}

test("settings icon trigger opens a non-modal picker anchored below the trigger without a dialog shell", () => {
  const view = fixture();
  try {
    assert.equal(view.root().findAllByProps({ role: "tablist" }).length, 0);
    view.open();
    assert.equal(view.root().findAllByProps({ className: "modal-backdrop" }).length, 0, "settings picker must not mount a modal backdrop");
    assert.equal(view.root().findAllByProps({ "aria-modal": "true" }).length, 0);
    assert.equal(view.root().findAllByType("h2").length, 0);
    assert.equal(view.root().findAllByProps({ "aria-label": "Close" }).length, 0);
    assert.equal(view.popover().props.modal, false);
    const positioner = view.root().findByType("test-positioner");
    assert.equal(positioner.props.side, "bottom");
    assert.equal(positioner.props.align, "start");
    assert.equal(positioner.props.sideOffset, 4);
    assert.equal(view.root().findByProps({ role: "dialog" }).props["aria-label"], "Change repository icon");
    assert.equal(view.root().findAllByType("button").find((button: { props: { [key: string]: unknown } }) => button.props["aria-label"] === "Change repository icon").props["aria-expanded"], true);
  } finally { view.dispose(); }
});

test("settings popup selects an icon for its repository and closes", () => {
  const view = fixture();
  try {
    view.open();
    view.click("star");
    assert.deepEqual(view.changes, [["settings-icon-repo", "star"]]);
    assert.equal(view.root().findAllByProps({ role: "tablist" }).length, 0);
  } finally { view.dispose(); }
});

test("settings popup clears an existing icon and closes", () => {
  const view = fixture(false, "star");
  try {
    view.open();
    view.click("Remove icon");
    assert.deepEqual(view.changes, [["settings-icon-repo", null]]);
    assert.equal(view.root().findAllByProps({ role: "tablist" }).length, 0);
  } finally { view.dispose(); }
});

test("settings popup controlled dismissal and reopening reset the picker to Icons", () => {
  const view = fixture();
  try {
    view.open();
    view.tab("Emoji");
    assert.equal(view.root().findByProps({ role: "tab", children: "Emoji" }).props["aria-selected"], true);
    view.dismiss();
    assert.equal(view.root().findAllByProps({ role: "tablist" }).length, 0);
    view.open();
    assert.equal(view.root().findByProps({ role: "tab", children: "Icons" }).props["aria-selected"], true);
    assert.equal(view.root().findByType("input").props.value, "");
    assert.deepEqual(view.changes, []);
  } finally { view.dispose(); }
});

test("settings popup trigger toggles closed without changing the icon", () => {
  const view = fixture();
  try {
    view.open();
    view.open();
    assert.equal(view.root().findAllByProps({ role: "tablist" }).length, 0);
    assert.deepEqual(view.changes, []);
  } finally { view.dispose(); }
});

test("global repository icon dialog keeps its modal shell and picker", () => {
  const view = fixture(true);
  try {
    assert.equal(view.root().findAllByProps({ className: "modal-backdrop" }).length, 1);
    const dialog = view.root().findByProps({ role: "dialog" });
    assert.equal(dialog.props["aria-modal"], "true");
    assert.equal(dialog.props["aria-label"], "Change icon for Settings icon fixture");
    assert.equal(view.root().findAllByProps({ "aria-label": "Close" }).length, 1);
    assert.equal(view.root().findAllByProps({ role: "tab" }).length, 4);
    view.click("folder");
    assert.deepEqual(view.changes, [["settings-icon-repo", "folder"]]);
  } finally { view.dispose(); }
});
