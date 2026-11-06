// Colour-consistency proof for src/theme/tokens.css: screenshots of Home, a
// workspace, the New workspace dialog, Settings and a menu in one palette,
// light and dark, from the built app served with the sidebar seed
// (tools/sidebar-screens), and a pixel check that the sidebar, right panel,
// dialog header, user bubble, active tab and button backgrounds have no hue.
//
//   npm run build && node tools/palette/proof.mjs [outDir] [palette]
//
// Writes <outDir>/<palette>-<mode>-<screen>.png and <outDir>/pixels.json, and
// exits 1 when a Neutral sample has |R-G|, |G-B| or |R-B| above 2.
// Chromium: $CHROMIUM or /usr/bin/chromium.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(repoRoot, ".oc-tmp/palette-proof"));
const palette = process.argv[3] ?? "neutral";
const PORT = Number(process.env.PORT ?? 4333);
const TOLERANCE = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(outDir, { recursive: true });
const server = spawn(process.execPath, [path.join(repoRoot, "tools/sidebar-screens/server.mjs")], {
  env: { ...process.env, PORT: String(PORT), DIST: path.join(repoRoot, "dist") },
  stdio: "ignore",
});

/** A point inside an element, clear of its text: `dx`, `dy` from its left/top (negative: from right/bottom). */
async function pointIn(page, selector, dx, dy) {
  return page.evaluate(([sel, dx, dy]) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + (dx < 0 ? r.width + dx : dx)), y: Math.round(r.y + (dy < 0 ? r.height + dy : dy)), background: getComputedStyle(el).backgroundColor };
  }, [selector, dx, dy]);
}

/** RGB of screenshot pixels at the given points. */
async function readPixels(browser, png, points) {
  const page = await browser.newPage();
  const out = await page.evaluate(async ([b64, pts]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return pts.map((p) => [...ctx.getImageData(p.x, p.y, 1, 1).data.slice(0, 3)]);
  }, [png.toString("base64"), points]);
  await page.close();
  return out;
}

const results = { palette, samples: [], errors: [] };
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  for (const mode of ["light", "dark"]) {
    // The OS colour scheme drives dark mode, as Theme: System does in the app.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: mode });
    page.on("pageerror", (e) => results.errors.push(`${mode}: ${String(e).slice(0, 300)}`));
    await page.goto(`http://localhost:${PORT}/?oc_scenario=populated`, { waitUntil: "load" });
    await page.waitForSelector(".sidebar", { timeout: 15000 });
    await page.evaluate((p) => (document.documentElement.dataset.colorPalette = p), palette);
    await sleep(600);
    const shots = {};
    const shoot = async (screen) => {
      const file = path.join(outDir, `${palette}-${mode}-${screen}.png`);
      shots[screen] = await page.screenshot({ path: file });
    };
    const sample = async (screen, surface, selector, dx, dy) => {
      const p = await pointIn(page, selector, dx, dy);
      if (!p) return results.errors.push(`${mode} ${screen}: no ${surface} (${selector})`);
      results.samples.push({ mode, screen, surface, selector, ...p });
    };

    // Home.
    await page.locator(".sb-primary .sb-row", { hasText: "Home" }).first().click();
    await sleep(700);
    await shoot("home");
    await sample("home", "sidebar", ".sidebar", 128, -40);

    // A workspace with a sent message, so the transcript has a user bubble.
    await page.getByText("tide-web", { exact: true }).first().click().catch(() => {});
    await sleep(400);
    await page.getByText("Ada/dark mode tokens", { exact: true }).first().click();
    await sleep(900);
    await page.locator("textarea").first().fill("Palette check");
    await page.keyboard.press("Enter");
    await sleep(900);
    await shoot("workspace");
    await sample("workspace", "sidebar", ".sidebar", 128, -40);
    await sample("workspace", "panel", ".ws-right", 160, -120);
    await sample("workspace", "bubble", ".oc-bubble", 4, 4);
    await sample("workspace", "tab", ".rp-tab.active", 3, 3);
    await sample("workspace", "button", ".btn-primary", 3, 3);

    // A menu: the workspace row's context menu.
    await page.getByText("Ada/dark mode tokens", { exact: true }).first().click({ button: "right" });
    await sleep(500);
    await shoot("menu");
    await sample("menu", "menu", ".sb-ctx-menu", 3, -3);
    await page.keyboard.press("Escape");
    await sleep(300);

    // The New workspace dialog (Create, ⌘N).
    await page.locator(".sb-primary .sb-row", { hasText: "Create" }).first().click();
    await page.waitForSelector(".create-dialog", { timeout: 5000 });
    await sleep(600);
    await shoot("new-workspace");
    await sample("new-workspace", "dialog header", ".create-dialog", 24, 6);
    await page.keyboard.press("Escape");
    await sleep(400);

    // Settings > Appearance.
    await page.locator(".sb-computer").first().click();
    await sleep(300);
    const settingsItem = page.locator(".sb-account-menu button, .sb-account-menu [role=menuitem]", { hasText: "Settings" }).first();
    if (await settingsItem.count()) await settingsItem.click();
    else await page.keyboard.press("Control+Comma");
    await page.waitForSelector(".settings", { timeout: 5000 });
    await page.locator(".settings-nav .nav-item", { hasText: "Appearance" }).first().click().catch(() => {});
    await sleep(700);
    await shoot("settings");
    await sample("settings", "settings nav", ".settings .settings-nav", 6, -6);
    await page.close();

    const mine = results.samples.filter((s) => s.mode === mode);
    const rgbs = [];
    for (const screen of Object.keys(shots)) {
      const pts = mine.filter((s) => s.screen === screen);
      (await readPixels(browser, shots[screen], pts)).forEach((rgb, i) => (pts[i].rgb = rgb));
      rgbs.push(...pts);
    }
  }
  await browser.close();
} finally {
  server.kill();
}

let failed = 0;
for (const s of results.samples) {
  const [r, g, b] = s.rgb ?? [NaN, NaN, NaN];
  s.spread = Math.max(r, g, b) - Math.min(r, g, b);
  s.achromatic = s.spread <= TOLERANCE;
  if (palette === "neutral" && !s.achromatic) failed++;
  console.log(`${s.achromatic ? "PASS" : "HUE "} ${s.mode.padEnd(5)} ${s.screen.padEnd(13)} ${s.surface.padEnd(13)} rgb(${s.rgb?.join(", ")}) spread ${s.spread}  css ${s.background}`);
}
for (const e of results.errors) console.log(`ERROR ${e}`);
fs.writeFileSync(path.join(outDir, "pixels.json"), JSON.stringify(results, null, 2));
const ok = !results.errors.length && (palette !== "neutral" || failed === 0);
console.log(`\n${palette}: ${results.samples.length} samples, ${results.samples.filter((s) => !s.achromatic).length} with hue (tolerance ${TOLERANCE}), ${results.errors.length} errors: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
