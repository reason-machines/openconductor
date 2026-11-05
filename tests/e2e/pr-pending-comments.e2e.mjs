// End-to-end check of the PR header's "changes requested" state: with no
// unsent diff comment it is a plain status; a pending comment turns it into
// "Add all comments to chat" (Conductor's `hasPendingComments`), which puts
// the comment into the chat composer and goes back to the status once the
// comment is sent. The PR demo scenario "changes" is a PR with changes
// requested. Run after `npm run build`:
//
//   node --test tests/e2e/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

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

const ROW = '[data-testid="left-sidebar-workspace-item"]';

test("changes requested offers Add all comments to chat only while a diff comment is unsent", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("openconductor.pr.demo", "changes"));
  await page.goto(`${base}/?demo=1`);
  await page.locator(ROW).first().waitFor();
  await page.locator(ROW).nth(1).click();

  const header = page.locator("header");
  await header.getByRole("button", { name: "Changes requested" }).waitFor();
  assert.equal(await header.getByRole("button", { name: "Add all comments to chat" }).count(), 0);

  // Comment on line 2 of a changed file.
  await page.locator("button.oc-change", { hasText: "src/server/ready.ts" }).click();
  await page.getByText('return new Response("ready");').waitFor();
  const line = page.getByText('return new Response("ready");');
  const box = await line.boundingBox();
  await page.mouse.click(box.x - 18, box.y + box.height / 2);
  const note = page.getByPlaceholder(/^Leave a comment/);
  await note.fill("Return 204 here, the reviewer asked for no body.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  const add = header.getByRole("button", { name: "Add all comments to chat" });
  await add.waitFor();
  if (process.env.SHOTS_DIR) {
    mkdirSync(process.env.SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/pr-pending-comments.png` });
  }
  await add.click();

  // The comment reaches the workspace chat as an attachment carrying its comment id (#378), not composer text.
  const chip = page.locator(".composer-attachment", { hasText: "ready.ts +2" });
  await chip.waitFor();
  assert.match((await chip.getAttribute("title")) ?? "", /File: src\/server\/ready\.ts[\s\S]*Return 204 here/);
  await header.getByRole("button", { name: "Changes requested" }).waitFor();
  assert.equal(await add.count(), 0);
  await page.close();
});
