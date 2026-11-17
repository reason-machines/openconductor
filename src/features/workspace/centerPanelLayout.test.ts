import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { boolPref } from "../../settings/prefs.ts";
import { activeCenterTab, CENTER_LAYOUT_KEY, centerGroups, centerPanes, createCenterPanelController, parseCenterLayout, reconcileCenterLayout, selectCenterTab, splitCenterTab, type CenterLayout, type LayoutStorage } from "./centerPanelLayout.ts";

function storage() {
  const data = new Map<string, string>(); let writes = 0;
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { writes++; data.set(key, value); }, writes: () => writes };
}
const empty: CenterLayout = { root: null, activeGroupId: null };
const initial = (tabs = ["chat", "terminal:a"], active = "terminal:a") => selectCenterTab(reconcileCenterLayout(empty, tabs), active);

test("existing identity transfers once into a horizontal second 50/50 group", () => {
  const original = initial(); const next = splitCenterTab(original, "new");
  assert.equal(original.root?.type, "group");
  assert.deepEqual(centerGroups(next.root).map((group) => group.tabs), [["chat"], ["terminal:a"]]);
  assert.equal(next.activeGroupId, "new"); assert.equal(activeCenterTab(next), "terminal:a");
  assert.deepEqual(centerPanes(next).map(({ left, top, width, height }) => [left, top, width, height]), [[0, 0, 50, 100], [50, 0, 50, 100]]);
});
test("no root, missing group, missing active tab, one tab, duplicate new id are no-ops", () => {
  const layout = initial(); const one = initial(["chat"], "chat");
  const invalid = { ...layout, activeGroupId: "missing" };
  for (const entry of [empty, invalid, one]) assert.equal(splitCenterTab(entry, "new"), entry);
  assert.equal(splitCenterTab(layout, "group:main"), layout);
  const missing: CenterLayout = { root: { type: "group", id: "main", tabs: ["a", "b"], activeTab: "gone" }, activeGroupId: "main" };
  assert.equal(splitCenterTab(missing, "new"), missing);
});
test("closing the only tab in either pane collapses the split and chooses a surviving active group", () => {
  const split = splitCenterTab(initial(), "new");
  const keepFirst = reconcileCenterLayout(split, ["chat"]);
  assert.equal(keepFirst.root?.type, "group"); assert.equal(activeCenterTab(keepFirst), "chat");
  const keepSecond = reconcileCenterLayout(split, ["terminal:a"]);
  assert.equal(keepSecond.root?.type, "group"); assert.equal(keepSecond.activeGroupId, "new");
  assert.deepEqual(reconcileCenterLayout(split, []), empty);
});
test("nested splits replace only the selected group; unrelated siblings keep identity", () => {
  let layout = splitCenterTab(initial(["chat", "review", "terminal:a"]), "right");
  const right = centerGroups(layout.root)[1];
  layout = selectCenterTab(layout, "review"); layout = splitCenterTab(layout, "nested");
  assert.equal(layout.root?.type, "split");
  const groups = centerGroups(layout.root);
  assert.equal(groups[groups.length - 1], right);
  assert.deepEqual(centerPanes(layout).map((pane) => [pane.left, pane.width]), [[0, 25], [25, 25], [50, 50]]);
  assert.deepEqual(centerGroups(layout.root).flatMap((group) => group.tabs), ["chat", "review", "terminal:a"]);
});
test("reconcile keeps valid active selections and adds new tabs to the active group", () => {
  const split = splitCenterTab(initial(), "new");
  assert.equal(reconcileCenterLayout(split, ["chat", "terminal:a"]), split);
  const next = reconcileCenterLayout(split, ["chat", "terminal:a", "review", "review"]);
  assert.deepEqual(centerGroups(next.root)[1]?.tabs, ["terminal:a", "review"]);
  assert.equal(activeCenterTab(next), "terminal:a");
  const selected = selectCenterTab(next, "chat");
  assert.equal(selected.activeGroupId, "group:main");
  assert.equal(selectCenterTab(selected, "gone"), selected);
});
test("malformed/duplicate/deep/unbounded persisted trees are rejected", () => {
  const layout = initial(); assert.deepEqual(parseCenterLayout(layout), layout);
  assert.equal(parseCenterLayout({}), undefined);
  assert.equal(parseCenterLayout({ root: null, activeGroupId: "missing" }), undefined);
  const split = splitCenterTab(layout, "new");
  for (const firstSize of [0, 100, NaN, Infinity]) {
    assert.equal(parseCenterLayout({ ...split, root: { ...split.root, firstSize } }), undefined);
  }
  const duplicate = { type: "split", orientation: "horizontal", firstSize: 50, first: layout.root, second: layout.root };
  assert.equal(parseCenterLayout({ root: duplicate, activeGroupId: "group:main" }), undefined);
  let deep: unknown = layout.root;
  for (let n = 0; n < 70; n++) deep = { type: "split", orientation: "horizontal", firstSize: 50, first: deep, second: layout.root };
  assert.equal(parseCenterLayout({ root: deep, activeGroupId: "group:main" }), undefined);
});
test("workspace-keyed persistence roundtrips, preserves other workspaces, hydrates/collapses stale tabs", () => {
  const disk = storage();
  const options = { storage: disk, enabled: true, tabs: ["chat", "terminal:a"], selectedTab: "terminal:a", createGroupId: () => "new" };
  const one = createCenterPanelController({ ...options, workspaceId: "one" });
  one.split();
  const two = createCenterPanelController({ ...options, workspaceId: "two" });
  two.split(); two.selectTab("chat");
  const restored = createCenterPanelController({ ...options, workspaceId: "one" });
  assert.deepEqual(restored.snapshot(), one.snapshot());
  assert.equal(activeCenterTab(restored.snapshot()), "terminal:a");
  assert.deepEqual(Object.keys(JSON.parse(disk.getItem(CENTER_LAYOUT_KEY)!).layouts), ["one", "two"]);
  const stale = createCenterPanelController({ ...options, workspaceId: "one", tabs: ["chat"] });
  assert.equal(stale.snapshot().root?.type, "group"); assert.equal(activeCenterTab(stale.snapshot()), "chat");
});
for (const enabled of [false, undefined]) test(`ordinary ${String(enabled)}: no mutations, no writes and no split`, () => {
  const disk = storage();
  const controller = createCenterPanelController({ storage: disk, enabled, tabs: ["chat", "terminal:a"], workspaceId: "one" });
  const before = controller.snapshot();
  assert.equal(controller.split(), false);
  controller.selectTab("terminal:a"); controller.activateGroup("group:main"); controller.reconcile(["chat"]);
  assert.equal(controller.snapshot(), before); assert.equal(disk.writes(), 0);
});
test("live preference disable preserves split state without writes; reenabling keeps it", () => {
  const disk = storage(); const c = createCenterPanelController({ storage: disk, enabled: true, workspaceId: "one", tabs: ["chat", "terminal:a"], selectedTab: "terminal:a", createGroupId: () => "new" });
  c.split(); const saved = c.snapshot(), count = disk.writes();
  c.setEnabled(false); assert.equal(c.split(), false); c.reconcile(["chat"]);
  assert.equal(c.snapshot(), saved); assert.equal(disk.writes(), count);
  c.setEnabled(true); c.reconcile(["chat"]); assert.equal(c.snapshot().root?.type, "group");
});
test("blocked storage cannot prevent split, select or notification cleanup", () => {
  const disk: LayoutStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  const c = createCenterPanelController({ storage: disk, enabled: true, workspaceId: "one", tabs: ["chat", "terminal:a"], selectedTab: "terminal:a", createGroupId: () => "new" });
  let changes = 0; const unsubscribe = c.subscribe(() => { changes++; });
  c.split(); assert.equal(changes, 1); c.activateGroup("group:main"); assert.equal(changes, 2);
  unsubscribe(); c.selectTab("terminal:a"); assert.equal(changes, 2);
});
test("source wiring consumes the existing preference and preserves the ordinary branch", () => {
  const feature = readFileSync("src/features/workspace/CenterPanelGroups.tsx", "utf8");
  const view = readFileSync("src/components/WorkspaceView.tsx", "utf8");
  assert.ok(feature.includes('useBoolPref("experimental_configurable_center_panel")'));
  assert.ok(view.includes('{centerPanel.enabled ? ('));
  assert.ok(view.includes('renderCenterTabs(activeTab, setMainTab)}{renderCenterContent(mainTab, true)'));
  assert.ok(view.includes('bridge={grouped ? bridgeForPane(activeReview?.chatId ?? primaryId) : chatBridge}'));
  assert.ok(feature.includes('panes.flatMap') && feature.includes('key={tab}') && feature.includes('hidden={!visible}'));
  assert.ok(feature.includes('<KeybindingScope focused={focused}>'));
  const settings = { experimental: {} } as unknown as Parameters<typeof boolPref>[0];
  assert.equal(boolPref(settings, "experimental_configurable_center_panel"), false);
  assert.equal(boolPref({ ...settings, experimental: { experimental_configurable_center_panel: false } }, "experimental_configurable_center_panel"), false);
  assert.equal(boolPref({ ...settings, experimental: { experimental_configurable_center_panel: true } }, "experimental_configurable_center_panel"), true);
});
test("actual drop handler routes native paths to just the selected chat", async () => {
  const source = readFileSync("src/components/WorkspaceView.tsx", "utf8");
  const start = source.indexOf("  async function attachDroppedPaths(");
  const end = source.indexOf("\n  // Consumer 1:", start);
  assert.ok(start >= 0 && end > start);
  const javascript = stripTypeScriptTypes(source.slice(start, end));
  for (const interactionActive of [false, true]) {
    let reads = 0, attachments = 0;
    const handler = runInNewContext(`${javascript}\nattachDroppedPaths`, {
      interactionActive, workspace: { status: "ready" }, reason: false,
      nativePathToFile: async () => { reads++; return { name: "a.txt" }; },
      session: { attach: async () => { attachments++; } },
    }) as (paths: string[]) => Promise<void>;
    await handler(["/test/a.txt"]);
    assert.equal(reads, interactionActive ? 1 : 0);
    assert.equal(attachments, interactionActive ? 1 : 0);
  }
});
test("frozen source-dispatch regression also runs in the standard .test.ts CI suite", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "--test", "--test-reporter=tap", "src/features/workspace/CenterPanelGroups.test.mjs"], { encoding: "utf8", env });
  assert.ok(output.includes("# pass 8") && output.includes("# fail 0"));
});
test("corrupt storage and prototype-looking workspace ids fail safe", () => {
  const disk = storage(); disk.setItem(CENTER_LAYOUT_KEY, "broken");
  const c = createCenterPanelController({ storage: disk, enabled: true, workspaceId: "__proto__", tabs: ["chat", "terminal:a"], selectedTab: "terminal:a", createGroupId: () => "new" });
  c.split();
  const restored = createCenterPanelController({ storage: disk, enabled: true, workspaceId: "__proto__", tabs: ["chat", "terminal:a"] });
  assert.deepEqual(restored.snapshot(), c.snapshot());
});
