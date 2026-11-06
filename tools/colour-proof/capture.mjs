// Colour-system proof: captures the workspace view of OpenConductor's Vite
// build in every colour palette x light/dark, then samples screenshot pixels
// of the chrome that must carry no hue in Neutral (tab underline, Run button,
// user bubble, right panel and sidebar backgrounds).
//
//   npx vite build --outDir /tmp/oc-dist
//   DIST=/tmp/oc-dist node tools/colour-proof/capture.mjs
//
// Env: PALETTES (comma list, default all five), SCHEMES (default light,dark),
// TOLERANCE (max channel spread counted as achromatic, default 3), OUT (sub
// folder, default "palettes"). The palette name "baseline" sets no palette,
// which captures a build without the palette setting as it ships.
// Writes evidence/colour-proof/<OUT>/<palette>--<scheme>.png and samples.json.
// Chromium needs a short TMPDIR (its socket path limit), e.g. TMPDIR=/tmp/cp.
// Pixels come from the PNG that is saved, read back through a canvas, so the
// numbers describe the published image, not computed styles.
//
// Seed data is synthetic (one repo, one workspace, one prompt), injected into
// localStorage before the app boots. Verifier tooling only, no feature code.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.resolve(process.env.DIST ?? path.join(repoRoot, "dist"));
const outDir = path.join(repoRoot, "evidence/colour-proof", process.env.OUT ?? "palettes");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4417);
const PALETTES = (process.env.PALETTES ?? "neutral,stone,blue,slate,zinc").split(",");
const SCHEMES = (process.env.SCHEMES ?? "light,dark").split(",");
const TOLERANCE = Number(process.env.TOLERANCE ?? 3);

const SEED = {
  repos: [
    {
      id: "r1",
      name: "tide-web",
      path: "/Users/ada/src/tide-web",
      defaultBranch: "main",
      workspaces: [
        { id: "w1", name: "lisbon", branch: "ada/fix-login-redirect", status: "needs-review", diff: { added: 15, removed: 1 }, createdAt: 1762300000000, path: "/Users/ada/conductor/workspaces/tide-web/lisbon" },
      ],
    },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
  sidebarVisible: true,
};
const PROMPT = "Signed-in users with an expired session loop between the login page and the dashboard. Find out why and fix it.";

// How a palette is chosen at runtime. The palette setting writes
// `data-palette` on <html> through the app's settings; the harness sets the
// stored setting before boot and the attribute after boot, so the shot shows
// the palette whether or not the settings layer has loaded yet.
const PALETTE_ATTR = process.env.PALETTE_ATTR ?? "data-palette";
const PALETTE_STORAGE_KEY = process.env.PALETTE_STORAGE_KEY ?? "";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
fs.mkdirSync(outDir, { recursive: true });

// Sample points, found in the DOM of the rendered page. Each returns the CSS
// pixel to read and the element it belongs to.
function locate() {
  const box = (el) => el && el.getBoundingClientRect();
  const out = {};
  const tab = document.querySelector(".main-tabs button.active, .main-tabs [role=tab][aria-selected=true]");
  if (tab) { const b = box(tab); out.tab_underline = { x: Math.round(b.left + b.width / 2), y: Math.round(b.bottom - 1), el: ".main-tabs active tab, bottom border" }; }
  const run = [...document.querySelectorAll(".scripts button, button.btn-primary")].find((b) => b.getAttribute("role") !== "tab" && /\bRun\b/.test(b.textContent || ""));
  if (run) { const b = box(run); out.run_button = { x: Math.round(b.left + 3), y: Math.round(b.top + b.height / 2), el: "Run button, left padding" }; }
  const bubble = document.querySelector(".oc-bubble");
  if (bubble) { const b = box(bubble); out.user_bubble = { x: Math.round(b.left + 6), y: Math.round(b.top + 6), el: ".oc-bubble, top-left padding" }; }
  const scripts = document.querySelector(".scripts");
  if (scripts) { const b = box(scripts); out.panel_bg = { x: Math.round(b.left + b.width / 2), y: Math.round(b.top - 60), el: "right panel, empty area above .scripts" }; }
  const side = document.querySelector("aside.sidebar");
  if (side) { const b = box(side); out.sidebar_bg = { x: Math.round(b.left + b.width / 2), y: Math.round(b.bottom - 120), el: "aside.sidebar, empty area" }; }
  for (const v of Object.values(out)) {
    let el = document.elementFromPoint(v.x, v.y);
    v.hit = el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}` : null;
  }
  out._root = { theme: document.documentElement.getAttribute("data-theme"), palette: document.documentElement.getAttribute(window.__PALETTE_ATTR__) };
  return out;
}

async function readPixels(page, png, points) {
  return page.evaluate(
    async ({ b64, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const res = {};
      for (const [k, p] of Object.entries(points)) {
        const [r, g, b] = ctx.getImageData(p.x, p.y, 1, 1).data;
        res[k] = [r, g, b];
      }
      return res;
    },
    { b64: png.toString("base64"), points },
  );
}

const hex = ([r, g, b]) => "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
const results = [];
for (const palette of PALETTES) {
  for (const scheme of SCHEMES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme, locale: "en-US", timezoneId: "UTC" });
    await context.addInitScript(
      ({ seed, palette, attr, key }) => {
        window.__PALETTE_ATTR__ = attr;
        localStorage.setItem("openconductor.shell.v1", JSON.stringify(seed));
        if (key) localStorage.setItem(key, JSON.stringify(palette));
      },
      { seed: SEED, palette, attr: PALETTE_ATTR, key: PALETTE_STORAGE_KEY },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector(".composer textarea", { timeout: 15000 });
    await page.fill(".composer textarea", PROMPT);
    await page.press(".composer textarea", "Enter");
    await page.waitForSelector(".oc-bubble", { timeout: 10000 });
    if (palette !== "baseline") await page.evaluate(({ attr, palette }) => document.documentElement.setAttribute(attr, palette), { attr: PALETTE_ATTR, palette });
    // Pin data-theme to the emulated scheme, as the appearance setting does.
    if (process.env.SET_THEME) await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await page.mouse.move(0, 899);
    await page.waitForTimeout(1200);
    const points = await page.evaluate(locate);
    const root = points._root;
    delete points._root;
    const png = await page.screenshot({ type: "png" });
    const name = `${palette}--${scheme}`;
    fs.writeFileSync(path.join(outDir, `${name}.png`), png);
    const px = await readPixels(page, png, points);
    const samples = {};
    for (const [k, rgb] of Object.entries(px)) {
      const spread = Math.max(...rgb) - Math.min(...rgb);
      samples[k] = { rgb, hex: hex(rgb), spread, achromatic: spread <= TOLERANCE, at: [points[k].x, points[k].y], element: points[k].el, hit: points[k].hit };
    }
    const missing = ["tab_underline", "run_button", "user_bubble", "panel_bg", "sidebar_bg"].filter((k) => !samples[k]);
    results.push({ palette, scheme, file: `${name}.png`, root, samples, missing, page_errors: errors });
    console.log(name, JSON.stringify(Object.fromEntries(Object.entries(samples).map(([k, s]) => [k, `${s.hex} d${s.spread}`]))), missing.length ? `missing ${missing}` : "");
    await context.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(
  path.join(outDir, "samples.json"),
  JSON.stringify({ tool: "playwright-core + system Chromium, 1440x900, scale 1, sRGB, en-US, UTC", tolerance: TOLERANCE, palette_attr: PALETTE_ATTR, results }, null, 2) + "\n",
);
