// Session status from the chat layer, in the browser preview (stand-in agent).
// The prompts "permission", "plan" and "question" make the stand-in wait on that
// permission request (src/features/chat/reasonChat.ts), so this drives each card and
// checks the status it raises on the sidebar row and on Home.
// Usage: npx vite --host 127.0.0.1 --port 5392 --strictPort &
//        TMPDIR=/tmp node tools/e2e/chat-status.browser.mjs <screenshot folder> [chromium path]
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const OUT = process.argv[2] ?? "/tmp";
const PORT = process.env.PORT ?? "5392";
const b = await chromium.launch({ executablePath: process.argv[3] ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`http://127.0.0.1:${PORT}/?demo=1`);
const box = p.locator(".composer [contenteditable=true]");
await box.waitFor();
const ok = (m) => console.log("ok -", m);
const rowStatus = () => p.locator('[data-testid="left-sidebar-workspace-item"][data-active] [data-testid="workspace-status-icon"]').getAttribute("data-status");
const card = (kind) => p.locator(`[data-testid="chat-permission-request"][data-kind="${kind}"]`);
const lastReply = async () => (await p.locator(".chat-text").last().textContent())?.trim();
const settle = async (status) => {
  for (let i = 0; i < 100 && (await rowStatus()) !== status; i++) await p.waitForTimeout(50);
  assert.equal(await rowStatus(), status);
};
const send = async (text) => {
  await box.fill(text);
  await box.press("Enter");
};

// Permission: the card, the row's "Needs permission", Yes with its shortcut.
await send("permission");
await card("permission").waitFor();
assert.equal(await card("permission").locator(".prompt-heading").textContent(), "Do you want to run this command?");
await settle("needs-user-permission");
ok("a permission request shows the card and the row needs permission");
await p.screenshot({ path: `${OUT}/1-permission.png` });
// The Home list (the /all-workspaces route; sidebar Home opens the wordmark screen, #483)
// shows the same workspace with the same status while the chat keeps waiting.
await p.evaluate(() => { history.pushState(null, "", "/all-workspaces"); dispatchEvent(new PopStateEvent("popstate")); });
// The demo seeds another workspace (Slate heron) that already needs permission, so look at this one.
const homeStatus = p.getByRole("option", { name: /^Amber falcon/ }).locator('[data-testid="home-workspace-status"][data-status="needs-user-permission"]');
await homeStatus.waitFor();
assert.equal(await homeStatus.getAttribute("aria-label"), "Needs permission");
ok("Home shows the waiting workspace as Needs permission");
await p.screenshot({ path: `${OUT}/2-home-needs-permission.png` });
await p.locator('[data-testid="left-sidebar-workspace-item"]').first().click();
await card("permission").waitFor();
await p.locator("body").click({ position: { x: 640, y: 120 } });
await p.keyboard.press("Enter");
await card("permission").waitFor({ state: "detached" });
await settle("branch");
assert.match(await lastReply(), /answered with option allow\./);
ok("↵ (chat.approveToolCall) answers Yes; the turn ends and the row goes back to its git status");

// Plan: the composer asks for adjustments; text sent keeps planning.
await send("plan");
await card("plan").waitFor();
await settle("needs-plan-response");
assert.equal(await box.getAttribute("data-placeholder"), "Enter your plan adjustments here...");
ok("a plan shows the card, the row needs a plan response and the composer asks for adjustments");
await p.screenshot({ path: `${OUT}/3-plan.png` });
await send("use SQLite");
await card("plan").waitFor({ state: "detached" });
await settle("branch");
assert.match(await lastReply(), /keep planning: use SQLite/);
assert.notEqual(await box.getAttribute("data-placeholder"), "Enter your plan adjustments here...");
ok("text sent while a plan waits asks for changes");
await send("plan");
await card("plan").getByRole("button", { name: /^Approve/ }).click();
await settle("branch");
assert.match(await lastReply(), /plan approved/);
ok("Approve approves the plan");

// Questions: pages, single and multi select, Other, Submit.
await send("question");
await card("question").waitFor();
await settle("needs-user-input");
await card("question").getByRole("radio", { name: /Postgres/ }).click();
await card("question").getByRole("button", { name: "Next question" }).click();
await card("question").getByRole("checkbox", { name: /Search/ }).click();
await card("question").getByRole("checkbox", { name: /Export/ }).click();
await card("question").getByLabel("Other response").fill("Sync");
ok("a question shows the card and the row needs input");
await p.screenshot({ path: `${OUT}/4-question.png` });
await card("question").getByRole("button", { name: /^Submit/ }).click();
await settle("branch");
assert.match(await lastReply(), /Postgres; Search, Export, Sync/);
ok("Submit sends every question's answers");

// Stop clears a waiting card. A tool approval takes the composer's place (Conductor's
// `Jpo`), so its Stop button is hidden; ⌘⇧⌫ (chat.cancel, "Cancel agent") still stops.
await send("permission");
await card("permission").waitFor();
assert.equal(await p.locator(".composer.oc-composer.is-approval [data-testid=chat-permission-request]").count(), 1);
assert.equal(await p.locator('.composer [contenteditable=true]').isVisible(), false);
await p.locator("body").click({ position: { x: 640, y: 120 } });
await p.keyboard.press("Meta+Shift+Backspace");
await card("permission").waitFor({ state: "detached" });
await settle("branch");
ok("Stop drops the waiting card");

assert.deepEqual(errors, []);
await b.close();
