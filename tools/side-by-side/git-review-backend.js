// Fake Tauri backend for tools/side-by-side/git-review.mjs, injected after
// tools/sidebar-screens/seed.js. It opens the seeded lisbon workspace and
// serves the two files Conductor's harness changes there
// (tools/screens/seed-data.js: AUTH_BEFORE/AFTER, TEST_BEFORE/AFTER) as a real
// diff: one change block per file, `context_lines` of context, whole files
// when the entire-file view asks. Shell commands answer empty with exit 0;
// anything else fails, like the other fakes.
(function () {
  const raw = localStorage.getItem("openconductor.shell.v1");
  const shell = raw ? JSON.parse(raw) : { repos: [] };
  for (const r of shell.repos) for (const w of r.workspaces) w.path = `${r.path}/${w.name}`;
  shell.selection = { kind: "workspace", repoId: "repo-tide-web", workspaceId: "ws-lisbon" };
  localStorage.setItem("openconductor.shell.v1", JSON.stringify(shell));
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: shell.selection, collapsed: [] }));
  const created = new Date(Date.now() - 3600_000).toISOString();
  const AUTH_BEFORE = [
    'import { getSession } from "./session";',
    "",
    "export type Session = { userId: string; expiresAt: number };",
    "",
    "export async function currentSession(): Promise<Session | null> {",
    "  return (await getSession()) ?? null;",
    "}",
    "",
    "export function redirectTo(session) {",
    '  if (session) return "/dashboard";',
    '  return "/login";',
    "}",
  ];
  const AUTH_AFTER = AUTH_BEFORE.map((l) => (l === '  if (session) return "/dashboard";' ? '  if (session && session.expiresAt > Date.now()) return "/dashboard";' : l));
  const TEST_BEFORE = [
    'import { describe, expect, it } from "vitest";',
    'import { redirectTo } from "./auth";',
    "",
    'describe("redirectTo", () => {',
    '  it("sends signed-out users to /login", () => {',
    '    expect(redirectTo(null)).toBe("/login");',
    "  });",
    "});",
  ];
  const TEST_AFTER = [
    ...TEST_BEFORE.slice(0, 7),
    "",
    '  it("sends expired sessions to /login", () => {',
    "    const expired = { expiresAt: Date.now() - 1000 };",
    '    expect(redirectTo(expired)).toBe("/login");',
    "  });",
    "",
    '  it("sends live sessions to the dashboard", () => {',
    "    const live = { expiresAt: Date.now() + 60_000 };",
    '    expect(redirectTo(live)).toBe("/dashboard");',
    "  });",
    "",
    '  it("treats a missing expiry as expired", () => {',
    '    expect(redirectTo({})).toBe("/login");',
    "  });",
    "});",
  ];
  const FILES = { "src/lib/auth.ts": [AUTH_BEFORE, AUTH_AFTER], "src/lib/auth.test.ts": [TEST_BEFORE, TEST_AFTER] };
  const TREE = [".gitignore", "README.md", "package.json", "tsconfig.json", "src/main.tsx", "src/App.tsx", "src/lib/auth.ts", "src/lib/auth.test.ts", "src/lib/session.ts", "src/routes/login.tsx", "src/routes/dashboard.tsx"];

  /** One change block (common prefix and suffix around it) as a hunk with `ctx` lines of context. */
  function diffFile(path, ctx) {
    const [a, b] = FILES[path];
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const lo = Math.max(0, p - ctx);
    const hiA = Math.min(a.length, a.length - s + ctx);
    const hiB = Math.min(b.length, b.length - s + ctx);
    const lines = [];
    for (let i = lo; i < p; i++) lines.push({ kind: "context", old_line: i + 1, new_line: i + 1, text: a[i] });
    for (let i = p; i < a.length - s; i++) lines.push({ kind: "deletion", old_line: i + 1, new_line: null, text: a[i] });
    for (let i = p; i < b.length - s; i++) lines.push({ kind: "addition", old_line: null, new_line: i + 1, text: b[i] });
    for (let i = 0; i < hiA - (a.length - s); i++) lines.push({ kind: "context", old_line: a.length - s + i + 1, new_line: b.length - s + i + 1, text: a[a.length - s + i] });
    return {
      path,
      old_path: null,
      status: "modified",
      binary: false,
      additions: b.length - s - p,
      deletions: a.length - s - p,
      hunks: [{ old_start: lo + 1, old_lines: hiA - lo, new_start: lo + 1, new_lines: hiB - lo, section: "", lines }],
    };
  }

  const settings = { general: { theme: "dark" }, appearance: { zoom_level_v2: 1, low_contrast_dark_mode: false, terminal_font_size: 12 }, git: {}, models: { default: "opus" }, providers: {} };
  const ok = { stdout: "", stderr: "", exitCode: 0, signal: null, cancelled: false, truncated: false };
  let cb = 0;
  window.isTauri = true;
  window.__fake = { unmocked: [] };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => ++cb,
    async invoke(cmd, args) {
      switch (cmd) {
        case "plugin:event|listen":
          return 1;
        case "plugin:event|unlisten":
          return;
        case "execute_shell_command":
        case "execute_shell_command_cancellable":
          return ok;
        case "get_settings":
          return structuredClone(settings);
        // Signed in and past first-run onboarding, like the reference's populated scenario.
        case "db_first_run_onboarding_step":
          return "999";
        case "db_list_repos":
          return shell.repos.map((r, i) => ({ id: r.id, name: r.name, rootPath: r.path, remoteUrl: r.remote ?? null, defaultBranch: r.defaultBranch, displayOrder: i, hidden: false, icon: null, createdAt: created }));
        case "db_list_workspaces":
          return shell.repos.flatMap((r) =>
            r.workspaces.map((w) => ({ id: w.id, repositoryId: r.id, directoryName: w.name, workspaceName: w.name, branch: w.branch, placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: w.path, pinnedAt: null, unread: !!w.unread, prTitle: w.prTitle ?? null, createdAt: created })),
          );
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        case "diff_workspace": {
          const req = args.request ?? {};
          // Conductor's harness shows four lines above the change and two below it (lines 6 to 12 of auth.ts).
          const ctx = req.context_lines ?? 4;
          const paths = Object.keys(FILES).filter((p) => !req.path || p === req.path);
          return { files: paths.map((p) => diffFile(p, ctx)).sort((x, y) => (x.path < y.path ? -1 : 1)) };
        }
        case "fuzzy_filter_files":
          return TREE.map((p) => ({ file: { name: p.split("/").pop(), path: p, is_directory: false }, relative_path: p, score: 0, match_indices: [] }));
        case "scripts_config":
          return { setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false, run: [], managedKeys: [], warnings: [] };
        case "setup_script_status":
          return { state: "idle", log: null, last: null };
        case "run_script_status":
          return { runs: [], history: [] };
        case "spotlight_testing_get":
          return { enabled: false, layer: null, managed: false };
        case "spotlight_status":
          return { active: false, workspaceId: null };
        case "open_in_apps":
          return [{ id: "finder", name: "Finder", kind: "finder", installed: true }];
        // No review comments and no PR, like the reference's lisbon (gh is signed out there).
        case "diff_comments_list":
          return [];
        case "diff_comments_sync_github":
          return { pr_number: null, skipped: "no pull request", review_comments: 0, general_comments: null, changed: 0 };
        case "pr_lookup":
          return (args.requests ?? []).map(() => ({ lookup: { kind: "none" }, derivedStatus: "in-progress" }));
        case "pr_git_state":
          return { hasUncommitted: true, hasChanges: true, hasRemote: true, canCreatePr: true, remote: "origin", upstream: { branchExists: false, diverged: false, ahead: 0, behind: 0 }, targetBehind: 0, detached: false };
        case "sidebar_workspace_changes":
          return [];
        // The Create from picker. gh is signed out in the reference harness (`gh auth status` fails),
        // so PRs and GitHub issues are "set up GitHub"; branches are main plus each workspace's branch.
        case "pr_list_open":
        case "gh_issue_list_open":
          throw "no_github: gh auth login required";
        case "ensure_repository": {
          const repo = shell.repos.find((r) => r.id === args.repositoryId || r.path === args.path);
          return { id: repo.id, name: repo.name, root: repo.path, defaultBranch: repo.defaultBranch };
        }
        // Conductor's create composer opens with no repository chosen, so its Branches tab is
        // empty ("No branches found"). Ours opens on tide-web; giving it only its default branch,
        // which the list leaves out, shows the same empty state.
        case "list_branches":
          return [{ name: "main", remote: null, commit: "", isHead: true, committedAt: 0 }];
        default:
          window.__fake.unmocked.push(cmd);
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
})();
