import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const output = path.resolve(process.env.SHELL_OUT ?? '.oc-tmp/header-repo-menu');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of ['dark', 'light']) {
    for (const side of ['ref', 'oc']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
      await page.route('**/*', route => new URL(route.request().url()).hostname.endsWith('localhost') ? route.continue() : route.abort());
      try {
        await page.goto(`http://${side === 'ref' ? 'conductor.localhost' : 'localhost'}:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local&oc_number_fixture=1`);
        if (side === 'ref') {
          const row = page.getByText('Ada/fix login redirect', { exact: true }).first();
          const project = page.getByText('tide-web', { exact: true }).first();
          await project.waitFor();
          await page.waitForTimeout(500);
          if (!await row.isVisible()) await project.click();
          await row.click();
          await page.getByText('Fix login redirect loop', { exact: true }).first().waitFor();
        } else {
          await page.locator('.sb-repo-name').filter({ hasText: 'tide-web' }).click();
          await page.getByTestId('left-sidebar-workspace-item').filter({ hasText: 'Ada/fix login redirect' }).click();
          await page.locator('.ws-header').waitFor();
        }
        const trigger = side === 'ref' ? page.locator('button.max-w-48').filter({ hasText: 'tide-web' }) : page.locator('.ws-header').getByRole('button', { name: 'tide-web', exact: true });
        const interactive = await trigger.count() === 1;
        const result = { theme, side, interactive };
        results.push(result);
        if (!interactive) {
          await page.screenshot({ path: path.join(output, `${side}-${theme}.png`) });
          continue;
        }
        await trigger.focus();
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu');
        await menu.waitFor();
        result.items = await menu.getByRole('menuitem').allTextContents();
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(output, `${side}-${theme}.png`) });
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' });
        result.escapeClosed = true;
        await page.waitForTimeout(150);
        result.focusReturned = await trigger.evaluate(el => el === document.activeElement);
        if (side === 'oc') {
          await page.evaluate(() => {
            window.__HEADER_URLS__ = [];
            const original = window.__TAURI_INTERNALS__.invoke;
            window.__TAURI_INTERNALS__.invoke = (command, args) => {
              if (command === 'plugin:opener|open_url') {
                window.__HEADER_URLS__.push(args.url);
                return Promise.resolve();
              }
              return original(command, args);
            };
            window.open = url => { window.__HEADER_URLS__.push(url); return null; };
          });
          await trigger.click();
          await menu.getByRole('menuitem', { name: 'Open on GitHub', exact: true }).click();
          result.githubRequests = await page.evaluate(() => window.__HEADER_URLS__);
          assert.deepEqual(result.githubRequests, ['https://github.com/tide-labs/tide-web']);
          await menu.waitFor({ state: 'hidden' });
        }
        await trigger.click();
        await menu.getByRole('menuitem', { name: 'Repository settings', exact: true }).click();
        if (side === 'ref') await page.waitForURL('**/settings/repos/*/misc');
        else await page.getByRole('heading', { name: 'Misc', exact: true }).waitFor();
        result.settingsOpened = side === 'ref' ? new URL(page.url()).pathname.endsWith('/misc') : await page.getByRole('heading', { name: 'Misc', exact: true }).isVisible();
      } finally { await page.close(); }
    }
  }
  if (process.env.HEADER_REA === '1') {
    const input = {
      browser: { mode: 'launch', executable_path: '/usr/bin/chromium', headless: true },
      start_url: { url: 'http://conductor.localhost:4682/?oc_scenario=populated&oc_theme=dark&oc_org=local&oc_number_fixture=1' },
      environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: 'dark' },
      actions: [
        { step_id: 'settle', action: 'wait_for_timeout', duration_ms: 2500 },
        { step_id: 'project', action: 'click', locator: { kind: 'css', selector: 'text=tide-web' }, timeout_ms: 5000 },
        { step_id: 'workspace', action: 'click', locator: { kind: 'css', selector: 'text=Ada/fix login redirect' }, timeout_ms: 5000 },
        { step_id: 'settle-workspace', action: 'wait_for_timeout', duration_ms: 1000 },
        { step_id: 'repo-menu', action: 'click', locator: { kind: 'css', selector: 'button.max-w-48' }, timeout_ms: 5000 },
        { step_id: 'settle-menu', action: 'wait_for_timeout', duration_ms: 250 },
      ],
      capture: { at_end: ['screenshot', 'dom', 'url'], events: ['page-errors'] },
    };
    const inputPath = path.join(output, 'reference.input.json');
    fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
    const raw = await new Promise((resolve, reject) => {
      const child = spawn('/home/runner/rea/node_modules/.bin/rea', ['capture-browser-scenario', inputPath, '--format', 'json']);
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => stdout += chunk);
      child.stderr.on('data', chunk => stderr += chunk);
      child.on('error', reject);
      child.on('close', code => code ? reject(new Error(stderr)) : resolve(stdout));
    });
    const evidence = JSON.parse(raw);
    const steps = evidence.normalized_result?.steps ?? [];
    const screenshot = steps.at(-1)?.artifacts?.screenshot;
    assert(steps.every(step => step.status === 'completed') && screenshot?.state === 'captured', 'REA reference steps complete');
    fs.writeFileSync(path.join(output, 'reference.png'), Buffer.from(screenshot.value.data_base64, 'base64'));
    screenshot.value = { omitted: 'Saved separately in reference.png' };
    fs.writeFileSync(path.join(output, 'reference.evidence.json'), JSON.stringify(evidence, null, 2));
    console.log('REA', evidence.evidence_id);
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  for (const result of results) {
    assert.equal(result.interactive, true, `${result.side}/${result.theme}: repository breadcrumb opens a menu`);
    assert.deepEqual(result.items.map(item => item.trim()), ['Repository settings', 'Open on GitHub']);
    assert.equal(result.settingsOpened, true, `${result.side}/${result.theme}: opens repository Configuration`);
  }
  console.log('PASS header repository menu and Configuration routing in four dark/light reference/OC contexts');
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
