import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { mount, act } = createRequire(import.meta.url)("./configSyncHarness.cjs");

test("General Sync opens a local selection dialog without copying files", async () => {
  const view = mount();
  try {
    const sync = view.button("Sync");
    assert.ok(sync, "General must expose Sync");
    assert.notEqual(sync.props.disabled, true, "local config sync must be reachable");
    assert.equal(view.calls.reads, 0, "opening General must not read agent configs");
    await act(async () => { sync.props.onClick(); });
    const dialogs = view.root().findAllByProps({ role: "dialog", "aria-label": "Sync agent configs" });
    assert.equal(dialogs.length, 1);
    assert.equal(view.calls.reads, 1, "opening Sync must request a fresh local diff");
    assert.deepEqual(view.calls.writes, [], "opening must not copy anything");
    assert.deepEqual(view.calls.boundaries, [], "no real config, credentials, provider or native calls");
  } finally { view.close(); }
});
