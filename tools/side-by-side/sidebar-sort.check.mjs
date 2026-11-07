import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve(process.env.SHELL_OUT ?? '.oc-tmp/sidebar-sort');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of ['dark', 'light']) {
    for (const side of ['ref', 'oc']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
      await page.goto(`http://${side === 'ref' ? 'conductor.localhost' : 'localhost'}:4682/?oc_scenario=populated&oc_theme=${theme}&oc_org=local&oc_sort_fixture=1`);
      const header = page.getByRole('button', { name: 'My workspaces actions', exact: true });
      await header.waitFor();
      const rows = page.locator('[data-testid="left-sidebar-workspace-item"]');
      if (await rows.count() < 3) await page.getByText('tide-web', { exact: true }).click();
      const order = async () => (await rows.allInnerTexts()).flatMap((text) => {
        if (text.includes('dark mode tokens')) return ['osaka'];
        if (text.includes('login redirect')) return ['lisbon'];
        if (text.includes('Add search to settings')) return ['quito'];
        return [];
      });
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="left-sidebar-workspace-item"]').length >= 3);
      assert.deepEqual(await order(), ['osaka', 'lisbon', 'quito'], `${side} ${theme} Updated rows`);
      await header.click();
      const sort = page.getByRole('menuitem', { name: 'Sort by', exact: true });
      await sort.click();
      const updated = page.getByRole('menuitemradio', { name: 'Updated', exact: true });
      const created = page.getByRole('menuitemradio', { name: 'Created', exact: true });
      await created.waitFor();
      assert.equal(await updated.getAttribute('aria-checked'), 'true', `${side} ${theme} default Updated`);
      const geometry = await updated.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { width: r.width, height: r.height, fontSize: style.fontSize, lineHeight: style.lineHeight };
      });
      await created.click();
      await page.waitForFunction(() => !document.querySelector('[role="menuitemradio"]'));
      assert.deepEqual(await order(), ['lisbon', 'quito', 'osaka'], `${side} ${theme} Created rows`);
      await header.click();
      await sort.click();
      await created.waitFor();
      assert.equal(await created.getAttribute('aria-checked'), 'true', `${side} ${theme} Created checked`);
      await updated.click();
      await page.waitForFunction(() => !document.querySelector('[role="menuitemradio"]'));
      assert.deepEqual(await order(), ['osaka', 'lisbon', 'quito'], `${side} ${theme} Updated restored`);
      if (side === 'oc') {
        await header.click();
        await sort.focus();
        await page.keyboard.press('ArrowRight');
        await updated.waitFor();
        assert.equal(await page.locator(':focus').innerText(), 'Updated');
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator(':focus').innerText(), 'Created');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.locator(':focus').innerText(), 'Sort by');
        await page.keyboard.press('ArrowRight');
        await created.click();
        await page.reload();
        await header.waitFor();
        if (await rows.count() < 3) await page.getByText('tide-web', { exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="left-sidebar-workspace-item"]').length >= 3);
        assert.deepEqual(await order(), ['lisbon', 'quito', 'osaka'], `${theme} persisted Created`);
      }
      results.push({ side, theme, geometry, updatedOrder: ['osaka', 'lisbon', 'quito'], createdOrder: ['lisbon', 'quito', 'osaka'] });
      await page.close();
    }
  }
  for (const theme of ['dark', 'light']) {
    const ref = results.find((r) => r.side === 'ref' && r.theme === theme);
    const oc = results.find((r) => r.side === 'oc' && r.theme === theme);
    assert.deepEqual(oc.geometry, ref.geometry, `${theme} Sort radio geometry and typography`);
  }
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
  console.log('PASS dark/light scoped local-account Sort by, Updated/Created ordering, checked states and radio geometry; OpenConductor keyboard and reload persistence');
} finally {
  await browser.close();
}
