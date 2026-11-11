import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AppState, Repo, Workspace } from "../state/types.ts";
import { RECENT_STORAGE_KEY, loadRecentWorkspaceIds, saveRecentWorkspaceIds } from "./recentWorkspaces.ts";
import { loadLastWorkspaceRoute, saveLastWorkspaceRoute, selectedWorkspaceRoute, settingsRepositoryId, type LastWorkspaceRoute } from "./settingsRepository.ts";

const workspace = (id: string, state = "ready"): Workspace => ({
  id, name: id, branch: "main", status: "idle", state, createdAt: 1, diff: { added: 0, removed: 0 },
});
const repo = (id: string): Repo => ({ id, name: id, path: `/${id}`, defaultBranch: "main", workspaces: [workspace(`w-${id}`)] });
const repos = [repo("r1"), repo("r2")];
const home = (): AppState => ({ selection: { kind: "home" }, repos });
const active = (): AppState => ({ selection: { kind: "workspace", repoId: "r2", workspaceId: "w-r2" }, repos });
const lastR2 = { href: "/repository/r2/workspace/w-r2" };

function memoryStorage(value: unknown = { state: {}, version: 0 }) {
  let saved = JSON.stringify(value);
  return {
    getItem: (key: string) => key === RECENT_STORAGE_KEY ? saved : null,
    setItem: (key: string, next: string) => { assert.equal(key, RECENT_STORAGE_KEY); saved = next; },
    snapshot: () => JSON.parse(saved),
  };
}

function runSetting(state: AppState, lastWorkspaceRoute: LastWorkspaceRoute | undefined, id = "scripts") {
  const source = readFileSync(new URL("./PaletteHost.tsx", import.meta.url), "utf8");
  const start = source.indexOf("  function openSetting(");
  const end = source.indexOf("  const settingIcon", start);
  assert.ok(start >= 0 && end > start, "the actual PaletteHost Settings callback is present");
  const callback = source.slice(start, end).replace("id: string", "id");
  const navigations: unknown[] = [];
  const rows: string[] = [];
  const settingsIndex = [
    { id: "scripts", target: { scope: "repo", section: "scripts" } },
    { id: "script-row", target: { scope: "repo", section: "scripts", row: "setup-script" } },
    { id: "providers", target: { scope: "user", providerTab: "codex" } },
    { id: "general", target: { scope: "user", page: "general" } },
  ];
  const openSetting = new Function("settingsIndex", "sel", "state", "lastWorkspaceRoute", "settingsRepositoryId", "openRepoSettingsPage", "openAgentSettings", "openSettingsPage", "scrollToRow", `${callback}\nreturn openSetting;`)(
    settingsIndex, state.selection, state, lastWorkspaceRoute, settingsRepositoryId,
    (repoId: string, section: string) => navigations.push({ repoId, section }),
    (providerTab: string) => navigations.push({ providerTab }),
    (page: string) => navigations.push({ page }),
    (row: string) => rows.push(row),
  );
  openSetting(id);
  return { navigations, rows };
}

test("the actual palette callback retains the last workspace repository after Home and reload", () => {
  const storage = memoryStorage();
  const route = selectedWorkspaceRoute(active());
  assert.deepEqual(route, lastR2);
  assert.ok(route);
  saveLastWorkspaceRoute(route, storage);
  saveRecentWorkspaceIds(["w-r1", "w-r2"], storage);
  assert.deepEqual(runSetting(home(), loadLastWorkspaceRoute(storage)), { navigations: [{ repoId: "r2", section: "scripts" }], rows: [] });
});

test("the actual palette callback keeps the requested repository setting row", () => {
  assert.deepEqual(runSetting(home(), lastR2, "script-row"), { navigations: [{ repoId: "r2", section: "scripts" }], rows: ["setup-script"] });
});

test("a resolved selected workspace takes precedence over the saved route", () => {
  assert.deepEqual(runSetting(active(), { href: "/repository/r1/workspace/w-r1" }).navigations, [{ repoId: "r2", section: "scripts" }]);
  assert.equal(settingsRepositoryId(active(), { href: "/repository/r1/workspace/w-r1" }), "r2");
});

test("no route, an invalid route or a removed repository falls back to the first repository", () => {
  for (const route of [undefined, { href: "/all-workspaces" }, { href: "http://[" }, { href: "/repository/removed/workspace/gone" }]) {
    assert.equal(settingsRepositoryId(home(), route), "r1");
    assert.deepEqual(runSetting(home(), route).navigations, [{ repoId: "r1", section: "scripts" }]);
  }
});

test("the saved route selects its repository even if that workspace is no longer in the sidebar", () => {
  const state = { ...home(), repos: [repos[0], { ...repos[1], workspaces: [] }] };
  assert.equal(settingsRepositoryId(state, lastR2), "r2");
});

test("an empty repository list has no Settings target", () => {
  assert.equal(settingsRepositoryId({ ...home(), repos: [] }, lastR2), undefined);
  assert.deepEqual(runSetting({ ...home(), repos: [] }, lastR2).navigations, []);
});

test("an unresolved or wrong-repository selection does not create a saved workspace route", () => {
  const state = active();
  assert.equal(selectedWorkspaceRoute({ ...state, selection: { kind: "workspace", repoId: "r2", workspaceId: "missing" } }), undefined);
  assert.equal(selectedWorkspaceRoute({ ...state, selection: { kind: "workspace", repoId: "r1", workspaceId: "w-r2" } }), undefined);
  assert.equal(selectedWorkspaceRoute({ ...state, selection: { kind: "workspace", repoId: "missing", workspaceId: "w-r2" } }), undefined);
  assert.equal(selectedWorkspaceRoute(home()), undefined);
});

test("resolved unstarted and failed workspaces still establish their repository route", () => {
  for (const state of ["unstarted", "initializing", "failed", "ready"]) {
    const selected = { ...active(), repos: [repos[0], { ...repos[1], workspaces: [workspace("w-r2", state)] }] };
    assert.deepEqual(selectedWorkspaceRoute(selected), lastR2);
  }
});

test("only a full matching archived workspace can establish the selected route", () => {
  const state: AppState = { ...active(), repos: [repos[0], { ...repos[1], workspaces: [] }], archivedOpen: { repoId: "r2", workspace: { ...workspace("w-r2"), status: "archived" } } };
  assert.deepEqual(selectedWorkspaceRoute(state), lastR2);
  assert.equal(selectedWorkspaceRoute({ ...state, archivedOpen: { ...state.archivedOpen!, repoId: "r1" } }), undefined);
  assert.equal(selectedWorkspaceRoute({ ...state, archivedOpen: { repoId: "r2", workspace: workspace("unrelated") } }), undefined);
});

test("stale unresolved selection leaves the previous persisted route intact", () => {
  const storage = memoryStorage({ state: { lastRoute: lastR2 }, version: 0 });
  const state: AppState = { ...home(), selection: { kind: "workspace", repoId: "r1", workspaceId: "missing" } };
  const route = selectedWorkspaceRoute(state);
  if (route) saveLastWorkspaceRoute(route, storage);
  assert.deepEqual(loadLastWorkspaceRoute(storage), lastR2);
  assert.equal(settingsRepositoryId(state, loadLastWorkspaceRoute(storage)), "r2");
});

test("the authoritative recent writer preserves the route and ordinary tab fields through reload", () => {
  const storage = memoryStorage({ state: { lastRoute: lastR2, stickyUtilityTab: { "w-r2": "diff" }, prTabOpen: { "w-r2": true } }, version: 3, custom: "kept" });
  saveRecentWorkspaceIds(["w-r1", "w-r2"], storage);
  assert.deepEqual(loadLastWorkspaceRoute(storage), lastR2);
  assert.deepEqual(loadRecentWorkspaceIds(storage), ["w-r1", "w-r2"]);
  assert.deepEqual(storage.snapshot(), { state: { lastRoute: lastR2, stickyUtilityTab: { "w-r2": "diff" }, prTabOpen: { "w-r2": true }, recentWorkspaceIds: ["w-r1", "w-r2"] }, version: 3, custom: "kept" });
});

test("saving a route preserves recents and sibling fields from the latest ordinary write", () => {
  const storage = memoryStorage({ state: { prTabOpen: { "w-r1": true } }, version: 4, custom: "kept" });
  saveRecentWorkspaceIds(["w-r1"], storage);
  saveLastWorkspaceRoute(lastR2, storage);
  assert.deepEqual(loadLastWorkspaceRoute(storage), lastR2);
  assert.deepEqual(storage.snapshot(), { state: { prTabOpen: { "w-r1": true }, recentWorkspaceIds: ["w-r1"], lastRoute: lastR2 }, version: 4, custom: "kept" });
});

test("persisted route parsing rejects malformed fields and non-workspace paths", () => {
  for (const value of [null, [], { state: null }, { state: { lastRoute: "/repository/r2/workspace/w-r2" } }, { state: { lastRoute: { href: 3 } } }, { state: { lastRoute: { href: "/settings/repos/r2/scripts" } } }, { state: { lastRoute: { href: "/repository/r2/workspace/w-r2/nested" } } }]) {
    assert.equal(loadLastWorkspaceRoute(memoryStorage(value)), undefined);
  }
  assert.equal(loadLastWorkspaceRoute({ getItem: () => "{bad json", setItem: () => assert.fail("not a write") }), undefined);
});

test("workspace routes accept a trailing slash and search without decoding opaque IDs", () => {
  const route = { href: "http://conductor.local/repository/r2/workspace/w-r2/?activeTabType=session" };
  assert.deepEqual(loadLastWorkspaceRoute(memoryStorage({ state: { lastRoute: route } })), route);
  assert.equal(settingsRepositoryId(home(), route), "r2");
});

test("storage denial does not throw or prevent in-memory repository selection", () => {
  const storage = { getItem: (): never => { throw new Error("denied"); }, setItem: (): never => { throw new Error("full"); } };
  assert.equal(loadLastWorkspaceRoute(storage), undefined);
  assert.doesNotThrow(() => saveLastWorkspaceRoute(lastR2, storage));
  assert.equal(settingsRepositoryId(home(), lastR2), "r2");
});

test("user pages, provider pages and unknown rows keep their existing callback behavior", () => {
  assert.deepEqual(runSetting(home(), lastR2, "providers").navigations, [{ providerTab: "codex" }]);
  assert.deepEqual(runSetting(home(), lastR2, "general").navigations, [{ page: "general" }]);
  assert.deepEqual(runSetting(home(), lastR2, "missing").navigations, []);
});
