// Run against a supported Vite preview: node tools/chat/startup.browser.mjs http://localhost:4179
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { fakeBackend } from "../../tests/e2e/right-panel-fixture.mjs";

const base = process.argv[2];
assert.ok(base, "pass the URL of a running Vite server");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const shell = {
  repos: [{ id: "r1", name: "proj", path: "/isolated/proj", defaultBranch: "main", workspaces: [
    { id: "fork", name: "osaka", branch: "e2e-v1", path: "/isolated/fork" },
    { id: "original", name: "e2e", branch: "e2e", path: "/isolated/original" },
  ] }],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "fork" },
};
const original = 'button[data-testid="left-sidebar-workspace-item"][title*=" · e2e · "]';
const app = ".app";
let checks = 0;
const pass = (name) => { checks++; console.log(`PASS ${name}`); };

async function desktop() {
  const context = await browser.newContext();
  await context.addInitScript(fakeBackend, { shell, files: [] });
  await context.addInitScript(() => {
    const backend = window.__TAURI_INTERNALS__.invoke;
    window.__startupTest = { workspaces: [], sections: [] };
    window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      const key = cmd === "db_list_workspaces" ? "workspaces" : cmd === "db_read_navigation_sections" ? "sections" : null;
      if (key) {
        const value = key === "sections" ? { sections: [], updatedAt: 0 } : await backend(cmd, args);
        return new Promise((resolve, reject) => window.__startupTest[key].push({ resolve, reject, value }));
      }
      if (cmd === "plugin:deep-link|get_current") return null;
      return backend(cmd, args);
    };
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.__startupTest?.workspaces.length >= 2 && window.__startupTest?.sections.length >= 2);
  return { page, context };
}

try {
  const { page, context } = await desktop();
  assert.equal(await page.locator(app).getAttribute("data-startup"), "loading");
  assert.equal(await page.locator(app).getAttribute("aria-busy"), "true");
  pass("desktop shell is busy before database rows arrive");

  await page.evaluate(() => { const read = window.__startupTest.workspaces.at(-1); read.resolve(read.value); });
  await page.locator(original).waitFor();
  assert.equal(await page.locator(app).getAttribute("data-startup"), "loading");
  pass("visible workspace rows do not imply sidebar sections are loaded");

  await page.evaluate(() => { const read = window.__startupTest.sections.at(-1); read.resolve(read.value); });
  await page.locator(`${app}[data-startup="ready"][aria-busy="false"]`).waitFor();
  await page.locator(original).click();
  assert.equal(await page.locator(original).getAttribute("aria-current"), "page");
  pass("ready shell accepts original-workspace navigation");

  await page.evaluate(async () => {
    const oldRows = window.__startupTest.workspaces[0];
    oldRows.resolve(oldRows.value.filter((w) => w.id !== "original"));
    window.__startupTest.sections[0].resolve({ sections: [], updatedAt: 100 });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.locator(original).getAttribute("aria-current"), "page");
  assert.match(await page.locator(".ws-title").innerText(), /e2e/);
  assert.equal(await page.locator(app).getAttribute("data-startup"), "ready");
  pass("cancelled StrictMode read cannot remove or replace the selected workspace");
  await context.close();

  const failed = await desktop();
  await failed.page.evaluate(() => {
    window.__startupTest.workspaces.at(-1).reject(new Error("isolated test database unavailable"));
    window.__startupTest.sections.at(-1).resolve({ sections: [], updatedAt: 0 });
  });
  await failed.page.locator(`${app}[data-startup="error"][aria-busy="false"]`).waitFor();
  assert.equal(await failed.page.locator(`${app}[data-startup="ready"]`).count(), 0);
  pass("failed database load is error, never ready or permanently busy");
  await failed.context.close();

  const plain = await browser.newContext();
  const plainPage = await plain.newPage();
  await plainPage.goto(base);
  await plainPage.getByRole("button", { name: "Continue without signing in", exact: true }).click();
  await plainPage.locator(`${app}[data-startup="ready"][aria-busy="false"]`).waitFor();
  pass("plain browser has no desktop hydration to wait for");
  await plain.close();
  console.log(`${checks} startup checks passed`);
} finally {
  await browser.close();
}
