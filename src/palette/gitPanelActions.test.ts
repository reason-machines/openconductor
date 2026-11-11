import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import type { AppState, Workspace } from "../state/types.ts";
import * as paletteAdapters from "./fromAppState.ts";
import { GIT_PANEL_ACTIONS, gitPanelWorkspace, onGitPanelRequest, requestGitPanelAction, takeGitPanelRequest, type GitPanelTarget } from "./gitPanelActions.ts";

const targets = [
  ["show-changes", { tab: "changes", scope: "all" }],
  ["show-uncommitted-changes", { tab: "changes", scope: "uncommitted" }],
  ["show-all-files", { tab: "files" }],
  ["show-checks", { tab: "checks" }],
] satisfies [string, GitPanelTarget][];
const workspace = (state = "ready"): Workspace => ({ id: "w2", name: "w2", branch: "main", status: "idle", state, createdAt: 1, diff: { added: 0, removed: 0 } });
const active = (row = workspace()): AppState => ({ selection: { kind: "workspace", repoId: "r2", workspaceId: "w2" }, repos: [{ id: "r2", name: "r2", path: "/r2", defaultBranch: "main", workspaces: [row] }] });

function paletteDataFromState(state: AppState, recents: readonly string[]): ReturnType<typeof paletteAdapters.paletteDataFromState> {
  const source = readFileSync(new URL("./PaletteHost.tsx", import.meta.url), "utf8");
  const prefix = "  const data = useMemo(";
  const start = source.indexOf(prefix);
  const end = source.indexOf(", [state,", start);
  assert.ok(start >= 0 && end > start, "the actual host data factory is present");
  const factory = source.slice(start + prefix.length, end);
  return new Function(...Object.keys(paletteAdapters), "state", "recents", "archived", "settingEntries", "apps", "prefs", `return (${factory})();`)(...Object.values(paletteAdapters), state, recents, [], [], [], { default_open_in: null });
}

function paletteCallback(state: AppState) {
  const source = readFileSync(new URL("./PaletteHost.tsx", import.meta.url), "utf8");
  const actionsStart = source.indexOf("  const actions:");
  const actionsEnd = source.indexOf("  // Cmd+N", actionsStart);
  const selectStart = source.indexOf("  function onSelect(");
  const selectEnd = source.indexOf("  function openSetting(", selectStart);
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart && selectStart >= 0 && selectEnd > selectStart);
  const javascript = stripTypeScriptTypes(`${source.slice(actionsStart, actionsEnd)}\n${source.slice(selectStart, selectEnd)}`);
  const existing: string[] = [];
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl"].map((name) => [name, () => existing.push(name)]));
  const onSelect: (item: object) => void = new Function("state", "sel", "selectedId", "activeRepoId", "commands", "apps", "GIT_PANEL_ACTIONS", "requestGitPanelAction", `${javascript}\nreturn onSelect;`)(state, state.selection, state.selection.kind === "workspace" ? state.selection.workspaceId : null, "r2", commands, [], GIT_PANEL_ACTIONS, requestGitPanelAction);
  return { select: (id: string) => onSelect({ kind: "action", id: `action:${id}`, action: { id } }), existing };
}

function workspaceConsumer(repoId = "r2", workspaceId = "w2") {
  const source = readFileSync(new URL("../components/WorkspaceView.tsx", import.meta.url), "utf8");
  const marker = source.indexOf("    const applyGitPanelRequest =");
  const start = source.lastIndexOf("  useEffect(() => {", marker);
  const endText = "  }, [repo.id, workspace.id, diff]);";
  const end = source.indexOf(endText, marker);
  let tab: GitPanelTarget["tab"] = "changes";
  let scope = "uncommitted";
  let turn: string | null = "turn-1";
  const updates: object[] = [];
  let cleanup = () => {};
  const diff = { update: (patch: { scope: string }) => { updates.push(patch); scope = patch.scope; turn = null; } };
  if (marker >= 0 && start >= 0 && end > marker) {
    const javascript = stripTypeScriptTypes(source.slice(start, end + endText.length));
    new Function("useEffect", "repo", "workspace", "diff", "setGitPanelTab", "takeGitPanelRequest", "onGitPanelRequest", javascript)((effect: () => () => void) => { cleanup = effect(); }, { id: repoId }, { id: workspaceId }, diff, (next: typeof tab) => { tab = next; }, takeGitPanelRequest, onGitPanelRequest);
  }
  return { snapshot: () => ({ tab, scope, turn }), updates, close: () => cleanup() };
}

for (const [id, target] of targets) {
  test(`${id} is offered for an active workspace`, () => {
    const entries = paletteDataFromState(active(), []).actions;
    assert.ok(entries.some((entry) => entry.id === id));
    assert.ok(entries.findIndex((entry) => entry.id === id) > entries.findIndex((entry) => entry.id === "quick-open"));
    assert.ok(entries.findIndex((entry) => entry.id === id) < entries.findIndex((entry) => entry.id === "copy-url"));
  });
  test(`the actual palette callback requests ${id} for the selected workspace`, () => {
    takeGitPanelRequest("r2", "w2");
    paletteCallback(active()).select(id);
    assert.deepEqual(takeGitPanelRequest("r2", "w2"), target);
  });
  test(`the actual workspace consumer applies ${id} without changing the center view`, () => {
    takeGitPanelRequest("r2", "w2");
    const view = workspaceConsumer();
    try {
      paletteCallback(active()).select(id);
      assert.deepEqual(view.snapshot(), { tab: target.tab, scope: "scope" in target ? target.scope : "uncommitted", turn: "scope" in target ? null : "turn-1" });
      assert.deepEqual(view.updates, "scope" in target ? [{ scope: target.scope }] : []);
    } finally { view.close(); takeGitPanelRequest("r2", "w2"); }
  });
}

test("lifecycle gates retain initializing, failed and legacy local workspaces", () => {
  for (const state of ["active", "initializing", "setting_up", "failed", "ready", undefined]) {
    const row = { ...workspace(), state };
    const selected = { ...active(row), archivedOpen: { repoId: "other", workspace: { ...workspace(), id: "unrelated", status: "archived" as const } } };
    assert.equal(gitPanelWorkspace(selected), row);
    for (const [id, target] of targets) {
      assert.ok(paletteDataFromState(selected, []).actions.some((entry) => entry.id === id));
      paletteCallback(selected).select(id);
      assert.deepEqual(takeGitPanelRequest("r2", "w2"), target);
    }
  }
});

test("unstarted, archived, missing and wrong-repository selections have no panel actions or requests", () => {
  const base = active();
  const invalid: AppState[] = [
    active(workspace("unstarted")), active(workspace("archived")), active({ ...workspace(), status: "archived" }),
    { ...base, repos: [] }, { ...base, selection: { kind: "workspace", repoId: "other", workspaceId: "w2" } },
    { ...base, selection: { kind: "workspace", repoId: "r2", workspaceId: "missing" } },
    { ...base, selection: { kind: "home" } }, { ...base, selection: { kind: "root" } },
    { ...base, repos: [{ ...base.repos[0], workspaces: [] }], archivedOpen: { repoId: "r2", workspace: { ...workspace(), status: "archived" } } },
  ];
  for (const state of invalid) for (const [id] of targets) {
    takeGitPanelRequest("r2", "w2");
    assert.equal(paletteDataFromState(state, []).actions.some((entry) => entry.id === id), false);
    paletteCallback(state).select(id);
    assert.equal(takeGitPanelRequest("r2", "w2"), undefined);
  }
});

test("requests survive a hidden panel and are consumed once by the workspace owner", () => {
  takeGitPanelRequest("r2", "w2");
  paletteCallback(active()).select("show-all-files");
  const view = workspaceConsumer();
  try {
    assert.equal(view.snapshot().tab, "files");
    assert.equal(takeGitPanelRequest("r2", "w2"), undefined);
    assert.deepEqual(view.updates, []);
  } finally { view.close(); takeGitPanelRequest("r2", "w2"); }
});

test("a workspace switch and same-ID sibling repository cannot consume another target", () => {
  takeGitPanelRequest("r2", "w2");
  const other = workspaceConsumer("r1", "w2");
  try {
    paletteCallback(active()).select("show-checks");
    assert.equal(other.snapshot().tab, "changes");
    const selected = workspaceConsumer();
    try { assert.equal(selected.snapshot().tab, "checks"); }
    finally { selected.close(); }
  } finally { other.close(); takeGitPanelRequest("r2", "w2"); }
});

test("an unsubscribed consumer receives nothing, and the latest queued command wins", () => {
  takeGitPanelRequest("r2", "w2");
  const view = workspaceConsumer();
  view.close();
  paletteCallback(active()).select("show-all-files");
  paletteCallback(active()).select("show-uncommitted-changes");
  assert.equal(view.snapshot().tab, "changes");
  assert.deepEqual(takeGitPanelRequest("r2", "w2"), { tab: "changes", scope: "uncommitted" });
  assert.equal(takeGitPanelRequest("r2", "w2"), undefined);
});

test("the existing quick-open and Copy URL callbacks are unchanged", () => {
  const callback = paletteCallback(active());
  callback.select("quick-open");
  callback.select("copy-url");
  assert.deepEqual(callback.existing, ["quickOpen", "copyUrl"]);
});

// Execute the frozen fixture/equality blocks without importing their unrelated fuzzy-search dependency.
const legacySource = readFileSync(new URL("./fromAppState.test.ts", import.meta.url), "utf8");
const fixturesStart = legacySource.indexOf("const w =");
const fixturesEnd = legacySource.indexOf("\ntest(", fixturesStart);
const legacyStart = legacySource.indexOf("for (const loaded of [false, true])");
const legacyEnd = legacySource.indexOf('    for (const tab of ["all", "actions"]', legacyStart);
assert.ok(fixturesStart >= 0 && fixturesEnd > fixturesStart && legacyStart >= 0 && legacyEnd > legacyStart);
const legacyCode = stripTypeScriptTypes(legacySource.slice(fixturesStart, fixturesEnd) + "\n" + legacySource.slice(legacyStart, legacyEnd) + "\n  });\n}\n");
new Function("test", "assert", "paletteDataFromState", legacyCode)(test, assert, paletteAdapters.paletteDataFromState);

test("unknown actions do not notify listeners or create a request", () => {
  const calls: string[] = [];
  const close = onGitPanelRequest((repoId, workspaceId) => calls.push(`${repoId}/${workspaceId}`));
  try { requestGitPanelAction("unknown", active()); assert.deepEqual(calls, []); }
  finally { close(); }
  assert.equal(takeGitPanelRequest("r2", "w2"), undefined);
});
