// Flows run in order against one app session. Each throws on failure.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export const flows = [
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
];
