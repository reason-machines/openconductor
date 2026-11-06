import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { chromium } from "playwright-core";

const reference = process.argv[2] === "reference";
const port = Number(process.env.PORT ?? 4526);
const origin = `http://${reference ? "conductor.localhost" : "localhost"}:${port}`;
const out = path.resolve(process.env.OUT ?? "evidence/chat/responsive");
const rea = process.env.REA ?? "/home/runner/rea/node_modules/.bin/rea";
const executable = process.env.CHROMIUM ?? "/usr/bin/chromium";
const viewport = { width: 1000, height: 820 };
fs.mkdirSync(out, { recursive: true });
if (reference) {
  process.env.HOST = "0.0.0.0";
  process.env.PORT = String(port);
  await import("../screens/server.mjs");
} else {
  const { createServer } = await import("vite");
  await (await createServer({ server: { host: "0.0.0.0", port, strictPort: true } })).listen();
  process.env.BASE_URL = origin;
  await import("./turn-changes.browser.mjs");
}
const prior = reference ? null : JSON.parse(fs.readFileSync(path.join(out, "reference.json"), "utf8"));
const url = reference ? `${origin}/?oc_scenario=populated&oc_theme=dark` : `${origin}/tools/chat/transcript-fixture.html?width=${prior.footer.width + 74}`;
const selectors = reference ? ["text=tide-web", "text=Ada/fix login redirect"] : [];
const browser = await chromium.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport });
await page.goto(url);
for (const selector of selectors) await page.locator(selector).click();
await page.getByRole("button", { name: "Show message actions", exact: true }).waitFor();
const footer = await page.getByRole("button", { name: "Show message actions", exact: true }).evaluate((el) => {
  const node = el.parentElement.parentElement;
  const rect = node.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});
await browser.close();
if (footer.width >= 480) throw new Error(`Expected a compact footer, measured ${footer.width}px`);
const run = promisify(execFile);
const manifest = { viewport, footer, captures: {} };
fs.writeFileSync(path.join(out, `${reference ? "reference" : "openconductor"}.json`), JSON.stringify(manifest, null, 2) + "\n");
for (const expanded of [false, true]) {
  const name = `${reference ? "reference" : "openconductor"}-${expanded ? "revealed" : "compact"}`;
  const clicks = [...selectors, ...(expanded ? ["[aria-label='Show changed files']"] : [])];
  const actions = [{ step_id: "ready", action: "wait_for_timeout", duration_ms: 3000 }];
  for (const [i, selector] of clicks.entries()) {
    actions.push({ step_id: `click-${i}`, action: "click", locator: { kind: "css", selector }, timeout_ms: 8000 });
    actions.push({ step_id: `settle-${i}`, action: "wait_for_timeout", duration_ms: 500 });
  }
  const input = path.join(out, `${name}.input.json`);
  fs.writeFileSync(input, JSON.stringify({ browser: { mode: "launch", executable_path: executable, headless: true }, start_url: { url }, environment: { viewport: { ...viewport, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" }, actions, capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] } }));
  const { stdout } = await run(rea, ["capture-browser-scenario", input, "--format", "json"], { maxBuffer: 30_000_000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  const ev = JSON.parse(stdout);
  const shot = ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot;
  if (shot?.state !== "captured") throw new Error(`${name}: screenshot missing`);
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.value.data_base64, "base64"));
  manifest.captures[name] = { evidence_id: ev.evidence_id };
  console.log(`${name}: ${ev.evidence_id}`);
}
fs.writeFileSync(path.join(out, `${reference ? "reference" : "openconductor"}.json`), JSON.stringify(manifest, null, 2) + "\n");
console.log("Capture complete. Stop the preview to release its slot.");
