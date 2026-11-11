import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { DbRepoRow, DbWorkspaceRow } from "../state/persisted";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const root = new URL("../../", import.meta.url);
const inert = () => null;
const savedRepo: DbRepoRow = {
  id: "project", name: "Project", rootPath: "/fixture/project", remoteUrl: null,
  defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: "2026-11-11T00:00:00Z",
};
const savedWorkspace: DbWorkspaceRow = {
  id: "workspace", repositoryId: "project", directoryName: "working", workspaceName: "Working",
  userSetWorkspaceName: true, branch: "working", placeholderBranchName: null, state: "ready",
  derivedStatus: null, manualStatus: null, workspacePath: "/fixture/project/working", pinnedAt: null,
  unread: false, prTitle: null, prDescription: null, number: 1,
  createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z",
};

function deferred<T>() {
  let resolve: (value: T) => void = () => assert.fail("Promise resolver was not initialized");
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(options: { desktop: boolean; pending?: boolean; populated?: boolean }) {
  const repositories = deferred<DbRepoRow[]>();
  const workspaces = deferred<DbWorkspaceRow[]>();
  const commands: string[] = [];
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const window = Object.assign(new EventTarget(), { location: { pathname: "/all-workspaces", search: "" }, localStorage: storage });
  const cache = new Map<string, Record<string, unknown>>();
  const actual = new Set([
    "src/App.tsx", "src/components/AllWorkspaces.tsx", "src/components/RowStatusIcon.tsx",
    "src/state/store.ts", "src/state/persisted.ts", "src/state/selectors.ts", "src/state/navigationSections.ts",
    "src/state/workspaceStatus.ts", "src/home/sidebarGroupBy.ts", "src/state/openChat.ts",
    "src/state/workspaceSessions.ts", "src/state/rowStatus.ts", "src/state/chatUnread.ts", "src/home/allWorkspaces.ts",
    "src/components/sidebarLabel.ts", "src/state/workspaceNumber.ts",
  ]);
  const common: Record<string, unknown> = {
    inTauri: () => options.desktop,
    useAppPrefs: () => ({}),
    useBoolPref: () => false,
    useBoolPrefState: () => false,
    useStatusMatrix: () => false,
    useWorkspaceAgentStatus: () => "idle",
    useCustomSectionCollapse: () => [new Set(), inert],
    useNavHistory: () => ({ onBack: inert, onForward: inert }),
    useWorkspaceDeepLinks: inert,
    useAutoUnread: inert,
    useSidebarVisiblePref: inert,
    useSidebarWidth: () => ({ style: {}, resizer: null }),
    useSetupWatch: inert,
    useInitIssues: inert,
    useArchiveOnMergeWatcher: inert,
    useKeybindings: inert,
    useKeybindingOverrides: () => ({ overrides: {} }),
    useToasts: () => ({ toasts: [], show: inert, dismiss: inert }),
    storedOrganization: () => null,
    resolveSettingsUrl: () => null,
    effectiveShortcuts: () => [],
    glyphs: () => "",
    listArchivedWorkspaces: async () => [],
    onArchiveEvent: () => inert,
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

  function evaluate(path: string, exports: Record<string, unknown> = {}): Record<string, unknown> {
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
        if (target) return evaluate(target);
        const module = mocked.get(specifier);
        assert.ok(module, `Unexpected module ${path}: ${specifier}`);
        return module;
      },
    });
    return exports;
  }

  if (!options.pending) {
    repositories.resolve(options.populated ? [savedRepo] : []);
    workspaces.resolve(options.populated ? [savedWorkspace] : []);
  }
  const exported: { default?: () => React.ReactNode } = {};
  evaluate("src/App.tsx", exported);
  const App = exported.default;
  assert.ok(App);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(App)); });
  return {
    commands,
    loading: () => renderer.root.findAllByProps({ role: "status", "aria-label": "Loading workspaces" }).length,
    empty: () => renderer.root.findAllByProps({ className: "allws-empty" }),
    rows: () => renderer.root.findAllByProps({ role: "option" }),
    startup: () => renderer.root.findByProps({ className: "app " }).props["data-startup"],
    header: () => renderer.root.findByProps({ className: "allws-header" }).findByType("button"),
    async settle(populated: boolean) {
      await act(async () => {
        repositories.resolve(populated ? [savedRepo] : []);
        workspaces.resolve(populated ? [savedWorkspace] : []);
      });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home keeps the loading state while the actual desktop store hydrates through App", async () => {
  const view = await fixture({ desktop: true, pending: true });
  try {
    assert.equal(view.startup(), "loading");
    assert.equal(view.loading(), 1, "pending workspace data must render Loading workspaces, not a settled empty list");
    assert.equal(view.empty().length, 0);
    assert.equal(view.rows().length, 0);
    assert.deepEqual(view.header().children, ["Create workspace"]);
    await view.settle(true);
    assert.equal(view.startup(), "ready");
    assert.equal(view.loading(), 0);
    assert.equal(view.empty().length, 0);
    assert.equal(view.rows().length, 1);
    assert.equal(view.rows()[0].props.title, "Working");
  } finally { await view.close(); }
});

test("Home keeps populated desktop data visible after startup", async () => {
  const view = await fixture({ desktop: true, populated: true });
  try {
    assert.equal(view.startup(), "ready");
    assert.equal(view.loading(), 0);
    assert.equal(view.rows().length, 1);
    assert.equal(view.empty().length, 0);
  } finally { await view.close(); }
});

test("Home keeps its settled-empty Create action after desktop startup", async () => {
  const view = await fixture({ desktop: true });
  try {
    assert.equal(view.startup(), "ready");
    assert.equal(view.loading(), 0);
    assert.equal(view.empty().length, 1);
    assert.deepEqual(view.empty()[0].findByType("button").children, ["Create a workspace"]);
  } finally { await view.close(); }
});

test("Home browser preview stays ready and does not issue desktop reads", async () => {
  const view = await fixture({ desktop: false });
  try {
    assert.equal(view.startup(), "ready");
    assert.equal(view.loading(), 0);
    assert.equal(view.empty().length, 1);
    assert.deepEqual(view.commands, []);
  } finally { await view.close(); }
});
