import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = process.env.SHELL_OUT ?? '.oc-tmp/home-routing';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const side of (process.env.SHELL_SIDES ?? 'ref,oc').split(',')) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
      page.setDefaultTimeout(5000);
      try {
        const base = `http://${side === 'ref' ? 'conductor.localhost' : 'localhost'}:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local`;
        for (const trigger of ['sidebar', 'shortcut', 'palette']) {
          await page.goto(base);
          const home = page.getByText('Home', { exact: true }).first();
          await home.waitFor();
          await page.getByText('Quick start', { exact: true }).waitFor();
          const rootActive = await home.evaluate((node) => node.closest('[data-active]')?.getAttribute('data-active') === 'true');
          if (trigger === 'sidebar') await home.click();
          if (trigger === 'shortcut') await page.keyboard.press('Meta+Shift+h');
          if (trigger === 'palette') {
            await page.keyboard.press('Meta+k');
            const palette = page.getByRole('dialog');
            await palette.getByRole('combobox').fill('Home');
            await palette.getByText('Home', { exact: true }).click();
          }
          await page.waitForTimeout(400);
          const listVisible = await page.getByText('Create workspace', { exact: true }).isVisible()
            && await page.getByPlaceholder('Search', { exact: true }).isVisible();
          const homeActive = await page.getByText('Home', { exact: true }).first().evaluate((node) => node.closest('[data-active]')?.getAttribute('data-active') === 'true');
          const row = { side, theme, trigger, rootActive, listVisible, homeActive, route: new URL(page.url()).pathname };
          results.push(row);
          await page.screenshot({ path: path.join(output, `${side}-${theme}-${trigger}.png`) });
          console.log(JSON.stringify(row));
        }
      } finally { await page.close(); }
    }
  }
  for (const row of results) {
    assert.equal(row.rootActive, false, `${row.side}/${row.theme}/${row.trigger}: entry cards are not the active Home list`);
    assert.equal(row.listVisible, true, `${row.side}/${row.theme}/${row.trigger}: Home opens the workspace list`);
    assert.equal(row.homeActive, true, `${row.side}/${row.theme}/${row.trigger}: Home list activates the sidebar row`);
  }
  console.log(`PASS ${results.length} Home navigation contexts`);
} finally {
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
