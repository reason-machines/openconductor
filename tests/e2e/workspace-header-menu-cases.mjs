import assert from "node:assert/strict";

const ROW = '[data-testid="left-sidebar-workspace-item"]';
const menu = (page) => page.getByRole("menu", { name: "Workspace actions", exact: true });
const name = (page) => page.locator(".ws-header .ws-title strong").first();
const selectedRow = (page) => page.locator(`${ROW}[aria-current="page"]`);
const row = (page, label) => page.locator(ROW).filter({ has: page.locator(".sb-ws-name", { hasText: label }) });
const labels = async (page) => menu(page).locator(":scope > [role=menuitem]").evaluateAll((elements) => elements.map((element) => [...element.childNodes].filter((node) => !(node instanceof Element && node.classList.contains("cm-shortcut"))).map((node) => node.textContent).join("").trim()));
const EXPECTED = ["Mark as unread", "Pin", "Set status", "Move to section", "Rename", "Copy link", "Archive"];

async function openNameMenu(page) {
  await name(page).click({ button: "right" });
  await menu(page).waitFor({ state: "visible", timeout: 3000 });
}
async function dismiss(page) {
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached", timeout: 3000 });
}
async function reset(page, baseURL) {
  await page.goto(`${baseURL.replace(/\/$/, "")}/?demo=1`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws-header").waitFor({ state: "visible", timeout: 15000 });
  const sidebar = page.getByRole("complementary", { name: "Repositories and workspaces" });
  if (!(await sidebar.isVisible())) await page.getByRole("button", { name: "Toggle left sidebar", exact: true }).click();
  await row(page, "Quiet harbor").waitFor({ state: "visible", timeout: 15000 });
  await row(page, "Quiet harbor").click();
  await page.waitForFunction(() => document.querySelector(".ws-header .ws-title strong")?.textContent === "quiet-harbor");
}

export const CASE_IDS = Object.freeze([
  "control.sidebar-actions",
  "control.header-primary-click",
  "header.context-menu-open-dismiss",
  "header.existing-pin-read-status",
  "header.existing-rename-dialog",
  "header.existing-new-section",
  "header.sidebar-hidden",
  "header.workspace-target-isolation",
]);

// The executor supplies its one admitted page and existing preview. No server,
// browser, backend stand-in, synthetic menu, storage or module mock is created.
export async function runWorkspaceHeaderMenuCases(page, { baseURL, onCase = () => {}, screenshot = async () => {} }) {
  page.setDefaultTimeout(3000);
  page.setDefaultNavigationTimeout(15000);
  const cases = [
    async () => {
      await row(page, "Quiet harbor").click({ button: "right" });
      await menu(page).waitFor();
      assert.deepEqual(await labels(page), EXPECTED);
      await dismiss(page);
    },
    async () => {
      await name(page).click();
      assert.equal(await menu(page).count(), 0);
      assert.equal(await name(page).textContent(), "quiet-harbor");
      assert.equal(await selectedRow(page).count(), 1);
    },
    async () => {
      await openNameMenu(page);
      assert.deepEqual(await labels(page), EXPECTED);
      assert.equal(await menu(page).getByRole("menuitem", { name: /Copy link/ }).locator(".cm-shortcut").textContent(), "⌘⇧C");
      assert.equal(await menu(page).getByRole("menuitem", { name: /Archive/ }).locator(".cm-shortcut").textContent(), "⌘⇧A");
      await screenshot(page, "header-context-menu");
      await dismiss(page);
      await openNameMenu(page);
      await dismiss(page);
    },
    async () => {
      await openNameMenu(page);
      await menu(page).getByRole("menuitem", { name: /^Pin/ }).click();
      await menu(page).waitFor({ state: "detached" });
      await page.locator(`${ROW}[aria-current="page"][data-pinned="true"]`).waitFor();
      await openNameMenu(page);
      await page.keyboard.press("r");
      await menu(page).waitFor({ state: "detached" });
      await page.locator(`${ROW}[aria-current="page"][data-unread="true"]`).waitFor();
      await openNameMenu(page);
      assert.equal((await labels(page))[0], "Mark as read");
      await menu(page).getByRole("menuitem", { name: "Set status", exact: true }).hover();
      const statuses = page.getByRole("menu", { name: "Set status", exact: true });
      await statuses.getByRole("menuitemradio", { name: "Done", exact: true }).click();
      await menu(page).waitFor({ state: "detached" });
      await openNameMenu(page);
      await menu(page).getByRole("menuitem", { name: "Set status", exact: true }).hover();
      assert.equal(await statuses.getByRole("menuitemradio", { name: "Done", exact: true }).getAttribute("aria-checked"), "true");
      await dismiss(page);
    },
    async () => {
      await openNameMenu(page);
      await menu(page).getByRole("menuitem", { name: "Rename", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Rename workspace", exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.locator("input[type=text], input:not([type])").first().inputValue(), "quiet-harbor");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(await name(page).textContent(), "quiet-harbor");
    },
    async () => {
      await openNameMenu(page);
      await menu(page).getByRole("menuitem", { name: "Move to section", exact: true }).hover();
      await page.getByRole("menu", { name: "Move to section", exact: true }).getByRole("menuitem", { name: "New section…", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New section", exact: true });
      await dialog.waitFor();
      await dialog.getByLabel("Section name", { exact: true }).fill("Header destination");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      const section = page.locator(".sb-nav-section").filter({ has: page.locator(".sb-section-label", { hasText: "Header destination" }) });
      await section.locator(".sb-ws-name", { hasText: "Quiet harbor" }).waitFor();
      assert.equal(await section.locator(".sb-ws-name").count(), 1);
      assert.equal(await name(page).textContent(), "quiet-harbor");
    },
    async () => {
      await page.getByRole("button", { name: "Toggle left sidebar", exact: true }).click();
      await page.getByRole("complementary", { name: "Repositories and workspaces" }).waitFor({ state: "detached" });
      await openNameMenu(page);
      assert.deepEqual(await labels(page), EXPECTED);
      await screenshot(page, "header-context-menu-sidebar-hidden");
      await dismiss(page);
    },
    async () => {
      await openNameMenu(page);
      await dismiss(page);
      await row(page, "Copper wren").click();
      await page.waitForFunction(() => document.querySelector(".ws-header .ws-title strong")?.textContent === "copper-wren");
      await openNameMenu(page);
      await page.keyboard.press("p");
      await menu(page).waitFor({ state: "detached" });
      await page.locator(`${ROW}[aria-current="page"][data-pinned="true"]`).waitFor();
      assert.equal(await row(page, "Copper wren").getAttribute("data-pinned"), "true");
      assert.equal(await row(page, "Quiet harbor").getAttribute("data-pinned"), null);
    },
  ];
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const result = { id: CASE_IDS[i], status: "not-run", phase: "setup" };
    try {
      await reset(page, baseURL);
      result.phase = "behavior";
      await cases[i]();
      result.status = "passed";
    } catch (error) {
      result.status = "failed";
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
    await onCase(result);
  }
  return results;
}
