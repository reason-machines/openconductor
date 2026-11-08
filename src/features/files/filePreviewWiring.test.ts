import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("All files can delegate internally before attempting an external app", () => {
  const tree = readFileSync(new URL("./AllFilesTree.tsx", import.meta.url), "utf8");
  const internal = tree.indexOf("onOpenFile?.(rel)");
  assert.ok(internal >= 0, "All files has no internal file-open handler");
  assert.ok(internal < tree.indexOf("await openInApp("));
});

test("the read-only file host is wired through WorkspaceView, not chat rendering", () => {
  const workspace = source("components/WorkspaceView.tsx");
  assert.match(workspace, /<MarkdownFileView/);
  assert.match(workspace, /onOpenFile=\{openMarkdown\}/);
  const viewer = readFileSync(new URL("./MarkdownFileView.tsx", import.meta.url), "utf8");
  assert.match(viewer, /workspace_read_markdown/);
  assert.match(viewer, /markdown_style/);
  assert.doesNotMatch(viewer, /diff_write_file|<textarea|saveFileMode/);
});
