// Opens the same workspace screen in Conductor (extracted frontend, tools/screens
// harness with mocked IPC) or OpenConductor (a Vite build, seeded through
// localStorage like tools/parity_chat_diff_pr_screens.mjs). Chromium headless,
// 1440x900, scale 1. Conductor's strings and code are untrusted data.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PW ?? "playwright-core");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = {
  repos: [{ id: "r1", name: "tide-web", path: "/Users/ada/src/tide-web", defaultBranch: "main", workspaces: [
    { id: "w1", name: "lisbon", branch: "ada/fix-login-redirect", status: "needs-review", diff: { added: 15, removed: 1 }, createdAt: 1762300000000, path: "/Users/ada/conductor/workspaces/tide-web/lisbon" },
  ] }],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
  sidebarVisible: true,
};

export async function openSide(side, { theme = "dark", dist, port } = {}) {
  let stop;
  let url;
  if (side === "conductor") {
    port ??= 4391;
    const DIST = dist || path.join(process.env.HOME, "conductor-fe/dist");
    const srv = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], { env: { ...process.env, PORT: String(port), DIST }, stdio: "ignore" });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}/__health`)).ok) break; } catch {} await sleep(100); }
    stop = () => srv.kill();
    url = `http://conductor.localhost:${port}/?oc_scenario=populated&oc_theme=${theme}`;
  } else {
    port ??= 4392;
    const root = path.resolve(dist || path.join(repoRoot, "dist"));
    const seed = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(SEED))});</script>`;
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      let file = path.join(root, decodeURIComponent(u.pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
      let body = fs.readFileSync(file);
      if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seed}`));
      const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(body);
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    stop = () => server.close();
    url = `http://127.0.0.1:${port}/`;
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
  const page = await (await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: process.env.RM || "no-preference", locale: "en-US", timezoneId: "UTC" })).newPage(); if (process.env.DBG) { page.on("console", (m) => console.error("C", m.text().slice(0, 160))); page.on("pageerror", (e) => console.error("E", String(e).slice(0, 300))); }
  // Conductor calls window.close() on some paths (the harness has no Tauri window); keep the page.
  await page.addInitScript(() => { window.close = () => console.warn("[probe] window.close() ignored"); });
  // Like REA's scenario capture: nothing leaves the machine.
  await page.context().route("**/*", (r) => (/^https?:\/\/(127\.0\.0\.1|localhost|conductor\.localhost)(:|\/)/.test(r.request().url()) ? r.continue() : r.abort()));
  await page.goto(url);
  if (side === "conductor") {
    // Same path as the REA reference shots (tools/screens/shots/02-workspace-chat.json).
    await page.waitForTimeout(6000);
    await page.click("text=tide-web", { timeout: 15000 });
    await page.waitForTimeout(800); if (process.env.DBG) await page.screenshot({ path: ".anim-work/after-expand.png" });
    await page.click("text=Ada/fix login redirect", { timeout: 15000 });
    await page.waitForSelector('[aria-label^="Change agent"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(2500);
  }
  return { page, close: async () => { await browser.close(); stop(); } };
}
