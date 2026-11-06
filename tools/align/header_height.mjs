// Height check for the workspace header against the sidebar's top row.
// Serves the Vite build with the seed tools/align/header_actions.mjs uses,
// measures in Chromium, and writes crops of the window's top strip (sidebar +
// header) plus the measurements.
//
//   npx vite build && node tools/align/header_height.mjs <out-prefix>
//
// Conductor (REA-decoded renderApp-D_fmY7hW.js):
//   - workspace header `ACi`: "flex justify-between items-center pl-4 pr-2 py-2 h-10
//     border-b border-border", so 40px tall with its content centred at y=20;
//   - sidebar top row `Isa`: "flex h-8 items-center pt-2", toggle centred at y=20,
//     back/forward "absolute top-2" size-6, also centred at y=20.
// Passes when the header is 40px (border included), every breadcrumb, chip and
// button in it is centred on the header's middle, and that middle is the
// sidebar top row's centre line (sidebar toggle, back, forward).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(repoRoot, "dist");
const outPrefix = path.resolve(process.argv[2] ?? path.join(repoRoot, "parity/side-by-side/chat-diff-pr/alignment/header-height"));
const PORT = Number(process.env.PORT ?? 4392);

const seed = (sidebarVisible) => ({
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
  sidebarVisible,
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) {
    const s = seed(url.searchParams.get("sidebar") !== "0");
    const script = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(s))});</script>`;
    body = Buffer.from(body.toString().replace("<head>", `<head>${script}`));
  }
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const near = (a, b) => Math.abs(a - b) <= 0.5;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const report = {};
for (const theme of ["dark", "light"]) {
  for (const sidebar of [true, false]) {
    const key = `${theme}${sidebar ? "" : "-sidebar-hidden"}`;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, locale: "en-US", timezoneId: "UTC" });
    await page.goto(`http://127.0.0.1:${PORT}/?sidebar=${sidebar ? 1 : 0}`);
    await page.waitForSelector(".ws-header .ws-actions", { timeout: 15000 });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const box = (el) => {
        const b = el.getBoundingClientRect();
        return { top: +b.top.toFixed(2), height: +b.height.toFixed(2), left: +b.left.toFixed(2), centerY: +(b.top + b.height / 2).toFixed(2) };
      };
      const label = (el) => (el.innerText || el.getAttribute("aria-label") || el.className || el.tagName).toString().trim().slice(0, 32);
      const header = document.querySelector(".ws-header");
      const items = [...header.querySelectorAll(".ws-title > *, .ws-actions button, .ws-actions .pr-pending")]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => ({ label: label(e), ...box(e) }));
      const sidebar = [...document.querySelectorAll(".sb-toggle, .sb-history .sb-icon-btn")].map((e) => ({ label: label(e), ...box(e) }));
      const sbTopbar = document.querySelector(".sb-topbar");
      return { header: box(header), items, sidebar, sbTopbar: sbTopbar ? box(sbTopbar) : null };
    });
    const mid = m.header.top + m.header.height / 2 - 0.5; // centre of the 39px content box above the 1px border
    const itemsCentred = m.items.every((i) => near(i.centerY, mid));
    const sidebarLine = m.sidebar.length ? m.sidebar.every((s) => near(s.centerY, mid)) : null;
    report[key] = {
      header_height: m.header.height,
      header_content_centre: +mid.toFixed(2),
      items: m.items,
      sidebar_controls: m.sidebar,
      sidebar_topbar: m.sbTopbar,
      pass: { height_40: near(m.header.height, 40), items_centred: itemsCentred, on_sidebar_centre_line: sidebarLine },
    };
    // Top strip of the window: sidebar top row + header, full width, and a zoom on the seam.
    await page.screenshot({ path: `${outPrefix}-${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 96 } });
    await page.screenshot({ path: `${outPrefix}-${key}-seam.png`, clip: { x: sidebar ? 0 : 0, y: 0, width: 720, height: 96 } });
    await page.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(`${outPrefix}.json`, JSON.stringify({ tool: "playwright-core Chromium headless, 1440x900 @2x, en-US, UTC", ...report }, null, 2) + "\n");
for (const [k, v] of Object.entries(report)) {
  console.log(k, "header", v.header_height, "centre", v.header_content_centre, "pass", JSON.stringify(v.pass));
  console.log("  items", JSON.stringify(v.items.map((i) => [i.label, i.height, i.centerY])));
  console.log("  sidebar", JSON.stringify(v.sidebar_controls.map((i) => [i.label, i.height, i.centerY])));
}
