// End-to-end check of the sidebar's user sections, in a real browser on the
// demo state (`?demo=1`): New section from the My workspaces menu and from a
// row's "Move to section" menu, moving a workspace in and out (it leaves its
// repository group and Pinned), Edit section and Delete section. Run after
// `npm run build`:
//
//   node --test tests/e2e/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

const ROW = '[data-testid="left-sidebar-workspace-item"]';
const NAMES = ".sb-ws-name";
const row = (page, label) => page.locator(ROW, { has: page.locator(NAMES, { hasText: label }) });
const section = (page, name) => page.locator(".sb-nav-section", { has: page.locator(".sb-section-label", { hasText: name }) });
const rowsIn = (scope) => scope.locator(NAMES).allTextContents();
const repoGroup = (page, name) => page.locator(".sb-repo-group", { has: page.locator(".sb-repo-name", { hasText: name }) });
const dialog = (page, title) => page.getByRole("dialog", { name: title });
const rowMenu = (page) => page.getByRole("menu", { name: "Workspace actions" });
const moveMenu = (page) => page.getByRole("menu", { name: "Move to section" });

// Rows and sections leave through framer-motion's AnimatePresence, which unmounts a removed
// child a frame after the change even with reduced motion, so removals are polled to settle.
async function settled(read, expected, timeout = 3000) {
  const end = Date.now() + timeout;
  let actual = await read();
  while (!isDeepStrictEqual(actual, expected) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 25));
    actual = await read();
  }
  assert.deepEqual(actual, expected);
}

async function openMoveMenu(page, label) {
  await row(page, label).click({ button: "right" });
  await rowMenu(page).getByRole("menuitem", { name: "Move to section" }).hover();
  await moveMenu(page).waitFor();
}

test("sections: create, move in and out, edit, delete", async () => {
  // Reduced motion: rows move between groups at once instead of collapsing out over 200ms
  // (Conductor's `Qj` skips its motion wrapper the same way); removals still settle a frame later.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  assert.equal(await page.locator(".sb-nav-section").count(), 0);

  // New section from the My workspaces menu: empty name disables Create; Enter submits.
  await page.getByRole("button", { name: "My workspaces actions" }).click();
  await page.getByRole("menuitem", { name: "New section…" }).click();
  const create = dialog(page, "New section");
  await create.waitFor();
  assert.equal(await create.getByRole("button", { name: "Create" }).isDisabled(), true);
  await create.getByRole("button", { name: "Choose section emoji" }).click();
  await create.getByRole("option", { name: "🚀" }).click();
  await create.getByLabel("Section name").fill("  Focus  ");
  await create.getByLabel("Section name").press("Enter");
  assert.equal(await create.count(), 0);
  const focus = section(page, "Focus");
  await focus.waitFor();
  assert.equal(await focus.locator(".sb-section-emoji").textContent(), "🚀");
  assert.equal(await focus.locator(".sb-section-empty").textContent(), "Drag a workspace here");

  // Pin a row, then move it into the section: it leaves Pinned and its repo group.
  await row(page, "Quiet harbor").click({ button: "right" });
  await rowMenu(page).getByRole("menuitem", { name: "Pin" }).click();
  await page.locator(".sb-group", { hasText: "Pinned" }).waitFor();
  await openMoveMenu(page, "Quiet harbor");
  await moveMenu(page).getByRole("menuitemradio", { name: "Focus" }).click();
  await settled(() => rowsIn(focus), ["Quiet harbor"]);
  await settled(() => page.locator(".sb-group", { hasText: "Pinned" }).count(), 0);
  await settled(async () => (await rowsIn(repoGroup(page, "openconductor"))).includes("Quiet harbor"), false);
  // Sections sit between Pinned and My workspaces.
  const order = await page.locator(".repo-list").evaluate((nav) => [...nav.querySelectorAll(".sb-nav-section .sb-section-label, .sb-section-header > .sb-section-toggle > .sb-section-label")].map((e) => e.textContent));
  assert.deepEqual(order, ["Focus", "My workspaces"]);

  // The current section is checked and disabled; Remove from section shows.
  await openMoveMenu(page, "Quiet harbor");
  const current = moveMenu(page).getByRole("menuitemradio", { name: "Focus" });
  assert.equal(await current.getAttribute("aria-checked"), "true");
  assert.equal(await current.isDisabled(), true);
  await moveMenu(page).getByRole("menuitem", { name: "Remove from section" }).click();
  await settled(async () => (await rowsIn(repoGroup(page, "openconductor"))).includes("Quiet harbor"), true);
  await settled(() => rowsIn(focus), []);

  // New section… from the row menu creates a section holding that row.
  await openMoveMenu(page, "Brisk otter");
  assert.equal(await moveMenu(page).getByRole("menuitem", { name: "Remove from section" }).count(), 0);
  await moveMenu(page).getByRole("menuitem", { name: "New section…" }).click();
  await dialog(page, "New section").getByLabel("Section name").fill("Backend");
  await dialog(page, "New section").getByRole("button", { name: "Create" }).click();
  assert.deepEqual(await rowsIn(section(page, "Backend")), ["Brisk otter"]);
  assert.deepEqual(await page.locator(".sb-nav-section .sb-section-label").allTextContents(), ["Focus", "Backend"]);

  // Edit section renames and keeps the emoji; the section menu also opens on right-click.
  await focus.locator(".sb-section-header").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit section" }).click();
  const edit = dialog(page, "Edit section");
  assert.equal(await edit.getByLabel("Section name").inputValue(), "Focus");
  await edit.getByLabel("Section name").fill("Later");
  await edit.getByRole("button", { name: "Save" }).click();
  const later = section(page, "Later");
  await later.waitFor();
  assert.equal(await later.locator(".sb-section-emoji").textContent(), "🚀");

  // Collapsing a section shows its count.
  await section(page, "Backend").locator(".sb-section-toggle").click();
  assert.equal(await section(page, "Backend").locator(".sb-group-count").textContent(), "1");
  await section(page, "Backend").locator(".sb-section-toggle").click();

  // Delete section sends its workspaces back to their repository group.
  await page.getByRole("button", { name: "Backend actions" }).click();
  await page.getByRole("menuitem", { name: "Delete section" }).click();
  await settled(() => section(page, "Backend").count(), 0);
  await settled(async () => (await rowsIn(repoGroup(page, "api-server"))).includes("Brisk otter"), true);
  await page.close();
});

// parity.create.in-section: Conductor's section menu starts with Create workspace
// (renderApp oBi), which opens the composer on that section; Create then reads
// "Create in <name>" and the new workspace lands in the section. With no section
// chosen, the split button's "Create in section" menu lists every section.
test("create a workspace directly inside a section", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  for (const name of ["Focus", "Backend"]) {
    await page.getByRole("button", { name: "My workspaces actions" }).click();
    await page.getByRole("menuitem", { name: "New section…" }).click();
    await dialog(page, "New section").getByLabel("Section name").fill(name);
    await dialog(page, "New section").getByRole("button", { name: "Create" }).click();
    await section(page, name).waitFor();
  }

  // The section menu's first item, then Create in <section>.
  await page.getByRole("button", { name: "Focus actions" }).click();
  const items = await page.getByRole("menu").getByRole("menuitem").allTextContents();
  assert.deepEqual(items, ["Create workspace", "Edit section", "New section…", "Delete section"]);
  await page.getByRole("menuitem", { name: "Create workspace" }).click();
  const create = dialog(page, "New workspace");
  await create.waitFor();
  assert.equal(await create.getByRole("button", { name: "Create in section" }).count(), 0);
  // The composer names the workspace after a city, so the new row is the section's only one.
  const before = await page.locator(NAMES).allTextContents();
  await create.getByRole("button", { name: "Create in Focus" }).click();
  await create.waitFor({ state: "detached" });
  await section(page, "Focus").locator(NAMES).first().waitFor();
  const [inFocus, ...extraFocus] = await rowsIn(section(page, "Focus"));
  assert.deepEqual(extraFocus, []);
  assert.ok(!before.includes(inFocus), `${inFocus} should be the new workspace`);

  // From the plain Create: the split menu lists the sections and creates into the chosen one.
  await page.locator("button.sb-row", { has: page.locator(".sb-row-label", { hasText: /^Create$/ }) }).click();
  const plain = dialog(page, "New workspace");
  await plain.waitFor();
  assert.equal(await plain.getByRole("button", { name: "Create", exact: true }).count(), 1);
  await plain.getByRole("button", { name: "Create in section" }).click();
  const menu = plain.getByRole("menu");
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Focus", "Backend"]);
  await menu.getByRole("menuitem", { name: "Backend" }).click();
  await plain.waitFor({ state: "detached" });
  await section(page, "Backend").locator(NAMES).first().waitFor();
  const [inBackend, ...extraBackend] = await rowsIn(section(page, "Backend"));
  assert.deepEqual(extraBackend, []);
  assert.ok(!before.includes(inBackend) && inBackend !== inFocus, `${inBackend} should be the second new workspace`);
  assert.deepEqual(await rowsIn(section(page, "Focus")), [inFocus]);
  await page.close();
});
