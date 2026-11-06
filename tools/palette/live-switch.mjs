// Drives Settings > Appearance > Color palette in the built app and checks that
// the switch applies live (no reload), persists (a reload keeps it) and reaches
// the surfaces (the sidebar background changes with the palette).
//
//   npm run build && TMPDIR=/tmp/pw node tools/palette/live-switch.mjs
//
// In the browser build, settings live in localStorage (src/settings/api.ts),
// so the stored value is checked there; in Tauri the same field is written to
// settings.toml through the appearance table.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const PORT = Number(process.env.PORT ?? 4332);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

const server = spawn(process.execPath, [path.join(repoRoot, "tools/sidebar-screens/server.mjs")], {
  env: { ...process.env, PORT: String(PORT), DIST: path.join(repoRoot, "dist") },
  stdio: "ignore",
});
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?oc_scenario=populated&oc_theme=light`, { waitUntil: "load" });
  await page.waitForSelector(".sidebar", { timeout: 15000 });
  // The resolved --sidebar token: every sidebar surface reads it, and Settings replaces the sidebar element.
  const sidebarBg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sidebar").trim());
  const palette = () => page.evaluate(() => document.documentElement.dataset.colorPalette ?? null);

  const before = { palette: await palette(), sidebar: await sidebarBg() };
  console.log("before:", before);
  if (before.palette !== null && before.palette !== "neutral") fail(`default palette is ${before.palette}`);

  await page.getByLabel("Settings").click();
  await page.getByText("Appearance", { exact: true }).first().click();
  await sleep(300);
  const select = page.getByLabel("Color palette");
  await select.waitFor({ timeout: 10000 });
  console.log("row present:", await select.count());
  if (process.env.SHOT_DIR) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(process.env.SHOT_DIR, { recursive: true });
    await select.scrollIntoViewIfNeeded();
    await sleep(200);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR, "appearance-color-palette.png") });
  }

  // Same window, no reload: a marker on window survives only without navigation.
  await page.evaluate(() => (window.__noReload = "still-here"));
  await select.selectOption("stone");
  await sleep(300);
  const afterStone = { palette: await palette(), sidebar: await sidebarBg() };
  console.log("after Stone:", afterStone);
  if (afterStone.palette !== "stone") fail(`root palette after switch is ${afterStone.palette}`);
  if (afterStone.sidebar === before.sidebar) fail("sidebar background did not change");
  if ((await page.evaluate(() => window.__noReload)) !== "still-here") fail("the page reloaded");

  await select.selectOption("zinc");
  await sleep(200);
  console.log("after Zinc:", { palette: await palette(), sidebar: await sidebarBg() });
  if ((await palette()) !== "zinc") fail("Zinc did not apply");

  // Dark mode with the Stone palette and low-contrast on: its own background.
  await page.getByLabel("Color palette").selectOption("stone");
  await sleep(200);
  const stored = await page.evaluate(() => localStorage.getItem("openconductor.settings.preview"));
  const storedPalette = stored ? JSON.parse(stored)?.appearance?.color_palette : undefined;
  console.log("stored color_palette:", storedPalette);
  if (storedPalette !== "stone") fail(`stored palette is ${storedPalette}`);

  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".sidebar, .settings", { timeout: 15000 });
  await sleep(300);
  const reloaded = await palette();
  console.log("after reload:", reloaded);
  if (reloaded !== "stone") fail(`palette after reload is ${reloaded}`);

  // Low-contrast dark mode on Stone: the palette's low-contrast values apply in dark only.
  const bgVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.lowContrast = "";
  });
  await sleep(150);
  const lc = await bgVar();
  console.log("stone, dark, low-contrast --background:", lc);
  if (lc !== "#1f1c1a") fail(`low-contrast Stone dark background is ${lc}`);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    delete document.documentElement.dataset.lowContrast;
  });
  await sleep(150);
  if ((await bgVar()) !== "#ffffff") fail("Stone light background is not #ffffff");

  // "System" (no data-theme) follows the OS: a dark-scheme context gets the dark values.
  const sys = await browser.newPage({ viewport: { width: 800, height: 600 }, colorScheme: "dark" });
  await sys.goto(`http://localhost:${PORT}/?oc_scenario=populated`, { waitUntil: "load" });
  await sys.waitForSelector(".sidebar", { timeout: 15000 });
  await sys.evaluate(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.dataset.colorPalette = "neutral";
  });
  await sleep(150);
  const sysBg = await sys.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
  console.log("system + OS dark, neutral --background:", sysBg);
  if (sysBg !== "#0a0a0a") fail(`system dark background is ${sysBg}`);
  await sys.close();

  if (errors.length) fail(`page errors: ${errors.join(" | ").slice(0, 300)}`);
  if (!process.exitCode) console.log("PASS: palette switches live, persists across reload, no page errors");
  await browser.close();
} finally {
  server.kill();
}
