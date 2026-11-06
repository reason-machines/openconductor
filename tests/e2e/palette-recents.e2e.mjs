// The command palette's "Recent workspaces" survive a reload (Conductor keeps
// `recentWorkspaceIds` in its persisted `workspace-tab-state-v2` store, at most
// 5, most recent first). Serves dist/ with `vite preview` and drives it with
// the machine's Chrome or Chromium through playwright-core. Run after
// `npm run build`: node --test tests/e2e/palette-recents.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
  .filter(Boolean)
  .find((p) => existsSync(p));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, "no Chrome or Chromium found; set CHROME_PATH");
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

test("recent workspaces persist across a reload, most recent first", async () => {
  const context = await browser.newContext();
  // Past the first-run onboarding, with one project of four workspaces in the
  // browser shell's saved state (seeded once, so the reload keeps the app's own).
  await context.addInitScript(() => {
    localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
    if (localStorage.getItem("openconductor.shell.v1")) return;
    const ws = (id, name) => ({ id, name, branch: name, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1 });
    const repos = [{ id: "r1", name: "web", path: "/code/web", defaultBranch: "main", workspaces: [ws("w1", "alpha"), ws("w2", "bravo"), ws("w3", "charlie"), ws("w4", "delta")] }];
    localStorage.setItem("openconductor.shell.v1", JSON.stringify({ repos, selection: { kind: "home" } }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(base + "/");
  await page.waitForSelector(".app");

  const recents = async () => {
    await page.locator("body").press("Meta+k");
    const group = page.getByRole("dialog", { name: "Command palette" }).getByRole("group", { name: "Recent workspaces" });
    await group.waitFor();
    const titles = await group.locator(".palette-title").allTextContents();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "detached" });
    return titles.map((t) => t.trim());
  };

  // Visit the first three workspaces with ⌘1..⌘3, then the first again.
  const visited = [];
  for (const n of [1, 2, 3, 1]) {
    await page.locator("body").press(`Meta+${n}`);
    const name = await page.locator(".ws-header .ws-title strong").textContent({ timeout: 5000 });
    visited.push(name.trim());
  }
  const [a, b, c] = visited;
  assert.equal(new Set([a, b, c]).size, 3, `expected three distinct workspaces, visited ${JSON.stringify(visited)}`);
  // Rows show the sidebar's display name (Conductor's `SUi`): here the branch, which is the name, capitalised.
  const label = (name) => name.charAt(0).toUpperCase() + name.slice(1);
  const want = [a, c, b].map(label);
  assert.deepEqual((await recents()).slice(0, 3), want);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("workspace-tab-state-v2") ?? "null"));
  assert.equal(stored?.state?.recentWorkspaceIds?.length, 3);

  // A reload starts a new React tree: the list comes back from storage.
  await page.reload();
  await page.waitForSelector(".app");
  // The saved selection (a) is recorded again, which keeps the order; then ⌘2.
  await page.locator("body").press("Meta+2");
  assert.equal((await page.locator(".ws-header .ws-title strong").textContent({ timeout: 5000 })).trim(), b);
  assert.deepEqual(await recents(), [b, a, c].map(label));

  assert.deepEqual(errors, []);
  await context.close();
});
