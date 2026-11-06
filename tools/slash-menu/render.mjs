// Renders the DOM and CSS the in-app driver saved from the real OpenConductor
// window (tools/slash-menu/e2e-driver.js, `slash-dom-<agent>-<state>.json`)
// to PNGs in Chromium at the window's size. Scripts are dropped, so the image
// is the window's state at capture time; assets (fonts, icons) come from the
// app's own Vite build.
//
//   npx vite build
//   TMPDIR=/tmp/t node tools/slash-menu/render.mjs <dir with slash-dom-*.json> [out dir]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../../dist");
const src = path.resolve(process.argv[2] ?? ".");
const out = path.resolve(process.argv[3] ?? src);
fs.mkdirSync(out, { recursive: true });
const MIME = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png", ".css": "text/css", ".html": "text/html" };

const pages = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (pages.has(url.pathname)) return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(pages.get(url.pathname));
  const file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const f of fs.readdirSync(src).filter((n) => /^slash-dom-.*\.json$/.test(n)).sort()) {
    const dom = JSON.parse(fs.readFileSync(path.join(src, f), "utf8"));
    const css = dom.css.join("\n").replaceAll("tauri://localhost", origin);
    const html = dom.html
      .replaceAll("tauri://localhost", origin)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, "")
      .replace("</head>", `<style>${css}</style></head>`);
    const name = `/${f.replace(/\.json$/, "")}.html`;
    pages.set(name, html);
    const page = await browser.newPage({ viewport: { width: dom.viewport.width, height: dom.viewport.height }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
    await page.goto(origin + name, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Keep the open menu's scroll position at the top, as the window showed it.
    const png = path.join(out, f.replace(/^slash-dom-/, "openconductor-").replace(/\.json$/, ".png"));
    await page.screenshot({ path: png });
    console.log(png);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
