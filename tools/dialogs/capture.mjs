import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const port = process.env.PORT ?? "4392";
const rea = process.env.REA ?? "rea";
const out = path.resolve(process.env.DIALOG_EVIDENCE ?? ".rea-work/dialog-captures");
fs.mkdirSync(out, { recursive: true });
const css = (selector) => ({ kind: "css", selector });
const click = (selector, button) => ({ action: "click", locator: css(selector), ...(button ? { button } : {}), timeout_ms: 5000 });
const states = {
  rename: { title: "Rename workspace", ref: [click("text=tide-web"), click("text=Ada/fix login redirect", "right"), click("[role=menuitem] >> text=Rename")] },
  clone: { title: "Clone GitHub repo", ref: [click("text=Open GitHub project")] },
  create: { title: "Create project", ref: [click("text=Quick start")] },
  remove: { title: "Remove tide-web?", ref: [click("text=tide-web", "right"), click("[role=menuitem] >> text=Remove repository")] },
};
const manifest = {};
for (const [name, state] of Object.entries(states)) {
  if (process.env.DIALOG_STATES && !process.env.DIALOG_STATES.split(",").includes(name)) continue;
  manifest[name] = {};
  for (const side of ["ref", "oc"]) {
    const actions = [{ action: "wait_for_timeout", duration_ms: 3000 }];
    for (const action of side === "ref" ? state.ref : []) actions.push(action, { action: "wait_for_timeout", duration_ms: 400 });
    actions.push({ action: "wait_for_timeout", duration_ms: 600 });
    const input = {
      browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
      start_url: { url: side === "ref" ? `http://127.0.0.1:${port}/?oc_scenario=populated&oc_theme=dark` : `http://localhost:${port}/tools/dialogs/index.html?dialog=${name}&reference=1` },
      environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions: actions.map((action, index) => ({ step_id: `s${index}`, ...action })),
      capture: { at_end: ["screenshot", "dom", "url"], events: ["console", "page-errors"] },
    };
    const inputFile = path.join(out, `${side}-${name}.input.json`);
    fs.writeFileSync(inputFile, JSON.stringify(input));
    const result = spawnSync(rea, ["capture-browser-scenario", inputFile, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    try {
      const evidence = JSON.parse(result.stdout);
      const normalized = evidence.normalized_result;
      const artifacts = normalized?.steps?.at(-1)?.artifacts;
      if (artifacts?.screenshot?.state !== "captured") throw new Error(JSON.stringify(normalized?.issues ?? evidence).slice(0, 500));
      const png = Buffer.from(artifacts.screenshot.value.data_base64, "base64");
      fs.writeFileSync(path.join(out, `${side}-${name}.png`), png);
      const dom = artifacts.dom?.value?.html ?? artifacts.dom?.value?.content ?? JSON.stringify(artifacts.dom?.value);
      fs.writeFileSync(path.join(out, `${side}-${name}.html`), dom);
      if (!dom.includes(state.title)) throw new Error(`Captured DOM lacks ${state.title}`);
      manifest[name][side] = { evidence_id: evidence.evidence_id, png_sha256: createHash("sha256").update(png).digest("hex"), input: `${side}-${name}.input.json` };
      console.log(`${side}-${name}: ${evidence.evidence_id}`);
    } catch (error) {
      manifest[name][side] = { error: String(error) };
      fs.writeFileSync(path.join(out, `${side}-${name}.failure.txt`), result.stderr + "\n" + result.stdout.slice(0, 12000));
      console.error(`${side}-${name}: ${error}`);
    }
    fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
}
