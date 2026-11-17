import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { ConfigSyncResult, ConfigSyncSelection } from "./configSync.ts";

const { mount, act } = createRequire(import.meta.url)("./configSyncHarness.cjs");
type View = ReturnType<typeof mount>;
const primary = (view: View) => view.root().find((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && node.props["data-primary-action"] === true);
const category = (view: View) => view.root().findByProps({ "aria-label": "Select Skills" });
const codexItem = (view: View) => view.root().findByProps({ "aria-label": "codex-only from Codex" });
const allItems = [
  { category: "skills", direction: "ccToCodex", name: "claude-only" },
  { category: "skills", direction: "codexToCc", name: "codex-only" },
] satisfies ConfigSyncSelection[];
const failedCopy: ConfigSyncResult = {
  successes: 0,
  failures: [{ category: "skills", name: "claude-only", reason: "Synthetic deferred copy failure." }],
  unsupportedMcp: [],
};
const successfulCopy: ConfigSyncResult = { successes: 2, failures: [], unsupportedMcp: [] };

function deferredCopy() {
  let complete: (result: ConfigSyncResult) => void = () => assert.fail("Deferred copy not initialized");
  const promise = new Promise<ConfigSyncResult>((resolve) => { complete = resolve; });
  return { promise, complete: (result: ConfigSyncResult) => complete(result) };
}

async function open(view: View) {
  await act(async () => { view.button("Sync").props.onClick(); });
}

function assertPendingGuards(view: View) {
  assert.equal(primary(view).props.disabled, true);
  assert.equal(view.button("Cancel").props.disabled, true);
  act(() => {
    primary(view).props.onClick();
    view.button("Cancel").props.onClick();
  });
  assert.equal(view.calls.writes.length, 1, "pending Sync cannot submit the changed selection");
  assert.equal(view.root().findAllByProps({ role: "dialog", "aria-label": "Sync agent configs" }).length, 1);
}

test("category selection stays editable during copy without changing its submitted snapshot", async () => {
  const copy = deferredCopy();
  const submitted: ConfigSyncSelection[][] = [];
  const view = mount({ sync: (selection: ConfigSyncSelection[]) => {
    submitted.push(selection);
    return submitted.length === 1 ? copy.promise : successfulCopy;
  } });
  try {
    await open(view);
    act(() => primary(view).props.onClick());
    assert.deepEqual(view.calls.writes, [allItems]);
    assert.equal(category(view).props.disabled, false, "loaded category selection must remain editable during copy");
    assert.equal(view.root().findByProps({ "aria-label": "Select MCP servers" }).props.disabled, true, "empty categories remain disabled");
    act(() => category(view).props.onChange());
    assert.equal(category(view).props.checked, false);
    assertPendingGuards(view);
    assert.deepEqual(view.calls.writes, [allItems]);
    assert.deepEqual(submitted, [allItems], "the original request objects are unchanged, not just the harness copy");

    await act(async () => { copy.complete(failedCopy); await copy.promise; });
    assert.equal(category(view).props.checked, false, "the changed category selection survives the failure refresh");
    assert.equal(primary(view).props.disabled, true, "an empty retry selection cannot be submitted");
    assert.equal(view.calls.reads, 2);
    act(() => category(view).props.onChange());
    await act(async () => primary(view).props.onClick());
    assert.deepEqual(view.calls.writes, [allItems, allItems]);
    assert.deepEqual(submitted, [allItems, allItems]);
    assert.deepEqual(view.calls.boundaries, []);
  } finally {
    await act(async () => { copy.complete(failedCopy); await copy.promise; });
    view.close();
  }
});

test("item changes during copy apply to the next attempt, not the in-flight selection", async () => {
  const copy = deferredCopy();
  const submitted: ConfigSyncSelection[][] = [];
  const view = mount({ sync: (selection: ConfigSyncSelection[]) => {
    submitted.push(selection);
    return submitted.length === 1 ? copy.promise : successfulCopy;
  } });
  try {
    await open(view);
    act(() => view.root().findByProps({ "aria-controls": "config-sync-skills" }).props.onClick());
    act(() => codexItem(view).props.onChange());
    act(() => primary(view).props.onClick());
    const firstSelection = [{ category: "skills", direction: "ccToCodex", name: "claude-only" }];
    assert.deepEqual(view.calls.writes, [firstSelection]);
    assert.equal(codexItem(view).props.disabled, false, "loaded item selection must remain editable during copy");
    act(() => codexItem(view).props.onChange());
    assert.equal(codexItem(view).props.checked, true);
    assertPendingGuards(view);
    assert.deepEqual(view.calls.writes, [firstSelection]);
    assert.deepEqual(submitted, [firstSelection], "the in-flight request retains its actual original selection");

    await act(async () => { copy.complete(failedCopy); await copy.promise; });
    assert.equal(codexItem(view).props.checked, true, "the item selection survives the failure refresh");
    assert.equal(primary(view).props.disabled, false);
    await act(async () => primary(view).props.onClick());
    assert.deepEqual(view.calls.writes, [firstSelection, allItems]);
    assert.deepEqual(submitted, [firstSelection, allItems]);
    assert.deepEqual(view.calls.boundaries, []);
  } finally {
    await act(async () => { copy.complete(failedCopy); await copy.promise; });
    view.close();
  }
});
