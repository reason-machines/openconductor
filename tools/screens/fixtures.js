// IPC fixtures per scenario: command name -> value or (args, ctx) => value.
// Everything is invented for the harness; tokens are obviously fake strings.
(function () {
  const FAKE_TOKEN = "oc-harness-fake-token";
  const USER = {
    id: "user_demo_0001",
    name: "Ada Demo",
    email: "ada@example.com",
    avatarUrl: "",
    createdAt: "2026-01-15T09:00:00.000Z",
    githubInstallations: [],
    githubUsername: "ada-demo",
  };
  const KEYCHAIN_SIGNED_IN = {
    conductor_api_token: FAKE_TOKEN,
    cached_user_data: JSON.stringify({ apiToken: FAKE_TOKEN, userData: USER }),
  };

  // The apps of Sven's Mac "sven m5 max" (checked 2026-11-05) besides Finder and Terminal.
  const INSTALLED_APPS = ["Cursor", "Visual Studio Code", "Zed", "Xcode", "Ghostty"];
  const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
  const fail = (stderr) => ({ code: 1, stdout: "", stderr });

  // A tiny fake git: answers the read-only commands Conductor runs on startup
  // and when opening a workspace, from window.__OC_SEED_DATA__[scenario].git.
  function fakeShell(command, git) {
    const cmd = String(command || "");
    const cd = cmd.match(/cd "?'?([^"' &]+)"?'?\s*&&/);
    const dashC = cmd.match(/git -C '?"?([^'" ]+)'?"?/);
    let cwd = (dashC && dashC[1]) || (cd && cd[1]) || "";
    cwd = cwd.replace(/\/\.main$/, "");
    const repo = git.repos[cwd];
    const repoForWorktree = Object.entries(git.repos).find(([, r]) => r.worktrees.some((w) => w.path === cwd));
    const wt = repoForWorktree && repoForWorktree[1].worktrees.find((w) => w.path === cwd);
    const diff = git.diffs[cwd];

    if (/pmset -g batt/.test(cmd)) return ok("Now drawing from 'AC Power'\n");
    // Conductor's installed-apps check (`Z_s`): one `test -d "/Applications/<App>.app" ... && echo "<id>"`
    // clause per catalog app. Answers as a Mac with INSTALLED_APPS in /Applications.
    if (/test -d "\/Applications\//.test(cmd) && /&& echo "/.test(cmd)) {
      const ids = cmd.split("; ").flatMap((clause) => {
        const app = clause.match(/test -d "\/Applications\/([^"]+)\.app"/);
        const id = clause.match(/&& echo "([^"]+)"/);
        return app && id && INSTALLED_APPS.includes(app[1]) ? [id[1]] : [];
      });
      return ok(ids.length ? ids.join("\n") + "\n" : "");
    }
    if (/gh auth status/.test(cmd)) return fail("You are not logged into any GitHub hosts.");
    if (/git branch --format/.test(cmd) && repo) return ok(repo.branches.join("\n") + "\n");
    if (/git worktree list --porcelain/.test(cmd) && repo)
      return ok(
        [`worktree ${cwd}`, "HEAD 1111111111111111111111111111111111111111", "branch refs/heads/main", ""]
          .concat(...repo.worktrees.map((w) => [`worktree ${w.path}`, "HEAD 2222222222222222222222222222222222222222", `branch refs/heads/${w.branch}`, ""]))
          .join("\n"),
      );
    if (/config .*--get/.test(cmd)) return fail("");
    if (/rev-parse --abbrev-ref HEAD|branch --show-current/.test(cmd) && wt) return ok(wt.branch + "\n");
    if (/rev-parse/.test(cmd)) return ok("2222222222222222222222222222222222222222\n");
    const show = cmd.match(/git( -c [^ ]+)* show '?[0-9a-f]{7,40}:([^' ]+)'?/);
    if (show) {
      const base = diff && diff.base && diff.base[show[2]];
      return base !== undefined ? ok(base) : fail(`fatal: path '${show[2]}' does not exist`);
    }
    if (/merge-base/.test(cmd)) return ok("1111111111111111111111111111111111111111\n");
    if (/diff .*--numstat/.test(cmd)) return ok(diff ? diff.files.map((f) => `${f.added}\t${f.removed}\t${f.path}`).join("\n") + "\n" : "");
    if (/diff .*--name-status/.test(cmd)) return ok(diff ? diff.files.map((f) => `M\t${f.path}`).join("\n") + "\n" : "");
    if (/diff .*--name-only/.test(cmd)) return ok(diff ? diff.files.map((f) => f.path).join("\n") + "\n" : "");
    if (/git( -c [^ ]+)* diff/.test(cmd)) return ok(diff ? diff.patch : "");
    if (/status --porcelain/.test(cmd)) return ok(diff ? diff.files.map((f) => ` M ${f.path}`).join("\n") + "\n" : "");
    if (/git( -c [^ ]+)* log/.test(cmd)) return ok("");
    if (/rev-list --count/.test(cmd)) return ok("0\n");
    return ok("");
  }

  window.__OC_FAKE__ = { FAKE_TOKEN, USER, KEYCHAIN_SIGNED_IN, fakeShell };

  window.__OC_FIXTURES__ = function (scenario) {
    const signedIn = scenario !== "signed-out";
    const keychain = signedIn ? { ...KEYCHAIN_SIGNED_IN } : {};
    const git = ((window.__OC_SEED_DATA__ || {})[scenario] || {}).git || { repos: {}, diffs: {} };
    const shellLog = (window.__OC_SHELL_LOG__ = []);
    const shell = (args) => {
      const command = args.command ?? (args.args || []).join(" ");
      const r = fakeShell(command, git);
      shellLog.push({ command, code: r.code });
      return r;
    };
    return {
      get_keychain_setting: (args) => keychain[args.key] ?? null,
      set_keychain_setting: (args) => {
        keychain[args.key] = args.value;
        return null;
      },
      delete_keychain_setting: (args) => {
        delete keychain[args.key];
        return null;
      },
      native_http_fetch: (args) => {
        const r = (args && args.request) || {};
        console.warn(`[oc-mock] refused native_http_fetch ${r.method} ${r.url}`);
        throw "network disabled in the screenshot harness";
      },
      execute_shell_command: shell,
      execute_shell_command_cancellable: shell,
      "plugin:shell|execute": shell,
      sidecar: {},
    };
  };
})();
