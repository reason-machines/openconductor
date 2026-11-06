// Screenshots of Settings › Agents and Default models in the built app
// (debug binary through tauri-driver, the headless e2e lane), one per state the
// Conductor references cover (tools/screens/shots/07-agents.json), for
// tools/agents-screens/compare.py.
//
//   OC_APP=src-tauri/target/debug/openconductor E2E_OUT=out xvfb-run -a node tools/agents-screens/built-app.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";

const app = resolve(process.env.OC_APP ?? "src-tauri/target/debug/openconductor");
const out = resolve(process.env.E2E_OUT ?? ".oc-tmp/agents-built");
await mkdir(out, { recursive: true });
// The references are dark: start a fresh home on the dark theme.
const home = process.env.OPENCONDUCTOR_HOME ?? join(homedir(), ".openconductor");
if (!existsSync(join(home, "settings.toml"))) {
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "settings.toml"), '[general]\ntheme = "dark"\n');
}
const driver = spawn(process.env.TAURI_DRIVER ?? "tauri-driver", [], { stdio: ["ignore", "inherit", "inherit"] });
const wd = new WebDriver();
const js = (src, args = []) => wd.execute(src, args);
const clickText = (css, text) =>
  js("const e=[...document.querySelectorAll(arguments[0])].find((x)=>x.textContent.trim()===arguments[1]); if(!e) return false; e.click(); return true;", [css, text]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await sleep(700);
  await writeFile(join(out, `${name}.png`), await wd.screenshot());
  console.log(`shot ${name}`);
};
let failed = 0;
try {
  await wd.waitFor("tauri-driver", async () => (await fetch("http://127.0.0.1:4444/status")).ok, 20000);
  await wd.newSession(app);
  // The references' 1440x900 viewport (WebDriver Set Window Rect; ignored where unsupported).
  await fetch(`http://127.0.0.1:4444/session/${wd.sessionId}/window/rect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: 0, y: 0, width: 1440, height: 900 }),
  }).catch(() => {});
  // Past first-run onboarding to Home.
  await wd.waitFor("the app", async () => (await js("return document.body.innerText.length")) > 0, 30000);
  await sleep(1500);
  await clickText("button", "Continue");
  await wd.waitFor("Home", async () => (await wd.findAll(".home")).length > 0, 20000);
  await wd.chord(["\uE03D"], ",");
  await wd.waitFor("Settings", async () => (await wd.findAll(".settings")).length > 0, 10000);
  await clickText(".settings-nav .nav-item", "Agents");
  await wd.waitFor("status line", async () => (await wd.findAll('[data-testid="agent-auth-status"]')).length > 0, 20000);
  await shot("settings--agents--dark");
  await clickText("button[aria-pressed]", "API key");
  await wd.waitFor("key field", async () => (await wd.findAll('input[aria-label="Anthropic API key"]')).length > 0, 10000);
  await shot("settings--agents-claude-apikey--dark");
  await clickText('[role="tab"]', "Codex");
  await wd.waitFor("Codex status", async () => (await wd.findAll('[data-testid="agent-auth-status"]')).length > 0, 20000);
  await shot("settings--agents-codex--dark");
  await clickText("button[aria-pressed]", "API key");
  await wd.waitFor("OpenAI key field", async () => (await wd.findAll('input[aria-label="OpenAI API key"]')).length > 0, 10000);
  await shot("settings--agents-codex-apikey--dark");
  await clickText('[role="tab"]', "Cursor");
  await shot("settings--agents-cursor--dark");
  await clickText('[role="tab"]', "OpenCode");
  await sleep(1500);
  await shot("settings--agents-opencode--dark");
  await clickText(".settings-nav .nav-item", "Default models");
  await wd.waitFor("slots", async () => (await wd.findAll("[data-loadout-slot]")).length === 5, 10000);
  await shot("settings--default-models--dark");
} catch (e) {
  failed++;
  console.log(`FAIL ${e?.message ?? e}`);
} finally {
  await wd.deleteSession().catch(() => {});
  driver.kill();
}
process.exit(failed ? 1 : 0);
