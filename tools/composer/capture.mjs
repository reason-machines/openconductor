// Run after preview_start has exposed the appropriate server. No server is started here.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [target = "ours", ...only] = process.argv.slice(2);
const reference = target === "reference";
const port = process.env.PORT ?? (reference ? "4428" : "4427");
const rea = process.env.REA ?? "/home/runner/rea/node_modules/.bin/rea";
const output = "evidence/chat/composer/current";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-composer-"));
const click = (selector, step_id) => ({ step_id, action: "click", locator: { kind: "css", selector }, timeout_ms: 5000 });
const wait = (duration_ms, step_id) => ({ step_id, action: "wait_for_timeout", duration_ms });
const editor = reference ? "[contenteditable=true]" : ".composer textarea";
const fill = (value) => ({ step_id: "type", action: "fill", locator: { kind: "css", selector: editor }, value: { source: "literal", value }, timeout_ms: 5000 });
const cases = {
  empty: reference ? [click("text=2 files changed", "blur")] : [],
  focused: [click(editor, "focus")],
  multiline: [fill("Review the login redirect.\nKeep the expired-session test.\nThen update the docs.")],
  mention: [fill("@README")],
  plus: [click("[aria-label='Add']", "add")],
  model: [click(reference ? "[aria-label^='Change agent']" : "[data-testid='composer-model-button']", "model")],
};
function screenshot(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.data_base64 === "string") return value.data_base64;
  for (const nested of Object.values(value)) { const result = screenshot(nested); if (result) return result; }
}
fs.mkdirSync(output, { recursive: true });
const capturesPath = `${output}/${target}-captures.json`;
const results = fs.existsSync(capturesPath) ? JSON.parse(fs.readFileSync(capturesPath, "utf8")) : [];
try {
  for (const [name, actions] of Object.entries(cases).filter(([name]) => only.length === 0 || only.includes(name))) {
    const input = {
      browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
      start_url: { url: `http://localhost:${port}/${reference ? "?oc_scenario=populated&oc_mention_files=1" : "tools/composer/demo.html?agent=claude"}` },
      environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions: [wait(1800, "settle"), ...(reference ? [click("text=tide-web", "repo"), click("text=Ada/fix login redirect", "workspace"), wait(1200, "open")] : []), ...actions, wait(600, "final")],
      capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
    };
    const file = path.join(temp, "scenario.json");
    fs.writeFileSync(file, JSON.stringify(input));
    const child = await new Promise((resolve, reject) => {
      execFile(rea, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", env: { ...process.env, TMPDIR: temp, NODE_NO_WARNINGS: "1" }, maxBuffer: 12 * 1024 * 1024, timeout: 90000 }, (error, stdout, stderr) => {
        if (error && !stdout) reject(new Error(stderr || error.message));
        else resolve({ status: error ? 1 : 0, stdout });
      });
    });
    const evidence = JSON.parse(child.stdout);
    const result = evidence.normalized_result ?? evidence;
    const failed = result.steps?.find((step) => step.status === "failed");
    if (child.status !== 0 || failed) throw new Error(`${target} ${name}: ${JSON.stringify(failed ?? { error: evidence.error, limitations: result.limitations, details: evidence.details })}`);
    const bytes = screenshot(result.steps?.at(-1)?.artifacts?.screenshot ?? result);
    if (!bytes) throw new Error(`${target} ${name}: no screenshot`);
    const image = `${output}/${target}-${name}.png`;
    fs.writeFileSync(image, Buffer.from(bytes, "base64"));
    const previous = results.findIndex((result) => result.name === name);
    if (previous >= 0) results.splice(previous, 1);
    results.push({ name, image, evidence_id: evidence.evidence_id, scenario: input });
    fs.writeFileSync(`${output}/${target}-captures.json`, JSON.stringify(results, null, 2) + "\n");
    console.log(target, name, evidence.evidence_id);
  }
  fs.writeFileSync(`${output}/${target}-captures.json`, JSON.stringify(results, null, 2) + "\n");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
