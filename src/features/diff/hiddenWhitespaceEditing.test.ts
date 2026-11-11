import * as Pierre from "@pierre/diffs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { CodeViewItem } from "@pierre/diffs";
import type { DiffLayout, DiffViewOptions, FileDiff } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const candidateFiles = new Set([
  "src/features/diff/useWorkspaceDiff.ts", "src/features/diff/DiffViewer.tsx", "src/features/diff/editable.ts",
  "src/features/diff/FileDiffView.tsx", "src/features/diff/pierre.ts",
]);
const allowed = new Set([
  ...candidateFiles, "src/features/diff/api.ts", "src/features/diff/types.ts", "src/features/diff/target.ts",
  "src/features/diff/nav.ts", "src/features/diff/changesTree.ts", "src/features/diff/changesFilter.ts",
  "src/features/diff/viewed.ts", "src/features/diff/EditInViewer.ts", "src/features/diff/editorContents.ts",
  "src/features/diff/copyFile.ts", "src/features/files/tree.ts", "src/lib/keyedCache.ts", "src/keybindings/fuzzy.ts",
  "src/keybindings/overrides.ts", "src/keybindings/registry.ts", "src/keybindings/shortcut.ts", "src/keybindings/types.ts",
].map((path) => resolve(root, path)));

type Request = { path: string | null; ignore_whitespace: boolean; context_lines: number | null; scope: { kind: string } };
type Kind = "modified" | "whitespace-only" | "binary" | "deleted" | "emptied";

function gitInput(kind: Kind, newline: boolean, historical: boolean) {
  const repo = mkdtempSync(join(tmpdir(), "oc-whitespace-edit-"));
  const file = join(repo, "example.txt");
  const ending = newline ? "\n" : "";
  const before = kind === "binary" ? "before\u0000data" : `heading\n  retained whitespace\nold value\ntail${ending}`;
  const after = kind === "binary" ? "after\u0000data" : kind === "emptied" ? "" : `heading\n\tretained whitespace\n${kind === "whitespace-only" ? "old" : "new"} value\ntail${ending}`;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Conductor Rebuild fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(file, before);
  git("add", "example.txt");
  git("commit", "-qm", "fixture baseline");
  if (kind === "deleted") unlinkSync(file);
  else writeFileSync(file, after);
  assert.equal(git("status", "--porcelain"), kind === "deleted" ? " D example.txt\n" : " M example.txt\n");
  if (historical) { git("add", "example.txt"); git("commit", "-qm", "historical change"); }

  function diff(request: Request): FileDiff | null {
    const raw = git("diff", "--no-ext-diff", "--no-color", `-U${request.context_lines ?? 3}`,
      ...(request.ignore_whitespace ? ["-w"] : []), ...(request.scope.kind === "commit" ? ["HEAD^", "HEAD"] : []), "--", "example.txt");
    const hunks: FileDiff["hunks"] = [];
    let old = 0;
    let next = 0;
    for (const line of raw.split("\n")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (match) {
        old = Number(match[1]); next = Number(match[3]);
        hunks.push({ old_start: old, new_start: next, old_lines: Number(match[2] ?? 1), new_lines: Number(match[4] ?? 1), section: match[5].trim(), lines: [] });
      } else if (hunks.length && [" ", "+", "-"].includes(line[0])) {
        const mark = line[0];
        hunks.at(-1)!.lines.push({ kind: mark === "+" ? "addition" : mark === "-" ? "deletion" : "context",
          old_line: mark === "+" ? null : old++, new_line: mark === "-" ? null : next++, text: line.slice(1) });
      } else if (hunks.length && line.startsWith("\\ No newline")) hunks.at(-1)!.lines.at(-1)!.no_newline_at_eof = true;
    }
    const counts = git("diff", "--numstat", ...(request.scope.kind === "commit" ? ["HEAD^", "HEAD"] : []), "--", "example.txt").split("\t");
    if (counts[0] === "") return null;
    return { path: "example.txt", old_path: null, status: kind === "deleted" ? "deleted" : "modified", binary: counts[0] === "-",
      additions: counts[0] === "-" ? 0 : Number(counts[0]), deletions: counts[1] === "-" ? 0 : Number(counts[1]), hunks };
  }
  return { repo, file, before, after, diff, close: () => rmSync(repo, { recursive: true, force: true }) };
}

async function fixture(layout: DiffLayout, newline = true, kind: Kind = "modified", scope: DiffViewOptions["scope"] = "uncommitted") {
  const input = gitInput(kind, newline, typeof scope === "object");
  const requests: Array<{ request: Request; finish: () => void; fail: () => void }> = [];
  const writes: string[] = [];
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const storage = new Map([["openconductor.diff.options", JSON.stringify({ scope: typeof scope === "object" ? "uncommitted" : scope, layout, ignoreWhitespace: true, wrapLines: false })]]);
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let editorText: string | undefined;
  let saveFailure = false;
  const CodeView = React.forwardRef((props: { items: CodeViewItem<unknown>[] }, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ getEditor: () => ({ getFile: () => ({ contents: editorText }) }) }), []);
    return React.createElement("code-view", props);
  });
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_WHITESPACE_REGRESSION_REF && candidateFiles.has(relative)
      ? execFileSync("git", ["show", `${process.env.DIFF_WHITESPACE_REGRESSION_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function require(name: string): unknown {
      if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort") return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@pierre/diffs/react") return { CodeView, EditProvider: ({ children }: { children: unknown }) => children };
      if (name === "@pierre/diffs/edit") return { Editor: class { constructor() { assert.fail("No native/DOM editor in this component fixture"); } } };
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => true };
      if (name === "@tauri-apps/api/core") return {
        invoke: (command: string, args: { repo: string; request: Request & { path: string; contents: string } }) => {
          assert.equal(args.repo, input.repo);
          if (command === "diff_write_file") {
            assert.equal(args.request.path, "example.txt");
            if (saveFailure) return Promise.reject(new Error("write refused"));
            writes.push(args.request.contents);
            writeFileSync(input.file, args.request.contents);
            return Promise.resolve();
          }
          assert.equal(command, "diff_workspace");
          const response = () => { const file = input.diff(args.request); return { files: file ? [file] : [] }; };
          if (args.request.context_lines === 0) return Promise.resolve(response());
          return new Promise((resolve, reject) => requests.push({ request: args.request,
            finish: () => resolve(response()), fail: () => reject(new Error("full text unavailable")) }));
        },
      };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined, useKeybindingOverrides: () => ({ overrides: {} }) };
      if (name === "./useChangesPresentation.ts") return { useChangesPresentation: () => ({ presentation: { filePathFilter: "", diffFileListMode: "flat" } }) };
      if (name === "./useDiffTheme.ts") return { useDiffTheme: () => "github-dark" };
      if (name === "./CommentNav") return { CommentNav: () => null, useCommentNavigation: () => ({ previousCount: 0, nextCount: 0, refresh: () => undefined }) };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => null, RevertIcon: () => null };
      if (name === "./FilePathChip") return { FilePathChip: () => null };
      if (name === "./Whitespace") return { ViewOptionsMenu: () => null, WhitespaceOnly: () => React.createElement("whitespace-only") };
      if (name === "../../components/ConductorIcon") return { ConductorIcon: () => null };
      if (name === "../../components/Icons.tsx") return { CopyIcon: () => null, CheckIcon: () => null };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: ({ children }: { children: unknown }) => children };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    }
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
      document: { documentElement: { dataset: { theme: "dark" } } }, MutationObserver: class { observe() {} disconnect() {} },
      setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout: (id: number) => timers.delete(id), console,
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { DiffTab } = load(resolve(root, "src/features/diff/DiffViewer.tsx"));
  const { useWorkspaceDiff } = load(resolve(root, "src/features/diff/useWorkspaceDiff.ts"));
  assert.ok(typeof DiffTab === "function" && typeof useWorkspaceDiff === "function");
  let state: WorkspaceDiff;
  function Fixture() {
    state = useWorkspaceDiff({ workspaceId: "fixture", worktree: input.repo, target: { branch: "main", remote: null } });
    return React.createElement(DiffTab, { diff: state });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Fixture)); });
  if (typeof scope === "object") await act(async () => { state.update({ scope }); });
  const pending = (path: string | null) => {
    const request = requests.filter((entry) => entry.request.path === path).at(-1);
    assert.ok(request, `Missing production request for ${path ?? "list"}`);
    return request;
  };
  await act(async () => { pending(null).finish(); });
  await act(async () => { state.openPath("example.txt"); });
  const code = () => renderer.root.findByType("code-view");
  return {
    input, requests, writes, code, state: () => state,
    draft: () => renderer.root.findByType(load(resolve(root, "src/features/diff/FileDiffView.tsx")).FileDiffView).props.edit?.current(),
    wholeRequest: () => pending("example.txt").request,
    editing: () => renderer.root.findAll((node: { type: string; props: { className?: string } }) => node.type === "div" && node.props.className === "oc-code-edit").length > 0,
    whitespaceOnly: () => renderer.root.findAllByType("whitespace-only").length > 0,
    async full() { await act(async () => { pending("example.txt").finish(); }); },
    async fail() { await act(async () => { pending("example.txt").fail(); }); },
    async refresh() { await act(async () => { state.refresh(); }); await act(async () => { pending(null).finish(); }); },
    async edit(contents: string) {
      editorText = contents;
      await act(async () => { code().props.onItemEditChange({ file: { contents } }); });
    },
    async save() {
      let prevented = false;
      const wrapper = renderer.root.find((node: { type: string; props: { className?: string } }) => node.type === "div" && node.props.className === "oc-code-edit");
      await act(async () => { wrapper.props.onKeyDown({ nativeEvent: { key: "s", code: "KeyS", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, preventDefault: () => { prevented = true; } }); });
      assert.ok(prevented, "production save-shortcut handler consumed Cmd+S");
    },
    refuseSave: () => { saveFailure = true; },
    alerts: () => renderer.root.findAll((node: { props: { role?: string } }) => node.props.role === "alert"),
    async close() { await act(async () => { renderer.unmount(); }); input.close(); assert.equal(timers.size, 0); },
  };
}

for (const layout of ["unified", "split", "file"] as const) {
  for (const newline of [true, false]) {
    test(`${layout} hidden-whitespace loader/editor/Cmd+S preserves complete text with ${newline ? "a" : "no"} final newline`, async () => {
      const view = await fixture(layout, newline);
      try {
        assert.equal(view.editing(), false, "filtered list data must never seed an editor");
        const request = view.wholeRequest();
        assert.equal(request.context_lines, 2 ** 31 - 1);
        assert.equal(request.ignore_whitespace, false, "whole-text request must not inherit the presentation filter");
        assert.equal(request.scope.kind, "uncommitted");
        await view.full();
        assert.ok(view.editing(), "legitimate modified file becomes editable after complete text arrives");
        const item = view.code().props.items[0];
        assert.equal(item.edit, true);
        if (item.type === "file") assert.equal(item.file.contents, view.input.after);
        else {
          assert.equal(item.fileDiff.isPartial, false);
          assert.equal(item.fileDiff.additionLines.join(""), view.input.after);
          assert.equal(item.fileDiff.deletionLines.join(""), view.input.before);
          assert.equal(item.fileDiff.hunks.reduce((count: number, hunk: { additionLines: number }) => count + hunk.additionLines, 0), 1, "presentation still hides the whitespace-only edit");
          assert.equal(item.fileDiff.hunks.reduce((count: number, hunk: { deletionLines: number }) => count + hunk.deletionLines, 0), 1);
        }
        const draft = view.input.after.replace("new value", "saved value");
        await view.edit(draft); await view.save();
        assert.equal(view.writes.length, 1);
        assert.equal(view.writes[0], draft, "save IPC carries the complete document, not a filtered patch");
        assert.equal(readFileSync(view.input.file, "utf8"), draft, "disk bytes retain tab, untouched prefix/suffix and EOF");
      } finally { await view.close(); }
    });
  }
}

test("a failed full-text load remains read-only", async () => {
  const view = await fixture("unified");
  try { await view.fail(); assert.equal(view.editing(), false); assert.equal(view.writes.length, 0); }
  finally { await view.close(); }
});

test("a same-file refresh revokes editing until fresh unfiltered contents arrive", async () => {
  const view = await fixture("split");
  try {
    await view.full(); assert.ok(view.editing());
    writeFileSync(view.input.file, view.input.after.replace("new value", "external value"));
    await view.refresh(); assert.equal(view.editing(), false);
    await view.full(); assert.ok(view.editing());
    assert.equal(view.code().props.items[0].fileDiff.additionLines.join(""), readFileSync(view.input.file, "utf8"));
  } finally { await view.close(); }
});

test("a rejected save preserves disk and the complete draft", async () => {
  const view = await fixture("file");
  try {
    await view.full(); const draft = view.input.after.replace("new value", "unsaved value");
    await view.edit(draft); view.refuseSave(); await view.save();
    assert.equal(readFileSync(view.input.file, "utf8"), view.input.after);
    assert.equal(view.draft(), draft);
    assert.equal(view.alerts().length, 1);
  } finally { await view.close(); }
});

for (const kind of ["binary", "deleted", "whitespace-only"] as const) {
  test(`a real ${kind} change does not gain an editor from hidden-whitespace loading`, async () => {
    const view = await fixture("unified", true, kind);
    try {
      for (const request of view.requests.filter((entry) => entry.request.path !== null)) await act(async () => { request.finish(); });
      assert.equal(view.editing(), false); assert.equal(view.writes.length, 0);
      if (kind === "whitespace-only") assert.ok(view.whitespaceOnly());
    } finally { await view.close(); }
  });
}

test("commit history remains read-only while Entire-file text uses the unfiltered full source", async () => {
  const view = await fixture("file", true, "modified", { type: "commit", commitHash: "HEAD" });
  try {
    await view.full(); assert.equal(view.editing(), false); assert.equal(view.writes.length, 0);
    assert.equal(view.code().props.items[0].file.contents, view.input.after);
  } finally { await view.close(); }
});

test("a content change becoming mode-only before its full response must not open an empty editor", async () => {
  const view = await fixture("split");
  try {
    writeFileSync(view.input.file, view.input.before); chmodSync(view.input.file, 0o755);
    await view.full(); assert.equal(view.editing(), false); assert.equal(view.writes.length, 0);
  } finally { await view.close(); }
});

test("a genuinely emptied file still has complete editable contents", async () => {
  const view = await fixture("split", true, "emptied");
  try {
    await view.full(); assert.ok(view.editing()); assert.equal(view.draft(), "");
  } finally { await view.close(); }
});
