import { test } from "node:test";
import assert from "node:assert/strict";
import { runBody, runHeader, type RunTabTask } from "./runTab.ts";

const run: RunTabTask = { id: "run", label: "Run", kind: "script" };
const dev: RunTabTask = { id: "dev-server", label: "Dev server", kind: "script" };
const spot: RunTabTask = { id: "spotlight", label: "Spotlight", kind: "spotlight" };

test("idle: Start <label> and Test your changes here; Spotlight and no task have their own wording", () => {
  assert.deepEqual(runBody(run, null, false, false), { kind: "idle", button: "Start Run", hint: "Test your changes here." });
  assert.deepEqual(runBody(dev, "stopped", false, false), { kind: "idle", button: "Start Dev server", hint: "Test your changes here." });
  assert.deepEqual(runBody(spot, null, false, false), { kind: "idle", button: "Start spotlight", hint: "Sync your changes to the repository root." });
  assert.deepEqual(runBody(null, null, false, false), { kind: "idle", button: "Run workspace", hint: "Test your changes here." });
});

test("pending lines show only before any output; a task that ran shows its output", () => {
  assert.deepEqual(runBody(run, "starting", true, false), { kind: "pending", text: "Starting..." });
  assert.deepEqual(runBody(run, "waiting_for_setup", true, false), { kind: "pending", text: "Setting up..." });
  assert.deepEqual(runBody(run, "stopping", true, false), { kind: "pending", text: "Stopping..." });
  assert.deepEqual(runBody(run, "stopping", true, true), { kind: "output" });
  assert.deepEqual(runBody(run, "running", true, false), { kind: "output" });
  assert.deepEqual(runBody(run, "stopped", true, true), { kind: "output" });
});

test("header: Run <label> when idle, Stop <label> while busy, Stopping... while it stops", () => {
  assert.deepEqual(runHeader(run, null), { busy: false, pending: null, label: "Run", name: "Run Run" });
  assert.deepEqual(runHeader(dev, "stopped"), { busy: false, pending: null, label: "Dev server", name: "Run Dev server" });
  assert.deepEqual(runHeader(spot, null), { busy: false, pending: null, label: "Spotlight", name: "Start spotlight" });
  assert.deepEqual(runHeader(null, null), { busy: false, pending: null, label: "Run", name: "Configure run scripts" });
  assert.deepEqual(runHeader(run, "running"), { busy: true, pending: null, label: "Run", name: "Stop Run" });
  assert.deepEqual(runHeader(run, "starting"), { busy: true, pending: "Starting...", label: "Run", name: "Stop Run" });
  assert.deepEqual(runHeader(spot, "running"), { busy: true, pending: null, label: "Spotlight", name: "Stop Spotlight" });
  assert.deepEqual(runHeader(run, "stopping"), { busy: true, pending: "Stopping...", label: "Run", name: "Stopping..." });
});
