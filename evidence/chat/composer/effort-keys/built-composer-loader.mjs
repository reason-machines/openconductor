// Disposable adapter: run existing browser verifiers against the built Composer fixture.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...pageArgs) => {
    const page = await newPage(...pageArgs);
    await page.route('http://localhost:4469/**', async route => {
      const pathname = new URL(route.request().url()).pathname.replace(/^\/tools\/composer\//, '/');
      const root = path.resolve('tools/composer/.qa/effort-demo');
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}/`) || !fs.existsSync(file)) return route.abort();
      const contentType = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[path.extname(file)] ?? 'application/octet-stream';
      await route.fulfill({path:file,contentType});
    });
    return page;
  };
  return browser;
};
