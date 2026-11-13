import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mount } = require("./updateAppHarness.cjs");

test("actual App consumes a downloaded update and restarts only after the persistence acknowledgment", async () => {
  const view = await mount({ enabled: true });
  try {
    assert.deepEqual(view.events, ["check", "download", "install", "flush", "restart"]);
    assert.deepEqual(view.native, []);
  } finally { await view.close(); }
});

test("actual App reports an available update without installing when the preference is disabled", async () => {
  const view = await mount({ enabled: false });
  try {
    assert.deepEqual(view.events, ["check", "download"]);
    assert.equal(view.notifications.length, 1);
    assert.equal(view.notifications[0].kind, "info");
    assert.deepEqual(view.native, []);
  } finally { await view.close(); }
});

test("an active session never reaches install or restart through App", async () => {
  const view = await mount({ enabled: true, readiness: { kind: "ready", sessionStatuses: ["working"], workspaceStates: ["ready"], setupRunning: false } });
  try {
    assert.deepEqual(view.events.filter((event: string) => ["install", "flush", "restart"].includes(event)), []);
    assert.deepEqual(view.native, []);
  } finally { await view.close(); }
});

test("unknown initial session readiness never reaches install or restart through App", async () => {
  const view = await mount({ enabled: true, readiness: { kind: "unknown" } });
  try {
    assert.deepEqual(view.events.filter((event: string) => ["install", "flush", "restart"].includes(event)), []);
    assert.deepEqual(view.native, []);
  } finally { await view.close(); }
});
