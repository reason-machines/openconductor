import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeRun,
  appendOutput,
  defaultScript,
  exitText,
  runButton,
  stripAnsi,
  visibleScripts,
  workspaceRef,
  type RunScript,
  type RunStatus,
  type ScriptsConfig,
} from "./model.ts";

function script(id: string, extra: Partial<RunScript> = {}): RunScript {
  return { id, label: id, command: `npm run ${id}`, args: [], cwd: null, default: false, icon: "play", hide: false, availableIn: ["local", "cloud"], layer: "repo_shared", ...extra };
}

function config(run: RunScript[]): ScriptsConfig {
  return { setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false, run, managedKeys: [], warnings: [] };
}

const status = (scriptId: string, state: RunStatus["state"], exit: RunStatus["exit"] = null): RunStatus => ({ workspaceId: "w", scriptId, state, exit });

test("workspaceRef needs both paths", () => {
  const repo = { id: "r", path: "/code/app", defaultBranch: "main" };
  assert.equal(workspaceRef(repo, { id: "w", name: "tokyo" }), null);
  assert.deepEqual(workspaceRef(repo, { id: "w", name: "tokyo", path: "/ws/tokyo" }), {
    workspaceId: "w", repositoryId: "r", repoRoot: "/code/app", workspacePath: "/ws/tokyo", workspaceName: "tokyo", defaultBranch: "main", targetBranch: null,
  });
});

test("default script prefers the default flag, local only", () => {
  const cfg = config([script("cloudy", { availableIn: ["cloud"], default: true }), script("lint"), script("dev", { default: true })]);
  assert.equal(defaultScript(cfg)?.id, "dev");
  assert.equal(defaultScript(config([script("lint"), script("test")]))?.id, "lint");
  assert.equal(defaultScript(null), null);
  assert.deepEqual(visibleScripts(config([script("a", { hide: true }), script("b")])).map((s) => s.id), ["b"]);
});

test("run button follows the active run", () => {
  const cfg = config([script("dev", { default: true })]);
  assert.deepEqual(runButton(cfg, [], true), { action: "run", label: "Run", disabled: false, hint: "npm run dev" });
  assert.equal(runButton(cfg, [status("dev", "running")], true).action, "stop");
  assert.equal(runButton(cfg, [status("dev", "waiting_for_setup")], true).label, "Waiting for setup");
  assert.equal(runButton(cfg, [status("dev", "stopping")], true).disabled, true);
  assert.equal(runButton(config([]), [], true).disabled, true);
  assert.equal(runButton(cfg, [], false).disabled, true);
  assert.equal(activeRun([status("a", "stopped"), status("b", "starting")])?.scriptId, "b");
});

test("exit text and output buffer", () => {
  assert.equal(exitText(status("dev", "stopped", [0, null])), "exited 0");
  assert.equal(exitText(status("dev", "stopped", [null, 15])), "stopped");
  assert.equal(exitText(status("dev", "running")), null);
  assert.equal(appendOutput("abc", "def", 4), "cdef");
  assert.equal(stripAnsi("\u001b[32mok\u001b[0m \u001b]0;title\u0007done"), "ok done");
});
