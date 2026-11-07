import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let base = process.env.TEST_BASE_URL;
let browser;
let server;
before(async () => {
  if (!base) {
    server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    await server.listen();
    base = server.resolvedUrls.local[0].replace(/\/$/, "");
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, reducedMotion: "reduce" });
  await page.goto(`${base}/tools/onboarding/index.html?${query}`);
  await page.getByRole("button", { name: "Sign up", exact: true }).waitFor();
  return page;
}

async function capture(page, name) {
  if (!process.env.SIGN_IN_EVIDENCE) return;
  await fs.mkdir(process.env.SIGN_IN_EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${process.env.SIGN_IN_EVIDENCE}/${name}.png` });
}

for (const strict of ["0", "1"]) {
  const mode = strict === "1" ? "StrictMode" : "production lifecycle";
  test(`${mode}: browser handoff displays its synthetic confirmation code`, async () => {
    const page = await open(`strict=${strict}`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByText("TEST-CODE", { exact: true }).waitFor({ timeout: 1500 });
      assert.match(await page.locator(".onb-signin").getByRole("status").innerText(), /Finish signing in in the browser window/);
    } finally { await capture(page, `code-strict-${strict}`); await page.close(); }
  });

  test(`${mode}: completed account polling leaves sign-in exactly once`, async () => {
    const page = await open(`strict=${strict}`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByRole("button", { name: "Opening browser...", exact: true }).waitFor();
      await page.getByRole("button", { name: "Resolve synthetic account", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="events"]')?.textContent === '["done"]', null, { timeout: 3500 });
      await page.getByRole("button", { name: "Sign up", exact: true }).waitFor();
      assert.equal(await page.getByTestId("events").textContent(), '["done"]');
    } finally { await page.close(); }
  });

  test(`${mode}: failed start shows inline failure and permits a successful retry`, async () => {
    const page = await open(`strict=${strict}&start=retry`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByRole("alert").waitFor({ timeout: 1500 });
      assert.match(await page.getByRole("alert").innerText(), /Couldn't start sign-in/);
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByText("TEST-CODE", { exact: true }).waitFor({ timeout: 1500 });
      assert.equal(await page.getByRole("alert").count(), 0);
    } finally { await capture(page, `retry-strict-${strict}`); await page.close(); }
  });

  test(`${mode}: already signed-in start resolves once`, async () => {
    const page = await open(`strict=${strict}&start=already-signed-in`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="events"]')?.textContent === '["done"]', null, { timeout: 1500 });
      assert.equal(await page.getByTestId("events").textContent(), '["done"]');
    } finally { await page.close(); }
  });
}

test("unmounted sign-up ignores a late login result", async () => {
  const page = await open("start=delayed");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("button", { name: "Opening browser...", exact: true }).waitFor();
  await page.getByRole("button", { name: "Hide sign-up", exact: true }).click();
  await page.getByRole("button", { name: "Resolve synthetic account", exact: true }).click();
  await page.getByRole("button", { name: "Resolve delayed start", exact: true }).click();
  await page.getByRole("button", { name: "Show sign-up", exact: true }).click();
  await page.getByRole("button", { name: "Sign up", exact: true }).waitFor();
  assert.equal(await page.getByTestId("events").textContent(), "[]");
  assert.equal(await page.locator(".onb-signin").getByRole("status").count(), 0);
  await page.close();
});
