import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { mount, act } = createRequire(import.meta.url)("./configSyncHarness.cjs");
type View = ReturnType<typeof mount>;
const dialogs = (view: View) => view.root().findAllByProps({ role: "dialog", "aria-label": "Sync agent configs" });
const primary = (view: View) => view.root().find((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && node.props["data-primary-action"] === true);
async function open(view: View) {
  await act(async () => { view.button("Sync").props.onClick(); });
}
async function sync(view: View) {
  await act(async () => { primary(view).props.onClick(); });
}
const failure = { category: "skills", name: "codex-only", reason: "Synthetic copy failure." };

test("successful config sync requests its plural confirmation even after the dialog closes", async () => {
  const view = mount();
  try {
    await open(view);
    await sync(view);
    assert.equal(dialogs(view).length, 0);
    assert.equal(view.calls.writes[0].length, 2);
    assert.deepEqual(view.calls.notifications, [{ kind: "info", message: "Synced 2 items" }]);
    assert.deepEqual(view.calls.boundaries, []);
  } finally { view.close(); }
});

test("mixed config sync requests its singular success confirmation and keeps failure details visible", async () => {
  const view = mount({ sync: () => ({ successes: 1, failures: [failure], unsupportedMcp: [] }) });
  try {
    await open(view);
    await sync(view);
    assert.equal(dialogs(view).length, 1);
    assert.equal(view.calls.reads, 2);
    const status = view.root().findByProps({ role: "status" });
    assert.match(JSON.stringify(status.children.map((node: { children?: unknown[] }) => node.children)), /Synthetic copy failure/);
    assert.deepEqual(view.calls.notifications, [{ kind: "info", message: "Synced 1 item" }]);
    assert.deepEqual(view.calls.boundaries, []);
  } finally { view.close(); }
});

test("zero-success failure does not request a success confirmation and stays open", async () => {
  const view = mount({ sync: () => ({ successes: 0, failures: [failure], unsupportedMcp: [] }) });
  try {
    await open(view);
    await sync(view);
    assert.equal(dialogs(view).length, 1);
    assert.equal(view.calls.reads, 2);
    const status = view.root().findByProps({ role: "status" });
    assert.match(JSON.stringify(status.children.map((node: { children?: unknown[] }) => node.children)), /Synthetic copy failure/);
    assert.deepEqual(view.calls.notifications, []);
    assert.deepEqual(view.calls.boundaries, []);
  } finally { view.close(); }
});

test("zero-success completion closes without inventing a success confirmation", async () => {
  const view = mount({ sync: () => ({ successes: 0, failures: [], unsupportedMcp: [] }) });
  try {
    await open(view);
    await sync(view);
    assert.equal(dialogs(view).length, 0);
    assert.equal(view.calls.reads, 1);
    assert.deepEqual(view.calls.notifications, []);
    assert.deepEqual(view.calls.boundaries, []);
  } finally { view.close(); }
});
