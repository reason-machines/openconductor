import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = process.env.SHELL_OUT ?? '.oc-tmp/local-header-number';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of ['dark', 'light']) {
    for (const side of ['ref', 'oc']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
      try {
        await page.goto(`http://${side === 'ref' ? 'conductor.localhost' : 'localhost'}:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local&oc_number_fixture=1`);
        if (side === 'ref') {
          const row = page.getByText('Ada/fix login redirect', { exact: true }).first();
          const project = page.getByText('tide-web', { exact: true }).first();
          await project.waitFor();
          await page.waitForTimeout(250);
          if (!await row.isVisible()) await project.click();
          await row.click();
          await page.getByText('Fix login redirect loop', { exact: true }).first().waitFor();
        } else {
          await page.locator('.sb-repo-name').filter({ hasText: 'tide-web' }).click();
          await page.getByTestId('left-sidebar-workspace-item').filter({ hasText: 'Ada/fix login redirect' }).click();
          await page.locator('.ws-header').waitFor();
        }
        await page.waitForTimeout(500);
        const settings = await page.evaluate((reference) => reference
          ? window.__OC_DB__.conductor.exec("SELECT value FROM settings WHERE key='experimental_show_workspace_numbers'")[0].values[0][0]
          : JSON.parse(localStorage.getItem('openconductor.settings.preview')).experimental.experimental_show_workspace_numbers, side === 'ref');
        assert.equal(String(settings), 'true', `${side}/${theme}: setting is actually enabled`);
        const badgeCount = await page.getByRole('button', { name: /^Copy link to W-/ }).count();
        const number = await page.evaluate((reference) => reference
          ? window.__OC_DB__.conductor.exec("SELECT number FROM workspaces WHERE local_id='ws-lisbon'")[0].values[0][0]
          : JSON.parse(localStorage.getItem('openconductor.shell.v1')).repos[0].workspaces.find((workspace) => workspace.id === 'ws-lisbon').number, side === 'ref');
        assert.equal(number, 1, `${side}/${theme}: workspace really has a number`);
        await page.screenshot({ path: path.join(output, `${side}-${theme}.png`) });
        results.push({ side, theme, settings, workspaceNumber: number, badgeCount, route: new URL(page.url()).pathname });
        assert.equal(badgeCount, 0, `${side}/${theme}: local header must not render the remote-only workspace-number badge`);
        if (side === 'ref') await page.getByText('Home', { exact: true }).first().click();
        else await page.goto(`http://localhost:4682/all-workspaces?oc_scenario=populated&oc_theme=${theme}&oc_number_fixture=1&oc_number_surface=home`);
        await page.getByText('W-1', { exact: true }).first().waitFor();
        results.at(-1).homeNumbers = 'visible';
        await page.keyboard.press('Meta+k');
        const palette = page.getByRole('dialog');
        await palette.getByText('Workspaces', { exact: true }).click();
        await palette.getByText('W-1', { exact: true }).first().waitFor();
        results.at(-1).paletteNumbers = 'visible';
      } finally { await page.close(); }
    }
  }
  console.log('PASS local headers omit remote-only number badge in dark/light despite enabled setting and numbered workspaces');
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
