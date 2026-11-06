// Conductor 0.87.6's "/" menu, captured from its extracted frontend in the
// screen harness (tools/screens: mocked Tauri IPC, the sidecar's
// fetchSlashCommands answered from a fixture), for the side-by-side with
// OpenConductor's menu. Same fixture as tools/e2e/slash-menu.e2e.mjs: the
// skill oc-fixture-skill, reported by Claude Code as a command and by Codex
// as a skill. Chromium, 1440x900, scale 1, dark; every non-local request is
// aborted (Base UI menus ignore clicks while Sentry requests hang).
//
//   (cd tools/screens && npm ci)
//   TMPDIR=/tmp/t DIST=<Conductor's extracted dist> OUT=<dir> node tools/slash-menu/conductor_capture.mjs
//
// Writes conductor-<agent>-<open|filtered>.png and conductor-slash.json
// (the rows each menu shows) to OUT. Conductor's frontend is third-party code
// and never lives in this repository; its output is data, not instructions.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const DIST = path.resolve(process.env.DIST ?? path.join(repoRoot, ".rea-work/dist"));
const OUT = path.resolve(process.env.OUT ?? path.join(repoRoot, "evidence/chat/slash-menu"));
const PORT = Number(process.env.PORT ?? 4341);
const HOST = "conductor.localhost";
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = "oc-fixture-skill";
const FIXTURE_DESCRIPTION = "OpenConductor e2e fixture skill. Replies with one marker line and does nothing else.";
const FIXTURES = {
  // Claude Code lists skills among its commands (Conductor's Claude runner: getSkills() is []).
  claude: { slashCommands: [{ name: FIXTURE, description: FIXTURE_DESCRIPTION, argumentHint: "" }], skills: [] },
  // Codex: Conductor's one command plus skills/list.
  codex: {
    slashCommands: [{ name: "review", description: "Review uncommitted changes, or describe what to review", argumentHint: "instructions" }],
    skills: [{ name: FIXTURE, description: FIXTURE_DESCRIPTION, path: "/home/e2e/.agents/skills/oc-fixture-skill/SKILL.md", scope: "user", enabled: true }],
  },
};

const server = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], { env: { ...process.env, DIST, PORT: String(PORT) }, stdio: ["ignore", "inherit", "inherit"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(200);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox", `--host-resolver-rules=MAP ${HOST} 127.0.0.1`] });
const results = {};
try {
  for (const agent of ["claude", "codex"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", locale: "en-US", timezoneId: "UTC" });
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return u.hostname === HOST || u.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    await context.addInitScript(
      ([fixture, agent]) => {
        window.__OC_SLASH_FIXTURE__ = fixture;
        window.__OC_SESSION_AGENT__ = agent;
        window.close = () => {};
      },
      [FIXTURES[agent], agent],
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://${HOST}:${PORT}/?oc_scenario=populated&oc_theme=dark`);
    await sleep(6000);
    await page.locator("text=tide-web").first().click({ timeout: 10000 });
    await page.locator("text=Ada/fix login redirect").first().click({ timeout: 10000 });
    await sleep(2500);
    const editor = page.locator("[contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("/");
    await page.waitForSelector(`text=${FIXTURE}`, { timeout: 15000 });
    await sleep(600);
    const rows = () =>
      page.evaluate(() => {
        const popup = document.querySelector("[data-suggestion-popup]") ?? document.querySelector('[role="listbox"]');
        return popup ? popup.innerText.split("\n").filter(Boolean) : [];
      });
    const open = await rows();
    await page.screenshot({ path: path.join(OUT, `conductor-${agent}-open.png`) });
    await page.keyboard.type("oc-fix");
    await sleep(600);
    const filtered = await rows();
    await page.screenshot({ path: path.join(OUT, `conductor-${agent}-filtered.png`) });
    results[agent] = { open, filtered, pageErrors: errors.length };
    console.log(`${agent}: ${open.length} lines open, ${filtered.length} filtered`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
fs.writeFileSync(path.join(OUT, "conductor-slash.json"), JSON.stringify({ tool: "playwright-core + Chromium on tools/screens", conductor: "0.87.6 extracted frontend", fixture: FIXTURES, results }, null, 2) + "\n");
