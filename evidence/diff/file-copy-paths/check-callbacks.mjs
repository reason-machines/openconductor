// Executes only OpenConductor's copy callback expressions, not JSX or Conductor code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../../src/features/diff/ChangesList.tsx", import.meta.url), "utf8");
const callbackLines = source.match(/^\s*copy(?:Path|RelativePath): .+,$/gm);
assert.equal(callbackLines?.length, 2, "read both production copy callback expressions");
const binding = source.match(/^  const \{ path: copyPath, relativePath \} = fileCopyPaths\([^\n]+\);$/m)?.[0] ?? "";
const helper = binding ? await import("../../../src/features/diff/fileCopyPaths.ts") : {};
const filePath = "src/file with spaces.ts";

function callbacks(worktree) {
  const calls = [];
  const notify = () => {};
  const actions = runInNewContext(`${binding}\n({${callbackLines.join("\n")}})`, {
    worktree,
    menuFile: { path: filePath },
    copy: (...args) => calls.push(args),
    notify,
    ...helper,
  });
  return { actions, calls, notify };
}

for (const worktree of [null, undefined, ""]) {
  test(`Copy path remains available without a workspace (${String(worktree)})`, () => {
    const { actions, calls, notify } = callbacks(worktree);
    assert.equal(typeof actions.copyPath, "function");
    actions.copyPath();
    assert.deepEqual(calls, [[filePath, "path", notify]]);
  });
  test(`Copy relative path is absent without a workspace (${String(worktree)})`, () => {
    assert.equal(callbacks(worktree).actions.copyRelativePath, undefined);
  });
}

for (const worktree of ["/work/project", "/work/project///", "/work/project with spaces/", "/"]) {
  test(`both workspace callbacks preserve their clipboard labels (${worktree})`, () => {
    const { actions, calls, notify } = callbacks(worktree);
    actions.copyPath();
    actions.copyRelativePath();
    const root = worktree === "/" ? "" : worktree.replace(/\/+$/, "");
    assert.deepEqual(calls, [[`${root}/${filePath}`, "path", notify], [filePath, "relative path", notify]]);
  });
}
