import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import fixture from "../../../evidence/open-in/vscode-workspace-context/cases.json" with { type: "json" };
import type { OpenInApp } from "../openIn/apps.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const installed: OpenInApp[] = [
  { id: "finder", name: "Finder", iconType: "folder", icon: null },
  { id: "vscode", name: "VS Code", iconType: "code", icon: null },
  { id: "vscode-short", name: "VS Code", iconType: "code", icon: null },
];

function load(file: string, exported: object, imports: Record<string, unknown>) {
  const transpiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.deepEqual(transpiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [], [], "Header loader must compile before behavior assertions");
  runInNewContext(transpiled.outputText, {
    Error, exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, "Unexpected diff-header dependency: " + name);
      return imports[name];
    },
  });
}

async function clickHeader(appId: string, path: string) {
  const calls: { command: string; args: unknown }[] = [];
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) { calls.push({ command, args }); },
  };
  const apps: Partial<typeof import("../openIn/apps.ts")> = {};
  load("../openIn/apps.ts", apps, { "@tauri-apps/api/core": native });
  const inert = () => null;
  const tooltip = { Tooltip: ({ children }: { children: React.ReactNode }) => children };
  const chip: Partial<typeof import("./FilePathChip.tsx")> = {};
  load("./FilePathChip.tsx", chip, {
    "../../components/FileIcons": { FileTypeIcon: inert },
    "../../components/ui/Tooltip.tsx": tooltip,
    "../../settings/appPrefs": { useAppPrefs: () => ({ default_open_in: appId }) },
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
    "@pierre/diffs": {}, "@pierre/diffs/react": {},
    "./Whitespace": { WhitespaceOnly: inert },
    "../../keybindings/KeybindingsProvider.tsx": {},
    "../../keybindings/overrides.ts": {}, "../../keybindings/shortcut.ts": {},
    "./EditInViewer.ts": {}, "./CommentNav": {},
    "./DiscardDialog": { RevertIcon: inert }, "./FilePathChip": chip,
    "./pierre.ts": {}, "./useDiffTheme.ts": {},
  });
  const FileDiffView = view.FileDiffView;
  assert.ok(FileDiffView);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(FileDiffView, {
      file: { path, old_path: null, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [] },
      layout: "unified", ignoreWhitespace: false, wrapLines: true,
      viewed: false, onToggleViewed() {}, worktree: fixture.workspace,
    }));
  });
  try {
    await act(async () => {
      const button = renderer.root.findByProps({ className: "oc-path-chip" });
      assert.equal(button.type, "button");
      assert.notEqual(button.props.disabled, true);
      button.props.onClick();
    });
  } finally {
    await act(async () => { renderer.unmount(); });
  }
  return calls;
}

for (const scenario of fixture.cases.filter((scenario) => scenario.header)) {
  test("VS Code workspace payload: " + scenario.id, async () => {
    const args = {
      appId: scenario.appId,
      path: fixture.workspace + "/" + scenario.relative,
      ...(scenario.context ? { fileContext: { workspacePath: fixture.workspace } } : {}),
    };
    assert.deepEqual(JSON.parse(JSON.stringify(await clickHeader(scenario.appId, scenario.relative))), [{ command: "open_in_app", args }]);
  });
}
