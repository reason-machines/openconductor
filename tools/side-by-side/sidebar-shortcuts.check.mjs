import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve(process.env.SHELL_OUT ?? '.oc-tmp/sidebar-shortcuts');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of ['dark', 'light']) {
    for (const group of ['repo', 'status']) {
      for (const filter of ['All projects', 'tide-web', 'tide-api']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
        try {
          await page.goto(`http://localhost:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local&oc_sort_fixture=1&oc_group_fixture=1&oc_shortcut_fixture=1&oc_group_by=${group}`);
          const header = page.getByRole('button', { name: 'My workspaces actions', exact: true });
          await header.waitFor();
          if (filter !== 'All projects') {
            await header.click();
            await page.getByRole('menuitem', { name: 'Filter by project', exact: true }).click();
            await page.getByRole('menuitemradio', { name: filter, exact: true }).click();
          }
          const focus = page.locator('[data-navigation-section-drop-id="focus"] .sb-section-toggle');
          const rows = page.getByTestId('left-sidebar-workspace-item');
          const expandedCount = filter === 'All projects' ? 6 : 4;
          const verifyActivation = async (context, expectedCount) => {
            await page.waitForFunction((count) => document.querySelectorAll('[data-testid="left-sidebar-workspace-item"]').length === count, expectedCount, { timeout: 3000 });
            const targets = await rows.evaluateAll((buttons) => buttons.map((button) => ({ title: button.title, number: Number(button.querySelector('.sb-ws-hint')?.textContent) })));
            assert.ok(targets.length > 0, `${context}: no visible rows`);
            for (const target of targets) {
              assert.ok(target.number >= 1 && target.number <= 9, `${context}: missing numbered hint`);
              await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
              await page.keyboard.press(`Meta+${target.number}`);
              try {
                await page.waitForFunction((title) => document.querySelector('.sb-ws[data-active="true"]')?.title === title, target.title, { timeout: 3000 });
              } catch (error) {
                const observed = await page.evaluate(() => ({ selection: JSON.parse(localStorage.getItem('openconductor.shell.v1')).selection, active: document.querySelector('.sb-ws[data-active="true"]')?.title, rows: [...document.querySelectorAll('.sb-ws')].map((button) => ({ title: button.title, number: button.querySelector('.sb-ws-hint')?.textContent })) }));
                fs.writeFileSync(path.join(output, 'activation-failure.json'), JSON.stringify({ theme, group, filter, context, target, observed }, null, 2));
                await page.screenshot({ path: path.join(output, 'activation-failure.png') });
                throw error;
              }
            }
            const selected = await page.evaluate(() => JSON.parse(localStorage.getItem('openconductor.shell.v1')).selection);
            await page.keyboard.press('Meta+9');
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('openconductor.shell.v1')).selection), selected, `${context}: out-of-range changed selection`);
            results.push({ theme, group, filter, context, targets, selected, outOfRange: 'unchanged' });
          };
          await verifyActivation('expanded', expandedCount);
          await focus.click();
          assert.equal(await focus.getAttribute('aria-expanded'), 'false');
          await verifyActivation('collapsed', expandedCount - 2);
          if (group === 'status' && filter === 'tide-web') {
            await page.keyboard.down('Meta');
            await page.waitForTimeout(600);
            await page.screenshot({ path: path.join(output, `after-${theme}.png`) });
            await page.keyboard.up('Meta');
          }
          await focus.click();
          await verifyActivation('re-expanded', expandedCount);
          if (group === 'status') {
            await page.locator('[data-status-group="in-progress"] .sb-status-header').click();
            await verifyActivation('status-group-collapsed', 3);
          }
        } finally {
          await page.close();
        }
      }
    }
  }
  fs.writeFileSync(path.join(output, 'activation-checks.json'), JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} actual Meta+number contexts: dark/light, Project/Status, all/tide-web/tide-api, expanded/collapsed/re-expanded; out-of-range unchanged`);
} finally {
  await browser.close();
}
