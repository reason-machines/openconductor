import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve(process.env.SHELL_OUT ?? '.oc-tmp/sidebar-group');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
    await page.goto(`http://localhost:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local&oc_sort_fixture=1&oc_group_fixture=1`);
    const header = page.getByRole('button', { name: 'My workspaces actions', exact: true });
    await header.waitFor();
    await header.click();
    await page.getByRole('menuitem', { name: 'Group by', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Status', exact: true }).click();
    const chooseFilter = async (name) => {
      await header.click();
      await page.getByRole('menuitem', { name: 'Filter by project', exact: true }).click();
      await page.getByRole('menuitemradio', { name, exact: true }).click();
    };
    const progress = page.locator('[data-status-group="in-progress"]');
    const rows = page.getByTestId('left-sidebar-workspace-item');
    await chooseFilter('tide-web');
    await page.waitForFunction(() => document.querySelector('[data-status-group="in-progress"] .sb-status-count')?.textContent === '2');
    assert.deepEqual(await page.locator('[data-status-group]').evaluateAll((groups) => groups.map((group) => Number(group.querySelector('.sb-status-count')?.textContent ?? 0))), [0, 1, 2, 0, 0]);
    await progress.getByRole('button').click();
    assert.deepEqual(await rows.locator('.sb-ws-name').allTextContents(), ['Ada/dark mode tokens', 'Ada/fix login redirect']);
    assert.deepEqual(await rows.locator('.sb-ws-hint').allTextContents(), ['1', '2']);
    assert.equal(await rows.locator('.sb-ws-repo').count(), 0);
    await page.screenshot({ path: path.join(output, `oc-filter-${theme}.png`) });
    await progress.getByRole('button').click();
    await page.reload();
    await header.waitFor();
    await progress.waitFor();
    assert.equal(await progress.getByRole('button').getAttribute('aria-expanded'), 'false');
    assert.equal(await rows.count(), 0);
    assert.equal(await progress.locator('.sb-status-count').innerText(), '2');
    await header.click();
    await page.getByRole('menuitem', { name: 'Filter by project', exact: true }).click();
    assert.equal(await page.getByRole('menuitemradio', { name: 'tide-web', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('menuitemradio', { name: 'All projects', exact: true }).click();
    assert.equal(await progress.locator('.sb-status-count').innerText(), '4');
    await progress.getByRole('button').click();
    assert.deepEqual(await rows.locator('.sb-ws-hint').allTextContents(), ['1', '2', '3', '4']);
    assert.equal(await rows.locator('.sb-ws-repo').count(), 4);
    results.push({ theme, filteredCounts: [0, 1, 2, 0, 0], filteredRows: ['Ada/dark mode tokens', 'Ada/fix login redirect'], shortcutNumbers: [1, 2], reload: 'filter, grouping and explicit collapse retained in isolated browser storage', clearFilter: 'four rows and four shortcut numbers restored' });
    await page.close();
  }
  fs.writeFileSync(path.join(output, 'filter-checks.json'), JSON.stringify(results, null, 2));
  console.log('PASS Group by dark/light filter rows/counts, keyboard-number projection, collapse/filter/grouping reload and All projects restoration');
} finally {
  await browser.close();
}
