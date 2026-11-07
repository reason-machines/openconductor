// Run inside the owned tools/open-in/server.mjs preview namespace.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.OPEN_IN_BASE_URL;
const out = process.env.OUT;
assert.ok(base && out);
fs.mkdirSync(out, { recursive: true });
const results = {};
for (const side of process.env.ACTIVATION_ONLY ? [] : ['reference', 'ours']) {
  const input = { browser: { mode: 'launch', executable_path: '/usr/bin/chromium', headless: true }, start_url: { url: base + (side === 'reference' ? '/__reference/' : '/') }, environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: 'dark', locale: 'en-US', timezone: 'UTC' }, actions: [
    ...(side === 'reference' ? [
      { step_id: 'repo', action: 'click', locator: { kind: 'css', selector: 'text=tide-web' }, timeout_ms: 20000 },
      { step_id: 'workspace', action: 'click', locator: { kind: 'css', selector: 'text=Ada/fix login redirect' }, timeout_ms: 10000 },
    ] : [{ step_id: 'ready', action: 'wait_for', locator: { kind: 'css', selector: '.oi-chevron' }, state: 'visible', timeout_ms: 20000 }]),
    { step_id: 'open', action: 'press', locator: { kind: 'css', selector: 'body' }, key: 'Meta+k' },
    { step_id: 'query', action: 'fill', locator: { kind: 'css', selector: '[role=dialog] input[placeholder]' }, value: { source: 'literal', value: 'VS Code' } },
    { step_id: 'row', action: 'wait_for', locator: { kind: 'css', selector: side === 'reference' ? '[cmdk-item][data-value="open-in-vscode"]' : '.palette-item >> text=VS Code' }, state: 'visible', timeout_ms: 10000 },
    { step_id: 'settle', action: 'wait_for_timeout', duration_ms: 500 },
  ], capture: { at_end: ['screenshot', 'url', 'dom'], events: ['console', 'page-errors'] } };
  const file = path.join(out, `${side}.input.json`);
  fs.writeFileSync(file, JSON.stringify(input, null, 2));
  const run = spawnSync(process.env.REA, ['capture-browser-scenario', file, '--format', 'json'], { encoding: 'utf8', maxBuffer: 32 << 20, timeout: 80000 });
  if (!run.stdout) throw new Error(`${side}: ${run.error ?? run.stderr}`);
  const ev = JSON.parse(run.stdout);
  fs.writeFileSync(path.join(out, `${side}.evidence.json`), run.stdout);
  const steps = ev.normalized_result.steps;
  assert.ok(steps.every((s) => s.status === 'completed'), `${side}: ${JSON.stringify(steps.map((s) => [s.step_id, s.status, s.error]))}`);
  const png = steps.at(-1).artifacts.screenshot;
  assert.equal(png.state, 'captured');
  fs.writeFileSync(path.join(out, `${side}.png`), Buffer.from(png.value.data_base64, 'base64'));
  results[side] = { evidence_id: ev.evidence_id, steps: steps.length };
}
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(base);
  await page.locator('.oi-chevron').waitFor();
  await page.keyboard.press('Meta+k');
  await page.locator('.palette-input').fill('VS Code');
  await page.locator('.palette-item', { hasText: 'VS Code' }).click();
  await page.waitForFunction(() => window.__fake.calls.some((c) => c.cmd === 'open_in_app' && c.appId === 'vscode'));
  const calls = await page.evaluate(() => window.__fake.calls.filter((c) => ['record_open_in', 'open_in_app'].includes(c.cmd)));
  assert.equal(calls[0].cmd, 'record_open_in');
  assert.equal(calls[1].path, '/Users/demo/code/tide-web/lisbon');
  await page.locator('.palette').waitFor({ state: 'hidden' });
  results.activation = calls;
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
console.log('PALETTE_OPEN_IN_PROOF_PASS', JSON.stringify(results));
