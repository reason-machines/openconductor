// OpenConductor side of parity/side-by-side/right-panel-*: the built app (dist/)
// in Chromium at Conductor's reference size (1440x900, dark), on a fake Tauri
// backend with the reference's invented data (tide-web / lisbon, two changed
// files, no run script). Each state is saved as <out>/oc-<state>.png.
//
//   npm run build && TMPDIR=/tmp/t node tools/side-by-side/right-panel.mjs [outDir]
//
// The Conductor side is evidence/screens/chat--transcript-collapsed-tools--dark.png
// (REA capture-browser-scenario of Conductor 0.87.6's own frontend, see
// evidence/screens/README.md); compose.py puts the two next to each other.
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, fakeBackend } from "../../tests/e2e/right-panel-fixture.mjs";

const out = resolve(process.argv[2] ?? "parity/side-by-side");
mkdirSync(out, { recursive: true });
const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(
  (p) => p && existsSync(p),
);
if (!existsSync("dist/index.html")) throw new Error("dist/ is missing; run `npm run build` first");

const STATES = {
  // The reference: the Changes tab, Run selected in the strip, no run script.
  changes: async () => {},
  // All files, two folders open.
  "all-files": async (page) => {
    await page.getByRole("tab", { name: "All files" }).click();
    await page.getByRole("treeitem", { name: "src" }).click();
    await page.getByRole("treeitem", { name: "lib" }).click();
    await page.getByRole("treeitem", { name: "auth.ts" }).hover();
  },
  // A terminal tab in the strip.
  terminal: async (page) => {
    await page.getByRole("button", { name: "New terminal" }).click();
    await page.locator(".terminal-panel .xterm-rows").waitFor();
    await page.waitForTimeout(300);
  },
};

const server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
try {
  for (const [name, act] of Object.entries(STATES)) {
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) continue;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`[${name}] pageerror: ${e.message}`));
    await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
    await page.goto(base + "/");
    await page.locator(".ws-header").waitFor();
    await page.locator(".rp-tabs").waitFor();
    await page.waitForTimeout(500);
    await act(page);
    await page.mouse.move(0, 0);
    if (name === "all-files") await page.getByRole("treeitem", { name: "auth.ts" }).hover();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/oc-${name}.png` });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
