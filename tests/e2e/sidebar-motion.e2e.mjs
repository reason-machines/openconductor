// End-to-end check of the sidebar's motion against Conductor v0.87.6's values
// (renderApp-D_fmY7hW.js / renderApp-BYEcFwvt.css, REA-extracted): rows rise in and
// collapse out over 200ms easeOut (`Qj`), menus open and close with opacity+scale over
// 100ms (`my`, data-[starting-style]/data-[ending-style]), ghost buttons press to 97%
// over 150ms ease-out (`tt`), repositories reorder with @hello-pangea/dnd and the lifted
// group gets shadow-md, toasts slide in and out over 400ms. In a real browser on the
// demo state (`?demo=1`). Run after `npm run build`:
//
//   node --test tests/e2e/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
const row = (scope, label) => scope.locator(ROW, { has: scope.locator(".sb-ws-name", { hasText: label }) });
const SHADOW_MD = "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px";

async function open(page) {
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
}

async function pin(page, label) {
  await row(page, label).click({ button: "right" });
  await page.getByRole("menu", { name: "Workspace actions" }).getByRole("menuitem", { name: "Pin" }).click();
}

test("rows: pinning rises the row into Pinned and collapses it out of its repo over 200ms", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await open(page);
  // The first pin mounts the Pinned group, whose list starts without an entrance
  // (AnimatePresence initial={false}, as Conductor's `Pia` returns null with no pins).
  const [first, second] = await page.locator(".sb-repo-groups .sb-ws-name").allTextContents();
  await pin(page, first);
  await page.locator('.sb-group[data-group="Pinned"]').waitFor();
  await page.waitForTimeout(400);
  const before = await page.locator(".sb-repo-groups .sb-ws-name").count();
  await pin(page, second);
  // Mid-flight: the new row is still fading in, the old one is still in its repo group.
  const mid = await page.evaluate((label) => {
    const entering = [...document.querySelectorAll('.sb-group[data-group="Pinned"] .sb-ws-motion')].find((el) => el.textContent.includes(label));
    return { opacity: Number(getComputedStyle(entering).opacity), leaving: document.querySelectorAll(".sb-repo-groups .sb-ws-name").length };
  }, second);
  assert.ok(mid.opacity < 1, `entering row opacity ${mid.opacity}`);
  await page.waitForTimeout(400);
  const done = await page.evaluate((label) => {
    const entering = [...document.querySelectorAll('.sb-group[data-group="Pinned"] .sb-ws-motion')].find((el) => el.textContent.includes(label));
    return { opacity: Number(getComputedStyle(entering).opacity), transform: getComputedStyle(entering).transform };
  }, second);
  assert.equal(done.opacity, 1);
  assert.ok(done.transform === "none" || done.transform === "matrix(1, 0, 0, 1, 0, 0)", done.transform);
  assert.equal(await row(page.locator(".sb-repo-groups"), second).count(), 0);
  assert.equal(mid.leaving, before, "the leaving row was still collapsing mid-flight");
  assert.equal(await page.locator(".sb-repo-groups .sb-ws-name").count(), before - 1);
  await page.close();
});

test("rows: with reduced motion they move at once (Conductor's `Qj` skips its wrapper)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await open(page);
  assert.equal(await page.locator(".sb-ws-motion").count(), 0);
  await page.close();
});

test("menus: 100ms opacity+scale in and out from the trigger's corner", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await open(page);
  await page.getByRole("button", { name: "My workspaces actions" }).click();
  const menu = page.locator(".sb-menu").first();
  await menu.waitFor();
  const opening = await menu.evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, duration: s.animationDuration, easing: s.animationTimingFunction };
  });
  assert.deepEqual(opening, { name: "sb-popup-in", duration: "0.1s", easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
  await page.keyboard.press("Escape");
  // Closing: still on screen with data-ending-style, out of the accessibility tree.
  const closing = await menu.evaluate((el) => ({ ending: el.hasAttribute("data-ending-style"), hidden: el.getAttribute("aria-hidden"), duration: getComputedStyle(el).transitionDuration }));
  assert.deepEqual(closing, { ending: true, hidden: "true", duration: "0.1s, 0.1s" });
  assert.equal(await page.getByRole("menu").count(), 0);
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".sb-menu").count(), 0);
  await page.close();
});

test("ghost buttons press to 97% over 150ms ease-out; the toggle eases its colour", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await open(page);
  const back = await page.locator(".sb-icon-btn").first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration, easing: s.transitionTimingFunction.match(/cubic-bezier\([^)]*\)/)?.[0] };
  });
  assert.equal(back.property, "transform, translate, scale, rotate");
  assert.equal(back.duration, "0.15s, 0.15s, 0.15s, 0.15s");
  assert.equal(back.easing, "cubic-bezier(0, 0, 0.2, 1)");
  const add = page.locator(".sb-repo-add").first();
  const box = await add.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  assert.equal(await add.evaluate((el) => getComputedStyle(el).scale), "0.97");
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const toggle = await page.locator(".sb-toggle").evaluate((el) => getComputedStyle(el).transition);
  assert.equal(toggle, "color 0.15s cubic-bezier(0, 0, 0.2, 1)");
  await page.close();
});

test("repositories reorder by drag; the lifted group is accent with shadow-md", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await open(page);
  const names = () => page.locator(".sb-repo-name").allTextContents();
  const before = await names();
  const header = page.locator(".sb-repo-header", { hasText: before[1] });
  const target = page.locator(".sb-repo-header", { hasText: before[0] });
  const from = await header.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + 40, from.y + from.height / 2 - ((from.y - to.y + 10) * i) / 10);
  const lifted = page.locator(".sb-repo-group[data-dragging]");
  await lifted.waitFor();
  const style = await lifted.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, radius: getComputedStyle(el).borderRadius }));
  assert.equal(style.shadow, SHADOW_MD);
  assert.equal(style.radius, "6px");
  await page.mouse.up();
  await page.waitForTimeout(700);
  assert.deepEqual((await names()).slice(0, 2), [before[1], before[0]]);
  await page.close();
});

test("toasts slide in and out over 400ms", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await open(page);
  await page.getByRole("button", { name: "My workspaces actions" }).click();
  await page.getByRole("menuitem", { name: "Add project…" }).click();
  await page.getByRole("menuitem", { name: /Open project/ }).click();
  const toast = page.locator(".toast").first();
  await toast.waitFor();
  const t = await toast.evaluate((el) => ({ name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration, transition: getComputedStyle(el).transition }));
  assert.deepEqual(t, { name: "toast-in", duration: "0.4s", transition: "transform 0.4s, opacity 0.4s" });
  await toast.getByRole("button", { name: "Dismiss" }).click();
  assert.equal(await toast.getAttribute("data-ending-style"), "");
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".toast").count(), 0);
  await page.close();
});
