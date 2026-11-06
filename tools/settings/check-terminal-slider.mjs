import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const lane = process.env.SLIDER_LANE ?? "after";
const reference = lane === "reference";
const port = process.env.PORT ?? "51749";
const base = `http://${reference ? "conductor.localhost" : "localhost"}:${port}`;
const url = `${base}/settings/user/appearance?oc_scenario=populated&oc_theme=dark`;
const out = path.resolve(process.env.SLIDER_OUT ?? "evidence/settings/terminal-slider");
const scratch = path.resolve(".oc-tmp/terminal-slider");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(scratch, { recursive: true });
const checks = [];
const exec = promisify(execFile);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
  await page.goto(url);
  const slider = page.locator('input[type="range"]');
  await slider.waitFor();
  const cases = [["PageUp", 20], ["Home", 10], ["ArrowLeft", 10], ["ArrowRight", 11], ["End", 20], ["ArrowRight", 20], ["PageDown", 10], ["ArrowRight", 11], ["ArrowRight", 12]];
  for (const [key, expected] of cases) {
    await slider.press(key);
    await page.waitForTimeout(80);
    const actual = Number(await slider.inputValue());
    if (!reference) await page.waitForFunction((size) => window.__settingsTest.stored().appearance.terminal_font_size === size, actual);
    checks.push({ key, expected, actual, passed: actual === expected });
  }
  await slider.scrollIntoViewIfNeeded();
  const geometry = await slider.evaluate((input) => {
    const thumb = input.parentElement;
    const track = thumb?.previousElementSibling;
    const measure = (el) => el ? { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderWidth } : null;
    return { input: measure(input), thumb: input.parentElement?.classList.contains("settings-terminal-size") ? null : measure(thumb), track: measure(track) };
  });
  await page.screenshot({ path: path.join(out, `${lane}-browser.png`) });
  const source = reference ? { indexSha256: createHash("sha256").update(fs.readFileSync(path.join(process.env.DIST, "index.html"))).digest("hex") } : {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceHash: createHash("sha256").update(fs.readFileSync("src/settings/TerminalFont.tsx")).update(fs.readFileSync("src/settings/settings.css")).digest("hex"),
  };
  fs.writeFileSync(path.join(out, `${lane}-checks.json`), JSON.stringify({ lane, url, source, checks, geometry, limitations: "Isolated Chromium and invented IPC state. Does not prove native macOS rendering, authentication, or filesystem persistence." }, null, 2) + "\n");
  const scenario = {
    browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
    start_url: { url },
    environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 2000 },
      ...["Home", "ArrowRight", "ArrowRight"].map((key, i) => ({ step_id: `size-${i}`, action: "press", locator: { kind: "css", selector: 'input[type="range"]' }, key, timeout_ms: 5000 })),
      { step_id: "ready", action: "wait_for_timeout", duration_ms: 500 },
    ],
    capture: { at_end: ["screenshot", "dom", "url"], events: ["page-errors"] },
  };
  const scenarioFile = path.join(out, `${lane}-scenario.json`);
  fs.writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2) + "\n");
  const { stdout } = await exec(process.env.REA ?? "/home/runner/rea/node_modules/.bin/rea", ["capture-browser-scenario", scenarioFile, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 27 });
  const evidence = JSON.parse(stdout);
  const artifacts = evidence.normalized_result?.steps?.at(-1)?.artifacts;
  assert.equal(artifacts?.screenshot?.state, "captured", "REA captured the rendered Appearance page");
  const png = Buffer.from(artifacts.screenshot.value.data_base64, "base64");
  fs.writeFileSync(path.join(out, `${lane}.png`), png);
  fs.writeFileSync(path.join(scratch, `${lane}.dom.html`), artifacts.dom?.value?.text ?? "");
  fs.writeFileSync(path.join(out, `${lane}-capture.json`), JSON.stringify({ evidence_id: evidence.evidence_id, source, url: artifacts.url?.value?.url, screenshot: `${lane}.png`, sha256: createHash("sha256").update(png).digest("hex"), issues: evidence.normalized_result?.issues ?? [] }, null, 2) + "\n");
  for (const check of checks) assert.equal(check.actual, check.expected, `${check.key} should select ${check.expected}px`);
  assert.equal(geometry.track.height, 6, "slider track is 6px tall");
  assert.equal(geometry.thumb.height, 16, "slider thumb is 16px tall");
  assert.notEqual(geometry.thumb.background, "rgba(0, 0, 0, 0)", "slider thumb has an opaque background");
  console.log(`SLIDER_PROOF_PASSED ${lane}: 9 keyboard assertions, 6px track, 16px thumb`);
} finally {
  await browser.close();
}
