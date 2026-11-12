import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { AppState } from "./types";
import type { StoreStartup } from "./store";

const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const profile = readFileSync(new URL("../../src-tauri/src/visual_qa_profile.rs", import.meta.url), "utf8");
const composition = profile.split("fn run_visual(")[1].split("\n#[cfg(not(workspace_std_only))]")[0];
const handlers = new Set(Array.from(composition.split(".invoke_handler(tauri::generate_handler![")[1].split("])")[0].matchAll(/crate::[\w:]+::(\w+)|crate::(app_info)\b/g), match => match[1] ?? match[2]));

async function fixture(rejected?: string) {
  const calls: string[] = [];
  const errors: unknown[][] = [];
  const modules = new Map<string, Record<string, unknown>>();
  const storage = new Map<string, string>();
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
  const window = { location: { search: "", pathname: "/all-workspaces" }, addEventListener() {}, removeEventListener() {} };
  const unused = new Set(["./names", "./repoOrder", "./sidebarOrder", "./nextUnread", "./chatUnread", "./addRepo", "../workspace/archive", "../scripts/api", "../scripts/model", "../workspace/setupWatch", "./sidebarPersist"]);
  async function invoke(command: string) {
    calls.push(command);
    if (!handlers.has(command)) throw new Error(`Unregistered visual-profile command: ${command}`);
    if (command === rejected) throw new Error(`Private read failed: ${command}`);
    if (command === "db_list_repos" || command === "db_list_workspaces") return [];
    if (command === "db_read_navigation_sections" || command === "local_storage_get_entry") return null;
    throw new Error(`Unexpected fixture command: ${command}`);
  }
  function load(url: URL): Record<string, unknown> {
    const cached = modules.get(url.href);
    if (cached) return cached;
    const exports = {};
    modules.set(url.href, exports);
    const source = readFileSync(url, "utf8");
    runInNewContext(ts.transpileModule(source, {
      fileName: url.pathname,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports, window, localStorage, URLSearchParams,
      console: { error: (...args: unknown[]) => errors.push(args) },
      require(name: string) {
        if (name === "react") return React;
        if (name === "@tauri-apps/api/core") return { invoke };
        if (name === "../backend") return { inTauri: () => true };
        if (name === "../settings/appPrefs") return { useAppPrefs: () => ({}) };
        if (unused.has(name)) return {};
        if (name.startsWith(".")) return load(new URL(/\.tsx?$/.test(name) ? name : `${name}.ts`, url));
        throw new Error(`Unexpected hydration dependency: ${name}`);
      },
    });
    return exports;
  }
  const { useAppStore } = load(new URL("./store.ts", import.meta.url));
  assert.equal(typeof useAppStore, "function");
  if (typeof useAppStore !== "function") throw new Error("Missing actual store hook");
  const useCheckedAppStore = useAppStore;
  let snapshot: { state: AppState; startup: StoreStartup } | undefined;
  function Harness() {
    const [state, , startup]: readonly [AppState, unknown, StoreStartup] = useCheckedAppStore();
    snapshot = { state, startup };
    return null;
  }
  let mounted: ReturnType<typeof create>;
  await act(async () => { mounted = create(React.createElement(Harness)); });
  return {
    calls, errors, invoke,
    snapshot() { assert.ok(snapshot); return snapshot; },
    async collapseValue() {
      const { LocalStorageClient, persistStorage } = load(new URL("../lib/local-storage/client.ts", import.meta.url));
      assert.ok(typeof LocalStorageClient === "function" && typeof persistStorage === "function");
      const client = Reflect.construct(LocalStorageClient, [invoke]);
      return persistStorage(client, { name: "navigation", sizeLimit: 1024 }).getItem("custom-section-collapse");
    },
    dispose() { act(() => mounted.unmount()); },
  };
}

test("ordinary visual profile hydrates empty Home/sidebar without a startup error", async () => {
  const view = await fixture();
  try {
    assert.equal(view.snapshot().startup, "ready", JSON.stringify(view.errors));
    assert.equal(view.snapshot().state.repos.length, 0);
    assert.equal(view.snapshot().state.sections?.length, 0);
    assert.equal(view.snapshot().state.selection.kind, "home");
    assert.deepEqual(view.calls, ["db_list_repos", "db_list_workspaces", "db_read_navigation_sections"]);
    assert.equal(view.errors.length, 0);
  } finally { view.dispose(); }
});

test("ordinary visual profile reads absent collapse storage through the real client", async () => {
  const view = await fixture();
  try {
    assert.equal(await view.collapseValue(), null);
    assert.equal(view.calls.at(-1), "local_storage_get_entry");
  } finally { view.dispose(); }
});

for (const command of ["db_list_repos", "db_list_workspaces", "db_read_navigation_sections"]) {
  test(`ordinary hydration does not hide a failed ${command} read`, async () => {
    const view = await fixture(command);
    try {
      assert.equal(view.snapshot().startup, "error");
      assert.ok(view.errors.length > 0);
    } finally { view.dispose(); }
  });
}

test("ordinary visual profile keeps provider, process, clone and storage writes unavailable", async () => {
  const view = await fixture();
  try {
    for (const command of ["reason_cli_ensure_current", "reason_login_status", "get_agent_binary_state", "execute_shell_command", "clone_repo", "db_write_navigation_sections", "local_storage_set_entry", "local_storage_remove_entry", "local_storage_remove_subsystem"]) {
      await assert.rejects(view.invoke(command), /Unregistered visual-profile command/);
    }
  } finally { view.dispose(); }
});

test("visual-profile storage getter has managed state below the checked private data root", () => {
  const checked = composition.indexOf("resolved_paths(app.handle()");
  const data = composition.indexOf("let data = app.path().app_data_dir()?");
  const store = composition.indexOf("app.manage(crate::local_storage_commands::state(&data))");
  const window = composition.indexOf("tauri::WebviewWindowBuilder::from_config");
  assert.ok(checked >= 0 && checked < data && data < store && store < window, "Manage the real private SubsystemStore before creating the ordinary frontend");
});
