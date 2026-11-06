// ⌘⇧L (git.pull) and the "Pull latest from <target>" button it shares with
// the Changes panel, with real key presses against the built frontend and a
// fake Tauri backend. Conductor's rules: src/features/pr/pullLatest.ts (REA,
// renderApp `Wds` / `Y4s`, index `aNt`). Run after `npm run build`:
//
//   node --test tests/e2e/shortcuts-git-pull.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, WT, fakeBackend } from "./right-panel-fixture.mjs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

/**
 * On top of the right-panel fake: a clean branch with no changes whose target
 * (origin/main) is `behind` commits ahead of it, no PR, and a
 * `pr_pull_latest_from_target` that records its arguments, waits for
 * `window.__pull.release()` when `hold` is set, then answers `outcome`.
 */
function pullBackend({ behind, outcome, hold }) {
  const inner = window.__TAURI_INTERNALS__.invoke;
  let release;
  window.__pull = { behind, calls: [], release: () => release?.() };
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    switch (cmd) {
      case "diff_workspace":
        return { files: [] };
      case "pr_git_state":
        return {
          hasUncommitted: false,
          hasChanges: false,
          hasRemote: true,
          canCreatePr: true,
          remote: "origin",
          upstream: { branchExists: true, diverged: false, ahead: 0, behind: 0 },
          targetBehind: window.__pull.behind,
          detached: false,
        };
      case "pr_lookup":
        return [{ lookup: { kind: "none" }, derivedStatus: "in-progress" }];
      case "pr_header_state":
        return { tone: "no_pr", action: { type: "create_pr" } };
      case "pr_sync_workspace":
        return { statusChanged: false, metadataChanged: false };
      case "pr_pull_latest_from_target":
        window.__pull.calls.push(args);
        if (hold) await new Promise((r) => (release = r));
        if (outcome.kind === "pulled") window.__pull.behind = 0;
        return outcome;
      default:
        return inner(cmd, args);
    }
  };
}

async function open({ behind = 3, outcome = { kind: "pulled" }, hold = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
  await page.addInitScript(pullBackend, { behind, outcome, hold });
  await page.goto(base + "/");
  await page.locator(".main-tabs").waitFor();
  // The git state has loaded once the Changes panel's empty state is up.
  await page.getByText("No changes on this branch yet.").waitFor();
  await page.waitForFunction(() => window.__TAURI_INTERNALS__ && window.__pull, null, { timeout: 3000 });
  return { context, page, errors };
}

/** Press `key` with nothing focused, as after clicking empty space. */
async function press(page, key) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press(key);
}

const calls = (page) => page.evaluate(() => window.__pull.calls);
const toast = (page, text) => page.locator(".toast", { hasText: text });

test("⌘⇧L pulls the target into the workspace branch and says so (git.pull)", async () => {
  const { context, page, errors } = await open();
  const button = page.getByRole("button", { name: "Pull latest from main (3 commits)" });
  await button.waitFor();
  await press(page, "Meta+Shift+l");
  await toast(page, "Pulled latest changes. You're up to date!").waitFor();
  assert.deepEqual(await calls(page), [{ workspacePath: WT, remoteName: "origin", targetBranch: "main" }]);
  // Re-read afterwards: the target has nothing new, so the button goes away.
  await button.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘⇧L does nothing when the target has no new commits (git.pull)", async () => {
  const { context, page, errors } = await open({ behind: 0 });
  await press(page, "Meta+Shift+l");
  await page.waitForTimeout(300);
  assert.deepEqual(await calls(page), []);
  assert.equal(await page.locator(".oc-pull-latest").count(), 0);
  assert.equal(await page.locator(".toast").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the button shows Pulling latest... while it runs, and ⌘⇧L does not start a second pull", async () => {
  const { context, page, errors } = await open({ hold: true });
  await page.getByRole("button", { name: "Pull latest from main (3 commits)" }).click();
  const busy = page.getByRole("button", { name: "Pulling latest..." });
  await busy.waitFor();
  assert.equal(await busy.isDisabled(), true);
  await press(page, "Meta+Shift+l");
  await page.waitForTimeout(200);
  assert.equal((await calls(page)).length, 1);
  await page.evaluate(() => window.__pull.release());
  await toast(page, "Pulled latest changes. You're up to date!").waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("a failed pull shows the reference's error toast", async () => {
  const { context, page, errors } = await open({ outcome: { kind: "targetMissing" } });
  await press(page, "Meta+Shift+l");
  await toast(page, "Target branch main does not exist").waitFor();
  assert.equal((await calls(page)).length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});
