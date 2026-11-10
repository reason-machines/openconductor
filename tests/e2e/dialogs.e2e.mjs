import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let base = process.env.DIALOGS_URL;
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

async function open(name, viewport = { width: 1280, height: 820 }, query = "") {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  await page.goto(`${base}/tools/dialogs/index.html?dialog=${name}${query}`);
  await page.locator('[aria-modal="true"]').waitFor();
  return page;
}

for (const [name, width] of [["rename", 384], ["clone", 525], ["create", 525]]) {
  test(`${name}: top edge, reference width, no close X, trapped focus`, async () => {
    const page = await open(name);
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    assert.equal(box.y, 160);
    assert.equal(box.width, width);
    assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).count(), 0);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement), null, { timeout: 1500 });
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.close();
  });
}

for (const name of ["archive", "remove", "restore"]) {
  test(`${name}: centered alert, Cancel focused, outside click is inert`, async () => {
    const page = await open(name);
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ timeout: 1500 });
    const box = await dialog.boundingBox();
    assert.equal(box.width, 512);
    assert.ok(Math.abs(box.y + box.height / 2 - 410) <= 1);
    assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).evaluate((node) => node === document.activeElement), true);
    assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).count(), 0);
    await page.mouse.click(10, 100);
    assert.equal(await dialog.count(), 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("events").textContent(), "[]");
    await page.close();
  });
}

test("archive: primary shortcut confirms exactly once", async () => {
  const page = await open("archive");
  await page.keyboard.press("Meta+Enter");
  await page.getByRole("alertdialog").waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("events").textContent(), '["archive"]');
  await page.close();
});

test("archive: configured primary shortcut replaces Command+Enter", async () => {
  const page = await open("archive", undefined, "&customShortcut=1");
  await page.locator('[data-overrides-ready="true"]').waitFor();
  await page.keyboard.press("Meta+Enter");
  assert.equal(await page.getByRole("alertdialog").count(), 1);
  assert.equal(await page.getByTestId("events").textContent(), "[]");
  await page.keyboard.press("Alt+Enter");
  await page.getByRole("alertdialog").waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("events").textContent(), '["archive"]');
  await page.close();
});

test("remove: no primary shortcut and plain Enter cancels rather than deletes", async () => {
  const page = await open("remove");
  await page.keyboard.press("Meta+Enter");
  assert.equal(await page.getByTestId("events").textContent(), "[]");
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("events").textContent(), "[]");
  await page.close();
});

test("restore: shortcut dispatches new-branch restore and disables buttons", async () => {
  const page = await open("restore");
  await page.keyboard.press("Meta+Enter");
  const events = JSON.parse(await page.getByTestId("events").textContent());
  assert.deepEqual(events, [{ type: "unarchiveWorkspace", repoId: "fixture-repo", workspaceId: "fixture-workspace", useNewBranch: true }]);
  assert.equal(await page.getByRole("button", { name: "Restoring..." }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Cancel" }).isDisabled(), true);
  await page.close();
});

test("rename: remembers branch choice, Enter submits, primary shortcut accepts unchanged", async () => {
  const page = await open("rename");
  const input = page.locator(".rename-ws-input");
  assert.equal(await input.inputValue(), "lisbon");
  assert.deepEqual(await input.evaluate((node) => [node.selectionStart, node.selectionEnd]), [0, 6]);
  await page.getByLabel("Also rename branch").check();
  await input.fill("new name");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const events = JSON.parse(await page.getByTestId("events").textContent());
  assert.ok(events.some((e) => e.type === "renameWorkspace" && e.name === "new name"));
  await page.getByRole("button", { name: "rename", exact: true }).click();
  assert.equal(await page.getByLabel("Also rename branch").isChecked(), true);
  await page.keyboard.press("Meta+Enter");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.close();
});

test("dialogs remain within a short viewport and restore trigger focus", async () => {
  const page = await open("rename", { width: 640, height: 400 });
  const box = await page.getByRole("dialog").boundingBox();
  assert.equal(box.y, 32);
  assert.ok(box.y + box.height <= 368);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "clone", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.textContent === "clone", null, { timeout: 1500 });
  await page.close();
});

test("restore: Escape dismisses the pending dialog without repeating the restore", async () => {
  const page = await open("restore");
  try {
    const dialog = page.getByRole("alertdialog");
    await page.keyboard.press("Meta+Enter");
    assert.equal(await dialog.getByRole("button", { name: "Restoring..." }).isDisabled(), true);
    assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
    const expected = [{ type: "unarchiveWorkspace", repoId: "fixture-repo", workspaceId: "fixture-workspace", useNewBranch: true }];
    assert.deepEqual(JSON.parse(await page.getByTestId("events").textContent()), expected);
    await page.mouse.click(10, 100);
    assert.equal(await dialog.count(), 1, "pointer dismissal remains blocked while restoring");
    await page.keyboard.press("Meta+Enter");
    assert.deepEqual(JSON.parse(await page.getByTestId("events").textContent()), expected);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5000 });
    assert.deepEqual(JSON.parse(await page.getByTestId("events").textContent()), expected, "dismissal neither cancels nor repeats the restore action");
  } finally {
    await page.close();
  }
});
