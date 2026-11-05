// Flows run in order against one app session. Each throws on failure.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { installFakeApps } from "./fake-apps.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" });

/** A clone with an `origin` remote and one commit, so Open project adds it directly. */
function makeRepoFixture(name) {
  const base = mkdtempSync(join(tmpdir(), "oc-e2e-"));
  git(base, "init", "--bare", "-b", "main", "origin.git");
  git(base, "clone", "origin.git", name);
  const repo = join(base, name);
  git(repo, "commit", "--allow-empty", "-m", "init");
  git(repo, "push", "origin", "HEAD:main");
  return repo;
}

/** WebDriver-click the first element matching `css` whose textContent is exactly `label`. */
async function clickByText(wd, css, label) {
  const ids = await wd.findAll(css);
  const i = ids.length ? await wd.execute("return Array.from(document.querySelectorAll(arguments[0]), (e) => e.textContent.trim()).indexOf(arguments[1]);", [css, label]) : -1;
  if (i < 0 || i >= ids.length) throw new Error(`no ${css} with text ${JSON.stringify(label)}`);
  return wd.click(ids[i]);
}

// textContent, not WebDriver's visible text: the Home cards fade in, and visible
// text reads "" until the animation finishes.
function textsOf(wd, css) {
  return wd.execute("return Array.from(document.querySelectorAll(arguments[0]), (e) => e.textContent.trim());", [css]);
}

/** `key` under `[section]` of a TOML file, as its raw value text, or null. */
function tomlValue(path, section, key) {
  if (!existsSync(path)) return null;
  let current = "";
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) current = header[1].trim();
    const kv = current === section && line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (kv && kv[1] === key) return kv[2];
  }
  return null;
}

export const flows = [
  {
    // A fresh conductor.db has no repositories and no onboarding step, so the
    // first-run onboarding comes first; Continue writes the step and opens Home.
    name: "first-run",
    async run(wd) {
      await wd.waitFor("the first-run onboarding", async () => (await wd.findAll(".onb")).length > 0);
      await clickByText(wd, ".onb-continue", "Continue");
      await wd.waitFor("Home after onboarding", async () => (await wd.findAll(".home")).length > 0);
      const step = await wd.execute("return window.__TAURI_INTERNALS__.invoke('db_first_run_onboarding_step');", []);
      if (step !== "999") throw new Error(`first_time_onboarding_step ${JSON.stringify(step)}, want "999"`);
    },
  },
  {
    name: "home",
    async run(wd) {
      await wd.waitFor("the Home screen", async () => (await wd.findAll(".home")).length > 0);
      const labels = await wd.waitFor("Home entry cards", async () => {
        const t = await textsOf(wd, ".home-card-label");
        return t.length === 3 ? t : null;
      });
      const want = ["Open project", "Open GitHub project", "Quick start"];
      if (JSON.stringify(labels) !== JSON.stringify(want)) {
        throw new Error(`Home cards ${JSON.stringify(labels)}, want ${JSON.stringify(want)}`);
      }
    },
  },
  {
    name: "add-repo",
    async run(wd, ctx) {
      const repo = makeRepoFixture("e2e-demo");
      ctx.repo = repo;
      await wd.execute("window.__OC_E2E_PICK_FOLDER__ = arguments[0];", [repo]);
      await clickByText(wd, ".home-card", "Open project");
      await wd.waitFor("e2e-demo in the sidebar", async () => (await textsOf(wd, ".sb-repo-name")).includes("e2e-demo"));
    },
  },
  {
    name: "create-workspace",
    async run(wd, ctx) {
      if (!ctx.repo) throw new Error("needs the add-repo flow's repo");
      const worktreePaths = () => git(ctx.repo, "worktree", "list", "--porcelain").toString().match(/^worktree .+$/gm)?.map((l) => l.slice(9)) ?? [];
      const worktrees = () => worktreePaths().length;
      const pathsBefore = worktreePaths();
      const namesBefore = await textsOf(wd, ".sb-ws-name");
      const treesBefore = worktrees();
      const [add] = await wd.findAll('.sb-repo-add[aria-label="Create workspace in e2e-demo"]');
      if (!add) throw new Error("no Create workspace button for e2e-demo");
      await wd.click(add);
      const [submit] = await wd.waitFor("the Create workspace dialog", () => wd.findAll('form.create-ws button[type="submit"]').then((ids) => ids.length && ids));
      await wd.click(submit);
      await wd.waitFor("the workspace view", async () => (await wd.findAll(".workspace")).length > 0, 60000);
      // Adding a repo already lists one workspace, so check the new one was added.
      const names = await wd.waitFor("one more sidebar workspace", async () => {
        const t = await textsOf(wd, ".sb-ws-name");
        return t.length === namesBefore.length + 1 ? t : null;
      });
      // The backend made a real git worktree off the fixture repo.
      const trees = worktrees();
      if (trees !== treesBefore + 1) throw new Error(`git worktree list has ${trees} entries, want ${treesBefore + 1} (sidebar: ${JSON.stringify(names)})`);
      ctx.worktree = worktreePaths().find((p) => !pathsBefore.includes(p));
    },
  },
  {
    name: "diff",
    async run(wd, ctx) {
      if (!ctx.worktree) throw new Error("needs the create-workspace flow's worktree");
      // A new, untracked file in the selected workspace's worktree, as an agent would write it.
      writeFileSync(join(ctx.worktree, "e2e-diff.txt"), "one\ntwo\nthree\n");
      const [reload] = await wd.waitFor("the Changes panel", () => wd.findAll('.oc-diff-toolbar button[title="Reload changes"]').then((ids) => ids.length && ids));
      await wd.click(reload);
      const rows = await wd.waitFor("e2e-diff.txt in Changed files", async () => {
        const r = await wd.execute(
          "return Array.from(document.querySelectorAll('.oc-change'), (e) => [e.querySelector('.name')?.textContent.trim(), e.querySelector('.oc-count .a')?.textContent.trim()]);",
          [],
        );
        return r.some(([name]) => name === "e2e-diff.txt") ? r : null;
      });
      const [, added] = rows.find(([name]) => name === "e2e-diff.txt");
      if (added !== "+3") throw new Error(`e2e-diff.txt shows ${added} added lines, want +3 (rows: ${JSON.stringify(rows)})`);
    },
  },
  {
    // Checkpoints reach the UI through Spotlight: Run saves the repository root as
    // the `pre-spotlight` checkpoint, then saves the workspace and restores that
    // checkpoint into the root; Stop restores `pre-spotlight` and drops its ref.
    name: "checkpoint",
    async run(wd, ctx) {
      if (!ctx.worktree) throw new Error("needs the diff flow's worktree");
      const inRoot = join(ctx.repo, "e2e-diff.txt");
      // The toggle writes the root's own local settings file, which the workspace
      // lacks. Spotlight must leave it alone: not delete it while syncing, not
      // put back an older copy on Stop.
      const settings = join(ctx.repo, ".conductor", "settings.local.toml");
      const spotlightSetting = () => (existsSync(settings) ? readFileSync(settings, "utf8").match(/^spotlight_testing = (true|false)$/m)?.[1] ?? "unset" : "no file");
      const refs = () => git(ctx.repo, "for-each-ref", "--format=%(refname)", "refs/conductor-checkpoints").toString().split("\n").filter(Boolean);
      const buttonText = () => wd.execute("return document.querySelector('.scripts-actions .btn-primary, .scripts-actions .btn-stop')?.textContent.trim() ?? null;", []);
      if (existsSync(inRoot)) throw new Error("e2e-diff.txt is already in the repository root");

      const [toggle] = await wd.waitFor("the spotlight testing toggle", () => wd.findAll(".spotlight-toggle input:not([disabled])").then((ids) => ids.length && ids));
      await wd.click(toggle);
      await wd.waitFor("Run Spotlight", async () => (await buttonText())?.endsWith("Run Spotlight"));
      if (spotlightSetting() !== "true") throw new Error(`.conductor/settings.local.toml spotlight_testing: ${spotlightSetting()} after turning it on, want true`);
      const [start] = await wd.findAll(".scripts-actions .btn-primary");
      await wd.click(start);

      await wd.waitFor("the workspace's file synced into the repository root", async () => existsSync(inRoot) && readFileSync(inRoot, "utf8") === "one\ntwo\nthree\n", 60000);
      const during = refs();
      if (!during.includes("refs/conductor-checkpoints/pre-spotlight") || !during.some((r) => /\/cp-spotlight-\d+-\d+$/.test(r))) {
        throw new Error(`checkpoint refs while syncing: ${JSON.stringify(during)}, want pre-spotlight and cp-spotlight-<epoch>-<pid>`);
      }
      if (!existsSync(join(ctx.worktree, "e2e-diff.txt"))) throw new Error("saving the checkpoint removed e2e-diff.txt from the worktree");
      await wd.waitFor("Stop Spotlight", async () => (await buttonText())?.endsWith("Stop Spotlight"));
      if (spotlightSetting() !== "true") throw new Error(`.conductor/settings.local.toml spotlight_testing: ${spotlightSetting()} while syncing, want true (the sync must not touch the root's own settings)`);

      const [stop] = await wd.findAll(".scripts-actions .btn-stop");
      await wd.click(stop);
      await wd.waitFor("the repository root restored from pre-spotlight", async () => !existsSync(inRoot), 60000);
      await wd.waitFor("the pre-spotlight ref dropped", async () => !refs().includes("refs/conductor-checkpoints/pre-spotlight"));
      const status = git(ctx.repo, "status", "--porcelain", "--untracked-files=all").toString().split("\n").filter(Boolean);
      const want = ["?? .conductor/settings.local.toml"];
      if (JSON.stringify(status) !== JSON.stringify(want)) throw new Error(`repository root status ${JSON.stringify(status)}, want ${JSON.stringify(want)}`);
      if (spotlightSetting() !== "true") throw new Error(`.conductor/settings.local.toml spotlight_testing: ${spotlightSetting()} after Stop, want true`);

      // Turn spotlight testing back off for later flows.
      const [again] = await wd.findAll(".spotlight-toggle input:checked:not([disabled])");
      if (!again) throw new Error("no checked spotlight testing toggle to turn off");
      await wd.click(again);
      await wd.waitFor("spotlight_testing = false in .conductor/settings.local.toml", async () => spotlightSetting() === "false");
    },
  },
  {
    // The workspace's terminal panel runs a real login shell in the repository
    // checkout. The typed line never contains "42", so seeing oc-term-42 proves
    // the shell evaluated it, and pwd shows where the shell started.
    name: "terminal",
    async run(wd, ctx) {
      if (!ctx.repo) throw new Error("needs the add-repo flow's repository");
      const rows = () => wd.execute("return document.querySelector('.terminal-panel .xterm-rows')?.textContent ?? null;", []);
      const [screen] = await wd.waitFor("a terminal in the workspace's terminal panel", () => wd.findAll(".terminal-panel .xterm-screen").then((ids) => ids.length && ids), 60000);
      await wd.click(screen);
      await wd.keys("echo oc-term-$((6*7)); pwd\uE007");
      const cwds = [...new Set([ctx.repo, realpathSync(ctx.repo)])];
      const text = await wd.waitFor("the shell's output", async () => {
        const t = ((await rows()) ?? "").replace(/\u00a0/g, " ");
        return t.includes("oc-term-42") && cwds.some((c) => t.includes(c)) && t;
      }).catch(async (e) => {
        throw new Error(`${e.message}; terminal shows ${JSON.stringify(((await rows()) ?? "").replace(/\u00a0/g, " ").trim().slice(-400))}`);
      });
      if (!text.includes("echo oc-term-$((6*7)); pwd")) throw new Error("the typed command is not echoed in the terminal");
    },
  },
  {
    // ⌘K opens the palette from anywhere; typing filters it and Enter runs the
    // active result. Go to Home leaves the workspace for the Home list
    // (Conductor's /all-workspaces, titled "Home"; the wordmark-and-cards
    // screen at / only shows at start-up), and searching the workspace's name
    // brings it back.
    name: "command-palette",
    async run(wd) {
      const META = "\uE03D";
      const ENTER = "\uE007";
      const DOWN = "\uE015";
      const paletteOpen = async () => (await wd.findAll('.palette[aria-label="Command palette"]')).length > 0;
      const activeTitle = () => wd.execute("return document.querySelector('.palette-item.active .palette-title')?.textContent.trim() ?? null;", []);
      const titles = () => textsOf(wd, ".palette-item .palette-title");
      const headerName = () => wd.execute("return document.querySelector('.ws-header .ws-title strong')?.textContent.trim() ?? null;", []);

      const name = await wd.waitFor("the selected workspace's name", headerName);
      async function open() {
        // Leave the terminal so the chord reaches the app, not the shell.
        await wd.execute("document.activeElement?.blur();", []);
        await wd.chord([META], "k");
        await wd.waitFor("the command palette after ⌘K", paletteOpen, 10000);
        await wd.waitFor("focus in the palette input", () => wd.execute("return document.activeElement?.classList.contains('palette-input') ?? false;", []));
      }
      /** Type `query`, move the highlight onto `title` with ↓, and press Enter. */
      async function run(query, title) {
        await wd.keys(query);
        await wd.waitFor(`${JSON.stringify(title)} in the results`, async () => (await titles()).includes(title)).catch(async (e) => {
          throw new Error(`${e.message}; results ${JSON.stringify(await titles())}`);
        });
        for (let i = 0; (await activeTitle()) !== title; i++) {
          if (i > 20) throw new Error(`could not highlight ${JSON.stringify(title)}; results ${JSON.stringify(await titles())}`);
          await wd.keys(DOWN);
        }
        await wd.keys(ENTER);
        await wd.waitFor("the palette to close after Enter", async () => !(await paletteOpen()));
      }

      await open();
      await run("Go to Home", "Go to Home");
      const homeList = () =>
        wd.execute(
          "return { title: document.querySelector('.allws .allws-title')?.textContent.trim() ?? null, rows: document.querySelectorAll('.allws .allws-row').length, workspace: !!document.querySelector('.workspace') };",
          [],
        );
      await wd.waitFor("the Home list with the workspace's row", async () => {
        const h = await homeList();
        return h.title === "Home" && h.rows > 0 && !h.workspace;
      }).catch(async (e) => {
        throw new Error(`${e.message}; saw ${JSON.stringify(await homeList())}`);
      });

      await open();
      await run(name, name);
      const back = await wd.waitFor(`the ${name} workspace view`, headerName);
      if (back !== name) throw new Error(`palette opened workspace ${JSON.stringify(back)}, want ${JSON.stringify(name)}`);
    },
  },
  {
    // The header's Open button and its "Open in" menu, against stand-in app
    // bundles in ~/Applications (fake-apps.mjs: the apps of Sven's Mac). The
    // menu lists Finder (⌘O, 1), Cursor 2, VS Code 3, Zed 4, Xcode 5, Ghostty 6,
    // Terminal 7 and Copy path 8, each with the app's icon; ⌘⇧O opens it, 8
    // copies the path, and picking an app makes it the button's app.
    name: "open-in",
    setup(ctx) {
      ctx.removeFakeApps = installFakeApps(homedir());
    },
    teardown(ctx) {
      ctx.removeFakeApps?.();
    },
    async run(wd, ctx) {
      const META = "\uE03D";
      const SHIFT = "\uE008";
      const ESC = "\uE00C";
      const menuOpen = async () => (await wd.findAll('.oi-menu[role="menu"]')).length > 0;
      const rows = () =>
        wd.execute(
          "return Array.from(document.querySelectorAll('.oi-menu .oi-row'), (r) => ({ label: r.querySelector('.oi-row-label').textContent, kbd: r.querySelector('.oi-row-kbd')?.textContent ?? null, num: r.querySelector('.oi-row-num')?.textContent ?? null, icon: !!r.querySelector('img') }));",
          [],
        );
      const main = () => wd.execute("const b = document.querySelector('.ws-header .oi-main'); return b && { label: b.getAttribute('aria-label'), title: b.title, icon: !!b.querySelector('img'), disabled: b.disabled };", []);
      const openMenu = async () => {
        const [chevron] = await wd.findAll(".ws-header .oi-chevron");
        await wd.click(chevron);
        await wd.waitFor("the Open in menu", menuOpen, 10000);
      };

      const button = await wd.waitFor("the header's Open button with Finder's icon", async () => {
        const b = await main();
        return b && !b.disabled && b.icon ? b : null;
      });
      if (button.label !== "Open in Finder" || button.title !== "Open in Finder (⌘O)") throw new Error(`Open button ${JSON.stringify(button)}`);

      await openMenu();
      const want = [
        ["Finder", "⌘O", "1"],
        ["Cursor", null, "2"],
        ["VS Code", null, "3"],
        ["Zed", null, "4"],
        ["Xcode", null, "5"],
        ["Ghostty", null, "6"],
        ["Terminal", null, "7"],
      ];
      const got = await rows();
      const shape = got.map((r) => [r.label, r.kbd, r.num]);
      if (JSON.stringify(shape) !== JSON.stringify([...want, ["Copy path", null, "8"]])) throw new Error(`menu rows ${JSON.stringify(shape)}`);
      const noIcon = got.filter((r, i) => i < want.length && !r.icon).map((r) => r.label);
      if (noIcon.length) throw new Error(`no app icon on ${JSON.stringify(noIcon)}`);
      const shot = await wd.screenshot();
      if (process.env.E2E_OUT) writeFileSync(join(process.env.E2E_OUT, "open-in-menu.png"), shot);

      // Esc closes; ⌘⇧O opens it again; 8 runs Copy path.
      await wd.keys(ESC);
      await wd.waitFor("the menu to close on Esc", async () => !(await menuOpen()));
      await wd.execute("document.activeElement?.blur();", []);
      await wd.chord([META, SHIFT], "o");
      await wd.waitFor("the Open in menu after ⌘⇧O", menuOpen, 10000);
      await wd.keys("8");
      await wd.waitFor("the menu to close after 8", async () => !(await menuOpen()));
      await wd.waitFor("the Copied path toast", async () => (await textsOf(wd, ".toast-message")).includes("Copied workspace path to clipboard"));
      const copied = await wd.execute("return window.__TAURI_INTERNALS__.invoke('plugin:clipboard-manager|read_text');", []);
      if (!ctx.worktree || ![ctx.worktree, realpathSync(ctx.worktree)].includes(copied)) throw new Error(`clipboard ${JSON.stringify(copied)}, want the worktree ${JSON.stringify(ctx.worktree)}`);

      // Picking an app saves it as the default: the button and the ⌘O hint move to it.
      // (Linux has no `open -a`, so opening reports an error toast; the choice still sticks, as in Conductor.)
      await openMenu();
      const [cursor] = await wd.findAll('.oi-menu .oi-row[data-app="cursor"]');
      await wd.click(cursor);
      await wd.waitFor("the button to open in Cursor", async () => (await main())?.label === "Open in Cursor");
      await openMenu();
      const kbdRow = (await rows()).find((r) => r.kbd)?.label;
      if (kbdRow !== "Cursor") throw new Error(`⌘O hint on ${JSON.stringify(kbdRow)}, want Cursor`);
      await wd.keys("1");
      await wd.waitFor("the button back on Finder", async () => (await main())?.label === "Open in Finder");
    },
  },
  {
    // ⌘, opens Settings on General; Appearance › Theme saves at once, re-themes
    // the window and lands in settings.toml. Esc closes Settings, and reopening
    // it reads the theme back from disk. The original theme is restored last.
    name: "settings",
    async run(wd) {
      const META = "\uE03D";
      const ESC = "\uE00C";
      const file = join(process.env.OPENCONDUCTOR_HOME ?? join(homedir(), ".openconductor"), "settings.toml");
      const heading = () => wd.execute("return document.querySelector('.settings .settings-header h1')?.textContent.trim() ?? null;", []);
      const select = 'select[aria-label="Theme"]';
      const selected = () => wd.execute("return document.querySelector(arguments[0])?.value ?? null;", [select]);
      const docTheme = () => wd.execute("return document.documentElement.dataset.theme ?? 'system';", []);
      const savedTheme = () => JSON.parse(tomlValue(file, "general", "theme") ?? '"system"');

      async function openAppearance() {
        await wd.execute("document.activeElement?.blur();", []);
        await wd.chord([META], ",");
        const first = await wd.waitFor("Settings after ⌘,", heading, 10000);
        if (first !== "General") throw new Error(`Settings opened on ${JSON.stringify(first)}, want "General"`);
        await clickByText(wd, ".settings-nav .nav-item", "Appearance");
        await wd.waitFor("the Appearance page", async () => (await heading()) === "Appearance");
        return wd.waitFor("the Theme select", selected);
      }
      async function choose(theme) {
        const [option] = await wd.findAll(`${select} option[value="${theme}"]`);
        if (!option) throw new Error(`no ${theme} option in the Theme select`);
        await wd.click(option);
        await wd.waitFor(`the window in the ${theme} theme`, async () => (await docTheme()) === theme);
        await wd.waitFor(`theme = "${theme}" in ${file}`, async () => savedTheme() === theme).catch((e) => {
          throw new Error(`${e.message}; [general] theme is ${tomlValue(file, "general", "theme")}`);
        });
      }
      async function close() {
        await wd.execute("document.activeElement?.blur();", []);
        await wd.keys(ESC);
        await wd.waitFor("Settings to close on Esc", async () => (await wd.findAll(".settings")).length === 0);
      }

      const original = await openAppearance();
      const target = original === "dark" ? "light" : "dark";
      await choose(target);
      await close();
      if ((await docTheme()) !== target) throw new Error(`theme ${await docTheme()} after closing Settings, want ${target}`);

      const reopened = await openAppearance();
      if (reopened !== target) throw new Error(`Theme select shows ${JSON.stringify(reopened)} after reopening, want ${JSON.stringify(target)}`);
      await choose(original);
      await close();
    },
  },
  {
    // A non-fatal initialization issue (Conductor's qYe, evidence/create-workspace/README.md):
    // a post-checkout hook that exits 1 makes `git worktree add` fail although the
    // worktree exists. The workspace is still created; its row stores the
    // worktree-add log as initialization_log_path; an error toast that stays
    // until dismissed says so, and its "View logs" opens that log.
    name: "create-workspace-init-issue",
    async run(wd, ctx) {
      if (!ctx.repo) throw new Error("needs the add-repo flow's repo");
      const MESSAGE = "Something failed while creating your workspace. Check the logs to see what went wrong.";
      const MARKER = "oc-e2e post-checkout hook failed";
      const hooks = resolve(ctx.repo, git(ctx.repo, "rev-parse", "--git-common-dir").toString().trim(), "hooks");
      const hook = join(hooks, "post-checkout");
      mkdirSync(hooks, { recursive: true });
      writeFileSync(hook, `#!/bin/sh\necho "${MARKER}" >&2\nexit 1\n`);
      chmodSync(hook, 0o755);
      try {
        const worktreePaths = () => git(ctx.repo, "worktree", "list", "--porcelain").toString().match(/^worktree .+$/gm)?.map((l) => l.slice(9)) ?? [];
        const pathsBefore = worktreePaths();
        const namesBefore = await textsOf(wd, ".sb-ws-name");
        // Observe the real opener call behind "View logs" (see openInitLog).
        await wd.execute("window.__OC_E2E_OPENED_LOGS__ = [];", []);
        const toastState = () =>
          wd.execute(
            `const t = [...document.querySelectorAll('.toast.toast-error')].find((e) => e.querySelector('.toast-message')?.textContent.includes(arguments[0]));
             return t ? { message: t.querySelector('.toast-message').textContent.trim(), buttons: [...t.querySelectorAll('button.btn')].map((b) => b.textContent.trim()) } : null;`,
            [MESSAGE],
          );
        if (await toastState()) throw new Error("the initialization-issue toast is already showing");

        const [add] = await wd.findAll('.sb-repo-add[aria-label="Create workspace in e2e-demo"]');
        if (!add) throw new Error("no Create workspace button for e2e-demo");
        await wd.click(add);
        const [submit] = await wd.waitFor("the Create workspace dialog", () => wd.findAll('form.create-ws button[type="submit"]').then((ids) => ids.length && ids));
        await wd.click(submit);

        // The workspace is created despite the failing hook. The sidebar lists
        // the pending row before `git worktree add` runs, so wait for git itself.
        const errorToasts = () => wd.execute("return [...document.querySelectorAll('.toast.toast-error .toast-message')].map((e) => e.textContent.trim());", []);
        let created;
        try {
          created = await wd.waitFor("a new git worktree", async () => worktreePaths().find((p) => !pathsBefore.includes(p)) ?? null, 60000);
        } catch (e) {
          throw new Error(`${e?.message ?? e}; error toasts: ${JSON.stringify(await errorToasts().catch(() => null))}`);
        }
        await wd.waitFor("one more sidebar workspace", async () => (await textsOf(wd, ".sb-ws-name")).length === namesBefore.length + 1, 60000);

        const toast = await wd.waitFor("the initialization-issue toast", toastState, 30000);
        if (!toast.buttons.includes("View logs")) throw new Error(`toast buttons ${JSON.stringify(toast.buttons)}, want "View logs"`);
        // Error toasts dismiss themselves after 8 s; this one stays.
        await new Promise((r) => setTimeout(r, 9500));
        if (!(await toastState())) throw new Error("the initialization-issue toast dismissed itself; it should stay until dismissed");
        const out = resolve(process.env.E2E_OUT ?? "e2e-artifacts");
        await wd.screenshot().then((png) => writeFileSync(join(out, "create-workspace-init-issue-toast.png"), png)).catch((e) => console.log(`no toast screenshot: ${e?.message ?? e}`));

        // conductor.db: the row is ready and holds the log path and tracked-file count.
        const real = realpathSync(created);
        const rows = await wd.execute("return window.__TAURI_INTERNALS__.invoke('db_list_workspaces');", []);
        const row = rows.find((r) => r.workspacePath && existsSync(r.workspacePath) && realpathSync(r.workspacePath) === real);
        if (!row) throw new Error(`no db_list_workspaces row for ${created}: ${JSON.stringify(rows.map((r) => r.workspacePath))}`);
        if (row.state !== "ready") throw new Error(`row state ${row.state}, want ready`);
        const logPath = row.initializationLogPath;
        if (!logPath || !/\/conductor-\d+-[a-z0-9]+\.log$/.test(logPath)) throw new Error(`initializationLogPath ${JSON.stringify(logPath)}, want $TMPDIR/conductor-<ms>-<rand>.log`);
        const tracked = git(created, "ls-files").toString().split("\n").filter(Boolean).length;
        if (row.initializationFilesCopied !== tracked) throw new Error(`initializationFilesCopied ${row.initializationFilesCopied}, want ${tracked} (git ls-files)`);

        // The log holds the `git worktree add` output and the hook's stderr. No
        // "--- Additional Output ---" block: the wrapper's own output all went into the log (Jfe).
        if (!existsSync(logPath)) throw new Error(`${logPath} does not exist`);
        const log = readFileSync(logPath, "utf8");
        if (log.includes("--- Additional Output ---")) throw new Error(`${logPath} has an Additional Output block, but the wrapper printed nothing of its own:\n${log}`);
        for (const want of ["Preparing worktree", MARKER]) {
          if (!log.includes(want)) throw new Error(`${logPath} lacks ${JSON.stringify(want)}:\n${log}`);
        }

        // View logs calls the opener on that file (allowed by the opener:allow-open-path scope) and dismisses the toast.
        await clickByText(wd, ".toast.toast-error button.btn", "View logs");
        const opened = await wd.waitFor("the opener call", () => wd.execute("return window.__OC_E2E_OPENED_LOGS__?.length ? window.__OC_E2E_OPENED_LOGS__ : null;", []));
        if (opened.length !== 1 || opened[0].path !== logPath) throw new Error(`opened ${JSON.stringify(opened)}, want [{ path: ${JSON.stringify(logPath)} }]`);
        // No default app on a headless runner is fine; a scope refusal is not.
        if (opened[0].error && /not allowed|forbidden|denied|scope/i.test(opened[0].error)) throw new Error(`the opener refused ${logPath}: ${opened[0].error}`);
        if (opened[0].error) console.log(`View logs: the opener ran but could not open ${logPath} here: ${opened[0].error}`);
        await wd.waitFor("the toast to close after View logs", async () => !(await toastState()));
      } finally {
        rmSync(hook, { force: true });
      }
    },
  },
];
