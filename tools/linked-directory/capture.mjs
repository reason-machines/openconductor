import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const reference = process.argv[2] === "reference";
const port = process.env.PORT ?? (reference ? "4438" : "4437");
const output = "evidence/chat/linked-directory";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-link-"));
const click = (selector, step_id) => ({ step_id, action: "click", locator: { kind: "css", selector }, timeout_ms: 5000 });
const wait = (duration_ms, step_id) => ({ step_id, action: "wait_for_timeout", duration_ms });
const fill = (selector, value, step_id) => ({ step_id, action: "fill", locator: { kind: "css", selector }, value: { source: "literal", value }, timeout_ms: 5000 });
const open = reference ? [wait(1800, "settle"), click("text=tide-web", "repo"), click("text=Ada/fix login redirect", "workspace"), wait(1200, "open")] : [wait(800, "settle")];
const cases = reference ? {
  add: [click("[aria-label='Add']", "add"), click("text=Link workspaces", "link")],
  mention: [fill("[contenteditable=true]", "@add", "query"), wait(600, "suggest"), { step_id: "choose", action: "press", locator: { kind: "css", selector: "[contenteditable=true]" }, key: "Enter", timeout_ms: 5000 }],
  search: [click("[aria-label='Add']", "add"), click("text=Link workspaces", "link"), fill("[placeholder='Search workspaces...']", "no-such-workspace", "search")],
} : { picker: [], search: [fill("[placeholder='Search workspaces...']", "no-such-workspace", "search")] };
function screenshot(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.data_base64 === "string") return value.data_base64;
  for (const nested of Object.values(value)) { const result = screenshot(nested); if (result) return result; }
}
fs.mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const [name, actions] of Object.entries(cases)) {
    const input = {
      browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
      start_url: { url: `http://localhost:${port}/${reference ? "?oc_scenario=populated&oc_mention_files=1" : "tools/linked-directory/demo.html"}` },
      environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions: [...open, ...actions, wait(600, "final")],
      capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
    };
    const file = path.join(temp, "scenario.json");
    fs.writeFileSync(file, JSON.stringify(input));
    const raw = await new Promise((resolve, reject) => execFile(process.env.REA ?? "/home/runner/rea/node_modules/.bin/rea", ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", env: { ...process.env, TMPDIR: temp, NODE_NO_WARNINGS: "1" }, maxBuffer: 12 * 1024 * 1024, timeout: 90000 }, (error, stdout, stderr) => error && !stdout ? reject(new Error(stderr || error.message)) : resolve(stdout)));
    const evidence = JSON.parse(raw);
    const result = evidence.normalized_result ?? evidence;
    const failed = result.steps?.find((step) => step.status === "failed");
    if (evidence.error || failed) throw new Error(JSON.stringify(failed ?? evidence.error));
    const bytes = screenshot(result.steps?.at(-1)?.artifacts?.screenshot ?? result);
    if (!bytes) throw new Error(`${name}: no screenshot`);
    const image = `${output}/${reference ? "reference" : "ours"}-${name}.png`;
    fs.writeFileSync(image, Buffer.from(bytes, "base64"));
    results.push({ name, image, evidence_id: evidence.evidence_id, scenario: input });
    fs.writeFileSync(`${output}/${reference ? "reference" : "ours"}-captures.json`, JSON.stringify(results, null, 2) + "\n");
    console.log(name, evidence.evidence_id);
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
