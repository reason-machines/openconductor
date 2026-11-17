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

async function fixture({ saved, worktree, path, error }: {
  saved: string;
  worktree: string | null;
  path: string;
  error?: Error;
}) {
  const calls: string[] = [];
  const notices: string[] = [];
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      calls.push(JSON.stringify({ command, args }));
      if (error) throw error;
    },
  };
  const apps: Partial<typeof import("../openIn/apps.ts")> = {};
  load("../openIn/apps.ts", apps, { "@tauri-apps/api/core": native });
  assert.ok(apps.openInApp && apps.defaultAppId);
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
  assert.ok(chip.FilePathChip);
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
      file: { path, old_path: null, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [] },
      layout: "unified", ignoreWhitespace: false, wrapLines: true,
      viewed: false, onToggleViewed() {}, worktree,
      notify(kind, message) { notices.push(`${kind}: ${message}`); },
    }));
  });
  return {
    calls,
    notices,
    async click() {
      await act(async () => {
        renderer.root.findByProps({ className: "oc-path-chip" }).props.onClick();
      });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

function invocation(appId: string, path: string): string {
  return JSON.stringify({ command: "open_in_app", args: { appId, path } });
}

for (const { worktree, path } of [
  { worktree: "/tmp/open-in-workspace", path: "src/example.ts" },
  { worktree: "/tmp/open in workspace", path: "src/nested/example file.ts" },
  { worktree: "/tmp/open-in-workspace", path: "example.ts" },
]) {
  test(`primary diff header opens Alacritty at workspace ${worktree} for ${path}`, async () => {
    const view = await fixture({ saved: "alacritty", worktree, path });
    try {
      await view.click();
      assert.deepEqual(view.calls, [invocation("alacritty", worktree)], "use the workspace folder entrypoint, not the generic file opener");
      assert.deepEqual(view.notices, []);
    } finally { await view.close(); }
  });
}

for (const saved of ["finder", "vscode"]) {
  test(`primary diff header preserves the exact file payload for ${saved}`, async () => {
    const view = await fixture({ saved, worktree: "/tmp/open-in-workspace", path: "src/example.ts" });
    try {
      await view.click();
      assert.deepEqual(view.calls, [invocation(saved, "/tmp/open-in-workspace/src/example.ts")]);
      assert.deepEqual(view.notices, []);
    } finally { await view.close(); }
  });
}

test("primary diff header without a worktree does not invoke an app", async () => {
  const view = await fixture({ saved: "alacritty", worktree: null, path: "src/example.ts" });
  try {
    await view.click();
    assert.deepEqual(view.calls, []);
    assert.deepEqual(view.notices, []);
  } finally { await view.close(); }
});

test("primary diff header preserves Alacritty failure notification", async () => {
  const view = await fixture({ saved: "alacritty", worktree: "/tmp/open-in-workspace", path: "src/example.ts", error: new Error("launch rejected") });
  try {
    await view.click();
    assert.equal(view.calls.length, 1);
    assert.deepEqual(view.notices, ["error: Failed to open in Alacritty: launch rejected"]);
  } finally { await view.close(); }
});
