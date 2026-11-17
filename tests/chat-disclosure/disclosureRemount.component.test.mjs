import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./wv-host.mjs";

async function inChatA(options = {}) {
  const f = fixture(options);
  try {
    await f.mount();
    await f.select(f.sourceTitle);
    return f;
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

function readBody(f, expected) {
  assert.equal(f.root().findAll((node) => node.type === "span" && node.children?.includes(expected)).length, 1, `actual code body contains ${expected}`);
}

function bodyCount(f) {
  return f.root().findAll((node) => node.type === "div" && node.props.className?.split(" ").includes("oc-tool-content")).length;
}

test("read-open-return: manually opened Read survives the actual A to B to A tab switch", async () => {
  const f = await inChatA();
  try {
    assert.equal(f.expanded(), false);
    await f.toggleRow();
    assert.equal(f.expanded(), true);
    readBody(f, "BODY_A");
    await f.select("Empty target");
    assert.equal(f.expanded(), false);
    await f.select(f.sourceTitle);
    assert.equal(f.expanded(), true, "READ_OPEN_RETURN_LOST_MANUAL_EXPANSION");
    readBody(f, "BODY_A");
  } finally { await f.dispose(); }
});

test("plan-closed-return: manually closed default-open plan survives A to B to A", async () => {
  const f = await inChatA({ kind: "ExitPlanMode" });
  try {
    assert.equal(f.expanded(), true);
    assert.match(f.text(), /BODY_A/);
    await f.toggleRow();
    assert.equal(f.expanded(), false);
    await f.select("Empty target");
    assert.equal(f.expanded(), true);
    await f.select(f.sourceTitle);
    assert.equal(f.expanded(), false, "PLAN_CLOSED_RETURN_LOST_MANUAL_COLLAPSE");
    assert.equal(bodyCount(f), 0);
  } finally { await f.dispose(); }
});

test("different-tool-id-isolation: untouched B does not inherit opened A's state", async () => {
  const f = await inChatA();
  try {
    await f.toggleRow();
    assert.equal(f.expanded(), true);
    await f.select("Empty target");
    assert.equal(f.expanded(), false);
    assert.equal(bodyCount(f), 0);
  } finally { await f.dispose(); }
});

test("same-mounted-chat-rerender: ordinary rerender retains the opened Read", async () => {
  const f = await inChatA();
  try {
    await f.toggleRow();
    assert.equal(f.expanded(), true);
    await f.rerenderCurrent();
    assert.equal(f.expanded(), true);
    readBody(f, "BODY_A");
  } finally { await f.dispose(); }
});

test("expanded-setting-manual-override: real garry_mode update preserves explicit false", async () => {
  const f = await inChatA({ garry: true });
  try {
    assert.equal(f.prefs().garry_mode, true);
    assert.equal(f.expanded(), true);
    await f.toggleRow();
    assert.equal(f.expanded(), false);
    await f.setGarry(false);
    assert.equal(f.prefs().garry_mode, false);
    assert.equal(f.expanded(), false);
    await f.setGarry(true);
    assert.equal(f.prefs().garry_mode, true);
    assert.equal(f.expanded(), false, "manual collapse takes precedence over a live default update");
    await f.rerenderCurrent();
    assert.equal(f.expanded(), false);
    await f.select("Empty target");
    assert.equal(f.expanded(), true, "untouched B still inherits real garry_mode default");
    assert.equal(f.nativeCalls.filter((call) => call.command === "set_app_pref").length, 2);
  } finally { await f.dispose(); }
});
