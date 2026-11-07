// Browser-only IPC fixture for settings captures and deterministic save-race checks.
// Never invokes an agent or touches a user's settings, credentials or repositories.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fakeBackend, FILES } from "../../tests/e2e/right-panel-fixture.mjs";

const root = path.resolve("dist");
const port = Number(process.env.PORT ?? 51749);
const shell = {
  repos: ["tide-web", "tide-api", "dotfiles"].map((name) => ({
    id: `repo-${name}`, name, path: `/Users/demo/code/${name}`, defaultBranch: "main", workspaces: [],
  })),
  selection: { kind: "home" },
};
function settingsBackend() {
  localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
  const manual = new URLSearchParams(location.search).has("manual_writes");
  let settings = {
    $schema: "https://openconductor.dev/schemas/settings.schema.json",
    general: { theme: "dark", send_native_notification: true, sound_type: "default" },
    appearance: { zoom_level_v2: 1, low_contrast_dark_mode: false, terminal_font_size: 12 },
    git: { branch_prefix_type: "github_username", delete_branch_on_archive: false, archive_on_merge: false, worktree_push_auto_setup_remote: true },
    models: { default: "opus", default_thinking_enabled: true, review_thinking_enabled: true, codex: { default_thinking_level: "medium", review_thinking_level: "medium" } },
    providers: {},
    experimental: { experimental_big_terminal_mode: location.pathname.endsWith("/terminal") },
    reason: { workspace: "ws-b", model: "test-model", reasoning_effort: "high" },
  };
  const account = { version: "0.2.692", name: "Ada Demo", email: "ada@example.com", credential: "login", error: null, organization: "Tide Labs", computerConnected: true, workspaces: [{ slug: "ws-a", name: "Workspace A", selected: true, connected: true }, { slug: "ws-b", name: "Workspace B", selected: false, connected: true }] };
  const writes = [];
  const statuses = [];
  window.__settingsTest = {
    writes,
    statuses,
    delayStatus: false,
    completeStatus(index, fail = false) {
      const status = statuses[index];
      if (!status || status.done) throw new Error("No pending Reason status " + index);
      status.done = true;
      if (fail) status.reject(new Error("obsolete Reason status"));
      else status.resolve({ ...account, version: "fixture-persisted" });
    },
    stored: () => structuredClone(settings),
    complete(index, fail = false) {
      const write = writes[index];
      if (!write || write.done) throw new Error("No pending settings write " + index);
      write.done = true;
      if (fail) write.reject(new Error("fixture write refused"));
      else { settings = structuredClone(write.next); write.resolve(structuredClone(settings)); }
    },
  };
  const original = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === "get_settings") return structuredClone(settings);
    if (cmd === "env_vars_list" || cmd === "env_files_loaded") return [];
    if (cmd === "update_settings") {
      if (!manual) { settings = structuredClone(args.settings); return structuredClone(settings); }
      return new Promise((resolve, reject) => writes.push({ next: structuredClone(args.settings), resolve, reject, done: false }));
    }
    if (cmd === "reason_account_status") {
      if (!window.__settingsTest.delayStatus) return account;
      return new Promise((resolve, reject) => statuses.push({ path: settings.reason_executable_path ?? null, resolve, reject, done: false }));
    }
    if (cmd === "reason_models") return [{ value: "test-model", name: "Test model" }];
    if (cmd === "reason_paths") return { systemCli: "/Users/demo/.local/bin/reason", configDir: "/Users/demo/.config/reason" };
    if (cmd === "provider_status") return { agent: args.agent, kind: args.agent === "reason" ? "reason_login" : args.agent === "codex" ? "codex_login" : "claude_login", secrets: [], ready: false, problem: null };
    if (cmd === "agent_system_binary") return `/Users/demo/.local/bin/${args.agent === "claude" ? "claude" : args.agent}`;
    if (cmd === "agent_auth_status") return { authenticated: false, error: null };
    if (cmd === "cli_login_status") return { installed: true, authenticated: false };
    if (cmd === "agent_config_file") return { filePath: `/Users/demo/.${args.agent === "claude" ? "claude/settings.json" : "codex/config.toml"}`, directoryPath: `/Users/demo/.${args.agent}` };
    if (cmd === "repo_settings_effective") return {
      prompts: {}, git: { branch_prefix_type: null, branch_prefix: null, archive_on_merge: { value: false, layer: "defaults" }, delete_branch_on_archive: { value: false, layer: "defaults" }, worktree_push_auto_setup_remote: { value: true, layer: "defaults" } },
      previewUrls: null, environmentVariableFiles: null, fileIncludeGlobs: null,
      env: { local: {}, cloud: {}, files: [] }, userEnv: { local: {}, cloud: {}, files: [] }, warnings: [],
    };
    if (cmd === "spotlight_testing_get") return { enabled: false, layer: null, managed: false };
    if (cmd === "scripts_config") return { setup: null, setupLayer: null, archive: null, archiveLayer: null, runMode: "nonconcurrent", autoRunAfterSetup: false, run: [], managedKeys: [], warnings: [] };
    if (cmd === "get_conductor_root") return "/Users/demo/.openconductor";
    if (cmd === "repo_workspaces_path") return `/Users/demo/.openconductor/workspaces/${args.repoId.replace("repo-", "")}`;
    return original(cmd, args);
  };
}
const seed = `(${fakeBackend})(${JSON.stringify({ shell, files: FILES })});(${settingsBackend})();`;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${seed}</script>`);
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  res.end(body);
}).listen(port, "0.0.0.0", () => {
  console.log(`Settings fixture listening on ${port}`);
  void (async () => {
    try {
      if (process.env.CAPTURE_SETTINGS) await import("./capture.mjs");
      if (process.env.CHECK_SAVE_RACE) {
        await import("./check-save-race.mjs");
        console.log("SAVE_RACE_CHECK_PASSED");
      }
    } catch (error) {
      process.exitCode = 1;
      console.error("SETTINGS_VERIFICATION_FAILED", error);
    } finally {
      if (process.env.EXIT_AFTER_CHECK) server.close();
    }
  })();
});
