import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as diff from "@pierre/diffs";
import * as pierre from "../../src/features/diff/pierre.ts";
import * as copy from "../../src/features/diff/copyFile.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const cases = JSON.parse(readFileSync("evidence/diff/large-file-placeholder/cases.json", "utf8"));
const dtoDirectory = process.env.DIFF_PLACEHOLDER_DTOS;
assert.ok(dtoDirectory, "Run the real Rust producer with DIFF_PLACEHOLDER_DTOS before mounting its DTOs");
const path = "src/features/diff/FileDiffView.tsx";
const source = readFileSync(path, "utf8");
const javascript = ts.transpileModule(source, {
  fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const unexpected = () => assert.fail("Unexpected native, clipboard, edit or navigation boundary");
const passthrough = ({ children }) => children;
const icon = () => null;
const boundaries = {
  "../../components/ui/Tooltip.tsx": { Tooltip: passthrough },
  "../../components/Icons.tsx": { CheckIcon: icon, CopyIcon: icon },
  "@tauri-apps/api/core": { invoke: unexpected },
  "../../backend": { inTauri: () => false },
  "./copyFile.ts": copy,
  "@pierre/diffs": diff,
  "@pierre/diffs/react": {
    CodeView: React.forwardRef((_props, _ref) => React.createElement("pre", { "data-code-view": "mounted" })),
    EditProvider: passthrough,
  },
  "./Whitespace": { WhitespaceOnly: () => React.createElement("div", {}, "Only whitespace changes found") },
  "../../keybindings/KeybindingsProvider.tsx": { useKeybindingOverrides: () => ({ overrides: {} }) },
  "../../keybindings/overrides.ts": { effectiveShortcuts: unexpected },
  "../../keybindings/shortcut.ts": { matchesEvent: unexpected },
  "./EditInViewer.ts": { createEditor: unexpected },
  "./CommentNav": {
    CommentNav: () => null,
    useCommentNavigation: () => ({ previousCount: 0, nextCount: 0, navigate: unexpected, refresh() {} }),
  },
  "./DiscardDialog": { RevertIcon: icon },
  "./FilePathChip": { FilePathChip: ({ path }) => React.createElement("span", { "data-file-path": path }, path) },
  "./pierre.ts": pierre,
  "./useDiffTheme.ts": { useDiffTheme: () => "pierre-dark" },
};
const module = { exports: {} };
runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, {
  document: { documentElement: { dataset: { theme: "dark" } } },
  MutationObserver: class { observe() {} disconnect() {} },
  setTimeout, clearTimeout,
})((name) => {
  if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
  assert.ok(Object.hasOwn(boundaries, name), `Unexpected dependency: ${name}`);
  return boundaries[name];
}, module, module.exports);
assert.equal(typeof module.exports.FileDiffView, "function");

for (const scenario of cases) {
  test(`real backend DTO renders ${scenario.name}`, async (t) => {
    const dto = JSON.parse(readFileSync(join(dtoDirectory, `${scenario.name}.json`), "utf8"));
    assert.equal(dto.file_bytes, scenario.bytes);
    assert.equal(dto.workspace.files.length, 1);
    assert.equal(dto.summary.length, 1);
    const file = dto.workspace.files[0];
    assert.equal(file.path, `${scenario.name}.txt`);
    assert.equal(dto.summary[0].path, file.path);
    assert.equal(file.binary, scenario.binary);
    let toggles = 0;
    const props = {
      file, layout: "unified", ignoreWhitespace: false, wrapLines: true,
      viewed: false, onToggleViewed: () => { toggles++; }, worktree: "/fixture-worktree",
    };
    let renderer;
    t.after(async () => { if (renderer) await act(async () => renderer.unmount()); });
    await act(async () => { renderer = create(React.createElement(module.exports.FileDiffView, props)); });
    for (const layout of ["unified", "split", "file"]) {
      await act(async () => renderer.update(React.createElement(module.exports.FileDiffView, { ...props, layout })));
      assert.equal(renderer.root.findByType("section").props.id, `oc-file-${encodeURIComponent(file.path)}`);
      assert.equal(renderer.root.findAllByProps({ "data-file-path": file.path }).length, 1);
      const notes = renderer.root.findAllByProps({ className: "oc-file-note" }).map((note) => note.props.children);
      if (scenario.hidden) {
        assert.ok(notes.includes("File too large to display"), `${scenario.name} must show the size placeholder in ${layout}`);
      } else if (scenario.binary) {
        assert.ok(notes.includes("Binary file not shown."), "Ordinary binary behavior must stay unchanged");
      }
      assert.equal(renderer.root.findAllByProps({ "data-code-view": "mounted" }).length,
        scenario.hidden || scenario.binary ? 0 : 1, "Only allowed text may mount CodeView");
    }
    await act(async () => renderer.root.findByProps({ "aria-label": "Mark as viewed" }).props.onClick());
    assert.equal(toggles, 1, "Placeholder must retain its existing Viewed action");
    await act(async () => renderer.update(React.createElement(module.exports.FileDiffView, { ...props, viewed: true })));
    assert.equal(renderer.root.findAllByProps({ className: "oc-file-note" }).length, 0);
    assert.equal(renderer.root.findAllByProps({ "data-code-view": "mounted" }).length, 0);
    assert.equal(renderer.root.findAllByProps({ "data-file-path": file.path }).length, 1);
  });
}
