// End-to-end check of the first-run onboarding in a real browser, on the
// production build served by `vite preview` (the browser build keeps the step
// in localStorage; the desktop app keeps it in conductor.db). Run after
// `npm run build`:
//
//   node --test tests/e2e/first-run.e2e.mjs
//
// E2E_OUT, when set, receives screenshots. CHROME_PATH points at the browser
// when it is not in a standard place.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
const STEP_KEY = "openconductor.firstRunOnboardingStep";
const OUT = process.env.E2E_OUT;

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  if (OUT) mkdirSync(OUT, { recursive: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

async function open(path, { colorScheme = "dark", init } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(base + path);
  return { page, context, errors };
}

const shot = (page, name) => (OUT ? page.screenshot({ path: join(OUT, `${name}.png`) }) : undefined);
const slideTitles = (page) => page.locator(".onb-slide-title").allTextContents();

test("a first launch with no repositories shows the onboarding; Continue finishes it and opens Home", async () => {
  const { page, context, errors } = await open("/");
  await page.locator(".onb").waitFor();
  assert.deepEqual(await slideTitles(page), [
    "Get coding agents working in parallel",
    "See at a glance what each agent is working on",
    "Review changes and create PRs",
  ]);
  assert.equal(await page.locator(".app").count(), 0, "the app shell waits behind the onboarding");
  assert.equal(await page.locator(".onb-exit").count(), 0, "no Exit button outside the route");
  // The first slide is selected; ArrowDown (onboarding.nextSlide) moves on and clicks select.
  assert.equal(await page.locator(".onb-slide.active .onb-slide-title").textContent(), "Get coding agents working in parallel");
  await shot(page, "first-run--dark");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.locator(".onb-slide.active .onb-slide-title").textContent(), "See at a glance what each agent is working on");
  await page.locator(".onb-slide", { hasText: "Review changes and create PRs" }).click();
  assert.equal(await page.locator(".onb-slide.active .onb-slide-title").textContent(), "Review changes and create PRs");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator(".home").waitFor();
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), STEP_KEY), "999");
  assert.equal(new URL(page.url()).pathname, "/");

  // Finished stays finished across a reload, even with no repositories.
  await page.reload();
  await page.locator(".home").waitFor();
  assert.equal(await page.locator(".onb").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("Enter (onboarding.continue) finishes the onboarding", async () => {
  const { page, context } = await open("/");
  await page.locator(".onb").waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".home").waitFor();
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), STEP_KEY), "999");
  await context.close();
});

test("a user who already has repositories goes straight to the app", async () => {
  const seed = () => {
    localStorage.setItem(
      "openconductor.shell.v1",
      JSON.stringify({ repos: [{ id: "r1", name: "tide-web", path: "/Users/demo/code/tide-web", defaultBranch: "main", workspaces: [] }], selection: { kind: "home" } }),
    );
  };
  const { page, context } = await open("/", { init: seed });
  await page.locator(".app").waitFor();
  assert.equal(await page.locator(".onb").count(), 0);
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), STEP_KEY), null, "the step is left unset");
  await context.close();
});

test("/first-run-onboarding replays the onboarding after it is done; Exit onboarding goes Home", async () => {
  const done = () => localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
  const { page, context, errors } = await open("/first-run-onboarding", { init: done, colorScheme: "light" });
  await page.locator(".onb").waitFor();
  const exit = page.getByRole("button", { name: "Exit onboarding" });
  await exit.waitFor();
  await shot(page, "first-run-route--light");
  await exit.click();
  await page.locator(".home").waitFor();
  assert.equal(new URL(page.url()).pathname, "/");
  assert.deepEqual(errors, []);
  await context.close();
});
