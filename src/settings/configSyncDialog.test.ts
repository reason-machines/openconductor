import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { mount, act } = createRequire(import.meta.url)("./configSyncHarness.cjs");
const dialog = (view: ReturnType<typeof mount>) => view.root().findAllByProps({ role: "dialog", "aria-label": "Sync agent configs" });
const primary = (view: ReturnType<typeof mount>) => view.root().find((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && node.props["data-primary-action"] === true);
async function open(view: ReturnType<typeof mount>) {
  await act(async () => { view.button("Sync").props.onClick(); });
}

test("selection copies exactly the selected direction and successful completion closes", async () => {
  const view = mount();
  try {
    await open(view);
    assert.equal(view.root().findByProps({ "aria-label": "Select Skills" }).props.checked, true, "missing items default selected");
    const expand = view.root().findByProps({ "aria-controls": "config-sync-skills" });
    assert.equal(expand.props["aria-expanded"], false);
    act(() => expand.props.onClick());
    act(() => view.root().findByProps({ "aria-label": "codex-only from Codex" }).props.onChange());
    assert.equal(view.root().findByProps({ "aria-label": "Select Skills" }).props["aria-checked"], "mixed");
    await act(async () => { primary(view).props.onClick(); });
    assert.deepEqual(view.calls.writes, [[{ category: "skills", direction: "ccToCodex", name: "claude-only" }]]);
    assert.equal(dialog(view).length, 0);
    assert.deepEqual(view.calls.boundaries, []);
  } finally { view.close(); }
});

test("select-none disables Sync; cancel and reopen reset selections and reload the diff", async () => {
  const view = mount();
  try {
    await open(view);
    act(() => view.root().findByProps({ "aria-label": "Select Skills" }).props.onChange());
    assert.equal(primary(view).props.disabled, true);
    act(() => view.button("Cancel").props.onClick());
    assert.equal(dialog(view).length, 0);
    await open(view);
    assert.equal(view.calls.reads, 2);
    assert.equal(view.root().findByProps({ "aria-label": "Select Skills" }).props.checked, true);
    assert.equal(view.root().findByProps({ "aria-controls": "config-sync-skills" }).props["aria-expanded"], false);
    assert.deepEqual(view.calls.writes, []);
  } finally { view.close(); }
});

test("pending copy suppresses repeat submit, cancel and Modal close", async () => {
  type Result = { successes: number; failures: never[]; unsupportedMcp: never[] };
  let finish: ((value: Result) => void) | undefined;
  const completion = new Promise<Result>((resolve) => { finish = resolve; });
  const view = mount({ sync: () => completion });
  try {
    await open(view);
    act(() => primary(view).props.onClick());
    assert.equal(primary(view).props.disabled, true);
    assert.equal(view.button("Cancel").props.disabled, true);
    act(() => {
      view.button("Cancel").props.onClick();
      view.root().findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && node.props["aria-label"] === "Close")[0].props.onClick();
      primary(view).props.onClick();
    });
    assert.equal(dialog(view).length, 1);
    assert.equal(view.calls.writes.length, 1);
    assert.ok(finish);
    await act(async () => { finish?.({ successes: 2, failures: [], unsupportedMcp: [] }); await completion; });
    assert.equal(dialog(view).length, 0);
  } finally { view.close(); }
});

test("partial copy failure stays visible and refreshes the diff", async () => {
  const view = mount({ sync: (_selection: unknown, diff: { skills: { ccToCodex: string[] } }) => {
    diff.skills.ccToCodex = [];
    return { successes: 1, failures: [{ category: "skills", name: "codex-only", reason: "Destination exists." }], unsupportedMcp: [] };
  } });
  try {
    await open(view);
    await act(async () => { primary(view).props.onClick(); });
    assert.equal(dialog(view).length, 1);
    assert.equal(view.calls.reads, 2);
    assert.equal(primary(view).props.disabled, false, "remaining item can be retried");
    const status = view.root().findByProps({ role: "status" });
    assert.match(JSON.stringify(status.children.map((node: { children?: unknown[] }) => node.children)), /Destination exists/);
  } finally { view.close(); }
});

test("mutation error stays visible without losing the selection", async () => {
  const view = mount({ sync: () => { throw new Error("Synthetic copy failure"); } });
  try {
    await open(view);
    await act(async () => { primary(view).props.onClick(); });
    assert.equal(dialog(view).length, 1);
    assert.equal(primary(view).props.disabled, false);
    assert.deepEqual(view.root().findByProps({ role: "alert" }).children, ["Synthetic copy failure"]);
    assert.equal(view.root().findByProps({ "aria-label": "Select Skills" }).props.checked, true);
    act(() => view.button("Cancel").props.onClick());
    assert.equal(dialog(view).length, 0);
  } finally { view.close(); }
});

test("read failure is visible and never offers a write", async () => {
  const view = mount({ loadError: "Synthetic local read failure" });
  try {
    await open(view);
    assert.equal(dialog(view).length, 1);
    assert.equal(primary(view).props.disabled, true);
    assert.deepEqual(view.root().findByProps({ role: "alert" }).children, ["Synthetic local read failure"]);
    assert.deepEqual(view.calls.writes, []);
    assert.deepEqual(view.calls.boundaries, []);
  } finally { view.close(); }
});
