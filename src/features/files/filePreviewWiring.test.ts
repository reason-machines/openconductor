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

test("the file host is wired through WorkspaceView (WorkspaceFileView), not chat rendering", () => {
  const workspace = source("components/WorkspaceView.tsx");
  // H1: WorkspaceFileView replaced MarkdownFileView as the main file tab host.
  assert.match(workspace, /<WorkspaceFileView/);
  assert.match(workspace, /onOpenFile=\{openAnyFile\}/);
  // WorkspaceFileView must not be imported in chat-layer components.
  const chatComp = source("features/chat/Transcript.tsx");
  assert.doesNotMatch(chatComp, /WorkspaceFileView/);
});
