// Flows run in order against one app session. Each throws on failure.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
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
      const worktrees = () => (git(ctx.repo, "worktree", "list", "--porcelain").toString().match(/^worktree /gm) ?? []).length;
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
    },
  },
];
