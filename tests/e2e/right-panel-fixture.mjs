// The reference's invented data and a fake Tauri backend for the right panel,
// shared by tests/e2e/right-panel.e2e.mjs and tools/side-by-side/right-panel.mjs.
export const WT = "/Users/demo/code/tide-web/lisbon";
export const SHELL = {
  repos: [{ id: "r1", name: "tide-web", path: "/Users/demo/code/tide-web", defaultBranch: "main", workspaces: [{ id: "w1", name: "lisbon", branch: "ada/fix-login-redirect", path: WT }] }],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
};
export const FILES = [
  ".github/workflows/ci.yml",
  ".gitignore",
  "README.md",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "public/favicon.svg",
  "src/main.tsx",
  "src/App.tsx",
  "src/styles.css",
  "src/lib/auth.ts",
  "src/lib/auth.test.ts",
  "src/lib/session.ts",
  "src/routes/login.tsx",
  "src/routes/dashboard.tsx",
  "scripts/dev.sh",
  "Cargo.toml",
];

/**
 * Runs in the page before the app (page.addInitScript(fakeBackend, { shell, files })).
 * Calls the right panel makes are recorded in window.__fake.calls; commands it
 * does not know fail, as in the other e2e fakes, and are listed in window.__fake.unmocked.
 */
export function fakeBackend({ shell, files, spotlight = false, setupScript = null }) {
  localStorage.setItem("openconductor.shell.v1", JSON.stringify(shell));
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: shell.selection, collapsed: [] }));
  const settings = {
    general: { theme: "dark" },
    appearance: { zoom_level_v2: 1, low_contrast_dark_mode: false, terminal_font_size: 12 },
    git: {},
    models: { default: "opus" },
    providers: {},
  };
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  let cb = 0;
  const cbs = {};
  let ptyHandler;
  const fileList = [...files];
  window.__fake = { calls: [], unmocked: [], spawns: 0 };
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  const line = (kind, n, text) => ({ kind, old_line: kind === "addition" ? null : n, new_line: kind === "deletion" ? null : n, text });
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: (f) => ((cbs[++cb] = f), cb),
    async invoke(cmd, args) {
      switch (cmd) {
        case "plugin:event|listen":
          if (args.event === "pty-event") ptyHandler = args.handler;
          return 1;
        case "plugin:event|unlisten":
          return;
        case "db_list_repos":
          return shell.repos.map((r, i) => ({ id: r.id, name: r.name, rootPath: r.path, remoteUrl: null, defaultBranch: r.defaultBranch, displayOrder: i, hidden: false, icon: null, createdAt: "2026-01-01T00:00:00Z" }));
        case "db_list_workspaces":
          return shell.repos.flatMap((r) => r.workspaces.map((w) => ({ id: w.id, repositoryId: r.id, directoryName: w.name, workspaceName: w.name, branch: w.branch, placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: w.path, pinnedAt: null, unread: w.unread ?? false, createdAt: "2026-01-01T00:00:00Z" })));
        case "get_settings":
          return structuredClone(settings);
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        case "fuzzy_filter_files":
          return fileList.map((p) => ({ file: { name: p.split("/").pop(), path: p, is_directory: false }, relative_path: p, score: 0, match_indices: [] }));
        case "diff_workspace":
          return {
            files: [
              { path: "src/lib/auth.test.ts", old_path: null, status: "untracked", binary: false, additions: 14, deletions: 0, hunks: [] },
              { path: "src/lib/auth.ts", old_path: null, status: "untracked", binary: false, additions: 1, deletions: 1, hunks: [{ old_start: 1, old_lines: 1, new_start: 1, new_lines: 1, section: "", lines: [line("deletion", 1, "a"), line("addition", 1, "b")] }] },
            ],
          };
        case "diff_write_file":
          window.__fake.calls.push({ cmd, repo: args.repo, path: args.request.path, contents: args.request.contents });
          fileList.push(args.request.path);
          return;
        case "scripts_config":
          return { setup: setupScript, setupLayer: setupScript === null ? null : "repo_local", archive: null, runMode: "concurrent", autoRunAfterSetup: false, run: [], managedKeys: [], warnings: [] };
        case "setup_script_status":
          return { state: "idle", log: null, last: null };
        case "run_script_status":
          return { runs: [], history: [] };
        // The repository's spotlight_testing setting (Settings › Actions); off unless the test turns it on.
        case "spotlight_testing_get":
          return { enabled: spotlight, layer: spotlight ? "repo_local" : null, managed: false };
        case "spotlight_status":
          return { active: false, workspaceId: null };
        case "spotlight_start":
          window.__fake.calls.push({ cmd, ...args });
          return true;
        case "open_in_apps":
          return [{ id: "finder", name: "Finder", kind: "finder", installed: true }];
        case "open_in_app":
          window.__fake.calls.push({ cmd, ...args });
          return;
        case "pty_spawn": {
          const a = args.args;
          window.__fake.spawns++;
          setTimeout(() => {
            cbs[ptyHandler]?.({ event: "pty-event", id: 1, payload: { kind: "ready", id: a.id, pid: 42 } });
            cbs[ptyHandler]?.({ event: "pty-event", id: 1, payload: { kind: "data", id: a.id, data: b64("ada@mac lisbon % ") } });
          }, 0);
          return a.id;
        }
        case "pty_resize":
        case "pty_ack_bytes":
        case "pty_write":
        case "pty_kill":
        case "pty_persist_terminal_history":
          return;
        default:
          window.__fake.unmocked.push(cmd);
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}
