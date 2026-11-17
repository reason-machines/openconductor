import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Action } from "../state/store";
import type { DbRepoRow, DbWorkspaceRow } from "../state/persisted";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const root = new URL("../../", import.meta.url);
const inert = () => null;
const FILTERS_KEY = "openconductor.home.filters.v1";
const saved = (projects: string[], archiveFilter = "active") => JSON.stringify({ projects, archiveFilter });
const repoRow = (id: string): DbRepoRow => ({
  id, name: `Project ${id.toUpperCase()}`, rootPath: `/fixture/${id}`, remoteUrl: null,
  defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: "2026-11-11T00:00:00Z",
});
const workspaceRow = (id: string): DbWorkspaceRow => ({
  id: `workspace-${id}`, repositoryId: id, directoryName: `working-${id}`, workspaceName: `Working ${id.toUpperCase()}`,
  userSetWorkspaceName: true, branch: `working-${id}`, placeholderBranchName: null, state: "ready",
  derivedStatus: null, manualStatus: null, workspacePath: `/fixture/${id}/working`, pinnedAt: null,
  unread: false, prTitle: null, prDescription: null, number: 1,
  createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z",
});

function deferred<T>() {
  let resolve: (value: T) => void = () => assert.fail("Promise resolver was not initialized");
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Tree = string | { children: readonly Tree[] };
function text(node: Tree): string { return typeof node === "string" ? node : node.children.map(text).join(""); }

async function fixture(raw: string | null, pending = true) {
  const repositories = deferred<DbRepoRow[]>();
  const workspaces = deferred<DbWorkspaceRow[]>();
  const commands: string[] = [];
  const actions: Action[] = [];
  const writes: [string, string][] = [];
  const values = new Map<string, string>(raw === null ? [] : [[FILTERS_KEY, raw]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) { values.set(key, value); writes.push([key, value]); },
  };
  const window = Object.assign(new EventTarget(), { location: { pathname: "/all-workspaces", search: "" }, localStorage: storage });
  const cache = new Map<string, Record<string, any>>();
  const actual = new Set([
    "src/App.tsx", "src/components/AllWorkspaces.tsx", "src/components/HomeWorkspaceScreen.tsx", "src/components/RowStatusIcon.tsx",
    "src/state/store.ts", "src/state/persisted.ts", "src/state/selectors.ts", "src/state/navigationSections.ts",
    "src/state/workspaceStatus.ts", "src/home/sidebarGroupBy.ts", "src/state/openChat.ts",
    "src/state/workspaceSessions.ts", "src/state/rowStatus.ts", "src/state/chatUnread.ts", "src/home/allWorkspaces.ts",
    "src/components/sidebarLabel.ts", "src/state/workspaceNumber.ts",
    "src/lib/persistence/producer.ts", "src/lib/persistence/restartPersistence.ts", "src/lib/persistence/owner.ts",
  ]);
  const common: Record<string, unknown> = {
    inTauri: () => true,
    useAppPrefs: () => ({}), useBoolPref: () => false, useBoolPrefState: () => false,
    useStatusMatrix: () => false, useWorkspaceAgentStatus: () => "idle",
    useCustomSectionCollapse: () => [new Set(), inert],
    useNavHistory: () => ({ onBack: inert, onForward: inert }),
    useWorkspaceDeepLinks: inert, useAutoUnread: inert, useSidebarVisiblePref: inert,
    useSidebarWidth: () => ({ style: {}, resizer: null }), useSetupWatch: inert,
    useUpdates: inert, useInitIssues: inert, useArchiveOnMergeWatcher: inert, useKeybindings: inert,
    useKeybindingOverrides: () => ({ overrides: {} }),
    useToasts: () => ({ toasts: [], show: inert, dismiss: inert }),
    storedOrganization: () => null, resolveSettingsUrl: () => null,
    effectiveShortcuts: () => [], glyphs: () => "",
    listArchivedWorkspaces: async () => [], onArchiveEvent: () => inert,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    USER_PAGES: [], REPO_SECTIONS: [], PRIORITY: { DIALOG: 1 },
    invoke(name: string) {
      commands.push(name);
      if (name === "db_list_repos") return repositories.promise;
      if (name === "db_list_workspaces") return workspaces.promise;
      if (name === "db_read_navigation_sections") return Promise.resolve(null);
      assert.fail(`Unexpected IPC command ${name}`);
    },
  };
  function relative(from: string, specifier: string): string | undefined {
    if (!specifier.startsWith(".")) return;
    const path = new URL(specifier, new URL(from, root)).pathname.slice(root.pathname.length);
    return [path, path + ".ts", path + ".tsx"].find((name) => actual.has(name));
  }
  function evaluate(path: string, exports: Record<string, any> = {}): Record<string, any> {
    const existing = cache.get(path);
    if (existing) return existing;
    cache.set(path, exports);
    const source = readFileSync(new URL(path, root), "utf8");
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const mocked = new Map<string, Record<string, unknown>>();
    for (const statement of tree.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier === "react" || relative(path, specifier)) continue;
      const names: Record<string, unknown> = {};
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) {
          if (item.isTypeOnly) continue;
          const name = item.propertyName?.text ?? item.name.text;
          names[name] = name in common ? common[name] : /^[A-Z]/.test(name) ? inert : () => assert.fail(`Unexpected dependency call ${path}: ${specifier}.${name}`);
        }
      }
      mocked.set(specifier, names);
    }
    const javascript = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    runInNewContext(javascript, {
      exports, window, localStorage: storage, URLSearchParams, console, Event, Date,
      require(specifier: string) {
        if (specifier === "react") return path === "src/App.tsx" ? { ...React, useEffect: inert } : React;
        if (specifier === "react/jsx-runtime") return dependencies(specifier);
        const target = relative(path, specifier);
        if (target) {
          const module = evaluate(target);
          // Real desktop startup/store, with only outward user dispatch recorded.
          if (path === "src/App.tsx" && target === "src/state/store.ts") return {
            ...module, useAppStore() {
              const [state, dispatch, startup] = module.useAppStore();
              return [state, (action: Action) => { actions.push(action); if (action.type !== "select") dispatch(action); }, startup];
            },
          };
          return module;
        }
        const module = mocked.get(specifier);
        assert.ok(module, `Unexpected module ${path}: ${specifier}`);
        return module;
      },
    });
    return exports;
  }
  if (!pending) {
    repositories.resolve([repoRow("a"), repoRow("b")]);
    workspaces.resolve([workspaceRow("a"), workspaceRow("b")]);
  }
  const App = evaluate("src/App.tsx").default;
  assert.ok(App);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(App)); });
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  return {
    actions, commands,
    loading: () => renderer.root.findAllByProps({ role: "status", "aria-label": "Loading workspaces" }).length,
    startup: () => renderer.root.findByProps({ className: "app " }).props["data-startup"],
    rows: () => renderer.root.findAllByProps({ role: "option" }).map((node: any) => node.props.title),
    projectLabel: () => text(renderer.root.findByProps({ "aria-label": "Projects" })),
    archiveLabel: () => text(renderer.root.findByProps({ "aria-label": "Archived workspaces" })),
    stored: () => values.get(FILTERS_KEY) ?? null,
    filterWrites: () => writes.filter(([key]) => key === FILTERS_KEY),
    async settle() { await act(async () => {
      repositories.resolve([repoRow("a"), repoRow("b")]);
      workspaces.resolve([workspaceRow("a"), workspaceRow("b")]);
    }); },
    async choose(label: string) {
      const menu = renderer.root.findByProps({ "aria-label": "Projects" });
      if (!menu.props["aria-expanded"]) await act(async () => { menu.props.onClick(); });
      const choice = renderer.root.findAllByProps({ role: "menuitemcheckbox" }).find((node: any) => node.children.some((child: any) => child === label));
      assert.ok(choice, label);
      await act(async () => { choice.props.onClick(); });
    },
    async key(key: string) { await act(async () => { input().props.onKeyDown({ key, preventDefault() {} }); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const [name, raw, expectedRows, label] of [
  ["single saved project", saved(["b"]), ["Working B"], "Project B"],
  ["partial stale selection", saved(["missing", "b"]), ["Working B"], "Project B"],
  ["multiple saved projects", saved(["a", "b"]), ["Working A", "Working B"], "2 projects"],
  ["saved all-archive mode", saved(["b"], "all"), ["Working B"], "Project B"],
] as const) {
  test(`Home preserves ${name} across actual desktop startup`, async () => {
    const view = await fixture(raw);
    try {
      assert.equal(view.startup(), "loading");
      assert.equal(view.loading(), 1);
      assert.deepEqual(view.rows(), []);
      await view.settle();
      assert.equal(view.startup(), "ready");
      assert.equal(view.loading(), 0);
      assert.equal(view.projectLabel(), `In ${label}`);
      assert.deepEqual(view.rows(), expectedRows);
      await view.key("Enter");
      const selected = view.actions.at(-1);
      assert.ok(selected?.type === "select" && selected.selection.kind === "workspace");
      assert.equal(selected.selection.repoId, expectedRows[0] === "Working B" ? "b" : "a");
      assert.equal(selected.selection.workspaceId, expectedRows[0] === "Working B" ? "workspace-b" : "workspace-a");
      assert.equal(view.stored(), raw, "hydration must not rewrite saved settings");
      assert.deepEqual(view.filterWrites(), []);
    } finally { await view.close(); }
  });
}

for (const [name, raw] of [["absent", null], ["malformed", "not-json"], ["removed project", saved(["missing"])]] as const) {
  test(`Home retains ${name} fallback after desktop startup`, async () => {
    const view = await fixture(raw);
    try {
      await view.settle();
      assert.equal(view.projectLabel(), "In all projects");
      assert.deepEqual(view.rows(), ["Working A", "Working B"]);
      assert.equal(view.stored(), raw);
      assert.deepEqual(view.filterWrites(), []);
    } finally { await view.close(); }
  });
}

test("Home keeps a saved project filter with immediately resolved desktop reads", async () => {
  // Even immediately resolved IPC still begins with []/loading on the desktop.
  const view = await fixture(saved(["b"]), false);
  try {
    assert.equal(view.startup(), "ready");
    assert.equal(view.projectLabel(), "In Project B");
    assert.deepEqual(view.rows(), ["Working B"]);
  } finally { await view.close(); }
});

test("Home archive mode survives startup independently of project selection", async () => {
  const view = await fixture(saved([], "all"));
  try {
    await view.settle();
    assert.equal(view.archiveLabel(), "Showing all");
    assert.deepEqual(view.rows(), ["Working A", "Working B"]);
    assert.deepEqual(view.filterWrites(), []);
  } finally { await view.close(); }
});

test("Home user project changes keep the existing real save path", async () => {
  const view = await fixture(null);
  try {
    await view.settle();
    await view.choose("Project B");
    assert.equal(view.projectLabel(), "In Project B");
    assert.deepEqual(view.rows(), ["Working B"]);
    assert.deepEqual(JSON.parse(view.stored()!), { projects: ["b"], archiveFilter: "active" });
    assert.equal(view.filterWrites().length, 1);
    await view.choose("All projects");
    assert.equal(view.projectLabel(), "In all projects");
    assert.deepEqual(view.rows(), ["Working A", "Working B"]);
    assert.deepEqual(JSON.parse(view.stored()!), { projects: [], archiveFilter: "active" });
    assert.equal(view.filterWrites().length, 2);
  } finally { await view.close(); }
});
