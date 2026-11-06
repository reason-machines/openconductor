// OpenConductor side of the transition probe: the same interactions as
// conductor.mjs on a Vite build (seeded through localStorage, Chromium
// headless 1440x900 dark, motion not reduced), recording every CSS
// transition and animation the page runs (document.getAnimations()).
//
//   npx vite build --outDir /tmp/oc-dist
//   node tools/transitions/openconductor.mjs /tmp/oc-dist > oc.json
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { RECORDER } from "./recorder.mjs";

const { chromium } = await import("playwright-core");
const root = path.resolve(process.argv[2] ?? "dist");
const port = Number(process.env.PORT ?? 4392);
const SHOTS = process.env.SHOTS;
const SEED = {
  repos: [{ id: "r1", name: "tide-web", path: "/Users/ada/src/tide-web", defaultBranch: "main", workspaces: [
    { id: "w1", name: "lisbon", branch: "ada/fix-login-redirect", status: "needs-review", diff: { added: 15, removed: 1 }, createdAt: 1762300000000, path: "/Users/ada/conductor/workspaces/tide-web/lisbon" },
  ] }],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
  sidebarVisible: true,
};
const seed = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(SEED))});</script>`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seed}`));
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(body);
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference", locale: "en-US", timezoneId: "UTC" });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
await page.addInitScript(`(${RECORDER})()`);
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(2500);

const click = (sel) => page.locator(`${sel} >> visible=true`).first().click();
const key = (k) => page.keyboard.press(k);
const STEPS = [
  { id: "terminal-panel-toggle", what: "Panel: terminal panel toggle (⌘J)", act: () => key("Meta+j"), ms: 800, undo: () => key("Meta+j") },
  { id: "right-panel-toggle", what: "Panel: right panel toggle (⌥⌘B)", act: () => key("Meta+Alt+b"), ms: 800, undo: () => key("Meta+Alt+b") },
  { id: "right-tab-switch", what: "Tab: right panel All files", act: () => click("text=All files"), ms: 800 },
  { id: "left-sidebar-hide", what: "Panel: left sidebar hide (⌘B)", act: () => key("Meta+b"), ms: 800 },
  { id: "left-sidebar-show", what: "Panel: left sidebar show (⌘B)", act: () => key("Meta+b"), ms: 800 },
  { id: "workspace-to-all", what: "Route: workspace to All workspaces (⌘⇧H)", act: () => key("Meta+Shift+h"), ms: 1600 },
  { id: "all-to-workspace", what: "Route: All workspaces to a workspace (sidebar row)", act: () => click(".sb-ws-row, [data-workspace-id]"), ms: 1600 },
  { id: "palette-open", what: "Dialog: command palette open (⌘K)", act: () => key("Meta+k"), ms: 600 },
  { id: "palette-close", what: "Dialog: command palette close (Escape)", act: () => key("Escape"), ms: 600 },
  { id: "create-open", what: "Dialog: new workspace open (⌘N)", act: () => key("Meta+n"), ms: 600 },
  { id: "create-close", what: "Dialog: new workspace close (Escape)", act: () => key("Escape"), ms: 600 },
  { id: "shortcuts-open", what: "Dialog: keyboard shortcuts open (⌥⌘/)", act: () => key("Meta+Alt+Slash"), ms: 600 },
  { id: "shortcuts-close", what: "Dialog: keyboard shortcuts close (Escape)", act: () => key("Escape"), ms: 600 },
  { id: "to-settings", what: "Route: app to Settings (⌘,)", act: () => key("Meta+Comma"), ms: 1000 },
  { id: "settings-tab-switch", what: "Tab: settings page switch (Appearance)", act: () => click("text=Appearance"), ms: 800 },
  { id: "settings-to-app", what: "Route: Settings back to the app (Escape)", act: () => key("Escape"), ms: 1600 },
];

const results = [];
for (const s of STEPS) {
  const r = { id: s.id, what: s.what };
  try {
    await page.evaluate(() => window.__txStart());
    await s.act();
    await page.waitForTimeout(s.ms);
    Object.assign(r, await page.evaluate(() => window.__txStop()));
  } catch (e) {
    r.error = String(e).split("\n")[0];
    await page.evaluate(() => window.__txStop?.()).catch(() => {});
  }
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `oc-${s.id}.png`) }); }
  if (s.undo) { await s.undo(); await page.waitForTimeout(500); }
  console.error(`[oc] ${s.id}: ${r.error ?? `${r.animations.length} animations`}`);
  results.push(r);
}
await browser.close();
server.close();
console.log(JSON.stringify({ side: "openconductor", dist: root, browser: "Chromium headless 1440x900 dark, prefers-reduced-motion: no-preference", results }, null, 1));
