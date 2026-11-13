import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { OpenInApp } from "../openIn/apps.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const installed: OpenInApp[] = [
  { id: "finder", name: "Finder", iconType: "folder", icon: null },
  { id: "alacritty", name: "Alacritty", iconType: "terminal", icon: null },
  { id: "vscode", name: "VS Code", iconType: "code", icon: null },
];

function load(file: string, exported: object, imports: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    Error,
    exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected diff-header dependency: ${name}`);
      return imports[name];
    },
  });
}

async function clickHeader(saved: string, status: "modified" | "deleted") {
  const calls: string[] = [];
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) { calls.push(JSON.stringify({ command, args })); },
  };
  const apps: Partial<typeof import("../openIn/apps.ts")> = {};
  load("../openIn/apps.ts", apps, { "@tauri-apps/api/core": native });
  const inert = () => null;
  const tooltip = { Tooltip: ({ children }: { children: React.ReactNode }) => children };
  const chip: Partial<typeof import("./FilePathChip.tsx")> = {};
  load("./FilePathChip.tsx", chip, {
    "../../components/FileIcons": { FileTypeIcon: inert },
    "../../components/ui/Tooltip.tsx": tooltip,
    "../../settings/appPrefs": { useAppPrefs: () => ({ default_open_in: saved }) },
    "../openIn/apps": apps,
    "../openIn/OpenInButton": { useInstalledApps: () => installed },
  });
  const view: Partial<typeof import("./FileDiffView.tsx")> = {};
  load("./FileDiffView.tsx", view, {
    "../../components/ui/Tooltip.tsx": tooltip,
    "../../components/Icons.tsx": { CheckIcon: inert, CopyIcon: inert },
    "@tauri-apps/api/core": native,
    "../../backend": { inTauri: () => true },
    "./copyFile.ts": { copySource: () => null },
    "@pierre/diffs": {},
    "@pierre/diffs/react": {},
    "./Whitespace": { WhitespaceOnly: inert },
    "../../keybindings/KeybindingsProvider.tsx": {},
    "../../keybindings/overrides.ts": {},
    "../../keybindings/shortcut.ts": {},
    "./EditInViewer.ts": {},
    "./CommentNav": {},
    "./DiscardDialog": { RevertIcon: inert },
    "./FilePathChip": chip,
    "./pierre.ts": {},
    "./useDiffTheme.ts": {},
  });
  const FileDiffView = view.FileDiffView;
  assert.ok(FileDiffView);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(FileDiffView, {
      file: { path: "src/gone.ts", old_path: null, status, binary: false, additions: 0, deletions: 0, hunks: [] },
      layout: "unified", ignoreWhitespace: false, wrapLines: true,
      viewed: false, onToggleViewed() {}, worktree: "/tmp/deleted finder workspace",
    }));
  });
  try {
    await act(async () => {
      renderer.root.findByProps({ className: "oc-path-chip" }).props.onClick();
    });
  } finally {
    await act(async () => { renderer.unmount(); });
  }
  return calls;
}

test("deleted diff header passes Finder file context through the actual IPC adapter", async () => {
  assert.deepEqual(await clickHeader("finder", "deleted"), [JSON.stringify({
    command: "open_in_app",
    args: {
      appId: "finder", path: "/tmp/deleted finder workspace/src/gone.ts",
      fileContext: { workspacePath: "/tmp/deleted finder workspace" },
    },
  })]);
});

for (const { saved, status, path } of [
  { saved: "finder", status: "modified", path: "/tmp/deleted finder workspace/src/gone.ts" },
  { saved: "vscode", status: "deleted", path: "/tmp/deleted finder workspace/src/gone.ts" },
  { saved: "alacritty", status: "deleted", path: "/tmp/deleted finder workspace" },
] satisfies { saved: string; status: "modified" | "deleted"; path: string }[]) {
  test(`${status} ${saved} header preserves its prior IPC payload`, async () => {
    assert.deepEqual(await clickHeader(saved, status), [JSON.stringify({ command: "open_in_app", args: { appId: saved, path } })]);
  });
}
