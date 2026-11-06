// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunScript } from "../scripts/model.ts";
import {
  EMPTY_VIEW,
  SPOTLIGHT_EMPTY_TEXT,
  SPOTLIGHT_TASK_ID,
  applyEvent,
  runTasks,
  shownTask,
  spotlightButton,
  toggleBlocked,
  viewFromStatus,
  type SpotlightEvent,
} from "./testing.ts";

const script = (id: string, isDefault = false): RunScript => ({
  id, label: id.toUpperCase(), command: `pnpm ${id}`, args: [], cwd: null, default: isDefault, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared",
});
const s = { repoRoot: "/repo", workspaceId: "ws-1" };
const at = new Date(2026, 10, 5, 12, 3, 4);
const play = (events: SpotlightEvent[]) => events.reduce((v, e) => applyEvent(v, e, at), EMPTY_VIEW);

test("Spotlight is appended after the run scripts only when the setting is on", () => {
  const scripts = [script("dev", true), script("test")];
  assert.deepEqual(runTasks(scripts, false).map((t) => t.id), ["dev", "test"]);
  const on = runTasks(scripts, true);
  assert.deepEqual(on.map((t) => t.id), ["dev", "test", SPOTLIGHT_TASK_ID]);
  assert.deepEqual(on.at(-1), { id: SPOTLIGHT_TASK_ID, label: "Spotlight", kind: "spotlight" });
  assert.deepEqual(runTasks([], true).map((t) => t.kind), ["spotlight"]);
});

test("the shown task: pick, running script, own session, default script, then Spotlight when it is the only task", () => {
  const none = { picked: null, spotlightEnabled: false, activeScriptId: null, spotlightMine: false, defaultScriptId: null };
  assert.equal(shownTask(none), null);
  // Spotlight switched on in Settings › Actions, no run script: the Run tab offers Run Spotlight.
  assert.equal(shownTask({ ...none, spotlightEnabled: true }), SPOTLIGHT_TASK_ID);
  // A run script stays the default over Spotlight.
  assert.equal(shownTask({ ...none, spotlightEnabled: true, defaultScriptId: "dev" }), "dev");
  assert.equal(shownTask({ ...none, spotlightEnabled: true, defaultScriptId: "dev", picked: SPOTLIGHT_TASK_ID }), SPOTLIGHT_TASK_ID);
  // A Spotlight pick is dropped once the setting is off.
  assert.equal(shownTask({ ...none, defaultScriptId: "dev", picked: SPOTLIGHT_TASK_ID }), "dev");
  assert.equal(shownTask({ ...none, spotlightEnabled: true, defaultScriptId: "dev", activeScriptId: "test" }), "test");
  assert.equal(shownTask({ ...none, spotlightEnabled: true, defaultScriptId: "dev", spotlightMine: true }), SPOTLIGHT_TASK_ID);
  assert.equal(shownTask({ ...none, spotlightEnabled: true, picked: "test", spotlightMine: true }), "test");
});

test("a session's events drive owner, syncing flag, status and log", () => {
  const started = play([{ type: "started", leftoverRestoreError: null, ...s }]);
  assert.equal(started.workspaceId, "ws-1");
  assert.equal(started.status, "Started 12:03:04");
  const syncing = applyEvent(started, { type: "syncing", ...s }, at);
  assert.equal(syncing.syncing, true);
  const synced = applyEvent(syncing, { type: "synced", ...s }, at);
  assert.equal(synced.syncing, false);
  assert.equal(synced.status, "Synced 12:03:04");
  assert.deepEqual(synced.log, [
    "[12:03:04] Spotlight started: syncing this workspace into /repo",
    "[12:03:04] Syncing changes to the repository root",
    "[12:03:04] Synced",
  ]);
});

test("skips and failures say why; stop clears the owner but keeps the log", () => {
  const v = play([
    { type: "started", leftoverRestoreError: null, ...s },
    { type: "skipped", busy: true, message: null, ...s },
    { type: "skipped", busy: false, message: "disk full", ...s },
    { type: "syncFailed", message: "checkout failed", ...s },
  ]);
  assert.equal(v.status, "Sync failed");
  assert.match(v.log[1], /merge, rebase, cherry-pick or revert/);
  assert.match(v.log[2], /could not be saved: disk full/);
  assert.match(v.log[3], /root could not be updated: checkout failed/);
  const stopped = applyEvent(v, { type: "stopped", restoreError: null, ...s }, at);
  assert.equal(stopped.workspaceId, null);
  assert.equal(stopped.logWorkspaceId, "ws-1");
  assert.equal(stopped.status, null);
  assert.equal(stopped.log.length, 5);
  const notRestored = applyEvent(v, { type: "stopped", restoreError: "locked", ...s }, at);
  assert.equal(notRestored.status, "Root not restored");
});

test("a new start begins a fresh log, and the log is capped", () => {
  const first = play([{ type: "started", leftoverRestoreError: null, ...s }, { type: "synced", ...s }]);
  const again = applyEvent(first, { type: "started", leftoverRestoreError: "ref missing", ...s }, at);
  assert.equal(again.log.length, 1);
  assert.match(again.log[0], /earlier session could not be undone.*ref missing/);
  let capped = again;
  for (let i = 0; i < 10; i++) capped = applyEvent(capped, { type: "synced", ...s }, at, 4);
  assert.equal(capped.log.length, 4);
});

test("status from spotlight_status seeds the view", () => {
  assert.deepEqual(viewFromStatus({ active: false, workspaceId: null }), EMPTY_VIEW);
  assert.equal(viewFromStatus({ active: true, workspaceId: "ws-2" }).workspaceId, "ws-2");
});

test("the Spotlight button starts, stops, or explains", () => {
  const idle = spotlightButton(EMPTY_VIEW, "ws-1", true, null);
  assert.deepEqual(idle, { action: "start", label: "Run Spotlight", disabled: false, hint: SPOTLIGHT_EMPTY_TEXT });
  const mine = { ...EMPTY_VIEW, workspaceId: "ws-1" };
  assert.equal(spotlightButton(mine, "ws-1", true, null).label, "Stop Spotlight");
  assert.equal(spotlightButton(mine, "ws-1", true, "stopping").label, "Stopping...");
  assert.equal(spotlightButton(mine, "ws-1", true, "stopping").disabled, true);
  const other = spotlightButton({ ...EMPTY_VIEW, workspaceId: "ws-9" }, "ws-1", true, null);
  assert.equal(other.action, "start");
  assert.match(other.hint ?? "", /another workspace/);
  assert.equal(spotlightButton(EMPTY_VIEW, "ws-1", false, null).disabled, true);
});

test("the toggle is blocked without a checkout, while loading, and when managed", () => {
  assert.match(toggleBlocked(null, false) ?? "", /no local checkout/);
  assert.equal(toggleBlocked(null, true), "Loading");
  assert.match(toggleBlocked({ enabled: true, layer: "managed", managed: true }, true) ?? "", /Managed/);
  assert.equal(toggleBlocked({ enabled: false, layer: null, managed: false }, true), null);
});
