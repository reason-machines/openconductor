// Drives the browser build's sidebar add-repository menu and resize rail with real
// pointer and key events (headless Chromium through playwright-core), checks what
// Conductor 0.87.6 does (PR #423), and writes screenshots.
//
//   npm run build && node tools/sidebar-screens/drive-add-menu-resize.mjs [OUT_DIR]
//
// No server: requests to http://oc.test/ are answered from dist/ by request
// interception, with seed.js injected before the app's scripts (as server.mjs does).
// Exits non-zero on the first failed check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../../dist");
const outDir = path.resolve(process.argv[2] ?? path.join(here, "../../.oc-tmp/add-menu-resize"));
const seed = fs.readFileSync(path.join(here, "seed.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", locale: "en-US", timezoneId: "UTC" });
await context.route("http://oc.test/**", (route) => {
  const url = new URL(route.request().url());
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head><script>${seed}</script>`));
  return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? "application/octet-stream", body });
});
const page = await context.newPage();
await page.goto("http://oc.test/?oc_scenario=populated&oc_theme=dark");
await page.waitForSelector("aside.sidebar");
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const sidebarWidth = () => page.$eval("aside.sidebar", (el) => Math.round(el.getBoundingClientRect().width));
const rail = page.getByRole("separator", { name: "Resize sidebar" });
const menuItems = () => page.$$eval('.add-menu [role="menuitem"]', (els) => els.map((e) => e.textContent.trim()));

// --- Add-repository menu ---------------------------------------------------
// The list starts loading when the sidebar mounts (browser build: a 600 ms demo
// delay), so open the menu at once to see the loading row.
await page.keyboard.press("Meta+Alt+KeyA");
await page.waitForSelector(".add-menu");
check("Recents shows the spinner row while the first load runs", await page.locator(".add-menu-loading").isVisible());
await shot("01-add-menu-loading");
await page.waitForSelector(".add-menu-recent");
await page.keyboard.press("Escape");
const header = page.locator(".sb-section-header", { hasText: "My workspaces" });
await header.hover();
await page.getByRole("button", { name: "My workspaces actions" }).click();
await page.getByRole("menuitem", { name: "Add project…" }).click();
await page.waitForSelector(".add-menu-recent");
check("My workspaces › Add project… opens it with the list already loaded", (await page.locator(".add-menu-loading").count()) === 0);
const items = await menuItems();
check(
  "items in Conductor's order",
  JSON.stringify(items.slice(0, 3)) === JSON.stringify(["Open project", "Open GitHub project", "Quick start"]),
  items.join(" | "),
);
const label = await page.locator(".add-menu-label").textContent();
check('"Recents" heading, then recent folders with ~ for /Users/<name>', label === "Recents" && items.slice(3).every((t) => t.startsWith("~/")), items.slice(3).join(", "));
const box = await page.locator(".add-menu").boundingBox();
const anchor = await page.locator(".sb-add-menu-anchor").boundingBox();
check("popover 320px wide, right edge on the anchor 24px in from the header, 4px below", Math.round(box.width) === 320 && (Math.round(box.x + box.width) === Math.round(anchor.x) || Math.round(box.x) === 5) && Math.round(box.y) === Math.round(anchor.y) + 4, JSON.stringify({ box, anchor }));
const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim());
check("focus starts on Open project", (await focused()) === "Open project");
await page.keyboard.press("ArrowDown");
check("ArrowDown moves to Open GitHub project", (await focused()) === "Open GitHub project");
await page.keyboard.press("ArrowUp");
await page.keyboard.press("ArrowUp");
check("ArrowUp wraps to the last Recents row", (await focused()) === items[items.length - 1], await focused());
await shot("02-add-menu-recents");
await page.keyboard.press("Escape");
check("Escape closes the menu", (await page.locator(".add-menu").count()) === 0);

await page.keyboard.press("Meta+Alt+KeyA");
await page.waitForSelector(".add-menu", { timeout: 2000 }).catch(() => {});
check("⌥⌘A (nav.addRepository) opens it", (await page.locator(".add-menu").count()) === 1);
await page.mouse.click(1200, 600);
check("a click outside closes it", (await page.locator(".add-menu").count()) === 0);

await page.keyboard.press("Meta+Alt+KeyA");
await page.getByRole("menuitem", { name: "Open GitHub project" }).click();
const cloneOpen = await page.locator(".modal, [role=dialog]").first().isVisible().catch(() => false);
check("Open GitHub project opens the clone dialog and closes the menu", cloneOpen && (await page.locator(".add-menu").count()) === 0);
await shot("03-open-github-project");
await page.keyboard.press("Escape");

await page.keyboard.press("Meta+Alt+KeyA");
await page.getByRole("menuitem", { name: "Quick start" }).click();
const quickOpen = await page.locator(".modal, [role=dialog]").first().isVisible().catch(() => false);
check("Quick start opens the quick start dialog", quickOpen);
await page.keyboard.press("Escape");

await page.keyboard.press("Meta+Alt+KeyA");
await page.locator(".add-menu-recent").first().click();
const toast = await page.getByText("Open project needs the desktop app.").first().isVisible().catch(() => false);
check("a Recents row runs the Open project flow (browser build: the desktop-only notice)", toast && (await page.locator(".add-menu").count()) === 0);

// --- Resize rail -----------------------------------------------------------
check("default width 256, rail reports min 192 / max 480 / now 256",
  (await sidebarWidth()) === 256 && (await rail.getAttribute("aria-valuemin")) === "192" && (await rail.getAttribute("aria-valuemax")) === "480" && (await rail.getAttribute("aria-valuenow")) === "256");
const railBox = await rail.boundingBox();
check("rail is the sidebar's inner 4px edge", Math.round(railBox.x) === 252 && Math.round(railBox.width) === 4, JSON.stringify(railBox));
const y = 450;
const x0 = railBox.x + 2;
await page.mouse.move(x0, y);
await page.mouse.down();
await page.mouse.move(x0 + 50, y, { steps: 5 });
await page.mouse.move(x0 + 100, y, { steps: 5 });
check("drag previews the width", (await sidebarWidth()) === 356, String(await sidebarWidth()));
await shot("04-rail-dragging");
await page.mouse.up();
check("release keeps it (left_panel_width 356)", (await sidebarWidth()) === 356 && (await rail.getAttribute("aria-valuenow")) === "356");

const drag = async (dx) => {
  const b = await rail.boundingBox();
  await page.mouse.move(b.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(b.x + 2 + dx, y, { steps: 8 });
  await page.mouse.up();
};
await drag(400);
check("clamps at 480", (await sidebarWidth()) === 480, String(await sidebarWidth()));
await drag(-600);
check("clamps at 192, no collapse", (await sidebarWidth()) === 192 && (await page.locator("aside.sidebar").count()) === 1, String(await sidebarWidth()));

const b = await rail.boundingBox();
await page.mouse.dblclick(b.x + 2, y);
check("double-click resets to 256", (await sidebarWidth()) === 256 && (await rail.getAttribute("aria-valuenow")) === "256", String(await sidebarWidth()));
await shot("05-rail-reset");

await page.mouse.move(b.x + 2, y);
await page.mouse.down({ button: "right" });
await page.mouse.move(b.x + 120, y, { steps: 4 });
await page.mouse.up({ button: "right" });
check("secondary-button drag does nothing", (await sidebarWidth()) === 256);

await drag(300);
await page.setViewportSize({ width: 900, height: 900 });
check("the sidebar never exceeds 40% of the window (480 → 360 at 900px)", (await sidebarWidth()) === 360 && Math.round((await rail.boundingBox()).x) === 356, String(await sidebarWidth()));
await shot("06-rail-40-percent");
await page.setViewportSize({ width: 1440, height: 900 });

// --- Toggle ------------------------------------------------------------------
await page.keyboard.press("Meta+KeyB");
check("⌘B hides the sidebar and its rail", (await page.locator("aside.sidebar").count()) === 0 && (await rail.count()) === 0);
await shot("07-sidebar-hidden");
await page.keyboard.press("Meta+KeyB");
check("⌘B shows it again at the saved width", (await sidebarWidth()) === 480, String(await sidebarWidth()));

fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
await browser.close();
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed; screenshots in ${outDir}`);
