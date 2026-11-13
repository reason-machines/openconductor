import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startViteFixture } from "./vite-fixture-server.mjs";

let base = process.env.DIALOGS_URL;
let browser;
let server;
before(async () => {
  if (!base) {
    server = await startViteFixture();
    base = server.base;
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
});
after(async () => {
  try { await browser?.close(); } finally { await server?.close(); }
});

async function open(t) {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const pageErrors = [];
  const moduleFailures = [];
  const record = (events, event) => { if (events.length < 12) events.push(event); };
  const isModule = (request) => request.resourceType() === "script" || /\.[cm]?[jt]sx?(?:[?#]|$)/.test(request.url());
  page.on("pageerror", (error) => {
    try { record(pageErrors, { message: error.message.slice(0, 2000), stack: error.stack?.slice(0, 4000) }); } catch {}
  });
  page.on("response", (response) => {
    try {
      if (!response.ok() && isModule(response.request())) {
        record(moduleFailures, { url: response.url().slice(0, 2000), status: response.status(), statusText: response.statusText().slice(0, 200) });
      }
    } catch {}
  });
  page.on("requestfailed", (request) => {
    try {
      if (isModule(request)) record(moduleFailures, { url: request.url().slice(0, 2000), failure: request.failure()?.errorText.slice(0, 2000) });
    } catch {}
  });
  let phase = "goto";
  try {
    await page.goto(`${base}/tools/dialogs/index.html?workspaceFixture=1`);
    phase = "workspace opener click";
    await page.getByRole("button", { name: "workspace", exact: true }).click();
    phase = "New workspace dialog";
    await page.getByRole("dialog", { name: "New workspace", exact: true }).waitFor();
    phase = "First message textbox";
    await page.getByRole("textbox", { name: "First message" }).waitFor();
    return page;
  } catch (error) {
    let snapshot;
    try {
      snapshot = await page.evaluate(() => {
        const root = document.getElementById("root");
        return { readyState: document.readyState, rootExists: root !== null, rootHTML: root?.outerHTML.slice(0, 6000) ?? null };
      });
      snapshot.openerMatches = await page.getByRole("button", { name: "workspace", exact: true }).count();
    } catch (diagnosticError) {
      snapshot = { ...snapshot, captureError: String(diagnosticError).slice(0, 2000) };
    }
    try {
      t.diagnostic(`[workspace-open] ${JSON.stringify({ phase, url: page.url().slice(0, 2000), ...snapshot, pageErrors, moduleFailures })}`);
    } catch {}
    throw error;
  }
}

for (const key of ["Tab", "Shift+Tab"]) {
  test(`New workspace: ${key} stays inside the actual dialog and Escape restores opener focus`, async (t) => {
    const page = await open(t);
    try {
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(key);
        await page.waitForFunction(() => document.querySelector('[aria-labelledby="create-dialog-title"]')?.contains(document.activeElement), null, { timeout: 1500 });
      }
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "New workspace", exact: true }).waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.textContent === "workspace", null, { timeout: 1500 });
      assert.equal(await page.getByTestId("events").textContent(), "[]");
    } finally { await page.close(); }
  });
}

test("New workspace: nested Create from consumes the first Escape, outer dialog consumes the second", async (t) => {
  const page = await open(t);
  try {
    await page.getByRole("button", { name: "Create from", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Create new workspace from PR, branch, or issue", exact: true });
    await picker.waitFor();
    await picker.getByRole("textbox").focus();
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("dialog", { name: "New workspace", exact: true }).count(), 1);
    await page.getByRole("textbox", { name: "First message" }).focus();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "New workspace", exact: true }).waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "workspace", null, { timeout: 1500 });
  } finally { await page.close(); }
});

test("New workspace: accepted launch dismisses before creation settles and detached failure preserves a replacement dialog", async (t) => {
  const page = await open(t);
  try {
    const dialog = page.getByRole("dialog", { name: "New workspace", exact: true });
    await dialog.getByRole("group", { name: "Create workspace", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.createPending === "true");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("events").textContent(), "[]");
    await page.getByRole("button", { name: "archive", exact: true }).click();
    const replacement = page.getByRole("dialog", { name: "Archive workspace?", exact: true });
    await replacement.waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event("fixture:reject-create")));
    await page.waitForFunction(() => document.querySelector('[data-testid="events"]')?.textContent?.includes("Fixture creation failed"));
    assert.deepEqual(JSON.parse(await page.getByTestId("events").textContent()), ["Failed to create workspace: Fixture creation failed"]);
    assert.equal(await replacement.count(), 1);
    assert.equal(await dialog.count(), 0);
  } finally { await page.close(); }
});
