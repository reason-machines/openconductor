// Height check for the workspace header. Serves the Vite build with a seeded
// workspace and measures, with the sidebar shown and hidden, the header's
// height, the vertical centre of every breadcrumb part, chip and button in it,
// and the centre of the sidebar's toggle row. Writes a crop of the top 80px of
// the window per case and <out>/header-height.json.
//
//   npx vite build && node tools/align/header_height.mjs <out-dir>
//
// Passes (exit 0) when, in every case, the header is 40px (Conductor's h-10),
// every control is centred on the header's content line (to 1px), the sidebar
// toggle shares that line, and with the sidebar hidden the header's content
// starts right of the traffic-light clearance. Verifier tooling only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(repoRoot, "dist");
const out = path.resolve(process.argv[2] ?? "header-height");
const PORT = Number(process.env.PORT ?? 4395);
const WIDTH = Number(process.env.WIDTH ?? 1280);

const seed = (sidebarVisible) => ({
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
  sidebarVisible,
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) {
    const s = seed(url.searchParams.get("sidebar") !== "0");
    body = Buffer.from(body.toString().replace("<head>", `<head><script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(s))});</script>`));
  }
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const report = {};
let failed = false;
for (const theme of ["dark", "light"]) {
  for (const sidebar of [true, false]) {
    const name = `${theme}-${sidebar ? "sidebar" : "no-sidebar"}`;
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 820 }, deviceScaleFactor: 2, colorScheme: theme, locale: "en-US", timezoneId: "UTC" });
    await page.goto(`http://127.0.0.1:${PORT}/?sidebar=${sidebar ? 1 : 0}`);
    await page.waitForSelector(".ws-header .ws-actions", { timeout: 15000 });
    await page.waitForTimeout(1200);
    const g = await page.evaluate(() => {
      const r1 = (n) => Math.round(n * 100) / 100;
      const box = (el) => {
        const b = el.getBoundingClientRect();
        return { top: r1(b.top), height: r1(b.height), left: r1(b.left), centerY: r1(b.top + b.height / 2) };
      };
      const header = document.querySelector(".ws-header");
      const hb = header.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(header).borderBottomWidth) || 0;
      const controls = [...header.querySelectorAll(".ws-title > *, .ws-actions button, .ws-actions .pr-pending")]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => ({ el: (typeof e.className === "string" && e.className) || e.tagName.toLowerCase(), text: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30), ...box(e) }));
      const toggle = document.querySelector(".sb-toggle");
      const clearance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--traffic-lights-clearance")) || 0;
      return {
        header: { ...box(header), contentCenterY: r1(hb.top + (hb.height - border) / 2) },
        controls,
        sidebar_toggle: toggle ? box(toggle) : null,
        first_control_left: controls.length ? Math.min(...controls.map((c) => c.left)) : null,
        clearance,
      };
    });
    const near = (a, b, t) => Math.abs(a - b) <= t;
    const c = g.header.contentCenterY;
    const checks = {
      "header is 40px": near(g.header.height, 40, 0.5),
      "controls centred on the header line": g.controls.every((x) => near(x.centerY, c, 1)),
      "sidebar toggle on the same line": sidebar ? !!g.sidebar_toggle && near(g.sidebar_toggle.centerY, c, 1) : true,
      "clears the traffic lights without a sidebar": sidebar ? true : g.first_control_left >= g.clearance,
    };
    g.checks = checks;
    report[name] = g;
    const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
    if (bad.length) failed = true;
    console.log(`${name}: header ${g.header.height}px, line ${c}, controls ${g.controls.map((x) => x.centerY).join("/")}${g.sidebar_toggle ? `, toggle ${g.sidebar_toggle.centerY}` : ""} -> ${bad.length ? "FAIL " + bad.join("; ") : "pass"}`);
    await page.screenshot({ path: path.join(out, `header-${name}.png`), clip: { x: 0, y: 0, width: WIDTH, height: 80 } });
    await page.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(path.join(out, "header-height.json"), JSON.stringify(report, null, 1) + "\n");
process.exit(failed ? 1 : 0);
