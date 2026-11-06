// Alignment check for the workspace header (crumbs + chips on the left, Open in /
// PR / Archive on the right). Serves the Vite build with the same synthetic seed
// as tools/parity_chat_diff_pr_screens.mjs, measures every control in the header
// rows in Chromium, and writes crops of the header plus the measurements.
//
//   npx vite build && node tools/align/header_actions.mjs <out-prefix>
//
// A row passes when every control in it has the same height and the same
// vertical centre (to 0.5 px). Verifier tooling only, no feature code.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(repoRoot, "dist");
const outPrefix = path.resolve(process.argv[2] ?? path.join(repoRoot, "parity/side-by-side/chat-diff-pr/alignment/header"));
const PORT = Number(process.env.PORT ?? 4391);

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
const seedScript = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(SEED))});</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seedScript}`));
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const report = {};
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, locale: "en-US", timezoneId: "UTC" });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector(".ws-header .ws-actions", { timeout: 15000 });
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const describe = (el) => {
      const b = r(el);
      return {
        el: `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : ""}`,
        text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        top: +b.top.toFixed(2),
        height: +b.height.toFixed(2),
        centerY: +(b.top + b.height / 2).toFixed(2),
      };
    };
    const controls = (root, sel) => [...root.querySelectorAll(sel)].filter((e) => r(e).height > 0).map(describe);
    const header = document.querySelector(".ws-header");
    return {
      actions: controls(header, ".ws-actions button, .ws-actions .pr-pending"),
      title: controls(header, ".ws-title > .chip, .ws-title > button"),
    };
  });
  const verdict = (list) => {
    const spread = (a) => (a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(2) : 0);
    const hs = list.map((c) => c.height);
    const cs = list.map((c) => c.centerY);
    return { heights: [...new Set(hs)], height_spread: spread(hs), center_spread: spread(cs), pass: spread(hs) <= 0.5 && spread(cs) <= 0.5 };
  };
  report[theme] = { actions: { controls: rows.actions, ...verdict(rows.actions) }, title_chips: { controls: rows.title, ...verdict(rows.title) } };
  const box = await page.locator(".ws-header .ws-actions").boundingBox();
  await page.screenshot({ path: `${outPrefix}-actions-${theme}.png`, clip: { x: box.x - 12, y: box.y - 10, width: box.width + 24, height: box.height + 20 } });
  const hb = await page.locator(".ws-header").boundingBox();
  await page.screenshot({ path: `${outPrefix}-header-${theme}.png`, clip: hb });
  await page.close();
}
await browser.close();
server.close();
fs.writeFileSync(`${outPrefix}.json`, JSON.stringify({ tool: "playwright-core Chromium headless, 1440x900 @2x, en-US, UTC", ...report }, null, 2) + "\n");
for (const [t, v] of Object.entries(report)) for (const [k, row] of Object.entries(v)) console.log(t, k, JSON.stringify(row.controls.map((c) => [c.text || c.el, c.height, c.centerY])), "pass:", row.pass);
