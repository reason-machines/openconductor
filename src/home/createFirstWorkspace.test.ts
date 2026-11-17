// Regression tests for GAP-SB-01c / GAP-SB-01b:
// startSetupScript must return a boolean so callers can pass the correct
// `state` to `addWorkspace`.  The store defaults to `"setting_up"` when
// `state` is absent, so discarding the return value leaves every new workspace
// permanently dimmed — even when no setup script exists.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compile(relPath: string): string {
  const src = readFileSync(new URL(relPath, import.meta.url), "utf8");
  return ts.transpileModule(src, {
    fileName: relPath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
}

type StartSetupScriptFn = (
  repo: { id: string; root: string; defaultBranch: string },
  ws: { id: string; name: string; path: string },
  targetBranch: string,
) => Promise<boolean>;

/** Load startSetupScript with injected stubs for scripts/api and scripts/model. */
async function runStartSetupScript(opts: {
  hasSetup: boolean;
  startResult: boolean;
  ref: object | null;
}): Promise<boolean> {
  const module: Partial<{ startSetupScript: StartSetupScriptFn }> = {};

  const watchLog: string[] = [];

  runInNewContext(compile("./createFirstWorkspace.ts"), {
    exports: module,
    require(name: string) {
      if (name === "../scripts/api")
        return {
          async scriptsConfig(_ws: unknown) { return { setup: opts.hasSetup }; },
          async startSetup(_ws: unknown) { return opts.startResult; },
        };
      if (name === "../scripts/model")
        return { workspaceRef: () => opts.ref };
      if (name === "../workspace/setupWatch")
        return {
          watchSetup:   (id: string) => watchLog.push(`watch:${id}`),
          unwatchSetup: (id: string) => watchLog.push(`unwatch:${id}`),
        };
      // Other imports not exercised by startSetupScript
      return {};
    },
  });

  assert.ok(typeof module.startSetupScript === "function", "startSetupScript must be exported");
  const repo = { id: "r1", root: "/repo", defaultBranch: "main" };
  const ws   = { id: "ws1", name: "my-workspace", path: "/repo/worktrees/my-workspace" };
  return module.startSetupScript!(repo, ws, "feature");
}

const REF = { id: "ws1", name: "my-workspace", path: "/repo/worktrees/my-workspace", repoId: "r1" };

test("startSetupScript returns true when setup script starts", async () => {
  const result = await runStartSetupScript({ hasSetup: true, startResult: true, ref: REF });
  assert.strictEqual(result, true, "should return true when startSetup returns true");
});

test("startSetupScript returns false when no setup script configured", async () => {
  const result = await runStartSetupScript({ hasSetup: false, startResult: false, ref: REF });
  assert.strictEqual(result, false, "should return false when no setup configured");
});

test("startSetupScript returns false when workspaceRef resolves to null", async () => {
  const result = await runStartSetupScript({ hasSetup: true, startResult: true, ref: null });
  assert.strictEqual(result, false, "should return false when ref cannot be resolved");
});

test("startSetupScript returns false when startSetup returns false", async () => {
  const result = await runStartSetupScript({ hasSetup: true, startResult: false, ref: REF });
  assert.strictEqual(result, false, "should return false when startSetup returns false");
});
