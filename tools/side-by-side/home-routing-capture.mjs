import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const output = path.resolve(process.env.SHELL_OUT ?? '.oc-tmp/home-routing-reference');
fs.mkdirSync(output, { recursive: true });
const captures = [];
for (const theme of ['dark', 'light']) {
  const input = {
    browser: { mode: 'launch', executable_path: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true },
    start_url: { url: `http://conductor.localhost:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local` },
    environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: theme, locale: 'en-US', timezone: 'UTC' },
    actions: [
      { step_id: 'settle-root', action: 'wait_for_timeout', duration_ms: 2000 },
      { step_id: 'sidebar-home', action: 'click', locator: { kind: 'css', selector: 'div[data-active][title^="Home"]' }, timeout_ms: 5000 },
      { step_id: 'settle-list', action: 'wait_for_timeout', duration_ms: 1000 },
    ],
    capture: { at_end: ['screenshot', 'dom', 'url'], events: ['console', 'page-errors'] },
  };
  const inputPath = path.join(output, `ref-${theme}.input.json`);
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
  const raw = await new Promise((resolve, reject) => {
    const child = spawn(process.env.REA ?? '/home/runner/rea/node_modules/.bin/rea', ['capture-browser-scenario', inputPath, '--format', 'json']);
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => stdout += chunk);
    child.stderr.on('data', (chunk) => stderr += chunk);
    child.on('error', reject);
    child.on('close', (code) => code ? reject(new Error(stderr)) : resolve(stdout));
  });
  const evidence = JSON.parse(raw);
  const steps = evidence.normalized_result?.steps;
  const artifacts = steps?.at(-1)?.artifacts;
  const image = artifacts?.screenshot;
  if (image?.state !== 'captured' || steps.some((step) => step.status !== 'completed') || artifacts?.url?.value?.url !== 'http://conductor.localhost:4682/all-workspaces') {
    fs.writeFileSync(path.join(output, `ref-${theme}.failure.json`), raw);
    throw new Error(`ref/${theme}: REA screenshot not captured`);
  }
  const png = Buffer.from(image.value.data_base64, 'base64');
  fs.writeFileSync(path.join(output, `ref-${theme}.png`), png);
  const compact = { ...evidence, normalized_result: { ...evidence.normalized_result, steps: steps.map((step) => ({ ...step, artifacts: step.artifacts ? { ...step.artifacts, screenshot: step.artifacts.screenshot ? { state: step.artifacts.screenshot.state, value: { omitted: 'Image saved separately' } } : undefined } : undefined })) } };
  fs.writeFileSync(path.join(output, `ref-${theme}.evidence.json`), JSON.stringify(compact, null, 2));
  captures.push({ theme, evidence_id: evidence.evidence_id, screenshotSHA256: createHash('sha256').update(png).digest('hex'), steps: steps.map(({ step_id, status }) => ({ step_id, status })), url: artifacts.url });
  fs.writeFileSync(path.join(output, 'captures.json'), JSON.stringify(captures, null, 2));
  console.log(JSON.stringify(captures.at(-1)));
}
