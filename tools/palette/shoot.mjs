// Screenshots of the workspace view in every color palette, light and dark,
// from the built app served with the sidebar seed (tools/sidebar-screens).
//
//   npm run build && node tools/palette/shoot.mjs [outDir]
//
// Writes <outDir>/<palette>-<mode>.png and <outDir>/rects.json (element boxes
// used by check-neutral-pixels.py). Chromium: $CHROMIUM or /usr/bin/chromium.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(repoRoot, ".oc-tmp/palette"));
const PORT = Number(process.env.PORT ?? 4331);
const PALETTES = ["neutral", "stone", "blue", "slate", "zinc"];
const MODES = ["light", "dark"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(outDir, { recursive: true });
const server = spawn(process.execPath, [path.join(repoRoot, "tools/sidebar-screens/server.mjs")], {
  env: { ...process.env, PORT: String(PORT), DIST: path.join(repoRoot, "dist") },
  stdio: "inherit",
});
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const rects = {};
  for (const mode of MODES) {
    for (const palette of PALETTES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: mode });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`http://localhost:${PORT}/?oc_scenario=populated&oc_theme=${mode}`, { waitUntil: "load" });
      await page.waitForSelector(".sidebar", { timeout: 15000 });
      // Open a workspace: expand its repository, then select a workspace row.
      await page.getByText("tide-web", { exact: true }).first().click().catch(() => {});
      await sleep(400);
      await page.getByText("Ada/dark mode tokens", { exact: true }).first().click().catch(() => {});
      await sleep(900);
      // Send a message so a user bubble is in the transcript (the browser build adds it optimistically).
      const composer = page.locator("textarea").first();
      await composer.fill("Palette check").catch(() => {});
      await page.keyboard.press("Enter").catch(() => {});
      await sleep(700);
      // Set the palette and mode the way applyAppearance does, then let CSS settle.
      await page.evaluate(([p, m]) => {
        const root = document.documentElement;
        root.dataset.colorPalette = p;
        root.dataset.theme = m;
      }, [palette, mode]);
      await sleep(400);
      const key = `${palette}-${mode}`;
      await page.screenshot({ path: path.join(outDir, `${key}.png`) });
      // Sample points (CSS px, device scale 1) inside each surface, clear of text.
      rects[key] = await page.evaluate(() => {
        const at = (el, dx, dy) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + (dx < 0 ? r.width + dx : dx)), y: Math.round(r.y + (dy < 0 ? r.height + dy : dy)) };
        };
        const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().endsWith(text));
        const pts = {};
        const tab = document.querySelector(".tabs button.active, .main-tab.active");
        if (tab) pts.tabUnderline = at(tab, tab.getBoundingClientRect().width / 2, -1);
        const run = byText("button.btn-primary", "Run");
        if (run) pts.runButton = at(run, 4, run.getBoundingClientRect().height / 2);
        const pr = byText("button.btn-primary", "Create PR");
        if (pr) pts.createPrButton = at(pr, 4, pr.getBoundingClientRect().height / 2);
        const bubble = document.querySelector(".oc-bubble");
        if (bubble) pts.userBubble = at(bubble, 6, bubble.getBoundingClientRect().height / 2);
        const panel = document.querySelector(".ws-right");
        if (panel) pts.panel = at(panel, panel.getBoundingClientRect().width / 2, 300);
        const sidebar = document.querySelector(".sidebar");
        if (sidebar) pts.sidebar = at(sidebar, sidebar.getBoundingClientRect().width / 2, 560);
        const composer = document.querySelector(".composer.oc-composer");
        if (composer) pts.composer = at(composer, -14, -14);
        return pts;
      });
      rects[key].errors = errors;
      console.log(key, errors.length ? `errors: ${errors.join("; ").slice(0, 200)}` : "ok");
      await page.close();
    }
  }
  fs.writeFileSync(path.join(outDir, "rects.json"), JSON.stringify(rects, null, 2));
  await browser.close();
} finally {
  server.kill();
}
