import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";
import { startViteFixture } from "./vite-fixture-server.mjs";

let base = process.env.TEST_BASE_URL;
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

async function open(query, label = "Sign up") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await page.goto(`${base}/tools/onboarding/index.html?${query}`);
  await page.getByRole("button", { name: label, exact: true }).waitFor();
  return page;
}

async function calls(page) {
  return JSON.parse(await page.getByTestId("calls").textContent());
}

async function expectCalls(page, expected) {
  await page.waitForFunction((values) => {
    const output = document.querySelector('[data-testid="calls"]');
    if (!output) return false;
    const actual = JSON.parse(output.textContent);
    return Object.entries(values).every(([key, value]) => actual[key] === value);
  }, expected);
  const actual = await calls(page);
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value);
}

async function capture(page, name) {
  if (!process.env.SIGN_IN_EVIDENCE) return;
  await fs.mkdir(process.env.SIGN_IN_EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${process.env.SIGN_IN_EVIDENCE}/${name}.png` });
}

test("completed onboarding with a working CLI opens Home despite an update warning", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  try {
    await page.goto(`${base}/tools/onboarding/index.html?surface=startup&setup=working-cli-warning`);
    await page.getByTestId("startup-home").waitFor();
    await page.getByRole("status").filter({ hasText: "The Reason CLI update could not be verified. Using the installed CLI." }).waitFor();
    assert.equal(await page.getByTestId("reason-cli-setup").count(), 0);
    assert.equal(await page.locator(".onb").count(), 0);
    await expectCalls(page, { attempts: 0, opens: 0 });
    await capture(page, "working-cli-update-warning");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "The Reason CLI update could not be verified." }).waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("startup-home").isVisible(), true);
  } finally { await page.close(); }
});

test("Settings preserves an unavailable pinned workspace instead of showing the account default", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  try {
    await page.goto(`${base}/tools/onboarding/index.html?surface=settings&account=connected&workspace=removed-workspace`);
    const workspace = page.getByRole("combobox", { name: "Workspace for new chats" });
    await workspace.waitFor();
    assert.equal(await workspace.inputValue(), "removed-workspace");
    await page.getByRole("alert").filter({ hasText: "Not signed in to removed-workspace" }).waitFor();
    assert.match(await page.getByTestId("reason-tab").innerText(), /removed-workspace \(unavailable\)/);
    await capture(page, "unavailable-pinned-workspace");
    await workspace.selectOption("fixture-workspace");
    assert.equal(await workspace.inputValue(), "fixture-workspace");
    assert.equal(await page.getByRole("alert").filter({ hasText: "Not signed in to" }).count(), 0);
    assert.doesNotMatch(await page.getByTestId("reason-tab").innerText(), /\(unavailable\)/);

    await page.goto(`${base}/tools/onboarding/index.html?surface=settings&account=connected`);
    await workspace.getByRole("option", { name: "Fixture workspace", exact: true }).waitFor({ state: "attached" });
    assert.equal(await workspace.inputValue(), "");
    assert.equal(await workspace.getByRole("option", { name: "Choose a workspace", exact: true }).isDisabled(), true);
    assert.equal(await workspace.getByRole("option", { name: "Fixture workspace", exact: true }).evaluate((option) => option.selected), false);
    await page.getByRole("alert").filter({ hasText: "Choose a workspace before starting a new Reason chat." }).waitFor();
    await workspace.selectOption("fixture-workspace");
    assert.equal(await workspace.inputValue(), "fixture-workspace");
    assert.equal(await page.getByRole("alert").filter({ hasText: "Choose a workspace" }).count(), 0);
  } finally { await page.close(); }
});

for (const strict of ["0", "1"]) {
  const mode = strict === "1" ? "StrictMode" : "production lifecycle";
  test(`${mode}: browser handoff opens once and displays its synthetic confirmation code`, async () => {
    const page = await open(`strict=${strict}`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      assert.match(await page.getByTestId("reason-login-waiting").getByRole("status").innerText(), /Finish signing in in the browser window/);
      await expectCalls(page, { opens: 1 });
      assert.doesNotMatch(await page.locator(".onb-signin").innerText(), /terminal|run reason login/i);
    } finally { await capture(page, `code-strict-${strict}`); await page.close(); }
  });

  test(`${mode}: completed polling reports account and workspace exactly once`, async () => {
    const page = await open(`strict=${strict}`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      await page.getByRole("button", { name: "Resolve synthetic account", exact: true }).click();
      await page.getByTestId("reason-login-connected").waitFor({ timeout: 3500 });
      await page.waitForFunction(() => document.querySelector('[data-testid="events"]')?.textContent === '["done"]');
      assert.match(await page.getByTestId("reason-login-connected").innerText(), /fixture@example.invalid/);
      assert.match(await page.getByTestId("reason-login-connected").innerText(), /Fixture workspace/);
      await expectCalls(page, { opens: 1 });
    } finally { await page.close(); }
  });

  test(`${mode}: failed start shows failure and retries without terminal instructions`, async () => {
    const page = await open(`strict=${strict}&start=retry`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /Couldn't start sign-in/);
      assert.doesNotMatch(await page.getByRole("alert").innerText(), /terminal|run reason login/i);
      await page.getByRole("button", { name: "Retry sign-in", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      await expectCalls(page, { attempts: 2 });
    } finally { await capture(page, `retry-strict-${strict}`); await page.close(); }
  });

  test(`${mode}: already signed-in start completes without opening the browser`, async () => {
    const page = await open(`strict=${strict}&start=already-signed-in`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="events"]')?.textContent === '["done"]');
      await expectCalls(page, { opens: 0 });
      assert.equal(await page.getByTestId("reason-login-connected").count(), 1);
    } finally { await page.close(); }
  });

  test(`${mode}: failed default-browser opening offers explicit reopen`, async () => {
    const page = await open(`strict=${strict}&opener=failed`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /Couldn't open your default browser/);
      await page.getByRole("button", { name: "Open the sign-in page again", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
      await expectCalls(page, { opens: 2 });
      await expectCalls(page, { attempts: 1 });
    } finally { await page.close(); }
  });

  test(`${mode}: cancel stops polling and ignores later account approval`, async () => {
    const page = await open(`strict=${strict}`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Retry sign-in", exact: true }).waitFor();
      assert.match(await page.locator(".onb-signin").innerText(), /Close the browser page/);
      await expectCalls(page, { cancels: 1 });
      const stopped = (await calls(page)).statusReads;
      await page.getByRole("button", { name: "Resolve synthetic account", exact: true }).click();
      await page.waitForTimeout(1200);
      assert.equal((await calls(page)).statusReads, stopped);
      assert.equal(await page.getByTestId("reason-login-connected").count(), 0);
      assert.equal(await page.getByTestId("events").textContent(), "[]");
    } finally { await page.close(); }
  });

  test(`${mode}: timeout ends waiting and retry creates another attempt`, async () => {
    const page = await open(`strict=${strict}&start=timed-out`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByRole("button", { name: "Retry sign-in", exact: true }).waitFor({ timeout: 4500 });
      assert.match(await page.locator(".onb-signin").innerText(), /Sign-in timed out/);
      await page.getByRole("button", { name: "Retry sign-in", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      await expectCalls(page, { attempts: 2 });
      await expectCalls(page, { opens: 2 });
    } finally { await page.close(); }
  });

  test(`${mode}: one attempt survives onboarding, settings, chat and remount`, async () => {
    const page = await open(`strict=${strict}`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      for (const entry of ["Show Settings sign-in", "Show Chat sign-in", "Show onboarding"]) {
        await page.getByRole("button", { name: entry, exact: true }).click();
        await page.getByTestId("reason-login-code").waitFor();
      }
      await page.getByRole("button", { name: "Hide sign-up", exact: true }).click();
      await page.getByRole("button", { name: "Show sign-up", exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      await expectCalls(page, { attempts: 1 });
      await expectCalls(page, { opens: 1 });
    } finally { await page.close(); }
  });

  test(`${mode}: a stale connected store never auto-completes a new mount`, async () => {
    const page = await open(`strict=${strict}&start=already-signed-in`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByTestId("reason-login-connected").waitFor();
      await page.waitForFunction(() => document.querySelector('[data-testid="events"]')?.textContent === '["done"]');
      await page.getByRole("button", { name: "Hide sign-up", exact: true }).click();
      await page.getByRole("button", { name: "Expire synthetic account", exact: true }).click();
      await page.getByRole("button", { name: "Show sign-up", exact: true }).click();
      await page.getByRole("button", { name: "Sign up", exact: true }).waitFor();
      assert.equal(await page.getByTestId("events").textContent(), '["done"]');
      assert.equal(await page.getByTestId("reason-login-connected").count(), 0);
    } finally { await page.close(); }
  });

  test(`${mode}: starting can be cancelled before a browser URL appears`, async () => {
    const page = await open(`strict=${strict}&start=delayed`);
    try {
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Retry sign-in", exact: true }).waitFor();
      await page.getByRole("button", { name: "Resolve delayed start", exact: true }).click();
      await expectCalls(page, { opens: 0 });
      await expectCalls(page, { cancels: 1 });
      assert.equal(await page.getByTestId("reason-login-waiting").count(), 0);
    } finally { await page.close(); }
  });
}

for (const surface of ["settings", "chat"]) {
  test(`${surface}: direct browser sign-in shows the connected account and workspace`, async () => {
    const label = surface === "chat" ? "Sign in to Reason" : "Sign in with Reason";
    const page = await open(`surface=${surface}`, label);
    try {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByTestId("reason-login-code").waitFor();
      await expectCalls(page, { opens: 1 });
      await page.getByRole("button", { name: "Resolve synthetic account", exact: true }).click();
      await page.getByText("fixture@example.invalid", { exact: surface === "settings" }).waitFor({ timeout: 3500 });
      assert.match(await page.locator("main").innerText(), /Fixture workspace/);
      assert.doesNotMatch(await page.locator("main").innerText(), /terminal|run reason login/i);
    } finally { await capture(page, `${surface}-connected`); await page.close(); }
  });
}
