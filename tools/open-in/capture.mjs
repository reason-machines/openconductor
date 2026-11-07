// Start server.mjs through preview_start first. No servers or real user data are created here.
// OPEN_IN_BASE_URL=http://localhost:4518 REA=/path/to/rea node tools/open-in/capture.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const base = process.env.OPEN_IN_BASE_URL;
if (!base) throw new Error("OPEN_IN_BASE_URL required");
const out = process.env.OUT ?? "evidence/open-in/switcher/screens";
fs.mkdirSync(out, { recursive: true });
const manifestPath = path.join(out, "captures.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const side of process.env.PALETTE_ONLY ? [] : ["reference", "ours"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
    await page.goto(side === "reference" ? base + "/__reference/" : base);
    if (side === "reference") {
      await page.getByText("tide-web", { exact: true }).first().click();
      await page.getByText("Ada/fix login redirect", { exact: true }).first().click();
      await page.locator("button.rounded-l-none.px-2").waitFor();
    } else await page.getByRole("button", { name: "Open in Finder", exact: true }).waitFor();
    await page.waitForTimeout(600);
    await page.keyboard.down("Meta");
    await page.keyboard.press("o");
    await page.waitForTimeout(500);
    const overlay = side === "reference" ? page.locator('.fixed.z-\\[9999\\]') : page.locator(".oi-switcher");
    for (const state of ["first", "next", "close"]) {
      if (state === "next") await page.keyboard.press("o");
      if (state === "close") { await page.keyboard.press("Shift+o"); await page.keyboard.press("Shift+o"); }
      await page.waitForTimeout(250);
      const png = await page.screenshot({ path: path.join(out, `${side}-${state}.png`) });
      const box = await overlay.boundingBox();
      if (!box) throw new Error(`${side} ${state}: chooser not visible`);
      await page.screenshot({ path: path.join(out, `${side}-${state}-crop.png`), clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } });
      manifest[`${side}-${state}`] = { sha256: crypto.createHash("sha256").update(png).digest("hex"), box, label: await overlay.innerText(), closeButton: await overlay.locator("button").last().evaluate((el) => el.innerHTML) };
    }
    await page.keyboard.press("Escape");
    await page.keyboard.up("Meta");
    await page.close();
  }
} finally { await browser.close(); }
const rea = process.env.REA;
if (rea) {
  for (const side of ["reference", "ours"]) for (const [state, query] of [["all", ""], ["search", "login"], ["no-results", "zzqx"]].filter(([state]) => !process.env.PALETTE_STATE || process.env.PALETTE_STATE === state)) {
    const actions = [
      { step_id: "ready", action: "wait_for", locator: { kind: "css", selector: "text=Home" }, state: "visible", timeout_ms: 10000 },
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 800 },
      { step_id: "open", action: "press", locator: { kind: "css", selector: "body" }, key: "Meta+k", timeout_ms: 5000 },
    ];
    if (query) actions.push({ step_id: "query", action: "fill", locator: { kind: "css", selector: "[role=dialog] input" }, value: { source: "literal", value: query }, timeout_ms: 5000 });
    actions.push({ step_id: "final", action: "wait_for_timeout", duration_ms: 600 });
    const input = { browser: { mode: "launch", executable_path: process.env.CHROME_PATH ?? "/usr/bin/chromium", headless: true }, start_url: { url: base + (side === "reference" ? "/__reference/" : "/?home=1") }, environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" }, actions, capture: { at_end: ["screenshot", "url", "dom"], events: ["console", "page-errors"] } };
    const file = path.join(out, `${side}-palette-${state}.input.json`);
    fs.writeFileSync(file, JSON.stringify(input));
    const result = spawnSync(rea, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 64 << 20 });
    const ev = JSON.parse(result.stdout);
    const shot = ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot;
    if (shot?.state !== "captured") throw new Error(`${side} palette ${state}: ${JSON.stringify(ev).slice(0, 500)}`);
    const png = Buffer.from(shot.value.data_base64, "base64");
    fs.writeFileSync(path.join(out, `${side}-palette-${state}.png`), png);
    manifest[`${side}-palette-${state}`] = { evidence_id: ev.evidence_id, sha256: crypto.createHash("sha256").update(png).digest("hex") };
  }
}
fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest));
