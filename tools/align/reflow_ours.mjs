// OpenConductor side of the resize-reflow check (tools/align/reflow_ref.mjs is
// Conductor's side). Serves the Vite build with a seeded workspace, sends two
// messages so the transcript has turns, and at each window width measures the
// sidebar, header, chat column, right panel, message turns and composer, then
// screenshots the window.
//
//   npx vite build && node tools/align/reflow_ours.mjs <out-dir> [widths...]
//
// Writes <out-dir>/ours-<width>.png and <out-dir>/ours-geometry.json, and exits
// non-zero when a width fails a check:
//   - nothing is wider than the window (no horizontal overflow or clipping),
//   - the right panel is a third of the space right of the sidebar (Conductor's
//     main-content 70 / right-panel 35 resizable panels),
//   - turns and composer share one centred column at Conductor's sizes
//     (tools/align/reflow_ref.mjs measured them): a turn is the chat width up
//     to 896px (max-w-4xl), the composer is the chat width less 16px a side up
//     to 896px, and both are centred in the chat.
// Verifier tooling only, no feature code.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(repoRoot, "dist");
const out = path.resolve(process.argv[2] ?? "reflow-ours");
const widths = process.argv.slice(3).map(Number).filter(Boolean);
const WIDTHS = widths.length ? widths : [900, 1280, 1600, 2100];
const HEIGHT = 900;
const PORT = Number(process.env.PORT ?? 4393);
const THEME = process.env.THEME ?? "dark";

const SEED = {
  repos: [
    {
      id: "r1",
      name: "tide-web",
      path: "/Users/ada/src/tide-web",
      defaultBranch: "main",
      workspaces: [{ id: "w1", name: "lisbon", branch: "ada/fix-login-redirect", status: "needs-review", diff: { added: 15, removed: 1 }, createdAt: 1762300000000, path: "/Users/ada/conductor/workspaces/tide-web/lisbon" }],
    },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
  sidebarVisible: true,
};
const seedScript = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(SEED))});</script>`;
const MESSAGES = [
  "After signing in, users with an expired session get bounced between /login and /dashboard forever. Can you find out why and fix it?",
  "Thanks. Also add a regression test for the expired-session redirect.",
];

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
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const report = {};
let failed = false;
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: THEME, locale: "en-US", timezoneId: "UTC" });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector(".composer textarea", { timeout: 15000 });
  for (const m of MESSAGES) {
    await page.fill(".composer textarea", m);
    await page.press(".composer textarea", "Enter");
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1000);
  const g = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const r = (n) => Math.round(n * 10) / 10;
      return { left: r(b.left), right: r(b.right), width: r(b.width), top: r(b.top), height: r(b.height), centerY: r(b.top + b.height / 2) };
    };
    const split = document.querySelector(".ws-split");
    const header = document.querySelector(".ws-header");
    const headerControls = [...header.querySelectorAll(".ws-title > *, .ws-actions button, .ws-actions .pr-pending")].filter((e) => e.getBoundingClientRect().height > 0);
    const overflow = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        if (!(b.width > 0 && b.height > 0 && b.right > window.innerWidth + 0.5) || getComputedStyle(e).position === "fixed") return false;
        // Content inside a scroll or clip container that itself fits the window is clipped by it, not the window.
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= window.innerWidth + 0.5) return false;
        }
        return true;
      })
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ").join(".")}`);
    return {
      viewport: window.innerWidth,
      sidebar: box(document.querySelector(".sidebar")),
      sidebar_topbar: box(document.querySelector(".sb-topbar")),
      sidebar_toggle: box(document.querySelector(".sb-toggle")),
      header: box(header),
      header_controls: headerControls.map((e) => ({ el: e.className || e.tagName.toLowerCase(), ...box(e) })),
      chat: box(split?.children[0]),
      right_panel: split?.children.length > 1 ? box(split.children[1]) : null,
      right_panel_head: box(document.querySelector(".ws-split > :nth-child(2) [role=tablist], .ws-split > :nth-child(2) .rp-tabs")),
      turns: [...document.querySelectorAll(".oc-turn")].map(box),
      composer: box(document.querySelector(".composer.oc-composer")),
      doc_scroll_width: document.documentElement.scrollWidth,
      overflow,
    };
  });
  const checks = [];
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  checks.push(["no horizontal overflow", g.doc_scroll_width <= width && g.overflow.length === 0]);
  if (g.right_panel) {
    const space = width - g.sidebar.width;
    checks.push(["right panel is 1/3 of the space right of the sidebar", near(g.right_panel.width, (space - 1) / 3, 2)]);
  }
  const inner = g.chat.width - 1; // the chat's 1px right border
  const col = [...g.turns, g.composer].filter(Boolean);
  checks.push(["turns are min(chat, 896) wide", g.turns.length > 0 && g.turns.every((b) => near(b.width, Math.min(inner, 896)))]);
  checks.push(["composer is min(chat - 32, 896) wide", !!g.composer && near(g.composer.width, Math.min(inner - 32, 896))]);
  checks.push(["turns and composer centred in chat", col.every((b) => near(b.left - g.chat.left, g.chat.left + inner - b.right, 1.5))]);
  g.checks = Object.fromEntries(checks);
  report[width] = g;
  const bad = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) failed = true;
  console.log(`${width}: ${bad.length ? "FAIL " + bad.join("; ") : "pass"}`);
  await page.screenshot({ path: path.join(out, `ours-${width}.png`) });
  await page.close();
}
await browser.close();
server.close();
fs.writeFileSync(path.join(out, "ours-geometry.json"), JSON.stringify(report, null, 1) + "\n");
process.exit(failed ? 1 : 0);
